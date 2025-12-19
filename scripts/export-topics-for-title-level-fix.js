// scripts/export-topics-for-title-level-fix.js
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

async function exportTopicsForTitleLevelFix() {
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

  // Fetch specs
  const { data: specs, error: specsError } = await supabase
    .from('specs')
    .select('id, subject, exam_board');

  if (specsError) {
    console.error('Error fetching specs:', specsError);
    return;
  }

  const specMap = new Map();
  specs?.forEach(spec => {
    specMap.set(spec.id, {
      subject: spec.subject,
      exam_board: spec.exam_board || 'Unknown'
    });
  });

  // Build topic map
  const topicMap = new Map();
  allTopics.forEach(topic => {
    topicMap.set(topic.id, topic);
  });

  // Organize by spec
  const topicsBySpec = {};
  allTopics.forEach(topic => {
    if (!topicsBySpec[topic.spec_id]) {
      topicsBySpec[topic.spec_id] = {
        spec_id: topic.spec_id,
        subject: specMap.get(topic.spec_id)?.subject || 'Unknown',
        exam_board: specMap.get(topic.spec_id)?.exam_board || 'Unknown',
        topics: []
      };
    }
    topicsBySpec[topic.spec_id].topics.push(topic);
  });

  // Create CSV organized by spec, then by level
  const reportDir = join(__dirname, '..', 'docs');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const csvLines = [];
  csvLines.push('spec_id,subject,exam_board,id,current_title,current_level,parent_id,parent_title,parent_title_from_id,order_index,corrected_title,corrected_level,corrected_parent_id,notes');

  // Sort specs
  const sortedSpecs = Object.values(topicsBySpec).sort((a, b) => {
    if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
    return a.exam_board.localeCompare(b.exam_board);
  });

  for (const specData of sortedSpecs) {
    // Add separator
    csvLines.push(`# SPEC: ${specData.subject} - ${specData.exam_board.toUpperCase()},,,,,,,,,,,,`);

    // Group by level
    const byLevel = { 1: [], 2: [], 3: [] };
    specData.topics.forEach(topic => {
      if (byLevel[topic.level]) {
        byLevel[topic.level].push(topic);
      }
    });

    // Export Level 1 topics
    csvLines.push(`# LEVEL 1 TOPICS,,,,,,,,,,,,`);
    byLevel[1].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)).forEach(topic => {
      const parent = topic.parent_id ? topicMap.get(topic.parent_id) : null;
      csvLines.push([
        topic.spec_id,
        `"${specData.subject}"`,
        `"${specData.exam_board}"`,
        topic.id,
        `"${(topic.title || '').replace(/"/g, '""')}"`,
        topic.level,
        topic.parent_id || '',
        `"${(topic.parent_title || '').replace(/"/g, '""')}"`,
        parent ? `"${(parent.title || '').replace(/"/g, '""')}"` : '',
        topic.order_index || 0,
        '', // corrected_title
        '', // corrected_level
        '', // corrected_parent_id
        ''  // notes
      ].join(','));
    });

    // Export Level 2 topics
    csvLines.push(`# LEVEL 2 TOPICS,,,,,,,,,,,,`);
    byLevel[2].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)).forEach(topic => {
      const parent = topic.parent_id ? topicMap.get(topic.parent_id) : null;
      const issue = !topic.parent_id ? 'MISSING PARENT' : 
                   (parent && parent.level !== 1) ? `PARENT IS LEVEL ${parent.level} (should be 1)` : '';
      csvLines.push([
        topic.spec_id,
        `"${specData.subject}"`,
        `"${specData.exam_board}"`,
        topic.id,
        `"${(topic.title || '').replace(/"/g, '""')}"`,
        topic.level,
        topic.parent_id || '',
        `"${(topic.parent_title || '').replace(/"/g, '""')}"`,
        parent ? `"${(parent.title || '').replace(/"/g, '""')}"` : '',
        topic.order_index || 0,
        '', // corrected_title
        '', // corrected_level
        '', // corrected_parent_id
        issue // notes
      ].join(','));
    });

    // Export Level 3 topics
    csvLines.push(`# LEVEL 3 TOPICS,,,,,,,,,,,,`);
    byLevel[3].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)).forEach(topic => {
      const parent = topic.parent_id ? topicMap.get(topic.parent_id) : null;
      const issue = !topic.parent_id ? 'MISSING PARENT' : 
                   (parent && parent.level !== 2) ? `PARENT IS LEVEL ${parent.level} (should be 2)` : 
                   (topic.parent_title && /^\d{4}[\u2013\u2014-]?\d{0,4}$/.test(topic.parent_title.trim())) ? 'PARENT_TITLE LOOKS LIKE DATE RANGE (might be wrong level)' : '';
      csvLines.push([
        topic.spec_id,
        `"${specData.subject}"`,
        `"${specData.exam_board}"`,
        topic.id,
        `"${(topic.title || '').replace(/"/g, '""')}"`,
        topic.level,
        topic.parent_id || '',
        `"${(topic.parent_title || '').replace(/"/g, '""')}"`,
        parent ? `"${(parent.title || '').replace(/"/g, '""')}"` : '',
        topic.order_index || 0,
        '', // corrected_title
        '', // corrected_level
        '', // corrected_parent_id
        issue // notes
      ].join(','));
    });

    csvLines.push(''); // Empty line between specs
  }

  const csvPath = join(reportDir, `topics-for-title-level-fix-${new Date().toISOString().split('T')[0]}.csv`);
  fs.writeFileSync(csvPath, csvLines.join('\n'));
  console.log(`💾 Topics exported to: ${csvPath}`);
  console.log(`\n📋 CSV includes:`);
  console.log(`   - All topics organized by spec and level`);
  console.log(`   - Current titles, levels, and parent relationships`);
  console.log(`   - Columns for corrections: corrected_title, corrected_level, corrected_parent_id`);
  console.log(`   - Notes column highlighting potential issues`);
  console.log(`\n💡 To fix:`);
  console.log(`   1. Open the CSV in Excel/Google Sheets`);
  console.log(`   2. Review topics, especially Level 2 and Level 3`);
  console.log(`   3. Fill in corrected_title, corrected_level, and corrected_parent_id where needed`);
  console.log(`   4. Run apply-title-level-corrections.js to apply changes`);
}

exportTopicsForTitleLevelFix().catch(console.error);




