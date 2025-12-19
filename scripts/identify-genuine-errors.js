// scripts/identify-genuine-errors.js
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

async function identifyGenuineErrors() {
  // Read the issues CSV
  const issuesPath = join(__dirname, '..', 'docs', 'level-mismatches-2025-12-02.csv');
  const issuesContent = fs.readFileSync(issuesPath, 'utf-8');
  const issuesLines = issuesContent.trim().split('\n');
  const issuesHeader = parseCSVLine(issuesLines[0]);
  
  const issueIdIdx = issuesHeader.indexOf('id');
  const issueTitleIdx = issuesHeader.indexOf('title');
  const issueLevelIdx = issuesHeader.indexOf('level');
  const issueParentTitleIdx = issuesHeader.indexOf('parent_title');
  const issueParentLevelIdx = issuesHeader.indexOf('parent_level');
  const issueIdx = issuesHeader.indexOf('issue');

  // Read the import CSV
  const importPath = join(__dirname, '..', 'data', 'topics-import.csv');
  const importContent = fs.readFileSync(importPath, 'utf-8');
  const importLines = importContent.trim().split('\n');
  const importHeader = parseCSVLine(importLines[0]);
  
  const importSubjectIdx = importHeader.indexOf('subject');
  const importExamBoardIdx = importHeader.indexOf('exam_board');
  const importLevelIdx = importHeader.indexOf('level');
  const importTitleIdx = importHeader.indexOf('title');
  const importParentTitleIdx = importHeader.indexOf('parent_title');

  // Parse import CSV
  const importTopics = new Map();
  for (let i = 1; i < importLines.length; i++) {
    const line = importLines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    if (values.length < importHeader.length) continue;

    const key = `${values[importSubjectIdx]?.trim()}|${values[importExamBoardIdx]?.trim()}|${values[importLevelIdx]?.trim()}|${(values[importTitleIdx] || '').trim()}`;
    importTopics.set(key, {
      subject: values[importSubjectIdx]?.trim(),
      exam_board: values[importExamBoardIdx]?.trim(),
      level: parseInt(values[importLevelIdx]) || null,
      title: values[importTitleIdx]?.trim(),
      parent_title: values[importParentTitleIdx]?.trim() || ''
    });
  }

  console.log(`📊 Parsed ${importTopics.size} topics from import CSV\n`);

  // Fetch specs
  const { data: specs } = await supabase
    .from('specs')
    .select('id, subject, exam_board');

  const specMap = new Map();
  specs?.forEach(spec => {
    specMap.set(`${spec.subject}|${spec.exam_board.toLowerCase()}`, spec.id);
  });

  // Fetch all topics
  console.log('📥 Fetching topics from database...');
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

  const topicMap = new Map();
  allTopics.forEach(t => {
    topicMap.set(t.id, t);
  });

  // Build parent map
  const parentMap = new Map();
  allTopics.forEach(t => {
    if (t.parent_id) {
      const parent = topicMap.get(t.parent_id);
      if (parent) {
        parentMap.set(t.id, parent);
      }
    }
  });

  // Analyze issues
  const genuineErrors = [];
  const databaseErrors = [];

  for (let i = 1; i < issuesLines.length; i++) {
    const values = parseCSVLine(issuesLines[i]);
    if (values.length < issuesHeader.length) continue;

    const issue = {
      id: values[issueIdIdx],
      title: values[issueTitleIdx]?.trim(),
      level: parseInt(values[issueLevelIdx]) || null,
      parent_title: values[issueParentTitleIdx]?.trim() || '',
      parent_level: values[issueParentLevelIdx] ? parseInt(values[issueParentLevelIdx]) : null,
      issue: values[issueIdx]?.trim()
    };

    // Find topic in database
    const dbTopic = topicMap.get(issue.id);
    if (!dbTopic) continue;

    // Find spec
    const spec = specs?.find(s => s.id === dbTopic.spec_id);
    if (!spec) continue;

    // Find in import CSV
    const importKey = `${spec.subject}|${spec.exam_board.toLowerCase()}|${issue.level}|${issue.title}`;
    const csvTopic = importTopics.get(importKey);

    if (!csvTopic) {
      databaseErrors.push({ ...issue, reason: 'Not found in import CSV' });
      continue;
    }

    // Check if the issue is in the CSV or just in the database
    if (issue.issue.includes('Level 1 topic should not have a parent')) {
      if (csvTopic.parent_title && csvTopic.parent_title.trim() !== '') {
        genuineErrors.push({ ...issue, csv_parent_title: csvTopic.parent_title, reason: 'CSV has parent_title - should be empty' });
      } else {
        databaseErrors.push({ ...issue, reason: 'CSV is correct (empty parent_title) - database has wrong parent_id' });
      }
    } else if (issue.issue.includes('Level 2 topic has Level 2 parent')) {
      // Check if CSV parent_title points to a Level 1 topic
      const csvParentKey = `${spec.subject}|${spec.exam_board.toLowerCase()}|1|${csvTopic.parent_title}`;
      const csvParent = importTopics.get(csvParentKey);
      
      if (csvParent) {
        databaseErrors.push({ ...issue, csv_parent_title: csvTopic.parent_title, reason: 'CSV is correct (parent is Level 1) - database has wrong parent_id' });
      } else {
        // Check if CSV parent is actually Level 2
        const csvParentKey2 = `${spec.subject}|${spec.exam_board.toLowerCase()}|2|${csvTopic.parent_title}`;
        const csvParent2 = importTopics.get(csvParentKey2);
        if (csvParent2) {
          genuineErrors.push({ ...issue, csv_parent_title: csvTopic.parent_title, reason: 'CSV has Level 2 parent - should be Level 1' });
        } else {
          databaseErrors.push({ ...issue, csv_parent_title: csvTopic.parent_title, reason: 'Parent not found in CSV - may be database issue' });
        }
      }
    } else if (issue.issue.includes('Level 2 topic has Level 3 parent')) {
      // Check if CSV parent_title points to a Level 1 topic
      const csvParentKey = `${spec.subject}|${spec.exam_board.toLowerCase()}|1|${csvTopic.parent_title}`;
      const csvParent = importTopics.get(csvParentKey);
      
      if (csvParent) {
        databaseErrors.push({ ...issue, csv_parent_title: csvTopic.parent_title, reason: 'CSV is correct (parent is Level 1) - database has wrong parent_id' });
      } else {
        // Check if CSV parent is actually Level 3
        const csvParentKey3 = `${spec.subject}|${spec.exam_board.toLowerCase()}|3|${csvTopic.parent_title}`;
        const csvParent3 = importTopics.get(csvParentKey3);
        if (csvParent3) {
          genuineErrors.push({ ...issue, csv_parent_title: csvTopic.parent_title, reason: 'CSV has Level 3 parent - should be Level 1' });
        } else {
          databaseErrors.push({ ...issue, csv_parent_title: csvTopic.parent_title, reason: 'Parent not found in CSV - may be database issue' });
        }
      }
    } else if (issue.issue.includes('Level 3 topic has Level 1 parent')) {
      // Check if CSV parent_title points to a Level 2 topic
      const csvParentKey = `${spec.subject}|${spec.exam_board.toLowerCase()}|2|${csvTopic.parent_title}`;
      const csvParent = importTopics.get(csvParentKey);
      
      if (csvParent) {
        databaseErrors.push({ ...issue, csv_parent_title: csvTopic.parent_title, reason: 'CSV is correct (parent is Level 2) - database has wrong parent_id' });
      } else {
        // Check if CSV parent is actually Level 1
        const csvParentKey1 = `${spec.subject}|${spec.exam_board.toLowerCase()}|1|${csvTopic.parent_title}`;
        const csvParent1 = importTopics.get(csvParentKey1);
        if (csvParent1) {
          genuineErrors.push({ ...issue, csv_parent_title: csvTopic.parent_title, reason: 'CSV has Level 1 parent - should be Level 2' });
        } else {
          databaseErrors.push({ ...issue, csv_parent_title: csvTopic.parent_title, reason: 'Parent not found in CSV - may be database issue' });
        }
      }
    } else if (issue.issue.includes('Level 3 topic has Level 3 parent')) {
      // Check if CSV parent_title points to a Level 2 topic
      const csvParentKey = `${spec.subject}|${spec.exam_board.toLowerCase()}|2|${csvTopic.parent_title}`;
      const csvParent = importTopics.get(csvParentKey);
      
      if (csvParent) {
        databaseErrors.push({ ...issue, csv_parent_title: csvTopic.parent_title, reason: 'CSV is correct (parent is Level 2) - database has wrong parent_id' });
      } else {
        // Check if CSV parent is actually Level 3
        const csvParentKey3 = `${spec.subject}|${spec.exam_board.toLowerCase()}|3|${csvTopic.parent_title}`;
        const csvParent3 = importTopics.get(csvParentKey3);
        if (csvParent3) {
          genuineErrors.push({ ...issue, csv_parent_title: csvTopic.parent_title, reason: 'CSV has Level 3 parent - should be Level 2' });
        } else {
          databaseErrors.push({ ...issue, csv_parent_title: csvTopic.parent_title, reason: 'Parent not found in CSV - may be database issue' });
        }
      }
    } else if (issue.issue.includes('has no parent')) {
      if (csvTopic.parent_title && csvTopic.parent_title.trim() !== '') {
        databaseErrors.push({ ...issue, csv_parent_title: csvTopic.parent_title, reason: 'CSV has parent_title - database missing parent_id (will be fixed on re-import)' });
      } else {
        if (issue.level > 1) {
          genuineErrors.push({ ...issue, csv_parent_title: csvTopic.parent_title, reason: 'CSV missing parent_title - topic should have a parent' });
        } else {
          databaseErrors.push({ ...issue, reason: 'CSV is correct (no parent for Level 1) - database issue' });
        }
      }
    } else {
      databaseErrors.push({ ...issue, reason: 'Unknown issue type' });
    }
  }

  console.log(`\n📊 Analysis Results:\n`);
  console.log(`   ✅ Genuine errors (fix in Google Sheets): ${genuineErrors.length}`);
  console.log(`   🔄 Database errors (will be fixed on re-import): ${databaseErrors.length}`);
  console.log(`   📝 Total issues: ${genuineErrors.length + databaseErrors.length}\n`);

  // Show genuine errors
  if (genuineErrors.length > 0) {
    console.log(`❌ GENUINE ERRORS - Fix these in Google Sheets:\n`);
    genuineErrors.slice(0, 10).forEach(err => {
      console.log(`   - "${err.title}" (Level ${err.level})`);
      console.log(`     Issue: ${err.issue}`);
      console.log(`     CSV parent_title: "${err.csv_parent_title || '(empty)'}"`);
      console.log(`     Reason: ${err.reason}`);
      console.log('');
    });
    if (genuineErrors.length > 10) {
      console.log(`   ... and ${genuineErrors.length - 10} more\n`);
    }
  }

  // Save reports
  const reportDir = join(__dirname, '..', 'docs');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // Genuine errors CSV
  const genuineCsvLines = [];
  genuineCsvLines.push('id,title,level,parent_title,issue,reason,csv_parent_title');
  genuineErrors.forEach(err => {
    genuineCsvLines.push([
      err.id,
      `"${(err.title || '').replace(/"/g, '""')}"`,
      err.level,
      `"${(err.parent_title || '').replace(/"/g, '""')}"`,
      `"${err.issue.replace(/"/g, '""')}"`,
      `"${err.reason.replace(/"/g, '""')}"`,
      `"${(err.csv_parent_title || '').replace(/"/g, '""')}"`
    ].join(','));
  });

  const genuineCsvPath = join(reportDir, `genuine-errors-to-fix-${new Date().toISOString().split('T')[0]}.csv`);
  fs.writeFileSync(genuineCsvPath, genuineCsvLines.join('\n'));
  console.log(`💾 Genuine errors saved to: ${genuineCsvPath}`);

  // Database errors CSV (for reference)
  const dbCsvLines = [];
  dbCsvLines.push('id,title,level,parent_title,issue,reason');
  databaseErrors.forEach(err => {
    dbCsvLines.push([
      err.id,
      `"${(err.title || '').replace(/"/g, '""')}"`,
      err.level,
      `"${(err.parent_title || '').replace(/"/g, '""')}"`,
      `"${err.issue.replace(/"/g, '""')}"`,
      `"${err.reason.replace(/"/g, '""')}"`
    ].join(','));
  });

  const dbCsvPath = join(reportDir, `database-errors-will-fix-on-import-${new Date().toISOString().split('T')[0]}.csv`);
  fs.writeFileSync(dbCsvPath, dbCsvLines.join('\n'));
  console.log(`💾 Database errors (will fix on re-import) saved to: ${dbCsvPath}`);

  console.log(`\n💡 Summary:`);
  console.log(`   - Fix ${genuineErrors.length} genuine errors in Google Sheets`);
  console.log(`   - ${databaseErrors.length} errors will be automatically fixed when you re-import`);
}

identifyGenuineErrors().catch(console.error);




