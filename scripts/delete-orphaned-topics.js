// scripts/delete-orphaned-topics.js
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

// Proper CSV parser
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

const DRY_RUN = process.argv.includes('--live') ? false : true;

async function deleteOrphanedTopics() {
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No topics will be deleted\n');
  } else {
    console.log('⚠️  LIVE MODE - Topics will be deleted from database\n');
  }

  // Read the database errors CSV to get list of orphaned topic IDs
  const errorsPath = join(__dirname, '..', 'docs', 'database-errors-will-fix-on-import-2025-12-02.csv');
  const errorsContent = fs.readFileSync(errorsPath, 'utf-8');
  const errorsLines = errorsContent.trim().split('\n');
  const errorsHeader = parseCSVLine(errorsLines[0]);
  
  const errorIdIdx = errorsHeader.indexOf('id');
  const errorTitleIdx = errorsHeader.indexOf('title');
  const errorLevelIdx = errorsHeader.indexOf('level');
  const errorIssueIdx = errorsHeader.indexOf('issue');

  // Parse orphaned topic IDs
  const orphanedTopicIds = [];
  for (let i = 1; i < errorsLines.length; i++) {
    const values = parseCSVLine(errorsLines[i]);
    if (values.length < errorsHeader.length) continue;
    
    orphanedTopicIds.push({
      id: values[errorIdIdx],
      title: values[errorTitleIdx]?.trim(),
      level: values[errorLevelIdx],
      issue: values[errorIssueIdx]?.trim()
    });
  }

  console.log(`📊 Found ${orphanedTopicIds.length} orphaned topics to check\n`);

  // Check which topics are used in blocks
  console.log('📥 Checking which topics are used in blocks...');
  const topicIds = orphanedTopicIds.map(t => t.id);
  
  // Fetch blocks that use these topics
  const { data: blocks, error: blocksError } = await supabase
    .from('blocks')
    .select('id, topic_id, user_id')
    .in('topic_id', topicIds);

  if (blocksError) {
    console.error('Error fetching blocks:', blocksError);
    return;
  }

  // Build map of topic_id -> block count
  const topicUsage = new Map();
  blocks?.forEach(block => {
    const count = topicUsage.get(block.topic_id) || 0;
    topicUsage.set(block.topic_id, count + 1);
  });

  // Categorize topics
  const usedTopics = [];
  const unusedTopics = [];

  orphanedTopicIds.forEach(topic => {
    const blockCount = topicUsage.get(topic.id) || 0;
    if (blockCount > 0) {
      usedTopics.push({ ...topic, blockCount });
    } else {
      unusedTopics.push(topic);
    }
  });

  console.log(`\n📊 Analysis:`);
  console.log(`   ✅ Topics NOT used in blocks (safe to delete): ${unusedTopics.length}`);
  console.log(`   ⚠️  Topics used in blocks (need manual review): ${usedTopics.length}\n`);

  if (usedTopics.length > 0) {
    console.log('⚠️  Topics used in blocks (first 10):');
    usedTopics.slice(0, 10).forEach(topic => {
      console.log(`   - "${topic.title}" (Level ${topic.level}) - Used in ${topic.blockCount} block(s)`);
    });
    if (usedTopics.length > 10) {
      console.log(`   ... and ${usedTopics.length - 10} more`);
    }
    console.log('');
  }

  // Delete unused topics
  if (unusedTopics.length > 0) {
    const unusedIds = unusedTopics.map(t => t.id);
    
    console.log(`🗑️  ${DRY_RUN ? 'Would delete' : 'Deleting'} ${unusedIds.length} unused orphaned topics...`);
    
    if (!DRY_RUN) {
      // Delete in batches to avoid overwhelming the database
      const batchSize = 100;
      let deletedCount = 0;
      
      for (let i = 0; i < unusedIds.length; i += batchSize) {
        const batch = unusedIds.slice(i, i + batchSize);
        const { error } = await supabase
          .from('topics')
          .delete()
          .in('id', batch);
        
        if (error) {
          console.error(`Error deleting batch ${i / batchSize + 1}:`, error);
        } else {
          deletedCount += batch.length;
          console.log(`  Deleted ${deletedCount}/${unusedIds.length} topics...`);
        }
      }
      
      console.log(`\n✅ Successfully deleted ${deletedCount} orphaned topics`);
    } else {
      console.log(`\n💡 This was a DRY RUN. To actually delete, run with --live flag:`);
      console.log(`   node scripts/delete-orphaned-topics.js --live`);
    }
  }

  // Save report
  const reportDir = join(__dirname, '..', 'docs');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // Save unused topics (for reference)
  const unusedCsvLines = [];
  unusedCsvLines.push('id,title,level,issue');
  unusedTopics.forEach(topic => {
    unusedCsvLines.push([
      topic.id,
      `"${(topic.title || '').replace(/"/g, '""')}"`,
      topic.level,
      `"${(topic.issue || '').replace(/"/g, '""')}"`
    ].join(','));
  });

  const unusedCsvPath = join(reportDir, `deleted-orphaned-topics-${new Date().toISOString().split('T')[0]}.csv`);
  fs.writeFileSync(unusedCsvPath, unusedCsvLines.join('\n'));
  console.log(`💾 Deleted topics saved to: ${unusedCsvPath}`);

  // Save used topics (for manual review)
  if (usedTopics.length > 0) {
    const usedCsvLines = [];
    usedCsvLines.push('id,title,level,issue,block_count');
    usedTopics.forEach(topic => {
      usedCsvLines.push([
        topic.id,
        `"${(topic.title || '').replace(/"/g, '""')}"`,
        topic.level,
        `"${(topic.issue || '').replace(/"/g, '""')}"`,
        topic.blockCount
      ].join(','));
    });

    const usedCsvPath = join(reportDir, `used-orphaned-topics-need-review-${new Date().toISOString().split('T')[0]}.csv`);
    fs.writeFileSync(usedCsvPath, usedCsvLines.join('\n'));
    console.log(`💾 Used topics (need review) saved to: ${usedCsvPath}`);
  }

  console.log(`\n💡 Summary:`);
  console.log(`   - ${unusedTopics.length} orphaned topics ${DRY_RUN ? 'would be' : 'were'} deleted`);
  if (usedTopics.length > 0) {
    console.log(`   - ${usedTopics.length} topics are used in blocks and need manual review`);
    console.log(`   - Check the CSV report to see which blocks use these topics`);
  }
}

deleteOrphanedTopics().catch(console.error);

