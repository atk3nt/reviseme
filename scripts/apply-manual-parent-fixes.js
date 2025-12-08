// scripts/apply-manual-parent-fixes.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

// MANUAL FIXES: Add your topic_id -> parent_id mappings here
// Format: 'topic_id': 'parent_id'
const MANUAL_FIXES = {
  // Example:
  // 'c488cdbf-750e-49b1-93f8-7c626bd99cd5': 'parent-topic-id-here',
  // 'e7104927-0e4e-4ff8-a79b-d1925156622b': 'another-parent-id-here',
  // Add your fixes below:
};

async function applyManualFixes() {
  console.log('='.repeat(80));
  console.log('🔧 APPLY MANUAL PARENT_ID FIXES');
  console.log('='.repeat(80));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '✏️  LIVE (will update database)'}`);
  console.log('');

  if (Object.keys(MANUAL_FIXES).length === 0) {
    console.log('⚠️  No fixes defined in MANUAL_FIXES object');
    console.log('   Please edit this script and add your topic_id -> parent_id mappings');
    console.log('');
    console.log('   Format:');
    console.log('   const MANUAL_FIXES = {');
    console.log('     "topic-id-1": "parent-id-1",');
    console.log('     "topic-id-2": "parent-id-2",');
    console.log('   };');
    process.exit(1);
  }

  try {
    console.log(`📋 Found ${Object.keys(MANUAL_FIXES).length} fixes to apply`);
    console.log('');

    const results = {
      fixed: [],
      failed: [],
      notFound: []
    };

    // STEP 1: Verify all topics and parents exist
    console.log('🔍 Step 1: Verifying topics and parents exist...');
    const topicIds = Object.keys(MANUAL_FIXES);
    const parentIds = Object.values(MANUAL_FIXES);

    const { data: topics, error: topicsError } = await supabase
      .from('topics')
      .select('id, title, level, spec_id, specs(subject, exam_board)')
      .in('id', topicIds);

    if (topicsError) {
      throw new Error(`Failed to fetch topics: ${topicsError.message}`);
    }

    const { data: parents, error: parentsError } = await supabase
      .from('topics')
      .select('id, title, level, spec_id, specs(subject, exam_board)')
      .in('id', parentIds);

    if (parentsError) {
      throw new Error(`Failed to fetch parents: ${parentsError.message}`);
    }

    const topicMap = new Map();
    topics.forEach(t => topicMap.set(t.id, t));
    const parentMap = new Map();
    parents.forEach(p => parentMap.set(p.id, p));

    // Verify each fix
    const fixesToApply = [];
    for (const [topicId, parentId] of Object.entries(MANUAL_FIXES)) {
      const topic = topicMap.get(topicId);
      const parent = parentMap.get(parentId);

      if (!topic) {
        console.log(`❌ Topic not found: ${topicId}`);
        results.notFound.push({ topic_id: topicId, reason: 'Topic not found' });
        continue;
      }

      if (!parent) {
        console.log(`❌ Parent not found: ${parentId} (for topic: ${topic.title})`);
        results.notFound.push({ 
          topic_id: topicId, 
          topic_title: topic.title,
          parent_id: parentId,
          reason: 'Parent not found' 
        });
        continue;
      }

      // Verify level relationship
      if (parent.level !== topic.level - 1) {
        console.log(`⚠️  Level mismatch: Topic "${topic.title}" (level ${topic.level}) -> Parent "${parent.title}" (level ${parent.level})`);
        console.log(`   Expected parent level: ${topic.level - 1}`);
      }

      // Verify same spec
      if (topic.spec_id !== parent.spec_id) {
        console.log(`⚠️  Spec mismatch: Topic and parent are in different specs`);
        console.log(`   Topic spec: ${topic.specs?.subject || 'Unknown'} ${topic.specs?.exam_board || 'Unknown'}`);
        console.log(`   Parent spec: ${parent.specs?.subject || 'Unknown'} ${parent.specs?.exam_board || 'Unknown'}`);
      }

      fixesToApply.push({ topic, parent });
    }

    console.log(`✅ Verified ${fixesToApply.length} fixes`);
    console.log('');

    // STEP 2: Display what will be fixed
    console.log('📋 Step 2: Fixes to apply:');
    console.log('');
    fixesToApply.forEach((fix, idx) => {
      const topic = fix.topic;
      const parent = fix.parent;
      console.log(`${idx + 1}. "${topic.title}"`);
      console.log(`   Subject: ${topic.specs?.subject || 'Unknown'} ${topic.specs?.exam_board || 'Unknown'}`);
      console.log(`   Level: ${topic.level}`);
      console.log(`   → Parent: "${parent.title}" (Level ${parent.level})`);
      console.log(`   Parent ID: ${parent.id}`);
      console.log('');
    });

    // STEP 3: Apply fixes
    console.log('🔧 Step 3: Applying fixes...');
    console.log('');

    for (const fix of fixesToApply) {
      const topic = fix.topic;
      const parent = fix.parent;

      if (!DRY_RUN) {
        const { error: updateError } = await supabase
          .from('topics')
          .update({ parent_id: parent.id })
          .eq('id', topic.id);

        if (updateError) {
          console.log(`❌ Failed to fix "${topic.title}": ${updateError.message}`);
          results.failed.push({
            topic_id: topic.id,
            topic_title: topic.title,
            parent_id: parent.id,
            error: updateError.message
          });
        } else {
          console.log(`✅ Fixed "${topic.title}" → "${parent.title}"`);
          results.fixed.push({
            topic_id: topic.id,
            topic_title: topic.title,
            parent_id: parent.id,
            parent_title: parent.title
          });
        }
      } else {
        console.log(`🔍 Would fix "${topic.title}" → "${parent.title}" (parent_id: ${parent.id})`);
        results.fixed.push({
          topic_id: topic.id,
          topic_title: topic.title,
          parent_id: parent.id,
          parent_title: parent.title,
          dry_run: true
        });
      }
    }

    console.log('');

    // STEP 4: Summary
    console.log('='.repeat(80));
    console.log('📋 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
    console.log(`✅ Fixed: ${results.fixed.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`⚠️  Not Found: ${results.notFound.length}`);
    console.log('');

    if (results.fixed.length > 0) {
      console.log('Fixed topics:');
      results.fixed.forEach(r => {
        console.log(`  ✅ "${r.topic_title}" → "${r.parent_title}"`);
      });
    }

    if (results.failed.length > 0) {
      console.log('Failed topics:');
      results.failed.forEach(r => {
        console.log(`  ❌ "${r.topic_title}": ${r.error}`);
      });
    }

    if (results.notFound.length > 0) {
      console.log('Not found:');
      results.notFound.forEach(r => {
        console.log(`  ⚠️  ${r.topic_id}: ${r.reason}`);
      });
    }

    if (!DRY_RUN && results.fixed.length > 0) {
      console.log('');
      console.log('⚠️  IMPORTANT: Run the diagnostic script again to verify fixes!');
    }

    return results;

  } catch (error) {
    console.error('\n❌ Script failed:', error);
    throw error;
  }
}

// Run script
applyManualFixes()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

