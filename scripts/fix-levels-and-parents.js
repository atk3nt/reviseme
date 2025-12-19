// scripts/fix-levels-and-parents.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.argv.includes('--live') ? false : true;

async function fixLevelsAndParents() {
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  } else {
    console.log('⚠️  LIVE MODE - Changes will be applied to database\n');
  }

  console.log('📥 Fetching all topics...');
  const allTopics = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: page, error } = await supabase
      .from('topics')
      .select('id, title, level, parent_id, parent_title, spec_id, order_index')
      .order('spec_id')
      .order('level')
      .order('order_index')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Error fetching topics:', error);
      break;
    }

    if (page && page.length > 0) {
      allTopics.push(...page);
      from += pageSize;
      hasMore = page.length === pageSize;
      console.log(`  Fetched ${allTopics.length} topics so far...`);
    } else {
      hasMore = false;
    }
  }

  console.log(`✅ Fetched ${allTopics.length} topics\n`);

  // Build topic maps
  const topicMap = new Map(); // id -> topic
  const topicsBySpecAndLevel = new Map(); // specId_level -> [topics]
  const topicsBySpecAndTitle = new Map(); // specId_title -> topic

  allTopics.forEach(topic => {
    topicMap.set(topic.id, topic);
    
    const specLevelKey = `${topic.spec_id}_${topic.level}`;
    if (!topicsBySpecAndLevel.has(specLevelKey)) {
      topicsBySpecAndLevel.set(specLevelKey, []);
    }
    topicsBySpecAndLevel.get(specLevelKey).push(topic);
    
    const specTitleKey = `${topic.spec_id}_${(topic.title || '').trim().toLowerCase()}`;
    topicsBySpecAndTitle.set(specTitleKey, topic);
  });

  const fixes = [];
  const stats = {
    orphanedFixed: 0,
    parentIdSet: 0,
    levelFixed: 0,
    skipped: 0
  };

  console.log('🔍 Analyzing topics and finding fixes...\n');

  for (const topic of allTopics) {
    let needsUpdate = false;
    const update = { id: topic.id };

    // Step 1: Fix orphaned topics (no parent_id but has parent_title)
    if (!topic.parent_id && topic.parent_title) {
      const expectedParentLevel = topic.level - 1;
      const specLevelKey = `${topic.spec_id}_${expectedParentLevel}`;
      const potentialParents = topicsBySpecAndLevel.get(specLevelKey) || [];

      // Try to find parent by exact title match
      let parent = potentialParents.find(p => 
        (p.title || '').trim() === (topic.parent_title || '').trim()
      );

      // Try case-insensitive match
      if (!parent) {
        parent = potentialParents.find(p => 
          (p.title || '').toLowerCase().trim() === (topic.parent_title || '').toLowerCase().trim()
        );
      }

      // Try partial match
      if (!parent && topic.parent_title) {
        const parentTitleLower = (topic.parent_title || '').toLowerCase().trim();
        parent = potentialParents.find(p => {
          const pTitleLower = (p.title || '').toLowerCase().trim();
          return pTitleLower.includes(parentTitleLower) || parentTitleLower.includes(pTitleLower);
        });
      }

      if (parent) {
        update.parent_id = parent.id;
        needsUpdate = true;
        stats.orphanedFixed++;
      } else {
        stats.skipped++;
        continue; // Skip if we can't find parent
      }
    }

    // Step 2: Validate and fix level based on parent
    if (update.parent_id) {
      const parent = topicMap.get(update.parent_id);
      if (parent) {
        const expectedLevel = parent.level + 1;
        if (topic.level !== expectedLevel) {
          update.level = expectedLevel;
          needsUpdate = true;
          stats.levelFixed++;
        }
      }
    } else if (topic.parent_id) {
      // Has parent_id, validate level
      const parent = topicMap.get(topic.parent_id);
      if (parent) {
        const expectedLevel = parent.level + 1;
        if (topic.level !== expectedLevel) {
          update.level = expectedLevel;
          needsUpdate = true;
          stats.levelFixed++;
        }
      }
    } else {
      // No parent - should be Level 1
      if (topic.level !== 1) {
        update.level = 1;
        needsUpdate = true;
        stats.levelFixed++;
      }
    }

    // Step 3: Set parent_id if we have parent_title but no parent_id
    if (!update.parent_id && topic.parent_title && !topic.parent_id) {
      const expectedParentLevel = (update.level || topic.level) - 1;
      if (expectedParentLevel >= 1) {
        const specLevelKey = `${topic.spec_id}_${expectedParentLevel}`;
        const potentialParents = topicsBySpecAndLevel.get(specLevelKey) || [];

        let parent = potentialParents.find(p => 
          (p.title || '').trim() === (topic.parent_title || '').trim()
        );

        if (!parent) {
          parent = potentialParents.find(p => 
            (p.title || '').toLowerCase().trim() === (topic.parent_title || '').toLowerCase().trim()
          );
        }

        if (parent) {
          update.parent_id = parent.id;
          needsUpdate = true;
          stats.parentIdSet++;
        }
      }
    }

    if (needsUpdate) {
      fixes.push({
        ...update,
        original: {
          level: topic.level,
          parent_id: topic.parent_id,
          title: topic.title
        }
      });
    }
  }

  console.log('='.repeat(100));
  console.log('📊 FIX SUMMARY\n');
  console.log(`Total topics analyzed: ${allTopics.length}`);
  console.log(`✅ Topics that need fixes: ${fixes.length}`);
  console.log(`   - Orphaned topics fixed: ${stats.orphanedFixed}`);
  console.log(`   - Parent IDs set: ${stats.parentIdSet}`);
  console.log(`   - Levels corrected: ${stats.levelFixed}`);
  console.log(`   - Skipped (can't find parent): ${stats.skipped}`);

  if (fixes.length === 0) {
    console.log('\n✅ No fixes needed! All topics are correct.');
    return;
  }

  // Show sample fixes
  console.log('\n📋 Sample fixes (first 10):');
  fixes.slice(0, 10).forEach(fix => {
    console.log(`\n  Topic: "${fix.original.title}"`);
    console.log(`    Current: Level ${fix.original.level}, parent_id: ${fix.original.parent_id || 'none'}`);
    if (fix.level !== fix.original.level) {
      console.log(`    → Level: ${fix.original.level} → ${fix.level}`);
    }
    if (fix.parent_id !== fix.original.parent_id) {
      const parent = topicMap.get(fix.parent_id);
      console.log(`    → Parent: ${fix.original.parent_id || 'none'} → ${fix.parent_id} ("${parent?.title || 'unknown'}")`);
    }
  });

  if (fixes.length > 10) {
    console.log(`\n  ... and ${fixes.length - 10} more fixes`);
  }

  // Save fix plan
  const reportDir = join(__dirname, '..', 'docs');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportPath = join(reportDir, `fix-plan-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({
    summary: {
      total: allTopics.length,
      fixes: fixes.length,
      stats
    },
    fixes: fixes.map(f => ({
      id: f.id,
      title: f.original.title,
      level: f.level || f.original.level,
      parent_id: f.parent_id || f.original.parent_id,
      changes: {
        level: f.level !== f.original.level ? { from: f.original.level, to: f.level } : null,
        parent_id: f.parent_id !== f.original.parent_id ? { from: f.original.parent_id, to: f.parent_id } : null
      }
    }))
  }, null, 2));
  console.log(`\n💾 Fix plan saved to: ${reportPath}`);

  // Apply fixes if not dry run
  if (!DRY_RUN) {
    console.log('\n' + '='.repeat(100));
    console.log('⚠️  APPLYING FIXES TO DATABASE...\n');

    let successCount = 0;
    let errorCount = 0;

    for (const fix of fixes) {
      const updateData = {};
      if (fix.level !== undefined) updateData.level = fix.level;
      if (fix.parent_id !== undefined) updateData.parent_id = fix.parent_id;

      const { error } = await supabase
        .from('topics')
        .update(updateData)
        .eq('id', fix.id);

      if (error) {
        console.error(`❌ Error updating topic ${fix.id}:`, error.message);
        errorCount++;
      } else {
        successCount++;
        if (successCount % 50 === 0) {
          console.log(`  Updated ${successCount}/${fixes.length} topics...`);
        }
      }
    }

    console.log(`\n✅ Successfully updated: ${successCount}`);
    if (errorCount > 0) {
      console.log(`❌ Errors: ${errorCount}`);
    }
  } else {
    console.log('\n' + '='.repeat(100));
    console.log('💡 This was a DRY RUN. To apply fixes, run with --live flag:');
    console.log('   node scripts/fix-levels-and-parents.js --live');
  }
}

fixLevelsAndParents().catch(console.error);




