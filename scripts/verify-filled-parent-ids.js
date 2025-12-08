// scripts/verify-filled-parent-ids.js
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

async function verifyFilledParentIds() {
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
      
      // Only check rows with a filled parent_id
      if (row.parent_id && row.parent_id.trim() !== '') {
        rowsToCheck.push(row);
      }
    }
  }

  if (rowsToCheck.length === 0) {
    console.log('ℹ️  No rows with filled parent_id found. Please fill in the parent_id column for the topics you want to verify.');
    return;
  }

  console.log(`🔍 Verifying ${rowsToCheck.length} entries with filled parent_id...\n`);

  let allCorrect = true;
  let correctCount = 0;
  let incorrectCount = 0;

  for (const row of rowsToCheck) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📋 Topic: "${row.title}" (Level ${row.level})`);
    console.log(`   ID: ${row.id}`);
    console.log(`   Subject: ${row.subject}, Board: ${row.exam_board}`);
    console.log(`   Parent Title (expected): "${row.parent_title}"`);
    console.log(`   Level 1 Parent Title (expected): "${row.level1_parent_title}"`);
    console.log(`   Filled parent_id: ${row.parent_id}`);
    
    // Check if the parent_id exists in the database
    const { data: parent, error: parentError } = await supabase
      .from('topics')
      .select('id, title, level, parent_id, spec_id')
      .eq('id', row.parent_id)
      .single();
    
    if (parentError || !parent) {
      console.log(`   ❌ ERROR: Parent with ID ${row.parent_id} not found in database!`);
      allCorrect = false;
      incorrectCount++;
      continue;
    }
    
    console.log(`   ✅ Parent found: "${parent.title}" (Level ${parent.level})`);
    
    // Check if parent is in the same spec
    if (parent.spec_id !== row.spec_id) {
      console.log(`   ❌ ERROR: Parent is in different spec!`);
      console.log(`      Topic spec: ${row.spec_id}`);
      console.log(`      Parent spec: ${parent.spec_id}`);
      allCorrect = false;
      incorrectCount++;
      continue;
    }
    console.log(`   ✅ Parent is in the same spec`);
    
    // Check if parent level is correct
    const expectedParentLevel = parseInt(row.level) - 1;
    if (parent.level !== expectedParentLevel) {
      console.log(`   ❌ ERROR: Parent level is incorrect!`);
      console.log(`      Expected: Level ${expectedParentLevel}`);
      console.log(`      Actual: Level ${parent.level}`);
      allCorrect = false;
      incorrectCount++;
      continue;
    }
    console.log(`   ✅ Parent level is correct (Level ${parent.level})`);
    
    // Check if parent title matches
    const parentTitleMatch = (parent.title || '').trim() === (row.parent_title || '').trim() ||
                            (parent.title || '').toLowerCase() === (row.parent_title || '').toLowerCase();
    if (!parentTitleMatch) {
      console.log(`   ⚠️  WARNING: Parent title doesn't exactly match!`);
      console.log(`      Expected: "${row.parent_title}"`);
      console.log(`      Actual: "${parent.title}"`);
      // This is a warning, not an error, as titles might have slight variations
    } else {
      console.log(`   ✅ Parent title matches`);
    }
    
    // For Level 3 topics, check if parent's Level 1 parent matches
    if (row.level === '3' && row.level1_parent_title && parent.parent_id) {
      const { data: level1Parent, error: l1Error } = await supabase
        .from('topics')
        .select('id, title, level')
        .eq('id', parent.parent_id)
        .single();
      
      if (!l1Error && level1Parent) {
        const l1Match = (level1Parent.title || '').trim() === (row.level1_parent_title || '').trim() ||
                       (level1Parent.title || '').toLowerCase() === (row.level1_parent_title || '').toLowerCase();
        if (l1Match) {
          console.log(`   ✅ Level 1 parent matches: "${level1Parent.title}"`);
        } else {
          console.log(`   ⚠️  WARNING: Level 1 parent doesn't match!`);
          console.log(`      Expected: "${row.level1_parent_title}"`);
          console.log(`      Actual: "${level1Parent.title}"`);
        }
      } else {
        console.log(`   ⚠️  WARNING: Could not verify Level 1 parent`);
      }
    }
    
    correctCount++;
    console.log(`   ✅ All checks passed for this entry!`);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Correct entries: ${correctCount}`);
  console.log(`   ❌ Incorrect entries: ${incorrectCount}`);
  console.log(`   📝 Total checked: ${rowsToCheck.length}`);
  
  if (allCorrect && incorrectCount === 0) {
    console.log(`\n✅ All entries are correct! You can proceed with applying these changes.`);
  } else {
    console.log(`\n⚠️  Some entries have issues. Please review the output above and fix them before proceeding.`);
  }
}

verifyFilledParentIds().catch(console.error);

