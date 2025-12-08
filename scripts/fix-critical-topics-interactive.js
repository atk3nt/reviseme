// scripts/fix-critical-topics-interactive.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';
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

// Default to dry-run mode
const DRY_RUN = process.env.DRY_RUN !== 'false';

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

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function findPotentialParents(specId, parentTitle, targetLevel) {
  const fixedParentTitle = fixEncoding(parentTitle);
  const normalizedParentTitle = normalizeText(fixedParentTitle);

  // Fetch all topics in the spec at the target level
  const { data: candidates, error } = await supabase
    .from('topics')
    .select('id, title, level, parent_title')
    .eq('spec_id', specId)
    .eq('level', targetLevel)
    .order('title');

  if (error || !candidates) {
    return [];
  }

  // Score each candidate
  const scored = candidates.map(candidate => {
    const candidateTitle = fixEncoding(candidate.title);
    const normalizedCandidate = normalizeText(candidateTitle);
    
    let score = 0;
    let reason = '';

    // Exact match
    if (candidateTitle === fixedParentTitle) {
      score = 100;
      reason = 'Exact match';
    }
    // Normalized match
    else if (normalizedCandidate === normalizedParentTitle) {
      score = 95;
      reason = 'Normalized match (ignoring case/spaces)';
    }
    // Contains match
    else if (normalizedCandidate.includes(normalizedParentTitle) || 
             normalizedParentTitle.includes(normalizedCandidate)) {
      score = 70;
      reason = 'Partial match (contains)';
    }
    // Similar words
    else {
      const parentWords = normalizedParentTitle.split(' ');
      const candidateWords = normalizedCandidate.split(' ');
      const commonWords = parentWords.filter(w => candidateWords.includes(w));
      if (commonWords.length > 0) {
        score = 50 + (commonWords.length * 10);
        reason = `Shared words: ${commonWords.join(', ')}`;
      }
    }

    return {
      id: candidate.id,
      title: candidate.title,
      level: candidate.level,
      parent_title: candidate.parent_title,
      score,
      reason
    };
  });

  // Sort by score descending
  return scored
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5); // Top 5 matches
}

