// scripts/check-and-fix-equilibrium-hierarchy.js
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

function cleanTitle(title) {
  if (!title) return '';
  return title.replace(/^['"]+/, '').replace(/['"]+$/, '').trim();
}

const DRY_RUN = process.argv.includes('--live') ? false : true;

async function checkAndFixEquilibriumHierarchy() {
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  } else {
    console.log('⚠️  LIVE MODE - Changes will be applied to database\n');
  }

  // Read CSV
  const csvPath = join(__dirname, '..', 'data', 'topics-import.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const csvLines = csvContent.trim().split('\n');
  const csvHeader = parseCSVLine(csvLines[0]);
  
  const subjectIdx = csvHeader.indexOf('subject');
  const examBoardIdx = csvHeader.indexOf('exam_board');
  const levelIdx = csvHeader.indexOf('level');
  const titleIdx = csvHeader.indexOf('title');
  const parentTitleIdx = csvHeader.indexOf('parent_title');

  // Build CSV map (normalized titles)
  const csvTopics = new Map();
  for (let i = 1; i < csvLines.length; i++) {
    const line = csvLines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    if (values.length < csvHeader.length) continue;

    const title = cleanTitle(values[titleIdx] || '');
    if (!title.toLowerCase().includes('equilibrium constant')) continue;

    const key = `${values[subjectIdx]?.trim()}|${values[examBoardIdx]?.trim()}|${values[levelIdx]?.trim()}|${title}`;
    csvTopics.set(key, {
      subject: values[subjectIdx]?.trim(),
      exam_board: values[examBoardIdx]?.trim(),
      level: parseInt(values[levelIdx]) || null,
      title: title,
      parent_title: cleanTitle(values[parentTitleIdx] || '')
    });
  }

  // Fetch specs
  const { data: specs } = await supabase
    .from('specs')
    .select('id, subject, exam_board');

  // Fetch all topics
  console.log('📥 Fetching all topics...');
  const allTopics = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: page } = await supabase
      .from('topics')
      .select('id, title, level, parent_id, spec_id')
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
  const topicMap = new Map();
  allTopics.forEach(t => topicMap.set(t.id, t));

  const topicMapByCleanTitle = new Map();
  allTopics.forEach(t => {
    const spec = specs?.find(s => s.id === t.spec_id);
    if (spec) {
      const cleanedTitle = cleanTitle(t.title || '');
      const key = `${spec.subject}|${spec.exam_board.toLowerCase()}|${t.level}|${cleanedTitle}`;
      if (!topicMapByCleanTitle.has(key)) {
        topicMapByCleanTitle.set(key, []);
      }
      topicMapByCleanTitle.get(key).push(t);
    }
  });

  // Find Equilibrium Constant topics in database
  const equilibriumTopics = allTopics.filter(t => {
    const clean = cleanTitle(t.title || '');
    return clean.toLowerCase().includes('equilibrium constant');
  });

  console.log(`📊 Found ${equilibriumTopics.length} "Equilibrium Constant" topics in database\n`);

  const issues = [];

  // Check each topic's hierarchy
  for (const topic of equilibriumTopics) {
    const spec = specs?.find(s => s.id === topic.spec_id);
    if (!spec) continue;

    const cleanedTitle = cleanTitle(topic.title || '');
    const csvKey = `${spec.subject}|${spec.exam_board.toLowerCase()}|${topic.level}|${cleanedTitle}`;
    const csvTopic = csvTopics.get(csvKey);

    // Build current hierarchy
    const currentHierarchy = [];
    let current = topic;
    let visited = new Set();
    
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      currentHierarchy.push(cleanTitle(current.title || ''));
      if (current.parent_id) {
        current = topicMap.get(current.parent_id);
      } else {
        current = null;
      }
    }

    // Build expected hierarchy from CSV
    const expectedHierarchy = [];
    if (csvTopic) {
      let csvCurrent = csvTopic;
      while (csvCurrent) {
        expectedHierarchy.unshift(csvCurrent.title);
        
        // Find parent in CSV
        if (csvCurrent.parent_title) {
          const parentLevel = csvCurrent.level - 1;
          const parentCsvKey = `${csvCurrent.subject}|${csvCurrent.exam_board.toLowerCase()}|${parentLevel}|${csvCurrent.parent_title}`;
          csvCurrent = csvTopics.get(parentCsvKey) || null;
        } else {
          csvCurrent = null;
        }
      }
    }

    // Check if hierarchy is correct
    const hierarchyLength = currentHierarchy.length;
    const expectedLength = expectedHierarchy.length;
    
    if (hierarchyLength < 2 || (csvTopic && expectedLength > hierarchyLength)) {
      issues.push({
        topic,
        spec,
        currentHierarchy,
        expectedHierarchy,
        csvTopic,
        needsFix: true
      });
    }
  }

  console.log(`📊 Analysis:`);
  console.log(`   Topics with hierarchy issues: ${issues.length}\n`);

  if (issues.length > 0) {
    console.log('📋 Issues found:');
    issues.forEach((issue, idx) => {
      console.log(`\n${idx + 1}. "${cleanTitle(issue.topic.title || '')}" (Level ${issue.topic.level}, ${issue.spec.subject} ${issue.spec.exam_board})`);
      console.log(`   Current hierarchy: ${issue.currentHierarchy.join(' → ') || '(none - orphaned)'}`);
      if (issue.expectedHierarchy.length > 0) {
        console.log(`   Expected hierarchy: ${issue.expectedHierarchy.join(' → ')}`);
      } else {
        console.log(`   Expected hierarchy: (not in CSV)`);
      }
    });

    // Fix issues
    if (!DRY_RUN && issues.length > 0) {
      console.log('\n⚠️  Applying fixes...');
      let fixedCount = 0;
      
      for (const issue of issues) {
        if (!issue.csvTopic || !issue.csvTopic.parent_title) continue;
        
        // Find correct parent
        const parentLevel = issue.csvTopic.level - 1;
        const parentCsvKey = `${issue.csvTopic.subject}|${issue.csvTopic.exam_board.toLowerCase()}|${parentLevel}|${issue.csvTopic.parent_title}`;
        const parentDbTopics = topicMapByCleanTitle.get(parentCsvKey) || [];
        
        if (parentDbTopics.length > 0) {
          const correctParentId = parentDbTopics[0].id;
          
          if (issue.topic.parent_id !== correctParentId) {
            const { error } = await supabase
              .from('topics')
              .update({ parent_id: correctParentId })
              .eq('id', issue.topic.id);
            
            if (error) {
              console.error(`Error fixing topic ${issue.topic.id}:`, error);
            } else {
              fixedCount++;
              console.log(`✅ Fixed: "${cleanTitle(issue.topic.title || '')}" → parent: "${cleanTitle(parentDbTopics[0].title || '')}"`);
            }
          }
        }
      }
      
      console.log(`\n✅ Successfully fixed ${fixedCount}/${issues.length} topics`);
    } else if (DRY_RUN) {
      console.log('\n💡 This was a DRY RUN. To apply fixes, run with --live flag:');
      console.log(`   node scripts/check-and-fix-equilibrium-hierarchy.js --live`);
    }
  } else {
    console.log('✅ All "Equilibrium Constant" topics have correct hierarchies!');
  }
}

checkAndFixEquilibriumHierarchy().catch(console.error);

