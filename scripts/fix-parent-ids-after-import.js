// scripts/fix-parent-ids-after-import.js
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

async function fixParentIdsAfterImport() {
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  } else {
    console.log('⚠️  LIVE MODE - Changes will be applied to database\n');
  }

  const csvPath = join(__dirname, '..', 'data', 'topics-import.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n');
  const header = parseCSVLine(lines[0]);
  
  const subjectIdx = header.indexOf('subject');
  const examBoardIdx = header.indexOf('exam_board');
  const levelIdx = header.indexOf('level');
  const titleIdx = header.indexOf('title');
  const parentTitleIdx = header.indexOf('parent_title');

  // Parse CSV topics
  const csvTopics = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    if (values.length < header.length) continue;

    csvTopics.push({
      subject: values[subjectIdx]?.trim(),
      exam_board: values[examBoardIdx]?.trim(),
      level: parseInt(values[levelIdx]) || null,
      title: values[titleIdx]?.trim(),
      parent_title: values[parentTitleIdx]?.trim() || ''
    });
  }

  console.log(`📊 Processing ${csvTopics.length} topics from CSV...\n`);

  // Fetch specs
  const { data: specs } = await supabase
    .from('specs')
    .select('id, subject, exam_board');

  const specMap = new Map();
  specs?.forEach(spec => {
    specMap.set(`${spec.subject}|${spec.exam_board.toLowerCase()}`, spec.id);
  });

  // Fetch all topics
  console.log('📥 Fetching all topics from database...');
  const allTopics = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: page } = await supabase
      .from('topics')
      .select('id, title, level, parent_id, spec_id')
      .range(from, from + pageSize - 1);

    if (page && page.length > 0) {
      allTopics.push(...page);
      from += pageSize;
      hasMore = page.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  console.log(`✅ Fetched ${allTopics.length} topics\n`);

  // Build topic maps by spec
  const topicsBySpec = {};
  allTopics.forEach(topic => {
    if (!topicsBySpec[topic.spec_id]) {
      topicsBySpec[topic.spec_id] = [];
    }
    topicsBySpec[topic.spec_id].push(topic);
  });

  // Build title lookup maps
  const titleMaps = {};
  for (const [specId, topics] of Object.entries(topicsBySpec)) {
    const titleMap = new Map();
    topics.forEach(t => {
      const key = (t.title || '').toLowerCase().trim();
      if (!titleMap.has(key)) {
        titleMap.set(key, []);
      }
      titleMap.get(key).push(t);
    });
    titleMaps[specId] = titleMap;
  }

  // Find topics that need parent_id updates
  const topicsToUpdate = [];
  let fixedCount = 0;
  let alreadyCorrectCount = 0;

  for (const csvTopic of csvTopics) {
    if (csvTopic.level <= 1 || !csvTopic.parent_title) continue;

    const specKey = `${csvTopic.subject}|${csvTopic.exam_board.toLowerCase()}`;
    const specId = specMap.get(specKey);
    if (!specId) continue;

    // Find the topic
    const titleMap = titleMaps[specId];
    const topicKey = (csvTopic.title || '').toLowerCase().trim();
    const matchingTopics = titleMap.get(topicKey) || [];
    const topic = matchingTopics.find(t => t.spec_id === specId);

    if (!topic) continue;

    // Check if parent_id is already set correctly
    if (topic.parent_id) {
      const parent = allTopics.find(t => t.id === topic.parent_id);
      if (parent && (parent.title || '').toLowerCase().trim() === (csvTopic.parent_title || '').toLowerCase().trim()) {
        alreadyCorrectCount++;
        continue;
      }
    }

    // Find parent
    const parentKey = (csvTopic.parent_title || '').toLowerCase().trim();
    const parentTitleMap = titleMaps[specId];
    const matchingParents = parentTitleMap.get(parentKey) || [];
    const expectedParentLevel = csvTopic.level - 1;
    const parent = matchingParents.find(p => p.level === expectedParentLevel && p.spec_id === specId);

    if (parent && topic.parent_id !== parent.id) {
      topicsToUpdate.push({
        id: topic.id,
        title: topic.title,
        current_parent_id: topic.parent_id,
        new_parent_id: parent.id,
        parent_title: parent.title
      });
    } else if (!parent) {
      // Parent not found - this is a problem
      console.warn(`⚠️  Could not find parent "${csvTopic.parent_title}" for topic "${csvTopic.title}"`);
    }
  }

  console.log(`📊 Analysis:`);
  console.log(`   Topics that need parent_id update: ${topicsToUpdate.length}`);
  console.log(`   Topics already correct: ${alreadyCorrectCount}\n`);

  if (topicsToUpdate.length === 0) {
    console.log('✅ All parent_id values are already correct!');
    return;
  }

  // Show sample updates
  console.log('📋 Sample updates (first 10):');
  topicsToUpdate.slice(0, 10).forEach(u => {
    console.log(`   - "${u.title}"`);
    console.log(`     Parent: ${u.current_parent_id || 'none'} → ${u.new_parent_id} ("${u.parent_title}")`);
  });
  if (topicsToUpdate.length > 10) {
    console.log(`   ... and ${topicsToUpdate.length - 10} more`);
  }

  // Apply updates
  if (!DRY_RUN) {
    console.log('\n⚠️  Applying parent_id updates...');
    let successCount = 0;
    let errorCount = 0;

    for (const update of topicsToUpdate) {
      const { error } = await supabase
        .from('topics')
        .update({ parent_id: update.new_parent_id })
        .eq('id', update.id);

      if (error) {
        console.error(`❌ Error updating topic ${update.id}:`, error.message);
        errorCount++;
      } else {
        successCount++;
        if (successCount % 50 === 0) {
          console.log(`  Updated ${successCount}/${topicsToUpdate.length} topics...`);
        }
      }
    }

    console.log(`\n✅ Successfully updated: ${successCount}`);
    if (errorCount > 0) {
      console.log(`❌ Errors: ${errorCount}`);
    }
  } else {
    console.log('\n💡 This was a DRY RUN. To apply updates, run with --live flag:');
    console.log('   node scripts/fix-parent-ids-after-import.js --live');
  }
}

fixParentIdsAfterImport().catch(console.error);

