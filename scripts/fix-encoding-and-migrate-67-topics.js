// scripts/fix-encoding-and-migrate-67-topics.js
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

const SPEC_ID = '098ba4b3-9b03-4679-9f9d-4551bfe2fe7c';

// Function to fix encoding issues
function fixEncoding(text) {
  if (!text) return text;
  return text
    .replace(/Äì/g, '–')  // en-dash
    .replace(/Aì/g, '–')  // en-dash
    .replace(/Äô/g, "'")  // apostrophe
    .replace(/Ãô/g, "'")  // apostrophe
    .replace(/Äò/g, "'")  // opening quote
    .trim();
}

async function fixEncodingAndMigrate() {
  console.log('='.repeat(60));
  console.log('FIX ENCODING & MIGRATE 67 TOPICS');
  console.log('='.repeat(60));
  console.log('');

  try {
    // STEP 1: Fetch all topics in the spec
    console.log('📊 Step 1: Fetching all topics...');
    let allTopics = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: page, error: pageError } = await supabase
        .from('topics')
        .select('id, spec_id, title, parent_title, level, parent_id')
        .eq('spec_id', SPEC_ID)
        .order('level')
        .order('order_index')
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

    console.log(`  Fetched ${allTopics.length} topics`);
    console.log('');

    // STEP 2: Fix encoding in level 2 topic titles
    console.log('🔧 Step 2: Fixing encoding in level 2 topic titles...');
    const level2Topics = allTopics.filter(t => t.level === 2);
    let level2Fixed = 0;

    for (const topic of level2Topics) {
      const fixedTitle = fixEncoding(topic.title);
      if (fixedTitle !== topic.title) {
        const { error } = await supabase
          .from('topics')
          .update({ title: fixedTitle })
          .eq('id', topic.id);

        if (error) {
          console.error(`  ❌ Error fixing "${topic.title}": ${error.message}`);
        } else {
          level2Fixed++;
          // Update in our local array too
          topic.title = fixedTitle;
        }
      }
    }

    console.log(`  ✓ Fixed ${level2Fixed} level 2 topic titles`);
    console.log('');

    // STEP 3: Fix encoding in level 3 topics' parent_title and match to parents
    console.log('🔧 Step 3: Fixing encoding in level 3 parent_title values...');
    const level3Topics = allTopics.filter(t => 
      t.level === 3 && 
      t.parent_title && 
      t.parent_title.trim() !== '' &&
      !t.parent_id
    );

    console.log(`  Found ${level3Topics.length} level 3 topics needing parent_id`);
    console.log('');

    // Build lookup map of level 2 topics by their parent_title (date ranges)
    // Level 3 topics' parent_title should match level 2 topics' parent_title
    const level2MapByParentTitle = new Map();
    allTopics.filter(t => t.level === 2 && t.parent_title).forEach(topic => {
      const key = fixEncoding(topic.parent_title).toLowerCase().trim();
      level2MapByParentTitle.set(key, topic);
      // Also add original (unfixed) version
      const originalKey = topic.parent_title.toLowerCase().trim();
      if (!level2MapByParentTitle.has(originalKey)) {
        level2MapByParentTitle.set(originalKey, topic);
      }
    });

    // Also try matching by level 2 topic title (for cases where parent_title is the topic name)
    const level2MapByTitle = new Map();
    allTopics.filter(t => t.level === 2).forEach(topic => {
      const key = fixEncoding(topic.title).toLowerCase().trim();
      level2MapByTitle.set(key, topic);
      const originalKey = topic.title.toLowerCase().trim();
      if (!level2MapByTitle.has(originalKey)) {
        level2MapByTitle.set(originalKey, topic);
      }
    });

    let matched = 0;
    let updated = 0;
    let stillOrphaned = [];

    for (const topic of level3Topics) {
      // Fix the parent_title encoding
      const fixedParentTitle = fixEncoding(topic.parent_title);
      
      // Try to find parent by matching parent_title (date range) first
      let parentTopic = level2MapByParentTitle.get(fixedParentTitle.toLowerCase().trim());
      
      // If not found, try original parent_title
      if (!parentTopic) {
        parentTopic = level2MapByParentTitle.get(topic.parent_title.toLowerCase().trim());
      }
      
      // If still not found, try matching by level 2 topic title
      if (!parentTopic) {
        parentTopic = level2MapByTitle.get(fixedParentTitle.toLowerCase().trim());
      }
      
      if (!parentTopic) {
        parentTopic = level2MapByTitle.get(topic.parent_title.toLowerCase().trim());
      }

      if (parentTopic) {
        matched++;
        // Update parent_id
        const { error } = await supabase
          .from('topics')
          .update({ parent_id: parentTopic.id })
          .eq('id', topic.id);

        if (error) {
          console.error(`  ❌ Error updating "${topic.title}": ${error.message}`);
        } else {
          updated++;
          if (updated % 10 === 0) {
            console.log(`    Progress: ${updated} topics updated...`);
          }
        }
      } else {
        stillOrphaned.push({
          id: topic.id,
          title: topic.title,
          parent_title: topic.parent_title,
          fixed_parent_title: fixedParentTitle
        });
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('FIX SUMMARY');
    console.log('='.repeat(60));
    console.log(`✓ Level 2 titles fixed: ${level2Fixed}`);
    console.log(`✓ Level 3 topics matched: ${matched}`);
    console.log(`✓ Level 3 topics updated: ${updated}`);
    console.log(`⊘ Still orphaned: ${stillOrphaned.length}`);
    console.log('');

    if (stillOrphaned.length > 0) {
      console.log('⚠️  Topics still without parent (need manual review):');
      stillOrphaned.slice(0, 10).forEach(topic => {
        console.log(`  - "${topic.title}" (parent: "${topic.parent_title}" → fixed: "${topic.fixed_parent_title}")`);
      });
      if (stillOrphaned.length > 10) {
        console.log(`  ... and ${stillOrphaned.length - 10} more`);
      }
    }

    // STEP 4: Final verification
    console.log('');
    console.log('✅ Step 4: Final verification...');
    const { data: finalCheck } = await supabase
      .from('topics')
      .select('id, parent_title, parent_id')
      .eq('spec_id', SPEC_ID)
      .not('parent_title', 'is', null)
      .is('parent_id', null);

    const stillMissing = finalCheck ? finalCheck.length : 0;
    if (stillMissing === 0) {
      console.log('  ✅ All topics with parent_title now have parent_id!');
    } else {
      console.log(`  ⚠️  ${stillMissing} topics still missing parent_id`);
    }

    console.log('');
    console.log('='.repeat(60));
    return { success: true, level2Fixed, matched, updated, stillOrphaned };
  } catch (error) {
    console.error('\n❌ Fix failed:', error);
    throw error;
  }
}

// Run fix
fixEncodingAndMigrate()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

