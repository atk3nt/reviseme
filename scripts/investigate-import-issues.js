// scripts/investigate-import-issues.js
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

async function investigateImportIssues() {
  const csvPath = join(__dirname, '..', 'data', 'topics-import.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n');
  const header = parseCSVLine(lines[0]);
  
  const subjectIdx = header.indexOf('subject');
  const examBoardIdx = header.indexOf('exam_board');
  const levelIdx = header.indexOf('level');
  const titleIdx = header.indexOf('title');
  const parentTitleIdx = header.indexOf('parent_title');

  // Parse CSV topics
  const csvTopics = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    if (values.length < header.length) continue;

    csvTopics.push({
      subject: values[subjectIdx]?.trim(),
      exam_board: values[examBoardIdx]?.trim(),
      level: parseInt(values[levelIdx]) || null,
      title: values[titleIdx]?.trim(),
      parent_title: values[parentTitleIdx]?.trim() || ''
    });
  }

  console.log(`📊 Analyzing ${csvTopics.length} topics from CSV...\n`);

  // Fetch existing topics
  console.log('📥 Fetching existing topics from database...');
  const existingTopics = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: page } = await supabase
      .from('topics')
      .select('id, title, level, spec_id')
      .range(from, from + pageSize - 1);

    if (page && page.length > 0) {
      existingTopics.push(...page);
      from += pageSize;
      hasMore = page.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  // Fetch specs
  const { data: specs } = await supabase
    .from('specs')
    .select('id, subject, exam_board');

  const specMap = new Map();
  specs?.forEach(spec => {
    specMap.set(`${spec.subject}|${spec.exam_board.toLowerCase()}`, spec.id);
  });

  // Build maps
  const existingBySpecAndTitle = new Map();
  existingTopics.forEach(t => {
    const spec = specs?.find(s => s.id === t.spec_id);
    if (spec) {
      const key = `${spec.subject}|${spec.exam_board.toLowerCase()}_${(t.title || '').toLowerCase().trim()}`;
      existingBySpecAndTitle.set(key, t);
    }
  });

  // Analyze
  const newTopics = [];
  const missingParents = [];
  const foundParents = [];

  for (const csvTopic of csvTopics) {
    const specKey = `${csvTopic.subject}|${csvTopic.exam_board.toLowerCase()}`;
    const specId = specMap.get(specKey);
    if (!specId) continue;

    // Check if topic exists
    const existingKey = `${specKey}_${(csvTopic.title || '').toLowerCase().trim()}`;
    const existing = existingBySpecAndTitle.get(existingKey);

    if (!existing) {
      newTopics.push(csvTopic);
    }

    // Check parent (only for Level 2 and 3)
    if (csvTopic.level > 1 && csvTopic.parent_title) {
      const parentKey = `${specKey}_${(csvTopic.parent_title || '').toLowerCase().trim()}`;
      const parent = existingBySpecAndTitle.get(parentKey);
      
      if (parent) {
        foundParents.push({
          topic: csvTopic.title,
          level: csvTopic.level,
          parent_title: csvTopic.parent_title,
          parent_found: parent.title,
          parent_level: parent.level
        });
      } else {
        // Check if parent is in CSV (will be created)
        const parentInCsv = csvTopics.find(t => 
          t.subject === csvTopic.subject &&
          t.exam_board === csvTopic.exam_board &&
          t.title.toLowerCase().trim() === csvTopic.parent_title.toLowerCase().trim() &&
          t.level === csvTopic.level - 1
        );

        missingParents.push({
          topic: csvTopic.title,
          level: csvTopic.level,
          parent_title: csvTopic.parent_title,
          parent_in_csv: !!parentInCsv,
          parent_will_be_created: !!parentInCsv && !existingBySpecAndTitle.has(parentKey)
        });
      }
    }
  }

  console.log(`\n📊 Investigation Results:\n`);
  console.log(`   New topics (not in database): ${newTopics.length}`);
  console.log(`   Parents found: ${foundParents.length}`);
  console.log(`   Parents missing: ${missingParents.length}\n`);

  // Analyze missing parents
  const missingButInCsv = missingParents.filter(m => m.parent_in_csv);
  const missingNotInCsv = missingParents.filter(m => !m.parent_in_csv);

  console.log(`   Missing parents breakdown:`);
  console.log(`     - Parent exists in CSV (will be created): ${missingButInCsv.length}`);
  console.log(`     - Parent NOT in CSV (actual problem): ${missingNotInCsv.length}\n`);

  // Show sample new topics
  if (newTopics.length > 0) {
    console.log(`📋 Sample new topics (first 10):`);
    newTopics.slice(0, 10).forEach(t => {
      console.log(`   - "${t.title}" (Level ${t.level}, ${t.subject} ${t.exam_board})`);
    });
    if (newTopics.length > 10) {
      console.log(`   ... and ${newTopics.length - 10} more`);
    }
    console.log('');
  }

  // Show sample missing parents that are actual problems
  if (missingNotInCsv.length > 0) {
    console.log(`❌ Missing parents NOT in CSV (actual problems, first 10):`);
    missingNotInCsv.slice(0, 10).forEach(m => {
      console.log(`   - Topic: "${m.topic}" (Level ${m.level})`);
      console.log(`     Looking for: "${m.parent_title}"`);
      console.log(`     ⚠️  Parent not found in database or CSV`);
    });
    if (missingNotInCsv.length > 10) {
      console.log(`   ... and ${missingNotInCsv.length - 10} more`);
    }
    console.log('');
  }

  // Show sample missing parents that will be created
  if (missingButInCsv.length > 0) {
    console.log(`✅ Missing parents that WILL be created (first 5):`);
    missingButInCsv.slice(0, 5).forEach(m => {
      console.log(`   - Topic: "${m.topic}" (Level ${m.level})`);
      console.log(`     Parent: "${m.parent_title}" (will be created)`);
    });
    if (missingButInCsv.length > 5) {
      console.log(`   ... and ${missingButInCsv.length - 5} more`);
    }
    console.log('');
  }

  // Save detailed report
  const reportDir = join(__dirname, '..', 'docs');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const report = {
    summary: {
      total_csv_topics: csvTopics.length,
      new_topics: newTopics.length,
      parents_found: foundParents.length,
      parents_missing: missingParents.length,
      parents_missing_but_in_csv: missingButInCsv.length,
      parents_missing_not_in_csv: missingNotInCsv.length
    },
    new_topics: newTopics.map(t => ({
      subject: t.subject,
      exam_board: t.exam_board,
      level: t.level,
      title: t.title,
      parent_title: t.parent_title
    })),
    missing_parents_problems: missingNotInCsv.map(m => ({
      topic: m.topic,
      level: m.level,
      parent_title: m.parent_title
    })),
    missing_parents_will_be_created: missingButInCsv.map(m => ({
      topic: m.topic,
      level: m.level,
      parent_title: m.parent_title
    }))
  };

  const reportPath = join(reportDir, `import-investigation-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`💾 Detailed report saved to: ${reportPath}`);
}

investigateImportIssues().catch(console.error);

