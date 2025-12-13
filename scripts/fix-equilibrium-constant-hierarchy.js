// scripts/fix-equilibrium-constant-hierarchy.js
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

const DRY_RUN = process.argv.includes('--live') ? false : true;

async function fixEquilibriumConstantHierarchy() {
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  } else {
    console.log('⚠️  LIVE MODE - Changes will be applied to database\n');
  }

  // Read CSV to get expected parent relationships
  const csvPath = join(__dirname, '..', 'data', 'topics-import.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const csvLines = csvContent.trim().split('\n');
  const csvHeader = parseCSVLine(csvLines[0]);
  
  const subjectIdx = csvHeader.indexOf('subject');
  const examBoardIdx = csvHeader.indexOf('exam_board');
  const levelIdx = csvHeader.indexOf('level');
  const titleIdx = csvHeader.indexOf('title');
  const parentTitleIdx = csvHeader.indexOf('parent_title');

  // Build CSV topic map
  const csvTopics = new Map();
  for (let i = 1; i < csvLines.length; i++) {
    const line = csvLines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    if (values.length < csvHeader.length) continue;

    const key = `${values[subjectIdx]?.trim()}|${values[examBoardIdx]?.trim()}|${values[levelIdx]?.trim()}|${(values[titleIdx] || '').trim()}`;
    csvTopics.set(key, {
      subject: values[subjectIdx]?.trim(),
      exam_board: values[examBoardIdx]?.trim(),
      level: parseInt(values[levelIdx]) || null,
      title: values[titleIdx]?.trim(),
      parent_title: values[parentTitleIdx]?.trim() || ''
    });
  }

  // Fetch specs
  const { data: specs } = await supabase
    .from('specs')
    .select('id, subject, exam_board');

  const specMap = new Map();
  specs?.forEach(spec => {
    specMap.set(`${spec.subject}|${spec.exam_board.toLowerCase()}`, spec.id);
  });

  // Find all "Equilibrium Constant" topics in database
  console.log('📥 Fetching "Equilibrium Constant" topics from database...');
  const { data: dbTopics, error } = await supabase
    .from('topics')
    .select('id, title, level, parent_id, spec_id')
    .ilike('title', '%Equilibrium Constant%');

  if (error) {
    console.error('Error fetching topics:', error);
    return;
  }

  console.log(`✅ Found ${dbTopics.length} topics with "Equilibrium Constant" in title\n`);

  // Fetch all topics to build topic map for parent lookups
  console.log('📥 Fetching all topics to build lookup map...');
  const allTopics = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: page } = await supabase
      .from('topics')
      .select('id, title, level, spec_id')
      .range(from, from + pageSize - 1);

    if (page && page.length > 0) {
      allTopics.push(...page);
      from += pageSize;
      hasMore = page.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  // Build lookup maps
  const topicMapByTitle = new Map(); // spec_id + title -> topic
  allTopics.forEach(t => {
    const spec = specs?.find(s => s.id === t.spec_id);
    if (spec) {
      const key = `${spec.subject}|${spec.exam_board.toLowerCase()}|${t.level}|${(t.title || '').trim()}`;
      if (!topicMapByTitle.has(key)) {
        topicMapByTitle.set(key, []);
      }
      topicMapByTitle.get(key).push(t);
    }
  });

  const fixes = [];

  // Check each Equilibrium Constant topic
  for (const dbTopic of dbTopics) {
    const spec = specs?.find(s => s.id === dbTopic.spec_id);
    if (!spec) continue;

    // Find in CSV
    const csvKey = `${spec.subject}|${spec.exam_board.toLowerCase()}|${dbTopic.level}|${(dbTopic.title || '').trim()}`;
    const csvTopic = csvTopics.get(csvKey);

    if (!csvTopic) {
      console.log(`⚠️  Topic not found in CSV: "${dbTopic.title}" (Level ${dbTopic.level}, ${spec.subject} ${spec.exam_board})`);
      continue;
    }

    // Check if parent_id is correct
    let expectedParentId = null;
    if (csvTopic.parent_title) {
      // Find parent in CSV
      const expectedParentLevel = csvTopic.level - 1;
      const parentCsvKey = `${spec.subject}|${spec.exam_board.toLowerCase()}|${expectedParentLevel}|${csvTopic.parent_title.trim()}`;
      const parentCsvTopic = csvTopics.get(parentCsvKey);

      if (parentCsvTopic) {
        // Find parent in database
        const parentDbTopics = topicMapByTitle.get(parentCsvKey) || [];
        if (parentDbTopics.length > 0) {
          expectedParentId = parentDbTopics[0].id;
        }
      }
    }

    // Check if fix is needed
    if (dbTopic.parent_id !== expectedParentId) {
      fixes.push({
        id: dbTopic.id,
        title: dbTopic.title,
        level: dbTopic.level,
        current_parent_id: dbTopic.parent_id,
        expected_parent_id: expectedParentId,
        parent_title: csvTopic.parent_title,
        spec: `${spec.subject} ${spec.exam_board}`
      });
    }
  }

  console.log(`📊 Analysis:`);
  console.log(`   Topics checked: ${dbTopics.length}`);
  console.log(`   Topics needing fix: ${fixes.length}\n`);

  if (fixes.length > 0) {
    console.log('📋 Topics to fix:');
    fixes.forEach(fix => {
      const currentParent = fix.current_parent_id 
        ? allTopics.find(t => t.id === fix.current_parent_id)?.title 
        : 'none';
      const expectedParent = fix.expected_parent_id
        ? allTopics.find(t => t.id === fix.expected_parent_id)?.title
        : 'none';
      console.log(`   - "${fix.title}" (Level ${fix.level}, ${fix.spec})`);
      console.log(`     Current parent: ${currentParent}`);
      console.log(`     Expected parent: ${expectedParent} ("${fix.parent_title}")`);
      console.log('');
    });

    if (!DRY_RUN) {
      console.log('⚠️  Applying fixes...');
      let fixedCount = 0;
      for (const fix of fixes) {
        const { error } = await supabase
          .from('topics')
          .update({ parent_id: fix.expected_parent_id })
          .eq('id', fix.id);

        if (error) {
          console.error(`Error fixing topic ${fix.id} ("${fix.title}"):`, error);
        } else {
          fixedCount++;
        }
      }
      console.log(`\n✅ Successfully fixed ${fixedCount}/${fixes.length} topics`);
    } else {
      console.log('💡 This was a DRY RUN. To apply fixes, run with --live flag:');
      console.log(`   node scripts/fix-equilibrium-constant-hierarchy.js --live`);
    }
  } else {
    console.log('✅ All "Equilibrium Constant" topics have correct parent relationships!');
  }
}

fixEquilibriumConstantHierarchy().catch(console.error);


