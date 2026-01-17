#!/usr/bin/env node

/**
 * Script to check if marketing components are used anywhere in the app
 * and provide a safety rating for removal
 */

const fs = require('fs');
const path = require('path');

// Components to check
const componentsToCheck = [
  'Hero',
  'FeaturesGrid',
  'FeaturesAccordion',
  'FeaturesListicle',
  'Testimonials1',
  'Testimonials11',
  'Testimonials3',
  'TestimonialsAvatars',
  'CTA',
  'Problem',
  'WithWithout',
  'Pricing',
  'FAQ',
  'ButtonGradient',
  'ButtonPopover',
];

// Directories to search
const searchDirectories = [
  'app',
  'components',
  'libs',
  'scripts',
];

// File extensions to check
const fileExtensions = ['.js', '.jsx', '.ts', '.tsx', '.json'];

/**
 * Recursively get all files in a directory
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      // Skip node_modules and .next
      if (!file.startsWith('.') && file !== 'node_modules' && file !== '.next') {
        arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
      }
    } else {
      const ext = path.extname(file);
      if (fileExtensions.includes(ext)) {
        arrayOfFiles.push(filePath);
      }
    }
  });

  return arrayOfFiles;
}

/**
 * Check if a component is referenced in a file
 */
function checkFileForComponent(filePath, componentName) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const results = {
      directImport: false,
      dynamicImport: false,
      stringReference: false,
      requireStatement: false,
      filePath: filePath,
    };

    // Check for direct import: import ComponentName from...
    const directImportRegex = new RegExp(
      `import\\s+(?:\\{[^}]*\\})?\\s*(?:,\\s*)?${componentName}\\s+from`,
      'i'
    );
    if (directImportRegex.test(content)) {
      results.directImport = true;
    }

    // Check for named import: import { ComponentName } from...
    const namedImportRegex = new RegExp(
      `import\\s+\\{[^}]*${componentName}[^}]*\\}\\s+from`,
      'i'
    );
    if (namedImportRegex.test(content)) {
      results.directImport = true;
    }

    // Check for dynamic import: import('...') or import(...)
    const dynamicImportRegex = new RegExp(
      `import\\([^)]*${componentName}[^)]*\\)`,
      'i'
    );
    if (dynamicImportRegex.test(content)) {
      results.dynamicImport = true;
    }

    // Check for require: require('...ComponentName...')
    const requireRegex = new RegExp(
      `require\\([^)]*${componentName}[^)]*\\)`,
      'i'
    );
    if (requireRegex.test(content)) {
      results.requireStatement = true;
    }

    // Check for string references (e.g., in configs, comments mentioning it)
    // This is less critical but good to know
    const stringRefRegex = new RegExp(
      `['"\`]${componentName}['"\`]`,
      'i'
    );
    if (stringRefRegex.test(content)) {
      results.stringReference = true;
    }

    // Check for JSX usage: <ComponentName
    const jsxUsageRegex = new RegExp(`<${componentName}\\s`, 'i');
    if (jsxUsageRegex.test(content)) {
      results.directImport = true; // If used in JSX, it must be imported
    }

    return results;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Get safety rating for removing a component
 */
function getSafetyRating(usages) {
  const hasDirectUsage = usages.some(
    (u) => u.directImport || u.dynamicImport || u.requireStatement
  );
  const hasStringRefs = usages.some((u) => u.stringReference);
  const usageCount = usages.filter(
    (u) => u.directImport || u.dynamicImport || u.requireStatement
  ).length;

  if (hasDirectUsage) {
    return {
      rating: 'DANGEROUS',
      color: '🔴',
      reason: `Component is actively used in ${usageCount} file(s). Removing it will break the build.`,
      canRemove: false,
    };
  }

  if (hasStringRefs) {
    return {
      rating: 'CAUTION',
      color: '🟡',
      reason:
        'Component is only referenced in strings/comments. May be used dynamically or in configs.',
      canRemove: true,
      note: 'Review string references before removing.',
    };
  }

  return {
    rating: 'SAFE',
    color: '🟢',
    reason: 'Component is not referenced anywhere. Safe to remove.',
    canRemove: true,
  };
}

/**
 * Main function
 */
