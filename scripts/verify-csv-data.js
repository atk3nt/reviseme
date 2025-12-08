// scripts/verify-csv-data.js
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

// Parse CSV line handling quoted fields with commas
function parseCSVLine(line) {
  const result = [];
  const regex = /"((?:[^"]|"")*)"/g;
  let match;
  
  while ((match = regex.exec(line)) !== null) {
    // Unescape quotes ("" -> ")
    const value = match[1].replace(/""/g, '"');
    result.push(value);
  }
  
  return result;
}

async function verifyCSVData() {
  // Read the CSV
  const csvPath = join(__dirname, '..', 'docs', 'skipped-topics-by-level1-2025-12-02.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n');
  
  // Parse all data rows
  const rowsToCheck = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#') || line.trim() === '') continue;
    
    const values = parseCSVLine(line);
    if (values.length >= 10) {
      const row = {
        id: values[0],
        title: values[1],
        level: values[2],
        parent_title: values[3],
        subject: values[4],
        exam_board: values[5],
        level1_parent_title: values[6],
        spec_id: values[7],
        is_critical: values[8],
        parent_id: values[9]
      };
      rowsToCheck.push(row);
    }
  }

  console.log(`🔍 Verifying ${rowsToCheck.length} entries from CSV...\n`);

  let allCorrect = true;
  let correctCount = 0;
  let issuesCount = 0;
  const issues = [];

  // Fetch all topics for the specs we need (for efficiency)
  const specIds = [...new Set(rowsToCheck.map(r => r.spec_id))];
  console.log(`📥 Fetching topics from ${specIds.length} spec(s)...`);
  
  const allTopics = [];
  for (const specId of specIds) {
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: page, error } = await supabase
        .from('topics')
        .select('id, title, level, parent_title, parent_id, spec_id')
        .eq('spec_id', specId)
        .order('level')
        .order('order_index')
        .range(from, from + pageSize - 1);

      if (error) {
        console.error(`Error fetching topics for spec ${specId}:`, error);
        break;
      }

      if (page && page.length > 0) {
        allTopics.push(...page);
        from += pageSize;
        hasMore = page.length === pageSize;
      } else {
        hasMore = false;
      }
    }
  }

  console.log(`✅ Fetched ${allTopics.length} topics\n`);

  // Build topic map
  const topicMap = new Map();
  allTopics.forEach(topic => {
    topicMap.set(topic.id, topic);
  });

  // Fetch specs to verify subject and exam_board
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

  // Function to find Level 1 parent
  function findLevel1Parent(topicId, specId) {
    let current = topicMap.get(topicId);
    if (!current) return null;

    if (current.level === 1) {
      return current;
    }

    let visited = new Set();
    while (current && current.parent_id && !visited.has(current.id)) {
      visited.add(current.id);
      current = topicMap.get(current.parent_id);
      if (!current) break;
      if (current.spec_id !== specId) break;
      if (current.level === 1) {
        return current;
      }
    }

    return null;
  }

  // Verify each row
  for (let idx = 0; idx < rowsToCheck.length; idx++) {
    const row = rowsToCheck[idx];
    
    // Check if topic exists
    const topic = topicMap.get(row.id);
    if (!topic) {
      console.log(`\n❌ Row ${idx + 1}: Topic ID ${row.id} not found in database`);
      allCorrect = false;
      issuesCount++;
      issues.push({
        row: idx + 1,
        issue: `Topic ID not found`,
        topic_id: row.id,
        title: row.title
      });
      continue;
    }

    // Check title
    const titleMatch = (topic.title || '').trim() === (row.title || '').trim();
    if (!titleMatch) {
      console.log(`\n⚠️  Row ${idx + 1}: Title mismatch`);
      console.log(`   CSV: "${row.title}"`);
      console.log(`   DB:  "${topic.title}"`);
      issues.push({
        row: idx + 1,
        issue: `Title mismatch`,
        csv_title: row.title,
        db_title: topic.title,
        topic_id: row.id
      });
    }

    // Check level
    const levelMatch = topic.level === parseInt(row.level);
    if (!levelMatch) {
      console.log(`\n❌ Row ${idx + 1}: Level mismatch`);
      console.log(`   CSV: Level ${row.level}`);
      console.log(`   DB:  Level ${topic.level}`);
      allCorrect = false;
      issuesCount++;
      issues.push({
        row: idx + 1,
        issue: `Level mismatch`,
        csv_level: row.level,
        db_level: topic.level,
        topic_id: row.id,
        title: row.title
      });
    }

    // Check parent_title
    const parentTitleMatch = (topic.parent_title || '').trim() === (row.parent_title || '').trim();
    if (!parentTitleMatch && row.parent_title) {
      console.log(`\n⚠️  Row ${idx + 1}: Parent title mismatch`);
      console.log(`   CSV: "${row.parent_title}"`);
      console.log(`   DB:  "${topic.parent_title || '(none)'}"`);
      issues.push({
        row: idx + 1,
        issue: `Parent title mismatch`,
        csv_parent_title: row.parent_title,
        db_parent_title: topic.parent_title,
        topic_id: row.id,
        title: row.title
      });
    }

    // Check spec_id
    const specMatch = topic.spec_id === row.spec_id;
    if (!specMatch) {
      console.log(`\n❌ Row ${idx + 1}: Spec ID mismatch`);
      console.log(`   CSV: ${row.spec_id}`);
      console.log(`   DB:  ${topic.spec_id}`);
      allCorrect = false;
      issuesCount++;
      issues.push({
        row: idx + 1,
        issue: `Spec ID mismatch`,
        csv_spec_id: row.spec_id,
        db_spec_id: topic.spec_id,
        topic_id: row.id,
        title: row.title
      });
    }

    // Check subject and exam_board
    const spec = specMap.get(row.spec_id);
    if (spec) {
      const subjectMatch = (spec.subject || '').toLowerCase() === (row.subject || '').toLowerCase();
      if (!subjectMatch) {
        console.log(`\n⚠️  Row ${idx + 1}: Subject mismatch`);
        console.log(`   CSV: "${row.subject}"`);
        console.log(`   DB:  "${spec.subject}"`);
        issues.push({
          row: idx + 1,
          issue: `Subject mismatch`,
          csv_subject: row.subject,
          db_subject: spec.subject,
          topic_id: row.id,
          title: row.title
        });
      }

      const boardMatch = (spec.exam_board || '').toLowerCase() === (row.exam_board || '').toLowerCase();
      if (!boardMatch) {
        console.log(`\n⚠️  Row ${idx + 1}: Exam board mismatch`);
        console.log(`   CSV: "${row.exam_board}"`);
        console.log(`   DB:  "${spec.exam_board}"`);
        issues.push({
          row: idx + 1,
          issue: `Exam board mismatch`,
          csv_exam_board: row.exam_board,
          db_exam_board: spec.exam_board,
          topic_id: row.id,
          title: row.title
        });
      }
    } else {
      console.log(`\n⚠️  Row ${idx + 1}: Spec not found for spec_id ${row.spec_id}`);
      issues.push({
        row: idx + 1,
        issue: `Spec not found`,
        spec_id: row.spec_id,
        topic_id: row.id,
        title: row.title
      });
    }

    // Check level1_parent_title (for Level 3 topics)
    if (row.level === '3' && row.level1_parent_title) {
      const level1Parent = findLevel1Parent(row.id, row.spec_id);
      if (level1Parent) {
        const l1Match = (level1Parent.title || '').trim() === (row.level1_parent_title || '').trim() ||
                       (level1Parent.title || '').toLowerCase() === (row.level1_parent_title || '').toLowerCase();
        if (!l1Match) {
          console.log(`\n⚠️  Row ${idx + 1}: Level 1 parent title mismatch`);
          console.log(`   CSV: "${row.level1_parent_title}"`);
          console.log(`   DB:  "${level1Parent.title}"`);
          issues.push({
            row: idx + 1,
            issue: `Level 1 parent title mismatch`,
            csv_level1: row.level1_parent_title,
            db_level1: level1Parent.title,
            topic_id: row.id,
            title: row.title
          });
        }
      } else {
        console.log(`\n⚠️  Row ${idx + 1}: Could not find Level 1 parent in hierarchy`);
        issues.push({
          row: idx + 1,
          issue: `Level 1 parent not found in hierarchy`,
          topic_id: row.id,
          title: row.title
        });
      }
    }

    if (titleMatch && levelMatch && specMatch) {
      correctCount++;
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Correct entries: ${correctCount}`);
  console.log(`   ⚠️  Entries with warnings: ${issues.length - issuesCount}`);
  console.log(`   ❌ Entries with errors: ${issuesCount}`);
  console.log(`   📝 Total checked: ${rowsToCheck.length}`);

  if (issues.length > 0) {
    console.log(`\n📋 Issues found:`);
    issues.forEach(issue => {
      console.log(`\n   Row ${issue.row}: ${issue.issue}`);
      console.log(`      Topic: "${issue.title || 'N/A'}" (ID: ${issue.topic_id})`);
      if (issue.csv_title) console.log(`      CSV: "${issue.csv_title}"`);
      if (issue.db_title) console.log(`      DB:  "${issue.db_title}"`);
      if (issue.csv_level) console.log(`      CSV Level: ${issue.csv_level}`);
      if (issue.db_level) console.log(`      DB Level: ${issue.db_level}`);
    });
  }

  if (allCorrect && issuesCount === 0) {
    console.log(`\n✅ All critical data is correct! Minor warnings may exist but won't prevent import.`);
  } else if (issuesCount === 0) {
    console.log(`\n⚠️  Some warnings found, but no critical errors. You can proceed with caution.`);
  } else {
    console.log(`\n❌ Critical errors found. Please fix them before proceeding.`);
  }
}

verifyCSVData().catch(console.error);

