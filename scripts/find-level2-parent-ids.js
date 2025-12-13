// scripts/find-level2-parent-ids.js
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
    const value = match[1].replace(/""/g, '"');
    result.push(value);
  }
  
  return result;
}

async function findLevel2ParentIds() {
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
      rowsToCheck.push({ ...row, lineNumber: i + 1 });
    }
  }

  console.log(`🔍 Finding Level 2 parent IDs for ${rowsToCheck.length} entries...\n`);

  // Group by spec_id for efficiency
  const rowsBySpec = {};
  rowsToCheck.forEach(row => {
    if (!rowsBySpec[row.spec_id]) {
      rowsBySpec[row.spec_id] = [];
    }
    rowsBySpec[row.spec_id].push(row);
  });

  const results = [];

  for (const [specId, rows] of Object.entries(rowsBySpec)) {
    console.log(`\n📋 Processing spec: ${specId} (${rows.length} topics)`);
    
    // Fetch all Level 2 topics for this spec
    const { data: level2Topics, error } = await supabase
      .from('topics')
      .select('id, title, level, parent_id')
      .eq('spec_id', specId)
      .eq('level', 2)
      .order('title');

    if (error) {
      console.error(`Error fetching Level 2 topics:`, error);
      continue;
    }

    console.log(`   Found ${level2Topics?.length || 0} Level 2 topics in this spec\n`);

    // For each orphaned topic, find matching Level 2 parent
    for (const row of rows) {
      if (row.level !== '3') continue; // Only process Level 3 topics

      const parentTitle = (row.parent_title || '').trim();
      if (!parentTitle) continue;

      // Try exact match
      let parent = level2Topics?.find(p => 
        (p.title || '').trim() === parentTitle
      );

      // Try case-insensitive match
      if (!parent) {
        parent = level2Topics?.find(p => 
          (p.title || '').toLowerCase().trim() === parentTitle.toLowerCase()
        );
      }

      // Try partial match
      if (!parent) {
        parent = level2Topics?.find(p => 
          (p.title || '').toLowerCase().includes(parentTitle.toLowerCase()) ||
          parentTitle.toLowerCase().includes((p.title || '').toLowerCase())
        );
      }

      if (parent) {
        results.push({
          lineNumber: row.lineNumber,
          topicId: row.id,
          topicTitle: row.title,
          parentTitle: row.parent_title,
          parentId: parent.id,
          parentTitleInDB: parent.title,
          matchType: (parent.title || '').trim() === parentTitle ? 'exact' : 
                     (parent.title || '').toLowerCase().trim() === parentTitle.toLowerCase() ? 'case-insensitive' : 'partial'
        });
      } else {
        results.push({
          lineNumber: row.lineNumber,
          topicId: row.id,
          topicTitle: row.title,
          parentTitle: row.parent_title,
          parentId: null,
          parentTitleInDB: null,
          matchType: 'not found'
        });
      }
    }
  }

  // Display results
  console.log(`\n${'='.repeat(100)}`);
  console.log(`RESULTS - Parent IDs to fill in:\n`);

  let foundCount = 0;
  let notFoundCount = 0;

  for (const result of results) {
    if (result.parentId) {
      foundCount++;
      console.log(`✅ Row ${result.lineNumber}:`);
      console.log(`   Topic: "${result.topicTitle.substring(0, 60)}${result.topicTitle.length > 60 ? '...' : ''}"`);
      console.log(`   Looking for: "${result.parentTitle}"`);
      console.log(`   → parent_id: ${result.parentId}`);
      console.log(`   → Found: "${result.parentTitleInDB}" (${result.matchType} match)`);
      console.log('');
    } else {
      notFoundCount++;
      console.log(`❌ Row ${result.lineNumber}:`);
      console.log(`   Topic: "${result.topicTitle.substring(0, 60)}${result.topicTitle.length > 60 ? '...' : ''}"`);
      console.log(`   Looking for: "${result.parentTitle}"`);
      console.log(`   → NOT FOUND - You'll need to search manually`);
      console.log('');
    }
  }

  console.log(`\n${'='.repeat(100)}`);
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Found: ${foundCount}`);
  console.log(`   ❌ Not found: ${notFoundCount}`);
  console.log(`   📝 Total: ${results.length}`);

  // Generate a CSV with the results
  const outputLines = [];
  outputLines.push('line_number,topic_id,topic_title,parent_title,parent_id,parent_title_in_db,match_type');
  
  results.forEach(r => {
    outputLines.push([
      r.lineNumber,
      `"${r.topicId}"`,
      `"${(r.topicTitle || '').replace(/"/g, '""')}"`,
      `"${(r.parentTitle || '').replace(/"/g, '""')}"`,
      r.parentId || '',
      `"${(r.parentTitleInDB || '').replace(/"/g, '""')}"`,
      r.matchType
    ].join(','));
  });

  const outputPath = join(__dirname, '..', 'docs', 'parent-ids-found-2025-12-02.csv');
  fs.writeFileSync(outputPath, outputLines.join('\n'));
  console.log(`\n💾 Results saved to: ${outputPath}`);
  console.log(`   You can use this CSV to copy parent_id values into your main CSV file.`);
}

findLevel2ParentIds().catch(console.error);


