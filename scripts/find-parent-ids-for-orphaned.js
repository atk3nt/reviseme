// scripts/find-parent-ids-for-orphaned.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Normalize text for matching
function normalizeText(text) {
  if (!text) return '';
  return text.toLowerCase().trim().replace(/\s+/g, ' ').replace(/['"]/g, '');
}

// Fix encoding issues
function fixEncoding(text) {
  if (!text) return text;
  return text
    .replace(/Äì/g, '–')
    .replace(/Aì/g, '–')
    .replace(/Äô/g, "'")
    .replace(/Ãô/g, "'")
    .replace(/Äò/g, "'")
    .trim();
}

async function findParentIds() {
  console.log('='.repeat(80));
  console.log('🔍 FINDING PARENT IDs FOR ORPHANED TOPICS');
  console.log('='.repeat(80));
  console.log('');

  try {
    // STEP 1: Fetch all orphaned topics
    console.log('📥 Step 1: Fetching orphaned topics...');
    let orphanedTopics = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: page, error: pageError } = await supabase
        .from('topics')
        .select('id, spec_id, title, parent_title, level')
        .in('level', [2, 3])
        .is('parent_id', null)
        .not('parent_title', 'is', null)
        .order('spec_id')
        .order('level')
        .range(from, from + pageSize - 1);

      if (pageError) {
        throw new Error(`Failed to fetch orphaned topics: ${pageError.message}`);
      }

      if (page && page.length > 0) {
        orphanedTopics = orphanedTopics.concat(page);
        from += pageSize;
        hasMore = page.length === pageSize;
        console.log(`  Fetched ${orphanedTopics.length} orphaned topics so far...`);
      } else {
        hasMore = false;
      }
    }

    console.log(`✅ Found ${orphanedTopics.length} orphaned topics`);
    console.log('');

    // STEP 2: Fetch all potential parent topics
    console.log('📥 Step 2: Fetching all potential parent topics...');
    let allTopics = [];
    from = 0;
    hasMore = true;

    while (hasMore) {
      const { data: page, error: pageError } = await supabase
        .from('topics')
        .select('id, spec_id, title, level, parent_title')
        .order('spec_id')
        .order('level')
        .range(from, from + pageSize - 1);

      if (pageError) {
        throw new Error(`Failed to fetch topics: ${pageError.message}`);
      }

      if (page && page.length > 0) {
        allTopics = allTopics.concat(page);
        from += pageSize;
        hasMore = page.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    console.log(`✅ Fetched ${allTopics.length} total topics`);
    console.log('');

    // STEP 3: Build lookup maps by spec_id
    console.log('🗺️  Step 3: Building lookup maps...');
    const topicsBySpec = new Map();
    allTopics.forEach(topic => {
      if (!topicsBySpec.has(topic.spec_id)) {
        topicsBySpec.set(topic.spec_id, {
          level1: [],
          level2: [],
          byTitle: new Map(), // normalized title -> [topics]
          byTitleExact: new Map() // exact title -> [topics]
        });
      }
      const specData = topicsBySpec.get(topic.spec_id);
      
      if (topic.level === 1) {
        specData.level1.push(topic);
      } else if (topic.level === 2) {
        specData.level2.push(topic);
      }

      // Index by normalized title
      const normalizedTitle = normalizeText(fixEncoding(topic.title));
      if (!specData.byTitle.has(normalizedTitle)) {
        specData.byTitle.set(normalizedTitle, []);
      }
      specData.byTitle.get(normalizedTitle).push(topic);

      // Index by exact title (after encoding fix)
      const exactTitle = fixEncoding(topic.title);
      if (!specData.byTitleExact.has(exactTitle)) {
        specData.byTitleExact.set(exactTitle, []);
      }
      specData.byTitleExact.get(exactTitle).push(topic);
    });

    console.log(`✅ Built lookup maps for ${topicsBySpec.size} specs`);
    console.log('');

    // STEP 4: Find parent for each orphaned topic
    console.log('🔍 Step 4: Finding parents for orphaned topics...');
    const results = [];

    orphanedTopics.forEach(orphaned => {
      const specData = topicsBySpec.get(orphaned.spec_id);
      if (!specData) {
        results.push({
          orphaned_id: orphaned.id,
          orphaned_title: orphaned.title,
          orphaned_level: orphaned.level,
          parent_title: orphaned.parent_title,
          spec_id: orphaned.spec_id,
          suggested_parent_id: null,
          suggested_parent_title: null,
          match_method: 'no_spec_data',
          confidence: 0,
          notes: 'Spec not found in database'
        });
        return;
      }

      const fixedParentTitle = fixEncoding(orphaned.parent_title);
      const normalizedParentTitle = normalizeText(fixedParentTitle);
      const targetLevel = orphaned.level - 1; // Level 2 topics need Level 1, Level 3 need Level 2

      let parent = null;
      let matchMethod = null;
      let confidence = 0;

      // Strategy 1: Exact match on title (after encoding fix)
      const exactMatches = specData.byTitleExact.get(fixedParentTitle) || [];
      const exactMatchAtLevel = exactMatches.find(t => t.level === targetLevel);
      if (exactMatchAtLevel) {
        parent = exactMatchAtLevel;
        matchMethod = 'exact_title';
        confidence = 1.0;
      }

      // Strategy 2: Normalized match
      if (!parent) {
        const normalizedMatches = specData.byTitle.get(normalizedParentTitle) || [];
        const normalizedMatchAtLevel = normalizedMatches.find(t => t.level === targetLevel);
        if (normalizedMatchAtLevel) {
          parent = normalizedMatchAtLevel;
          matchMethod = 'normalized_title';
          confidence = 0.95;
        }
      }

      // Strategy 3: Partial match (parent_title contains topic title or vice versa)
      if (!parent) {
        const candidates = targetLevel === 1 ? specData.level1 : specData.level2;
        for (const candidate of candidates) {
          const candidateTitle = normalizeText(fixEncoding(candidate.title));
          if (candidateTitle.includes(normalizedParentTitle) || 
              normalizedParentTitle.includes(candidateTitle)) {
            parent = candidate;
            matchMethod = 'partial_match';
            confidence = 0.7;
            break;
          }
        }
      }

      // Strategy 4: Check if parent_title is actually a date range (for level 2 topics)
      // Level 3 topics often have parent_title that matches level 2's parent_title (date range)
      if (!parent && orphaned.level === 3) {
        // Look for level 2 topics that have this as their parent_title
        const level2WithMatchingParentTitle = specData.level2.filter(t => {
          const tParentTitle = normalizeText(fixEncoding(t.parent_title || ''));
          return tParentTitle === normalizedParentTitle;
        });
        
        if (level2WithMatchingParentTitle.length === 1) {
          parent = level2WithMatchingParentTitle[0];
          matchMethod = 'level2_parent_title_match';
          confidence = 0.85;
        }
      }

      results.push({
        orphaned_id: orphaned.id,
        orphaned_title: orphaned.title,
        orphaned_level: orphaned.level,
        parent_title: orphaned.parent_title,
        spec_id: orphaned.spec_id,
        suggested_parent_id: parent?.id || null,
        suggested_parent_title: parent?.title || null,
        match_method: matchMethod || 'no_match',
        confidence: confidence,
        notes: parent 
          ? `✅ Match found (${matchMethod})` 
          : '⚠️ No match found - needs manual review'
      });
    });

    // Count matches
    const matched = results.filter(r => r.suggested_parent_id).length;
    const unmatched = results.filter(r => !r.suggested_parent_id).length;
    const highConfidence = results.filter(r => r.confidence >= 0.9).length;
    const mediumConfidence = results.filter(r => r.confidence >= 0.7 && r.confidence < 0.9).length;
    const lowConfidence = results.filter(r => r.confidence > 0 && r.confidence < 0.7).length;

    console.log(`✅ Analysis complete:`);
    console.log(`  - Total orphaned topics: ${results.length}`);
    console.log(`  - Matches found: ${matched} (${((matched/results.length)*100).toFixed(1)}%)`);
    console.log(`  - High confidence (≥90%): ${highConfidence}`);
    console.log(`  - Medium confidence (70-89%): ${mediumConfidence}`);
    console.log(`  - Low confidence (<70%): ${lowConfidence}`);
    console.log(`  - No match: ${unmatched}`);
    console.log('');

    // STEP 5: Check which are critical (used in active blocks)
    console.log('🚨 Step 5: Identifying critical topics (used in active blocks)...');
    const orphanedIds = results.map(r => r.orphaned_id);
    const criticalTopicIds = new Set();

    // Check in batches
    const batchSize = 100;
    for (let i = 0; i < orphanedIds.length; i += batchSize) {
      const batch = orphanedIds.slice(i, i + batchSize);
      const { data: blocks } = await supabase
        .from('blocks')
        .select('topic_id')
        .in('topic_id', batch);
      
      if (blocks) {
        blocks.forEach(block => criticalTopicIds.add(block.topic_id));
      }
    }

    // Mark critical topics in results
    results.forEach(result => {
      result.is_critical = criticalTopicIds.has(result.orphaned_id);
    });

    const criticalCount = results.filter(r => r.is_critical).length;
    console.log(`  ⚠️  Found ${criticalCount} critical topics (used in active blocks)`);
    console.log('');

    // STEP 6: Generate CSV
    console.log('📄 Step 6: Generating CSV...');
    const reportDir = join(__dirname, '..', 'docs');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const csvFile = join(reportDir, `orphaned-topics-with-parent-ids-${new Date().toISOString().split('T')[0]}.csv`);
    
    // CSV header
    const header = [
      'orphaned_id',
      'orphaned_title',
      'orphaned_level',
      'parent_title',
      'suggested_parent_id',
      'suggested_parent_title',
      'match_method',
      'confidence',
      'is_critical',
      'notes'
    ].join(',');

    // CSV rows
    const rows = results.map(r => [
      `"${r.orphaned_id}"`,
      `"${r.orphaned_title}"`,
      `"${r.orphaned_level}"`,
      `"${r.parent_title || ''}"`,
      `"${r.suggested_parent_id || ''}"`,
      `"${r.suggested_parent_title || ''}"`,
      `"${r.match_method}"`,
      r.confidence.toFixed(2),
      r.is_critical ? 'YES' : 'NO',
      `"${r.notes}"`
    ].join(','));

    fs.writeFileSync(csvFile, header + '\n' + rows.join('\n'));
    console.log(`✅ CSV saved to: ${csvFile}`);
    console.log('');

    // Also create a summary
    console.log('📊 Summary by confidence:');
    console.log(`  High confidence (≥90%): ${highConfidence} topics - Safe to auto-fix`);
    console.log(`  Medium confidence (70-89%): ${mediumConfidence} topics - Review before fixing`);
    console.log(`  Low confidence (<70%): ${lowConfidence} topics - Needs manual review`);
    console.log(`  No match: ${unmatched} topics - Needs manual investigation`);
    console.log('');

    if (criticalCount > 0) {
      console.log('🚨 CRITICAL TOPICS (used in active blocks):');
      results
        .filter(r => r.is_critical)
        .forEach(r => {
          const status = r.suggested_parent_id 
            ? `✅ Match: ${r.suggested_parent_title} (${(r.confidence * 100).toFixed(0)}%)`
            : '❌ No match found';
          console.log(`  - "${r.orphaned_title}": ${status}`);
        });
      console.log('');
    }

    return results;

  } catch (error) {
    console.error('\n❌ Script failed:', error);
    throw error;
  }
}

// Run script
findParentIds()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });




