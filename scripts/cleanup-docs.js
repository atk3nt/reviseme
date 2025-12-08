// scripts/cleanup-docs.js
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DRY_RUN = process.argv.includes('--live') ? false : true;

// Files that are SAFE to delete (all diagnostic/report files)
const FILES_TO_DELETE = [
  // Old audit files (before fixes)
  'data-quality-audit-2025-12-01.json',
  
  // Diagnostic CSV reports (all temporary)
  'all-topics-for-review-2025-12-02.csv',
  'database-errors-will-fix-on-import-2025-12-02.csv',
  'deleted-orphaned-topics-2025-12-02.csv',
  'genuine-errors-to-fix-2025-12-02.csv',
  'orphaned-topics-2025-12-01.csv',
  'orphaned-topics-2025-12-02.csv',
  'orphaned-topics-with-parent-ids-2025-12-01.csv',
  'parent-ids-found-2025-12-02.csv',
  'skipped-topics-2025-12-01.csv',
  'skipped-topics-2025-12-02.csv',
  'skipped-topics-by-level1-2025-12-02.csv',
  'topics-for-title-level-fix-2025-12-02.csv',
  'topics-to-fix-in-google-sheet-2025-12-02.csv',
  'topics-with-issues-2025-12-02.csv',
  
  // Temporary fix/plan files
  'fix-plan-2025-12-02.json',
  'fix-results-2025-12-01.json',
  'fix-results-2025-12-02.json',
  'import-investigation-2025-12-02.json',
];

// Files to KEEP (useful reference)
const FILES_TO_KEEP = [
  'data-quality-audit-2025-12-02.json', // Latest audit (shows everything is fixed)
  'level-mismatches-2025-12-02.csv',    // Latest diagnostic (shows 0 issues)
  'level-mismatches-2025-12-02.json',   // Latest diagnostic JSON
  'topics-hierarchical-view-2025-12-02.txt', // Useful structure reference
];

async function cleanupDocs() {
  const docsDir = join(__dirname, '..', 'docs');
  
  if (!fs.existsSync(docsDir)) {
    console.log('❌ docs/ directory not found');
    return;
  }

  console.log('🧹 Cleaning up diagnostic files in docs/ directory\n');
  
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be deleted\n');
  } else {
    console.log('⚠️  LIVE MODE - Files will be permanently deleted\n');
  }

  // Check which files exist
  const existingFiles = fs.readdirSync(docsDir);
  const filesToDelete = FILES_TO_DELETE.filter(file => existingFiles.includes(file));
  const filesToKeep = FILES_TO_KEEP.filter(file => existingFiles.includes(file));
  const unknownFiles = existingFiles.filter(file => 
    !FILES_TO_DELETE.includes(file) && !FILES_TO_KEEP.includes(file)
  );

  console.log('📊 Analysis:');
  console.log(`   Files to delete: ${filesToDelete.length}`);
  console.log(`   Files to keep: ${filesToKeep.length}`);
  if (unknownFiles.length > 0) {
    console.log(`   Unknown files (will NOT delete): ${unknownFiles.length}`);
  }
  console.log('');

  if (filesToDelete.length === 0) {
    console.log('✅ No files to delete - all diagnostic files already cleaned up!');
    return;
  }

  console.log('📋 Files that will be deleted:');
  filesToDelete.forEach((file, idx) => {
    const filePath = join(docsDir, file);
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    console.log(`   ${idx + 1}. ${file} (${sizeKB} KB)`);
  });
  console.log('');

  if (filesToKeep.length > 0) {
    console.log('✅ Files that will be KEPT:');
    filesToKeep.forEach(file => {
      if (existingFiles.includes(file)) {
        const filePath = join(docsDir, file);
        const stats = fs.statSync(filePath);
        const sizeKB = (stats.size / 1024).toFixed(2);
        console.log(`   - ${file} (${sizeKB} KB)`);
      } else {
        console.log(`   - ${file} (not found)`);
      }
    });
    console.log('');
  }

  if (unknownFiles.length > 0) {
    console.log('⚠️  Unknown files (not in delete list, will be kept):');
    unknownFiles.forEach(file => {
      const filePath = join(docsDir, file);
      const stats = fs.statSync(filePath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      console.log(`   - ${file} (${sizeKB} KB)`);
    });
    console.log('');
  }

  if (!DRY_RUN) {
    console.log('🗑️  Deleting files...');
    let deletedCount = 0;
    let errorCount = 0;

    for (const file of filesToDelete) {
      try {
        const filePath = join(docsDir, file);
        fs.unlinkSync(filePath);
        deletedCount++;
        console.log(`   ✅ Deleted: ${file}`);
      } catch (error) {
        errorCount++;
        console.error(`   ❌ Error deleting ${file}:`, error.message);
      }
    }

    console.log(`\n✅ Successfully deleted ${deletedCount}/${filesToDelete.length} files`);
    if (errorCount > 0) {
      console.log(`   ⚠️  ${errorCount} files had errors`);
    }
  } else {
    console.log('💡 This was a DRY RUN. To actually delete files, run with --live flag:');
    console.log('   node scripts/cleanup-docs.js --live');
  }
}

cleanupDocs().catch(console.error);

