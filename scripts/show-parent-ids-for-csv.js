// scripts/show-parent-ids-for-csv.js
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

async function showParentIds() {
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

  console.log(`🔍 Finding parent_id for ${rowsToCheck.length} entries...\n`);

  // Fetch all topics for the specs we need
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
        .select('id, title, level, parent_id, spec_id')
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

  // Build topic map by spec and level
  const topicsBySpecAndLevel = new Map();
  allTopics.forEach(topic => {
    const key = `${topic.spec_id}_${topic.level}`;
    if (!topicsBySpecAndLevel.has(key)) {
      topicsBySpecAndLevel.set(key, []);
    }
    topicsBySpecAndLevel.get(key).push(topic);
  });

  let foundCount = 0;
  let notFoundCount = 0;

  console.log(`\n${'='.repeat(100)}`);
  console.log(`RESULTS:\n`);

  for (const row of rowsToCheck) {
    const expectedParentLevel = parseInt(row.level) - 1;
    const key = `${row.spec_id}_${expectedParentLevel}`;
    const potentialParents = topicsBySpecAndLevel.get(key) || [];

    // Try to find exact match first
    let parent = potentialParents.find(p => 
      (p.title || '').trim() === (row.parent_title || '').trim()
    );

    // If no exact match, try case-insensitive
    if (!parent) {
      parent = potentialParents.find(p => 
        (p.title || '').toLowerCase().trim() === (row.parent_title || '').toLowerCase().trim()
      );
    }

    // If still no match, try partial match
    if (!parent && row.parent_title) {
      parent = potentialParents.find(p => 
        (p.title || '').toLowerCase().includes((row.parent_title || '').toLowerCase()) ||
        (row.parent_title || '').toLowerCase().includes((p.title || '').toLowerCase())
      );
    }

    if (parent) {
      foundCount++;
      console.log(`✅ Row ${row.lineNumber}: "${row.title.substring(0, 50)}${row.title.length > 50 ? '...' : ''}"`);
      console.log(`   Parent Title: "${row.parent_title}"`);
      console.log(`   → parent_id: ${parent.id}`);
      console.log(`   → Parent: "${parent.title}" (Level ${parent.level})`);
      console.log('');
    } else {
      notFoundCount++;
      console.log(`❌ Row ${row.lineNumber}: "${row.title.substring(0, 50)}${row.title.length > 50 ? '...' : ''}"`);
      console.log(`   Parent Title: "${row.parent_title}"`);
      console.log(`   → No parent found matching "${row.parent_title}"`);
      console.log(`   → Looking for Level ${expectedParentLevel} topics in spec ${row.spec_id}`);
      if (potentialParents.length > 0) {
        console.log(`   → Found ${potentialParents.length} Level ${expectedParentLevel} topics, but none match`);
        console.log(`   → Sample parents: ${potentialParents.slice(0, 3).map(p => `"${p.title}"`).join(', ')}`);
      } else {
        console.log(`   → No Level ${expectedParentLevel} topics found in this spec`);
      }
      console.log('');
    }
  }

  console.log(`\n${'='.repeat(100)}`);
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Found parent_id: ${foundCount}`);
  console.log(`   ❌ Not found: ${notFoundCount}`);
  console.log(`   📝 Total: ${rowsToCheck.length}`);
  
  if (notFoundCount > 0) {
    console.log(`\n💡 Tip: For topics where parent_id wasn't found, you may need to:`);
    console.log(`   1. Check if the parent_title in the CSV is correct`);
    console.log(`   2. Manually search for the parent topic in the database`);
    console.log(`   3. Use the parent topic's ID as the parent_id`);
  }
}

showParentIds().catch(console.error);

