// scripts/migrate-parent-title-to-id.js
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
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const DRY_RUN = process.env.DRY_RUN !== 'false'; // Default to dry-run
const BATCH_SIZE = 100;

async function migrateParentTitles() {
  console.log('='.repeat(60));
  console.log('PARENT_TITLE → PARENT_ID MIGRATION');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '✏️  LIVE (will update database)'}`);
  console.log('');

  try {
    // STEP 1: Pre-migration verification
    console.log('📊 Step 1: Pre-migration verification...');
    // Fetch all topics (Supabase default limit is 1000, so we need to paginate)
    let preStats = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: page, error: pageError } = await supabase
        .from('topics')
        .select('id, spec_id, title, parent_title, level, parent_id')
        .order('spec_id')
        .order('level')
        .order('order_index')
        .range(from, from + pageSize - 1);

      if (pageError) {
        throw new Error(`Failed to fetch topics: ${pageError.message}`);
      }

      if (page && page.length > 0) {
        preStats = preStats.concat(page);
        from += pageSize;
        hasMore = page.length === pageSize;
        console.log(`  Fetched ${preStats.length} topics so far...`);
      } else {
        hasMore = false;
      }
    }

    const preError = null; // No error if we got here

    const stats = {
      total: preStats.length,
      level1: preStats.filter(t => t.level === 1).length,
      level2: preStats.filter(t => t.level === 2).length,
      level3: preStats.filter(t => t.level === 3).length,
      withParentTitle: preStats.filter(t => t.parent_title && t.parent_title.trim() !== '').length,
      withParentId: preStats.filter(t => t.parent_id).length,
    };

    console.log(`  Total topics: ${stats.total}`);
    console.log(`  Level 1: ${stats.level1}`);
    console.log(`  Level 2: ${stats.level2}`);
    console.log(`  Level 3: ${stats.level3}`);
    console.log(`  With parent_title: ${stats.withParentTitle}`);
    console.log(`  With parent_id: ${stats.withParentId}`);
    console.log('');

    // STEP 2: Build lookup maps
    console.log('🗺️  Step 2: Building topic lookup maps...');
    const topicMap = new Map(); // (spec_id, title) -> topic

    preStats.forEach(topic => {
      const key = `${topic.spec_id}:${topic.title}`;
      topicMap.set(key, topic);
    });

    console.log(`  Built map with ${topicMap.size} topics`);
    console.log('');

    // STEP 3: Identify issues before migration
    console.log('🔍 Step 3: Identifying potential issues...');
    const issues = {
      orphaned: [],
      duplicates: [],
      missing: [],
    };

    preStats.forEach(topic => {
      if (!topic.parent_title || topic.parent_title.trim() === '') {
        if (topic.level > 1) {
          issues.missing.push({
            id: topic.id,
            title: topic.title,
            level: topic.level,
            spec_id: topic.spec_id,
          });
        }
        return;
      }

      const parentKey = `${topic.spec_id}:${topic.parent_title}`;
      const matches = preStats.filter(t => 
        t.spec_id === topic.spec_id && 
        t.title === topic.parent_title
      );

      if (matches.length === 0) {
        issues.orphaned.push({
          id: topic.id,
          title: topic.title,
          parent_title: topic.parent_title,
          spec_id: topic.spec_id,
        });
      } else if (matches.length > 1) {
        issues.duplicates.push({
          id: topic.id,
          title: topic.title,
          parent_title: topic.parent_title,
          matches: matches.length,
        });
      }
    });

    console.log(`  ⚠️  Orphaned topics: ${issues.orphaned.length}`);
    console.log(`  ⚠️  Duplicate titles: ${issues.duplicates.length}`);
    console.log(`  ⚠️  Missing parent_title: ${issues.missing.length}`);

    if (issues.orphaned.length > 0) {
      console.log('\n  Orphaned topics (will be skipped):');
      issues.orphaned.slice(0, 5).forEach(issue => {
        console.log(`    - "${issue.title}" (parent: "${issue.parent_title}")`);
      });
      if (issues.orphaned.length > 5) {
        console.log(`    ... and ${issues.orphaned.length - 5} more`);
      }
    }

    if (issues.duplicates.length > 0) {
      console.log('\n  ⚠️  WARNING: Duplicate titles found!');
      issues.duplicates.slice(0, 5).forEach(issue => {
        console.log(`    - "${issue.title}" has ${issue.matches} matches`);
      });
    }

    if (issues.orphaned.length > 0 || issues.duplicates.length > 0) {
      console.log('\n  ⚠️  Review issues above before proceeding!');
    }
    console.log('');

    // STEP 4: Perform migration
    console.log('🔄 Step 4: Migrating data...');
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails = [];

    const topicsToMigrate = preStats.filter(t => 
      t.parent_title && 
      t.parent_title.trim() !== '' && 
      !t.parent_id
    );

    console.log(`  Topics to migrate: ${topicsToMigrate.length}`);

    for (let i = 0; i < topicsToMigrate.length; i += BATCH_SIZE) {
      const batch = topicsToMigrate.slice(i, i + BATCH_SIZE);
      
      for (const topic of batch) {
        const parentKey = `${topic.spec_id}:${topic.parent_title}`;
        const parentTopic = topicMap.get(parentKey);

        if (!parentTopic) {
          skipped++;
          continue;
        }

        if (!DRY_RUN) {
          const { error: updateError } = await supabase
            .from('topics')
            .update({ parent_id: parentTopic.id })
            .eq('id', topic.id);

          if (updateError) {
            errors++;
            errorDetails.push({
              topic_id: topic.id,
              topic_title: topic.title,
              error: updateError.message,
            });
            console.error(`    ❌ Error updating "${topic.title}": ${updateError.message}`);
          } else {
            updated++;
          }
        } else {
          updated++;
        }

        if ((updated + skipped + errors) % 100 === 0) {
          console.log(`    Progress: ${updated} updated, ${skipped} skipped, ${errors} errors`);
        }
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✓ Updated: ${updated}`);
    console.log(`⊘ Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log('');

    // STEP 5: Post-migration verification
    if (!DRY_RUN) {
      console.log('✅ Step 5: Post-migration verification...');
      const { data: postStats, error: postError } = await supabase
        .from('topics')
        .select('id, parent_title, parent_id')
        .not('parent_title', 'is', null);

      if (postError) {
        console.error('  ⚠️  Error during verification:', postError);
      } else {
        const stillMissing = postStats.filter(t => 
          t.parent_title && !t.parent_id
        ).length;

        if (stillMissing === 0) {
          console.log('  ✅ All topics with parent_title now have parent_id!');
        } else {
          console.log(`  ⚠️  ${stillMissing} topics still missing parent_id`);
        }
      }
    } else {
      console.log('🔍 DRY RUN complete - no changes made');
      console.log('Run with DRY_RUN=false to perform actual migration');
    }

    console.log('');
    console.log('='.repeat(60));
    return { success: true, stats, updated, skipped, errors, issues };
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  }
}

// Run migration
migrateParentTitles()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