async function fixCriticalTopics() {
  console.log('='.repeat(80));
  console.log('🔧 INTERACTIVE FIX FOR CRITICAL TOPICS');
  console.log('='.repeat(80));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '✏️  LIVE (will update database)'}`);
  console.log('');

  try {
    // STEP 1: Load critical topics from diagnostic report
    console.log('📥 Step 1: Loading critical topics...');
    const reportDir = join(__dirname, '..', 'docs');
    const reportFiles = fs.existsSync(reportDir) 
      ? fs.readdirSync(reportDir)
          .filter(f => f.startsWith('data-quality-audit-') && f.endsWith('.json'))
          .sort()
          .reverse()
      : [];

    if (reportFiles.length === 0) {
      console.error('❌ No diagnostic report found. Please run diagnose-topic-data-quality.js first.');
      process.exit(1);
    }

    const latestReport = JSON.parse(
      fs.readFileSync(join(reportDir, reportFiles[0]), 'utf8')
    );
    const criticalTopics = latestReport.topicsInActiveBlocks || [];

    if (criticalTopics.length === 0) {
      console.log('✅ No critical topics found - all good!');
      process.exit(0);
    }

    console.log(`✅ Found ${criticalTopics.length} critical topics`);
    console.log('');

    // STEP 2: Fetch full topic details for critical topics (with spec info)
    console.log('📊 Step 2: Fetching topic details...');
    const criticalTopicIds = criticalTopics.map(t => t.topic_id);
    const { data: topicDetails, error: fetchError } = await supabase
      .from('topics')
      .select('id, spec_id, title, parent_title, level, specs(subject, exam_board)')
      .in('id', criticalTopicIds);

    if (fetchError || !topicDetails) {
      throw new Error(`Failed to fetch topic details: ${fetchError?.message}`);
    }

    // Map topic details
    const topicMap = new Map();
    topicDetails.forEach(topic => {
      topicMap.set(topic.id, topic);
    });

    console.log(`✅ Fetched details for ${topicDetails.length} topics`);
    console.log('');

    // STEP 3: Process each critical topic interactively
    console.log('🔧 Step 3: Processing critical topics...');
    console.log('');
    
    const results = {
      fixed: [],
      skipped: [],
      failed: []
    };

    for (let i = 0; i < criticalTopics.length; i++) {
      const critical = criticalTopics[i];
      const topic = topicMap.get(critical.topic_id);
      
      if (!topic) {
        console.log(`⚠️  Topic ${critical.topic_id} not found in database, skipping...`);
        continue;
      }

      const subject = topic.specs?.subject || 'Unknown';
      const examBoard = topic.specs?.exam_board || topic.specs?.board || 'Unknown';
      
      console.log('─'.repeat(80));
      console.log(`📌 Topic ${i + 1} of ${criticalTopics.length}`);
      console.log(`   Title: ${topic.title}`);
      console.log(`   Subject: ${subject}`);
      console.log(`   Exam Board: ${examBoard.toUpperCase()}`);
      console.log(`   Level: ${topic.level}`);
      console.log(`   Parent Title: ${topic.parent_title || 'N/A'}`);
      console.log(`   Used in: ${critical.block_count} block(s)`);
      console.log('');

      const targetLevel = topic.level - 1;
      const potentialParents = await findPotentialParents(
        topic.spec_id,
        topic.parent_title || '',
        targetLevel
      );

      if (potentialParents.length === 0) {
        console.log('   ❌ No potential parents found');
        console.log('   💡 You may need to:');
        console.log('      - Check if parent_title is correct');
        console.log('      - Look for similar topic names in the same spec');
        console.log('      - Check if the parent topic exists at all');
        console.log('');
        
        const skip = await question('   Skip this topic? (y/n): ');
        if (skip.toLowerCase() === 'y') {
          results.skipped.push({
            topic_id: topic.id,
            topic_title: topic.title,
            reason: 'No potential parents found'
          });
          console.log('   ⏭️  Skipped\n');
          continue;
        }
      } else {
        console.log(`   Found ${potentialParents.length} potential parent(s):`);
        console.log('');
        potentialParents.forEach((parent, idx) => {
          console.log(`   ${idx + 1}. "${parent.title}"`);
          console.log(`      Score: ${parent.score}% - ${parent.reason}`);
          console.log(`      ID: ${parent.id}`);
          console.log('');
        });

        const choice = await question('   Enter number to select parent (or "s" to skip, "n" for none): ');
        
        if (choice.toLowerCase() === 's') {
          results.skipped.push({
            topic_id: topic.id,
            topic_title: topic.title,
            reason: 'User skipped'
          });
          console.log('   ⏭️  Skipped\n');
          continue;
        }

        if (choice.toLowerCase() === 'n') {
          results.skipped.push({
            topic_id: topic.id,
            topic_title: topic.title,
            reason: 'User chose none'
          });
          console.log('   ⏭️  Skipped\n');
          continue;
        }

        const selectedIndex = parseInt(choice) - 1;
        if (selectedIndex < 0 || selectedIndex >= potentialParents.length) {
          console.log('   ❌ Invalid selection, skipping...\n');
          results.skipped.push({
            topic_id: topic.id,
            topic_title: topic.title,
            reason: 'Invalid selection'
          });
          continue;
        }

        const selectedParent = potentialParents[selectedIndex];
        console.log(`   ✅ Selected: "${selectedParent.title}"`);
        console.log('');

        if (!DRY_RUN) {
          const { error: updateError } = await supabase
            .from('topics')
            .update({ parent_id: selectedParent.id })
            .eq('id', topic.id);

          if (updateError) {
            console.log(`   ❌ Failed to update: ${updateError.message}\n`);
            results.failed.push({
              topic_id: topic.id,
              topic_title: topic.title,
              error: updateError.message
            });
          } else {
            console.log(`   ✅ Updated successfully!\n`);
            results.fixed.push({
              topic_id: topic.id,
              topic_title: topic.title,
              parent_id: selectedParent.id,
              parent_title: selectedParent.title
            });
          }
        } else {
          console.log(`   🔍 Would update: parent_id = ${selectedParent.id}\n`);
          results.fixed.push({
            topic_id: topic.id,
            topic_title: topic.title,
            parent_id: selectedParent.id,
            parent_title: selectedParent.title,
            dry_run: true
          });
        }
      }
    }

    // STEP 4: Summary
    console.log('='.repeat(80));
    console.log('📋 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
    console.log(`✅ Fixed: ${results.fixed.length}`);
    console.log(`⏭️  Skipped: ${results.skipped.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log('');

    if (results.fixed.length > 0) {
      console.log('Fixed topics:');
      results.fixed.forEach(r => {
        console.log(`  ✅ "${r.topic_title}" → "${r.parent_title}"`);
      });
      console.log('');
    }

    if (results.skipped.length > 0) {
      console.log('Skipped topics:');
      results.skipped.forEach(r => {
        console.log(`  ⏭️  "${r.topic_title}" - ${r.reason}`);
      });
      console.log('');
    }

    if (!DRY_RUN && results.fixed.length > 0) {
      console.log('⚠️  IMPORTANT: Run the diagnostic script again to verify fixes!');
    }

    rl.close();
    return results;

  } catch (error) {
    console.error('\n❌ Script failed:', error);
    rl.close();
    throw error;
  }
}

// Run script
fixCriticalTopics()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

