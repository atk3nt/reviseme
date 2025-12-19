// scripts/export-topics-for-manual-review.js
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

async function exportTopicsForManualReview() {
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

  // Fetch specs for subject/board info
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

  // Build topic map for parent lookups
  const topicMap = new Map();
  allTopics.forEach(topic => {
    topicMap.set(topic.id, topic);
  });

  // Analyze each topic
  const topicsWithIssues = [];
  const topicsCorrect = [];

  for (const topic of allTopics) {
    const spec = specMap.get(topic.spec_id);
    let issue = null;
    let parentLevel = null;
    let parentTitle = null;

    if (topic.parent_id) {
      const parent = topicMap.get(topic.parent_id);
      if (parent) {
        parentLevel = parent.level;
        parentTitle = parent.title;
        
        // Check if level is correct
        const expectedLevel = parent.level + 1;
        if (topic.level !== expectedLevel) {
          issue = `Level ${topic.level} but parent is Level ${parent.level} (should be Level ${expectedLevel})`;
        }
      } else {
        issue = `Parent ID ${topic.parent_id} does not exist`;
      }
    } else {
      // No parent - should be Level 1
      if (topic.level !== 1) {
        issue = `Level ${topic.level} but no parent (should be Level 1)`;
      }
    }

    const topicData = {
      id: topic.id,
      title: topic.title,
      level: topic.level,
      parent_id: topic.parent_id || '',
      parent_title: topic.parent_title || '',
      parent_level: parentLevel,
      parent_title_from_id: parentTitle,
      spec_id: topic.spec_id,
      subject: spec?.subject || 'Unknown',
      exam_board: spec?.exam_board || 'Unknown',
      order_index: topic.order_index || 0,
      issue: issue || ''
    };

    if (issue) {
      topicsWithIssues.push(topicData);
    } else {
      topicsCorrect.push(topicData);
    }
  }

  console.log('📊 Analysis:');
  console.log(`  ✅ Correct topics: ${topicsCorrect.length}`);
  console.log(`  ❌ Topics with issues: ${topicsWithIssues.length}`);
  console.log(`  📝 Total: ${allTopics.length}\n`);

  // Export all topics (with issues marked)
  const reportDir = join(__dirname, '..', 'docs');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // CSV with all topics, sorted by spec, then level, then order
  const allTopicsForExport = [...topicsWithIssues, ...topicsCorrect].sort((a, b) => {
    if (a.spec_id !== b.spec_id) return a.spec_id.localeCompare(b.spec_id);
    if (a.level !== b.level) return a.level - b.level;
    return (a.order_index || 0) - (b.order_index || 0);
  });

  const csvLines = [];
  csvLines.push('id,title,level,parent_id,parent_title,parent_level,parent_title_from_id,spec_id,subject,exam_board,order_index,issue,corrected_level,corrected_parent_id');

  allTopicsForExport.forEach(topic => {
    csvLines.push([
      topic.id,
      `"${(topic.title || '').replace(/"/g, '""')}"`,
      topic.level,
      topic.parent_id || '',
      `"${(topic.parent_title || '').replace(/"/g, '""')}"`,
      topic.parent_level || '',
      `"${(topic.parent_title_from_id || '').replace(/"/g, '""')}"`,
      topic.spec_id,
      `"${topic.subject}"`,
      `"${topic.exam_board}"`,
      topic.order_index,
      `"${topic.issue.replace(/"/g, '""')}"`,
      '', // corrected_level - for manual filling
      ''  // corrected_parent_id - for manual filling
    ].join(','));
  });

  const csvPath = join(reportDir, `all-topics-for-review-${new Date().toISOString().split('T')[0]}.csv`);
  fs.writeFileSync(csvPath, csvLines.join('\n'));
  console.log(`💾 All topics exported to: ${csvPath}`);

  // Separate CSV with only issues
  const issuesCsvLines = [];
  issuesCsvLines.push('id,title,level,parent_id,parent_title,parent_level,parent_title_from_id,spec_id,subject,exam_board,order_index,issue,corrected_level,corrected_parent_id');

  topicsWithIssues.sort((a, b) => {
    if (a.spec_id !== b.spec_id) return a.spec_id.localeCompare(b.spec_id);
    if (a.level !== b.level) return a.level - b.level;
    return (a.order_index || 0) - (b.order_index || 0);
  }).forEach(topic => {
    issuesCsvLines.push([
      topic.id,
      `"${(topic.title || '').replace(/"/g, '""')}"`,
      topic.level,
      topic.parent_id || '',
      `"${(topic.parent_title || '').replace(/"/g, '""')}"`,
      topic.parent_level || '',
      `"${(topic.parent_title_from_id || '').replace(/"/g, '""')}"`,
      topic.spec_id,
      `"${topic.subject}"`,
      `"${topic.exam_board}"`,
      topic.order_index,
      `"${topic.issue.replace(/"/g, '""')}"`,
      '', // corrected_level - for manual filling
      ''  // corrected_parent_id - for manual filling
    ].join(','));
  });

  const issuesCsvPath = join(reportDir, `topics-with-issues-${new Date().toISOString().split('T')[0]}.csv`);
  fs.writeFileSync(issuesCsvPath, issuesCsvLines.join('\n'));
  console.log(`💾 Topics with issues exported to: ${issuesCsvPath}`);

  // Create a hierarchical view by spec
  const topicsBySpec = {};
  allTopicsForExport.forEach(topic => {
    if (!topicsBySpec[topic.spec_id]) {
      topicsBySpec[topic.spec_id] = {
        spec_id: topic.spec_id,
        subject: topic.subject,
        exam_board: topic.exam_board,
        topics: []
      };
    }
    topicsBySpec[topic.spec_id].topics.push(topic);
  });

  // Create hierarchical text view
  const hierarchicalLines = [];
  for (const [specId, specData] of Object.entries(topicsBySpec)) {
    hierarchicalLines.push(`\n${'='.repeat(100)}`);
    hierarchicalLines.push(`SPEC: ${specData.subject} - ${specData.exam_board.toUpperCase()} (${specData.spec_id})`);
    hierarchicalLines.push('='.repeat(100));

    // Group by level
    const byLevel = { 1: [], 2: [], 3: [] };
    specData.topics.forEach(topic => {
      if (byLevel[topic.level]) {
        byLevel[topic.level].push(topic);
      }
    });

    // Print Level 1 topics
    hierarchicalLines.push('\nLEVEL 1 TOPICS:');
    byLevel[1].forEach(topic => {
      const issueMark = topic.issue ? ' ⚠️ ' : '   ';
      hierarchicalLines.push(`${issueMark}[${topic.id}] "${topic.title}"`);
      if (topic.issue) {
        hierarchicalLines.push(`      ISSUE: ${topic.issue}`);
      }
    });

    // Print Level 2 topics with their Level 1 parents
    hierarchicalLines.push('\nLEVEL 2 TOPICS:');
    byLevel[2].forEach(topic => {
      const issueMark = topic.issue ? ' ⚠️ ' : '   ';
      const parentInfo = topic.parent_title_from_id || topic.parent_title || 'NO PARENT';
      hierarchicalLines.push(`${issueMark}[${topic.id}] "${topic.title}"`);
      hierarchicalLines.push(`      Parent: "${parentInfo}" (Level ${topic.parent_level || '?'})`);
      if (topic.issue) {
        hierarchicalLines.push(`      ISSUE: ${topic.issue}`);
      }
    });

    // Print Level 3 topics with their Level 2 parents
    hierarchicalLines.push('\nLEVEL 3 TOPICS:');
    byLevel[3].forEach(topic => {
      const issueMark = topic.issue ? ' ⚠️ ' : '   ';
      const parentInfo = topic.parent_title_from_id || topic.parent_title || 'NO PARENT';
      hierarchicalLines.push(`${issueMark}[${topic.id}] "${topic.title}"`);
      hierarchicalLines.push(`      Parent: "${parentInfo}" (Level ${topic.parent_level || '?'})`);
      if (topic.issue) {
        hierarchicalLines.push(`      ISSUE: ${topic.issue}`);
      }
    });
  }

  const hierarchicalPath = join(reportDir, `topics-hierarchical-view-${new Date().toISOString().split('T')[0]}.txt`);
  fs.writeFileSync(hierarchicalPath, hierarchicalLines.join('\n'));
  console.log(`💾 Hierarchical view exported to: ${hierarchicalPath}`);

  console.log('\n' + '='.repeat(100));
  console.log('✅ Export complete!');
  console.log('\nFiles created:');
  console.log(`  1. ${csvPath}`);
  console.log(`     - All topics with columns for manual correction`);
  console.log(`  2. ${issuesCsvPath}`);
  console.log(`     - Only topics with issues (easier to focus on)`);
  console.log(`  3. ${hierarchicalPath}`);
  console.log(`     - Hierarchical view by spec for visual review`);
  console.log('\nTo fix:');
  console.log('  1. Open the CSV files in Excel/Google Sheets');
  console.log('  2. Fill in "corrected_level" and "corrected_parent_id" columns');
  console.log('  3. Run the apply-fixes script to update the database');
}

exportTopicsForManualReview().catch(console.error);