function main() {
  console.log('🔍 Checking for unused marketing components...\n');
  console.log('='.repeat(80));

  const workspaceRoot = path.resolve(__dirname, '..');
  const allFiles = [];

  // Get all files to search
  searchDirectories.forEach((dir) => {
    const dirPath = path.join(workspaceRoot, dir);
    if (fs.existsSync(dirPath)) {
      const files = getAllFiles(dirPath);
      allFiles.push(...files);
    }
  });

  console.log(`📁 Scanning ${allFiles.length} files...\n`);

  const results = [];

  componentsToCheck.forEach((componentName) => {
    const usages = [];
    const componentFile = path.join(
      workspaceRoot,
      'components',
      `${componentName}.js`
    );

    // Check if component file exists
    const fileExists = fs.existsSync(componentFile);

    // Search all files for references
    allFiles.forEach((filePath) => {
      // Skip the component file itself
      if (filePath === componentFile) {
        return;
      }

      const result = checkFileForComponent(filePath, componentName);
      if (result) {
        const hasUsage =
          result.directImport ||
          result.dynamicImport ||
          result.requireStatement ||
          result.stringReference;

        if (hasUsage) {
          usages.push(result);
        }
      }
    });

    const safety = getSafetyRating(usages);

    results.push({
      component: componentName,
      fileExists,
      usages,
      safety,
    });
  });

  // Print results
  console.log('\n📊 ANALYSIS RESULTS\n');
  console.log('='.repeat(80));

  results.forEach((result) => {
    const { component, fileExists, usages, safety } = result;

    console.log(`\n${safety.color} ${component}`);
    console.log(`   File exists: ${fileExists ? '✅ Yes' : '❌ No'}`);
    console.log(`   Safety Rating: ${safety.rating}`);
    console.log(`   Can Remove: ${safety.canRemove ? '✅ Yes' : '❌ No'}`);
    console.log(`   Reason: ${safety.reason}`);

    if (usages.length > 0) {
      console.log(`   Found ${usages.length} reference(s):`);
      usages.forEach((usage) => {
        const refs = [];
        if (usage.directImport) refs.push('direct import');
        if (usage.dynamicImport) refs.push('dynamic import');
        if (usage.requireStatement) refs.push('require()');
        if (usage.stringReference) refs.push('string reference');

        const relativePath = path.relative(workspaceRoot, usage.filePath);
        console.log(`      - ${relativePath} (${refs.join(', ')})`);
      });
    } else {
      console.log(`   ✅ No references found`);
    }

    if (safety.note) {
      console.log(`   ⚠️  Note: ${safety.note}`);
    }
  });

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📈 SUMMARY\n');

  const safeToRemove = results.filter((r) => r.safety.canRemove);
  const dangerous = results.filter((r) => !r.safety.canRemove);

  console.log(`✅ Safe to remove: ${safeToRemove.length} component(s)`);
  console.log(`❌ Dangerous to remove: ${dangerous.length} component(s)`);

  if (safeToRemove.length > 0) {
    console.log('\n🟢 Safe Components:');
    safeToRemove.forEach((r) => {
      console.log(`   - ${r.component}`);
    });
  }

  if (dangerous.length > 0) {
    console.log('\n🔴 Dangerous Components (DO NOT REMOVE):');
    dangerous.forEach((r) => {
      console.log(`   - ${r.component} (used in ${r.usages.length} file(s))`);
    });
  }

  // Check for dependencies between components
  console.log('\n' + '='.repeat(80));
  console.log('\n🔗 COMPONENT DEPENDENCIES\n');

  // Check if any safe components import other safe components
  safeToRemove.forEach((result) => {
    if (result.fileExists) {
      const componentFile = path.join(
        workspaceRoot,
        'components',
        `${result.component}.js`
      );
      const content = fs.readFileSync(componentFile, 'utf8');

      const importedComponents = componentsToCheck.filter((comp) => {
        if (comp === result.component) return false;
        const regex = new RegExp(
          `import\\s+.*${comp}.*from\\s+['"]@/components/${comp}['"]`,
          'i'
        );
        return regex.test(content);
      });

      if (importedComponents.length > 0) {
        console.log(
          `⚠️  ${result.component} imports: ${importedComponents.join(', ')}`
        );
        console.log(
          `   → Remove ${result.component} first, then ${importedComponents.join(', ')}`
        );
      }
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Analysis complete!\n');
}

// Run the script
main();
