// scripts/find-topics-in-google-sheet.js
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

async function findTopicsInGoogleSheet() {
  // Read the issues CSV
  const issuesPath = join(__dirname, '..', 'docs', 'level-mismatches-2025-12-02.csv');
  const issuesContent = fs.readFileSync(issuesPath, 'utf-8');
  const issuesLines = issuesContent.trim().split('\n');
  const issuesHeader = parseCSVLine(issuesLines[0]);
  
  const issueTitleIdx = issuesHeader.indexOf('title');
  const issueLevelIdx = issuesHeader.indexOf('level');
  const issueParentTitleIdx = issuesHeader.indexOf('parent_title');
  const issueIdx = issuesHeader.indexOf('issue');

  // Read the original import CSV
  const importPath = join(__dirname, '..', 'data', 'topics-import.csv');
  const importContent = fs.readFileSync(importPath, 'utf-8');
  const importLines = importContent.trim().split('\n');
  const importHeader = parseCSVLine(importLines[0]);
  
  const importSubjectIdx = importHeader.indexOf('subject');
  const importExamBoardIdx = importHeader.indexOf('exam_board');
  const importLevelIdx = importHeader.indexOf('level');
  const importTitleIdx = importHeader.indexOf('title');
  const importParentTitleIdx = importHeader.indexOf('parent_title');

  // Parse issues
  const issues = [];
  for (let i = 1; i < issuesLines.length; i++) {
    const values = parseCSVLine(issuesLines[i]);
    if (values.length < issuesHeader.length) continue;

    issues.push({
      title: values[issueTitleIdx]?.trim(),
      level: values[issueLevelIdx]?.trim(),
      parent_title: values[issueParentTitleIdx]?.trim() || '',
      issue: values[issueIdx]?.trim()
    });
  }

  // Parse import CSV and build lookup map
  const importTopics = [];
  for (let i = 1; i < importLines.length; i++) {
    const values = parseCSVLine(importLines[i]);
    if (values.length < importHeader.length) continue;

    importTopics.push({
      row: i + 1, // Google Sheets row number (CSV row + 1 for header)
      subject: values[importSubjectIdx]?.trim(),
      exam_board: values[importExamBoardIdx]?.trim(),
      level: values[importLevelIdx]?.trim(),
      title: values[importTitleIdx]?.trim(),
      parent_title: values[importParentTitleIdx]?.trim() || ''
    });
  }

  // Match issues to import CSV rows
  const matchedIssues = [];
  const unmatchedIssues = [];

  for (const issue of issues) {
    // Try to find exact match
    let match = importTopics.find(t => 
      (t.title || '').trim() === (issue.title || '').trim() &&
      t.level === issue.level
    );

    // If no exact match, try case-insensitive
    if (!match) {
      match = importTopics.find(t => 
        (t.title || '').toLowerCase().trim() === (issue.title || '').toLowerCase().trim() &&
        t.level === issue.level
      );
    }

    if (match) {
      matchedIssues.push({
        ...issue,
        google_sheet_row: match.row,
        subject: match.subject,
        exam_board: match.exam_board,
        csv_title: match.title,
        csv_parent_title: match.parent_title,
        csv_level: match.level
      });
    } else {
      unmatchedIssues.push(issue);
    }
  }

  console.log(`📊 Found ${matchedIssues.length} issues matched to Google Sheet rows`);
  console.log(`   ${unmatchedIssues.length} issues not found in import CSV\n`);

  // Group by issue type
  const byIssueType = {};
  matchedIssues.forEach(issue => {
    const type = issue.issue;
    if (!byIssueType[type]) {
      byIssueType[type] = [];
    }
    byIssueType[type].push(issue);
  });

  // Create CSV report
  const reportDir = join(__dirname, '..', 'docs');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const csvLines = [];
  csvLines.push('google_sheet_row,subject,exam_board,level,title,parent_title,issue,what_to_fix');

  // Sort by issue type, then by row number
  const sortedIssues = matchedIssues.sort((a, b) => {
    if (a.issue !== b.issue) return a.issue.localeCompare(b.issue);
    return a.google_sheet_row - b.google_sheet_row;
  });

  for (const issue of sortedIssues) {
    let whatToFix = '';
    
    if (issue.issue.includes('Level 1 topic should not have a parent')) {
      whatToFix = 'Clear parent_title (set to empty)';
    } else if (issue.issue.includes('Level 2 topic has Level 2 parent')) {
      whatToFix = `Change parent_title to a Level 1 topic (currently: "${issue.csv_parent_title}")`;
    } else if (issue.issue.includes('Level 3 topic has Level 1 parent')) {
      whatToFix = `Change parent_title to a Level 2 topic (currently: "${issue.csv_parent_title}")`;
    } else if (issue.issue.includes('Level 3 topic has Level 3 parent')) {
      whatToFix = `Change parent_title to a Level 2 topic (currently: "${issue.csv_parent_title}")`;
    } else if (issue.issue.includes('has no parent')) {
      whatToFix = `Add correct parent_title (should be a Level ${parseInt(issue.level) - 1} topic)`;
    }

    csvLines.push([
      issue.google_sheet_row,
      `"${issue.subject}"`,
      `"${issue.exam_board}"`,
      issue.level,
      `"${(issue.title || '').replace(/"/g, '""')}"`,
      `"${(issue.csv_parent_title || '').replace(/"/g, '""')}"`,
      `"${issue.issue.replace(/"/g, '""')}"`,
      `"${whatToFix.replace(/"/g, '""')}"`
    ].join(','));
  }

  const csvPath = join(reportDir, `topics-to-fix-in-google-sheet-${new Date().toISOString().split('T')[0]}.csv`);
  fs.writeFileSync(csvPath, csvLines.join('\n'));

  console.log(`💾 Report saved to: ${csvPath}\n`);

  // Print summary by issue type
  console.log('📋 Summary by issue type:');
  for (const [issueType, issues] of Object.entries(byIssueType)) {
    console.log(`\n   ${issueType}: ${issues.length} topics`);
    console.log(`   Sample rows (first 5):`);
    issues.slice(0, 5).forEach(i => {
      console.log(`     - Row ${i.google_sheet_row}: "${i.title}" (${i.subject} ${i.exam_board})`);
    });
    if (issues.length > 5) {
      console.log(`     ... and ${issues.length - 5} more`);
    }
  }

  console.log(`\n💡 How to use:`);
  console.log(`   1. Open the CSV report: ${csvPath}`);
  console.log(`   2. Sort by "google_sheet_row" column`);
  console.log(`   3. In Google Sheets, go to each row number`);
  console.log(`   4. Fix the issue as described in "what_to_fix" column`);
  console.log(`   5. Re-export and re-import when done`);
}

findTopicsInGoogleSheet().catch(console.error);

