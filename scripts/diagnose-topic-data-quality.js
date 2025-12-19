// scripts/diagnose-topic-data-quality.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
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

async function diagnoseDataQuality() {
  console.log('='.repeat(80));
  console.log('📊 TOPIC DATA QUALITY DIAGNOSTIC');
  console.log('='.repeat(80));
  console.log('');

  const report = {
    timestamp: new Date().toISOString(),
    summary: {},
    issues: [],
    orphanedTopics: [],
    topicsInActiveBlocks: [],
    encodingIssues: [],
    circularReferences: [],
    invalidParentIds: []
  };

  try {
    // STEP 1: Fetch all topics
    console.log('📥 Step 1: Fetching all topics...');
    let allTopics = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: page, error: pageError } = await supabase
        .from('topics')
        .select('id, spec_id, title, parent_title, level, parent_id, order_index')
        .order('spec_id')
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
        console.log(`  Fetched ${allTopics.length} topics so far...`);
      } else {
        hasMore = false;
      }
    }

    console.log(`✅ Total topics fetched: ${allTopics.length}`);
    console.log('');

    // STEP 2: Basic statistics
    console.log('📊 Step 2: Calculating statistics...');
    const stats = {
      total: allTopics.length,
      byLevel: { 1: 0, 2: 0, 3: 0 },
      withParentId: 0,
      withoutParentId: 0,
      withParentTitleButNoId: 0,
      orphaned: { level2: 0, level3: 0 }
    };

    allTopics.forEach(topic => {
      stats.byLevel[topic.level] = (stats.byLevel[topic.level] || 0) + 1;
      
      if (topic.parent_id) {
        stats.withParentId++;
      } else {
        stats.withoutParentId++;
        
        // Level 2 and 3 should have parent_id
        if (topic.level === 2 || topic.level === 3) {
          if (topic.level === 2) stats.orphaned.level2++;
          if (topic.level === 3) stats.orphaned.level3++;
        }
      }

      if (topic.parent_title && !topic.parent_id && (topic.level === 2 || topic.level === 3)) {
        stats.withParentTitleButNoId++;
      }
    });

    report.summary = stats;

    console.log(`  Total topics: ${stats.total}`);
    console.log(`  Level 1: ${stats.byLevel[1]}`);
    console.log(`  Level 2: ${stats.byLevel[2]}`);
    console.log(`  Level 3: ${stats.byLevel[3]}`);
    console.log(`  With parent_id: ${stats.withParentId}`);
    console.log(`  Without parent_id: ${stats.withoutParentId}`);
    console.log(`  Orphaned Level 2: ${stats.orphaned.level2}`);
    console.log(`  Orphaned Level 3: ${stats.orphaned.level3}`);
    console.log(`  With parent_title but no parent_id: ${stats.withParentTitleButNoId}`);
    console.log('');

    // STEP 3: Build topic map for validation
    console.log('🗺️  Step 3: Building topic map...');
    const topicMap = new Map();
    allTopics.forEach(topic => {
      topicMap.set(topic.id, topic);
    });
    console.log(`✅ Topic map built: ${topicMap.size} topics`);
    console.log('');

    // STEP 4: Find orphaned topics (detailed)
    console.log('🔍 Step 4: Finding orphaned topics...');
    const orphaned = allTopics.filter(topic => 
      (topic.level === 2 || topic.level === 3) && 
      !topic.parent_id
    );

    orphaned.forEach(topic => {
      report.orphanedTopics.push({
        id: topic.id,
        title: topic.title,
        level: topic.level,
        parent_title: topic.parent_title,
        spec_id: topic.spec_id
      });
    });

    console.log(`  Found ${orphaned.length} orphaned topics`);
    if (orphaned.length > 0) {
      console.log('  Sample orphaned topics:');
      orphaned.slice(0, 5).forEach(topic => {
        console.log(`    - "${topic.title}" (Level ${topic.level}, parent_title: "${topic.parent_title || 'N/A'}")`);
      });
      if (orphaned.length > 5) {
        console.log(`    ... and ${orphaned.length - 5} more`);
      }
    }
    console.log('');

    // STEP 5: Check which orphaned topics are in active blocks
    console.log('📦 Step 5: Checking orphaned topics in active blocks...');
    if (orphaned.length > 0) {
      const orphanedIds = orphaned.map(t => t.id);
      
      // Check in batches (Supabase IN clause limit)
      const batchSize = 100;
      let blocksWithOrphaned = [];
      
      for (let i = 0; i < orphanedIds.length; i += batchSize) {
        const batch = orphanedIds.slice(i, i + batchSize);
        const { data: blocks, error } = await supabase
          .from('blocks')
          .select('id, topic_id, scheduled_at, status')
          .in('topic_id', batch);
        
        if (error) {
          console.error(`  ⚠️  Error checking batch: ${error.message}`);
        } else if (blocks) {
          blocksWithOrphaned = blocksWithOrphaned.concat(blocks);
        }
      }

      // Group by topic_id
      const orphanedTopicUsage = new Map();
      blocksWithOrphaned.forEach(block => {
        if (!orphanedTopicUsage.has(block.topic_id)) {
          orphanedTopicUsage.set(block.topic_id, []);
        }
        orphanedTopicUsage.get(block.topic_id).push(block);
      });

      orphanedTopicUsage.forEach((blocks, topicId) => {
        const topic = orphaned.find(t => t.id === topicId);
        report.topicsInActiveBlocks.push({
          topic_id: topicId,
          topic_title: topic?.title || 'Unknown',
          topic_level: topic?.level || 'Unknown',
          block_count: blocks.length,
          blocks: blocks.map(b => ({
            id: b.id,
            scheduled_at: b.scheduled_at,
            status: b.status
          }))
        });
      });

      console.log(`  ⚠️  Found ${orphanedTopicUsage.size} orphaned topics used in ${blocksWithOrphaned.length} blocks`);
      if (orphanedTopicUsage.size > 0) {
        console.log('  Critical - these topics need fixing:');
        Array.from(orphanedTopicUsage.entries()).slice(0, 5).forEach(([topicId, blocks]) => {
          const topic = orphaned.find(t => t.id === topicId);
          console.log(`    - "${topic?.title}" (${blocks.length} blocks)`);
        });
      }
    } else {
      console.log('  ✅ No orphaned topics found');
    }
    console.log('');

    // STEP 6: Check for invalid parent_id values
    console.log('🔗 Step 6: Validating parent_id references...');
    const invalidParentIds = [];
    allTopics.forEach(topic => {
      if (topic.parent_id) {
        const parent = topicMap.get(topic.parent_id);
        if (!parent) {
          invalidParentIds.push({
            id: topic.id,
            title: topic.title,
            level: topic.level,
            parent_id: topic.parent_id,
            issue: 'Parent does not exist'
          });
        } else if (parent.level !== topic.level - 1) {
          invalidParentIds.push({
            id: topic.id,
            title: topic.title,
            level: topic.level,
            parent_id: topic.parent_id,
            parent_level: parent.level,
            issue: `Parent level mismatch (expected ${topic.level - 1}, got ${parent.level})`
          });
        }
      }
    });

    report.invalidParentIds = invalidParentIds;

    if (invalidParentIds.length > 0) {
      console.log(`  ⚠️  Found ${invalidParentIds.length} topics with invalid parent_id`);
      invalidParentIds.slice(0, 5).forEach(issue => {
        console.log(`    - "${issue.title}": ${issue.issue}`);
      });
    } else {
      console.log('  ✅ All parent_id references are valid');
    }
    console.log('');

    // STEP 7: Check for circular references
    console.log('🔄 Step 7: Checking for circular references...');
    const circularRefs = [];
    allTopics.forEach(topic => {
      if (topic.parent_id) {
        const visited = new Set();
        let current = topic;
        let depth = 0;
        const maxDepth = 10; // Safety limit

        while (current.parent_id && depth < maxDepth) {
          if (visited.has(current.id)) {
            circularRefs.push({
              topic_id: topic.id,
              topic_title: topic.title,
              cycle_start: current.id,
              cycle_start_title: current.title
            });
            break;
          }
          visited.add(current.id);
          current = topicMap.get(current.parent_id);
          if (!current) break;
          depth++;
        }
      }
    });

    report.circularReferences = circularRefs;

    if (circularRefs.length > 0) {
      console.log(`  ⚠️  Found ${circularRefs.length} circular references`);
      circularRefs.slice(0, 5).forEach(ref => {
        console.log(`    - "${ref.topic_title}" has circular reference`);
      });
    } else {
      console.log('  ✅ No circular references found');
    }
    console.log('');

    // STEP 8: Check for encoding issues
    console.log('🔤 Step 8: Checking for encoding issues...');
    const encodingPatterns = [
      /Äì/g, /Aì/g,  // en-dash issues
      /Äô/g, /Ãô/g, /Äò/g  // apostrophe issues
    ];

    const encodingIssues = [];
    allTopics.forEach(topic => {
      encodingPatterns.forEach((pattern, index) => {
        if (pattern.test(topic.title) || (topic.parent_title && pattern.test(topic.parent_title))) {
          encodingIssues.push({
            id: topic.id,
            title: topic.title,
            parent_title: topic.parent_title,
            level: topic.level,
            issue: 'Encoding issue detected'
          });
        }
      });
    });

    report.encodingIssues = encodingIssues;

    if (encodingIssues.length > 0) {
      console.log(`  ⚠️  Found ${encodingIssues.length} topics with encoding issues`);
      encodingIssues.slice(0, 5).forEach(issue => {
        console.log(`    - "${issue.title}"`);
      });
    } else {
      console.log('  ✅ No encoding issues found');
    }
    console.log('');

    // STEP 9: Generate summary report
    console.log('='.repeat(80));
    console.log('📋 SUMMARY REPORT');
    console.log('='.repeat(80));
    console.log('');

    const totalIssues = 
      report.orphanedTopics.length +
      report.invalidParentIds.length +
      report.circularReferences.length +
      report.encodingIssues.length;

    const criticalIssues = report.topicsInActiveBlocks.length;

    console.log(`Total Topics: ${stats.total}`);
    console.log(`Total Issues Found: ${totalIssues}`);
    console.log(`Critical Issues (orphaned topics in blocks): ${criticalIssues}`);
    console.log('');

    if (criticalIssues > 0) {
      console.log('🚨 CRITICAL: These issues affect active blocks and must be fixed!');
      console.log('');
    }

    console.log('Issue Breakdown:');
    console.log(`  - Orphaned topics: ${report.orphanedTopics.length}`);
    console.log(`  - Invalid parent_id: ${report.invalidParentIds.length}`);
    console.log(`  - Circular references: ${report.circularReferences.length}`);
    console.log(`  - Encoding issues: ${report.encodingIssues.length}`);
    console.log('');

    // Save report to file
    const reportDir = join(__dirname, '..', 'docs');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportFile = join(reportDir, `data-quality-audit-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`✅ Detailed report saved to: ${reportFile}`);
    console.log('');

    // Also save CSV for orphaned topics
    if (report.orphanedTopics.length > 0) {
      const csvFile = join(reportDir, `orphaned-topics-${new Date().toISOString().split('T')[0]}.csv`);
      const csvHeader = 'id,title,level,parent_title,spec_id\n';
      const csvRows = report.orphanedTopics.map(t => 
        `"${t.id}","${t.title}","${t.level}","${t.parent_title || ''}","${t.spec_id}"`
      ).join('\n');
      fs.writeFileSync(csvFile, csvHeader + csvRows);
      console.log(`✅ Orphaned topics CSV saved to: ${csvFile}`);
    }

    return report;

  } catch (error) {
    console.error('\n❌ Diagnostic failed:', error);
    throw error;
  }
}

// Run diagnostic
diagnoseDataQuality()
  .then((report) => {
    console.log('✅ Diagnostic completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Diagnostic failed:', error);
    process.exit(1);
  });




