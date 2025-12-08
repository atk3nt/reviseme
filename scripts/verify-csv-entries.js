// scripts/verify-csv-entries.js
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
// Format: "field1","field2","field3"
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

async function verifyEntries() {
  // Read the CSV
  const csvPath = join(__dirname, '..', 'docs', 'skipped-topics-by-level1-2025-12-02.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n');
  
  // Parse first few data rows (skip header and separators)
  const rowsToCheck = [];
  for (let i = 1; i < Math.min(10, lines.length); i++) {
    const line = lines[i];
    if (line.startsWith('#') || line.trim() === '') continue;
    
    const values = parseCSVLine(line);
    console.log(`\nDEBUG: Parsed ${values.length} fields from line ${i}:`);
    values.forEach((v, idx) => {
      console.log(`  [${idx}]: "${v.substring(0, 50)}${v.length > 50 ? '...' : ''}"`);
    });
    
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
    } else {
      console.log(`  ⚠️  Skipping line ${i} - only ${values.length} fields found`);
    }
  }

  console.log(`🔍 Verifying ${rowsToCheck.length} entries...\n`);

  let allCorrect = true;

  for (const row of rowsToCheck) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📋 Topic: "${row.title}" (Level ${row.level})`);
    console.log(`   ID: ${row.id}`);
    console.log(`   Subject: ${row.subject}, Board: ${row.exam_board}`);
    console.log(`   Parent Title (Level 2): "${row.parent_title}"`);
    console.log(`   Level 1 Parent Title: "${row.level1_parent_title}"`);
    
    if (row.level === '3') {
      // For Level 3, check if Level 2 parent exists
      const { data: level2Parents, error: l2Error } = await supabase
        .from('topics')
        .select('id, title, level, parent_id, spec_id')
        .eq('spec_id', row.spec_id)
        .eq('level', 2);
      
      if (l2Error) {
        console.log(`   ❌ Error finding Level 2 parents: ${l2Error.message}`);
        allCorrect = false;
        continue;
      }
      
      // Find exact or close match
      const matchingL2 = level2Parents?.filter(l2 => {
        const l2Title = (l2.title || '').trim();
        const parentTitle = (row.parent_title || '').trim();
        return l2Title === parentTitle || 
               l2Title.toLowerCase() === parentTitle.toLowerCase() ||
               l2Title.includes(parentTitle) || 
               parentTitle.includes(l2Title);
      });
      
      if (matchingL2 && matchingL2.length > 0) {
        console.log(`   ✅ Found ${matchingL2.length} matching Level 2 parent(s):`);
        for (const l2 of matchingL2) {
          const isExact = (l2.title || '').trim() === (row.parent_title || '').trim();
          console.log(`      ${isExact ? '✅' : '⚠️ '} "${l2.title}" (id: ${l2.id})`);
          
          // Check Level 1 parent of this Level 2
          if (l2.parent_id) {
            const { data: level1, error: l1Error } = await supabase
              .from('topics')
              .select('id, title, level')
              .eq('id', l2.parent_id)
              .single();
            
            if (!l1Error && level1) {
              const l1Matches = (level1.title || '').trim() === (row.level1_parent_title || '').trim() ||
                               (level1.title || '').toLowerCase() === (row.level1_parent_title || '').toLowerCase();
              console.log(`        → Level 1: "${level1.title}" ${l1Matches ? '✅' : '❌'}`);
              if (!l1Matches) {
                console.log(`        ⚠️  CSV says Level 1 should be: "${row.level1_parent_title}"`);
                allCorrect = false;
              }
              
              // Suggest the correct parent_id
              if (isExact && l1Matches) {
                console.log(`        💡 Suggested parent_id: ${l2.id}`);
              }
            } else {
              console.log(`        ⚠️  Level 2 has invalid parent_id`);
              allCorrect = false;
            }
          } else {
            console.log(`        ⚠️  Level 2 has no parent_id`);
            allCorrect = false;
          }
        }
      } else {
        console.log(`   ❌ No Level 2 parent found matching "${row.parent_title}"`);
        console.log(`   Available Level 2 topics in this spec:`);
        level2Parents?.slice(0, 5).forEach(l2 => {
          console.log(`      - "${l2.title}"`);
        });
        if (level2Parents && level2Parents.length > 5) {
          console.log(`      ... and ${level2Parents.length - 5} more`);
        }
        allCorrect = false;
      }
    } else if (row.level === '2') {
      // For Level 2, check if Level 1 parent exists
      const { data: level1Parents, error: l1Error } = await supabase
        .from('topics')
        .select('id, title, level, spec_id')
        .eq('spec_id', row.spec_id)
        .eq('level', 1);
      
      if (l1Error) {
        console.log(`   ❌ Error finding Level 1 parents: ${l1Error.message}`);
        allCorrect = false;
        continue;
      }
      
      // Find exact or close match
      const matchingL1 = level1Parents?.filter(l1 => {
        const l1Title = (l1.title || '').trim();
        const parentTitle = (row.parent_title || '').trim();
        return l1Title === parentTitle || 
               l1Title.toLowerCase() === parentTitle.toLowerCase() ||
               l1Title.includes(parentTitle) || 
               parentTitle.includes(l1Title);
      });
      
      if (matchingL1 && matchingL1.length > 0) {
        console.log(`   ✅ Found ${matchingL1.length} matching Level 1 parent(s):`);
        for (const l1 of matchingL1) {
          const isExact = (l1.title || '').trim() === (row.parent_title || '').trim();
          console.log(`      ${isExact ? '✅' : '⚠️ '} "${l1.title}" (id: ${l1.id})`);
          
          // Check if it matches the level1_parent_title (which should be the same for Level 2)
          if (row.level1_parent_title) {
            const matches = (l1.title || '').trim() === (row.level1_parent_title || '').trim();
            if (!matches) {
              console.log(`        ⚠️  CSV level1_parent_title says: "${row.level1_parent_title}"`);
              allCorrect = false;
            }
          }
          
          // Suggest the correct parent_id
          if (isExact) {
            console.log(`        💡 Suggested parent_id: ${l1.id}`);
          }
        }
      } else {
        console.log(`   ❌ No Level 1 parent found matching "${row.parent_title}"`);
        console.log(`   Available Level 1 topics in this spec:`);
        level1Parents?.slice(0, 5).forEach(l1 => {
          console.log(`      - "${l1.title}"`);
        });
        if (level1Parents && level1Parents.length > 5) {
          console.log(`      ... and ${level1Parents.length - 5} more`);
        }
        allCorrect = false;
      }
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  if (allCorrect) {
    console.log(`\n✅ All entries verified correctly!`);
  } else {
    console.log(`\n⚠️  Some entries have issues. Please review the output above.`);
  }
}

verifyEntries().catch(console.error);

