// scripts/apply-manual-corrections.js
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

// Parse CSV line handling quoted and unquoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim()); // Add last field
  
  return result;
}

const DRY_RUN = process.argv.includes('--live') ? false : true;

async function applyManualCorrections() {
  // Find the most recent CSV file
  const docsDir = join(__dirname, '..', 'docs');
  const files = fs.readdirSync(docsDir)
    .filter(f => f.startsWith('topics-with-issues-') && f.endsWith('.csv'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error('❌ No CSV file found. Please run export-topics-for-manual-review.js first.');
    return;
  }

  const csvFile = files[0];
  const csvPath = join(docsDir, csvFile);
  console.log(`📄 Reading corrections from: ${csvFile}\n`);

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  } else {
    console.log('⚠️  LIVE MODE - Changes will be applied to database\n');
  }

  // Read CSV
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n');
  const header = parseCSVLine(lines[0]);
  
  // Find column indices
  const idIdx = header.indexOf('id');
  const correctedLevelIdx = header.indexOf('corrected_level');
  const correctedParentIdIdx = header.indexOf('corrected_parent_id');
  const titleIdx = header.indexOf('title');
  const currentLevelIdx = header.indexOf('level');
  const currentParentIdIdx = header.indexOf('parent_id');

  if (idIdx === -1 || correctedLevelIdx === -1 || correctedParentIdIdx === -1) {
    console.error('❌ CSV file missing required columns. Expected: id, corrected_level, corrected_parent_id');
    return;
  }

  const corrections = [];
  let skippedCount = 0;

  // Parse rows
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < header.length) continue;

    const id = values[idIdx];
    const title = values[titleIdx] || '';
    const currentLevel = parseInt(values[currentLevelIdx]) || null;
    const currentParentId = values[currentParentIdIdx] || '';
    const correctedLevel = values[correctedLevelIdx]?.trim();
    const correctedParentId = values[correctedParentIdIdx]?.trim();

    // Skip if no corrections
    if (!correctedLevel && !correctedParentId) {
      skippedCount++;
      continue;
    }

    const correction = {
      id,
      title,
      currentLevel,
      currentParentId,
      correctedLevel: correctedLevel ? parseInt(correctedLevel) : null,
      correctedParentId: correctedParentId || null
    };

    corrections.push(correction);
  }

  console.log(`📊 Found ${corrections.length} topics with corrections`);
  console.log(`   Skipped ${skippedCount} topics (no corrections)\n`);

  if (corrections.length === 0) {
    console.log('ℹ️  No corrections to apply. Fill in the corrected_level and corrected_parent_id columns in the CSV file.');
    return;
  }

  // Show sample corrections
  console.log('📋 Sample corrections (first 10):');
  corrections.slice(0, 10).forEach(corr => {
    console.log(`\n  Topic: "${corr.title.substring(0, 50)}${corr.title.length > 50 ? '...' : ''}"`);
    console.log(`    ID: ${corr.id}`);
    if (corr.correctedLevel !== null && corr.correctedLevel !== corr.currentLevel) {
      console.log(`    Level: ${corr.currentLevel} → ${corr.correctedLevel}`);
    }
    if (corr.correctedParentId && corr.correctedParentId !== corr.currentParentId) {
      console.log(`    Parent ID: ${corr.currentParentId || 'none'} → ${corr.correctedParentId}`);
    }
  });

  if (corrections.length > 10) {
    console.log(`\n  ... and ${corrections.length - 10} more corrections`);
  }

  // Validate corrections
  console.log('\n🔍 Validating corrections...');
  const validationErrors = [];

  for (const corr of corrections) {
    // Validate level
    if (corr.correctedLevel !== null) {
      if (corr.correctedLevel < 1 || corr.correctedLevel > 3) {
        validationErrors.push({
          id: corr.id,
          title: corr.title,
          error: `Invalid level: ${corr.correctedLevel} (must be 1, 2, or 3)`
        });
      }
    }

    // Validate parent_id format (should be UUID)
    if (corr.correctedParentId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(corr.correctedParentId)) {
        validationErrors.push({
          id: corr.id,
          title: corr.title,
          error: `Invalid parent_id format: ${corr.correctedParentId} (must be UUID)`
        });
      }
    }
  }

  if (validationErrors.length > 0) {
    console.log(`\n❌ Validation errors found (${validationErrors.length}):`);
    validationErrors.slice(0, 10).forEach(err => {
      console.log(`  - "${err.title}" (${err.id}): ${err.error}`);
    });
    if (validationErrors.length > 10) {
      console.log(`  ... and ${validationErrors.length - 10} more errors`);
    }
    console.log('\n⚠️  Please fix validation errors before applying corrections.');
    return;
  }

  console.log('✅ All corrections validated\n');

  // Apply corrections
  if (!DRY_RUN) {
    console.log('='.repeat(100));
    console.log('⚠️  APPLYING CORRECTIONS TO DATABASE...\n');

    let successCount = 0;
    let errorCount = 0;

    for (const corr of corrections) {
      const updateData = {};
      
      if (corr.correctedLevel !== null && corr.correctedLevel !== corr.currentLevel) {
        updateData.level = corr.correctedLevel;
      }
      
      if (corr.correctedParentId !== null) {
        if (corr.correctedParentId === '') {
          updateData.parent_id = null;
        } else {
          updateData.parent_id = corr.correctedParentId;
        }
      }

      if (Object.keys(updateData).length === 0) {
        continue; // No changes needed
      }

      const { error } = await supabase
        .from('topics')
        .update(updateData)
        .eq('id', corr.id);

      if (error) {
        console.error(`❌ Error updating topic ${corr.id}:`, error.message);
        errorCount++;
      } else {
        successCount++;
        if (successCount % 10 === 0) {
          console.log(`  Updated ${successCount}/${corrections.length} topics...`);
        }
      }
    }

    console.log(`\n✅ Successfully updated: ${successCount}`);
    if (errorCount > 0) {
      console.log(`❌ Errors: ${errorCount}`);
    }
  } else {
    console.log('='.repeat(100));
    console.log('💡 This was a DRY RUN. To apply corrections, run with --live flag:');
    console.log('   node scripts/apply-manual-corrections.js --live');
  }
}

applyManualCorrections().catch(console.error);

