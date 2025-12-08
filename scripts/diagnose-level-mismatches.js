// scripts/diagnose-level-mismatches.js
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

async function diagnoseLevelMismatches() {
  console.log('🔍 Diagnosing level mismatches...\n');

  // Fetch all topics
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

  // Build topic map
  const topicMap = new Map();
  allTopics.forEach(topic => {
    topicMap.set(topic.id, topic);
  });

  // Analyze each topic
  const issues = {
    level1WithParent: [], // Level 1 topics that have a parent (shouldn't)
    level2WithLevel2Parent: [], // Level 2 topics with Level 2 parent (should have Level 1)
    level2WithLevel3Parent: [], // Level 2 topics with Level 3 parent (impossible)
    level3WithLevel1Parent: [], // Level 3 topics with Level 1 parent (should have Level 2)
    level3WithLevel3Parent: [], // Level 3 topics with Level 3 parent (impossible)
    orphaned: [], // Topics with parent_id but parent doesn't exist
    correct: [] // Topics with correct level relationships
  };

  for (const topic of allTopics) {
    if (!topic.parent_id) {
      // No parent - should be Level 1
      if (topic.level === 1) {
        issues.correct.push(topic);
      } else {
        // Level 2 or 3 with no parent - this is an orphaned topic
        issues.orphaned.push({
          ...topic,
          issue: `Level ${topic.level} topic has no parent (should be Level 1 or have parent)`
        });
      }
    } else {
      // Has parent_id - check if parent exists
      const parent = topicMap.get(topic.parent_id);
      if (!parent) {
        issues.orphaned.push({
          ...topic,
          issue: `Parent with ID ${topic.parent_id} does not exist`
        });
        continue;
      }

      // Check level relationships
      if (topic.level === 1) {
        issues.level1WithParent.push({
          ...topic,
          parent,
          issue: 'Level 1 topic should not have a parent'
        });
      } else if (topic.level === 2) {
        if (parent.level === 1) {
          issues.correct.push(topic);
        } else if (parent.level === 2) {
          issues.level2WithLevel2Parent.push({
            ...topic,
            parent,
            issue: 'Level 2 topic has Level 2 parent (should have Level 1 parent)'
          });
        } else if (parent.level === 3) {
          issues.level2WithLevel3Parent.push({
            ...topic,
            parent,
            issue: 'Level 2 topic has Level 3 parent (impossible)'
          });
        }
      } else if (topic.level === 3) {
        if (parent.level === 2) {
          issues.correct.push(topic);
        } else if (parent.level === 1) {
          issues.level3WithLevel1Parent.push({
            ...topic,
            parent,
            issue: 'Level 3 topic has Level 1 parent (should have Level 2 parent)'
          });
        } else if (parent.level === 3) {
          issues.level3WithLevel3Parent.push({
            ...topic,
            parent,
            issue: 'Level 3 topic has Level 3 parent (impossible)'
          });
        }
      }
    }
  }

  // Print summary
  console.log('='.repeat(100));
  console.log('📊 DIAGNOSTIC SUMMARY\n');
  console.log(`Total topics analyzed: ${allTopics.length}`);
  console.log(`✅ Correct relationships: ${issues.correct.length}`);
  console.log(`❌ Issues found: ${allTopics.length - issues.correct.length}\n`);

  console.log('ISSUE BREAKDOWN:\n');
  console.log(`  ❌ Level 1 topics with parent: ${issues.level1WithParent.length}`);
  console.log(`  ❌ Level 2 topics with Level 2 parent: ${issues.level2WithLevel2Parent.length}`);
  console.log(`  ❌ Level 2 topics with Level 3 parent: ${issues.level2WithLevel3Parent.length}`);
  console.log(`  ❌ Level 3 topics with Level 1 parent: ${issues.level3WithLevel1Parent.length}`);
  console.log(`  ❌ Level 3 topics with Level 3 parent: ${issues.level3WithLevel3Parent.length}`);
  console.log(`  ❌ Orphaned topics (invalid parent_id): ${issues.orphaned.length}`);

  // Show details for each issue type
  const allIssues = [
    ...issues.level1WithParent,
    ...issues.level2WithLevel2Parent,
    ...issues.level2WithLevel3Parent,
    ...issues.level3WithLevel1Parent,
    ...issues.level3WithLevel3Parent,
    ...issues.orphaned
  ];

  if (allIssues.length > 0) {
    console.log('\n' + '='.repeat(100));
    console.log('📋 DETAILED ISSUES:\n');

    // Group by issue type
    const byIssueType = {};
    allIssues.forEach(issue => {
      const type = issue.issue;
      if (!byIssueType[type]) {
        byIssueType[type] = [];
      }
      byIssueType[type].push(issue);
    });

    for (const [issueType, topics] of Object.entries(byIssueType)) {
      console.log(`\n${issueType} (${topics.length} topics):`);
      topics.slice(0, 10).forEach(topic => {
        console.log(`  - "${topic.title}" (Level ${topic.level}, ID: ${topic.id})`);
        if (topic.parent) {
          console.log(`    Parent: "${topic.parent.title}" (Level ${topic.parent.level})`);
        }
      });
      if (topics.length > 10) {
        console.log(`  ... and ${topics.length - 10} more`);
      }
    }
  }

  // Save detailed report
  const reportDir = join(__dirname, '..', 'docs');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportPath = join(reportDir, `level-mismatches-${new Date().toISOString().split('T')[0]}.json`);
  const report = {
    summary: {
      total: allTopics.length,
      correct: issues.correct.length,
      issues: allIssues.length,
      breakdown: {
        level1WithParent: issues.level1WithParent.length,
        level2WithLevel2Parent: issues.level2WithLevel2Parent.length,
        level2WithLevel3Parent: issues.level2WithLevel3Parent.length,
        level3WithLevel1Parent: issues.level3WithLevel1Parent.length,
        level3WithLevel3Parent: issues.level3WithLevel3Parent.length,
        orphaned: issues.orphaned.length
      }
    },
    issues: allIssues.map(issue => ({
      id: issue.id,
      title: issue.title,
      level: issue.level,
      parent_id: issue.parent_id,
      parent_title: issue.parent_title,
      spec_id: issue.spec_id,
      issue: issue.issue,
      parent: issue.parent ? {
        id: issue.parent.id,
        title: issue.parent.title,
        level: issue.parent.level
      } : null
    }))
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Detailed report saved to: ${reportPath}`);

  // Generate CSV for easy review
  const csvLines = [];
  csvLines.push('id,title,level,parent_id,parent_title,parent_level,spec_id,issue');
  allIssues.forEach(issue => {
    csvLines.push([
      issue.id,
      `"${(issue.title || '').replace(/"/g, '""')}"`,
      issue.level,
      issue.parent_id || '',
      `"${(issue.parent_title || '').replace(/"/g, '""')}"`,
      issue.parent ? issue.parent.level : '',
      issue.spec_id,
      `"${issue.issue.replace(/"/g, '""')}"`
    ].join(','));
  });

  const csvPath = join(reportDir, `level-mismatches-${new Date().toISOString().split('T')[0]}.csv`);
  fs.writeFileSync(csvPath, csvLines.join('\n'));
  console.log(`💾 CSV report saved to: ${csvPath}`);

  console.log('\n' + '='.repeat(100));
  console.log('\n✅ Diagnosis complete!');
  console.log('\nNext steps:');
  console.log('  1. Review the CSV/JSON reports');
  console.log('  2. Run fix script to automatically correct levels based on parent relationships');
}

diagnoseLevelMismatches().catch(console.error);

