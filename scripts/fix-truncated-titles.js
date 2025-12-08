// scripts/fix-truncated-titles.js
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

async function fixTruncatedTitles() {
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

  // Build CSV map
  const csvTopics = new Map();
  for (let i = 1; i < csvLines.length; i++) {
    const line = csvLines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    if (values.length < csvHeader.length) continue;

    const csvTitle = values[titleIdx]?.trim() || '';
    const csvSubject = values[subjectIdx]?.trim();
    const csvBoard = values[examBoardIdx]?.trim();
    const csvLevel = parseInt(values[levelIdx]) || null;

    if (!csvTitle || !csvSubject || !csvBoard || !csvLevel) continue;

    // Use cleaned title as key for matching
    const cleanedTitle = cleanTitle(csvTitle);
    const key = `${csvSubject}|${csvBoard.toLowerCase()}|${csvLevel}|${cleanedTitle}`;
    
    // Store both original and cleaned title
    csvTopics.set(key, {
      subject: csvSubject,
      exam_board: csvBoard,
      level: csvLevel,
      title: csvTitle, // Original title from CSV
      cleaned_title: cleanedTitle,
      parent_title: cleanTitle(values[parentTitleIdx] || '')
    });
  }

  console.log(`📊 Loaded ${csvTopics.size} topics from CSV\n`);

  // Fetch specs
  const { data: specs } = await supabase
    .from('specs')
    .select('id, subject, exam_board');

  // Fetch all topics from database
  console.log('📥 Fetching all topics from database...');
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

  console.log(`✅ Fetched ${allTopics.length} topics from database\n`);

  const fixes = [];

  // Build a map of CSV topics by spec and level for fuzzy matching
  const csvTopicsBySpecLevel = new Map();
  csvTopics.forEach((csvTopic, key) => {
    const specLevelKey = `${csvTopic.subject}|${csvTopic.exam_board.toLowerCase()}|${csvTopic.level}`;
    if (!csvTopicsBySpecLevel.has(specLevelKey)) {
      csvTopicsBySpecLevel.set(specLevelKey, []);
    }
    csvTopicsBySpecLevel.get(specLevelKey).push(csvTopic);
  });

  // Check each database topic
  for (const dbTopic of allTopics) {
    const spec = specs?.find(s => s.id === dbTopic.spec_id);
    if (!spec) continue;

    const dbTitle = dbTopic.title || '';
    const dbCleanedTitle = cleanTitle(dbTitle);
    
    // First try exact match
    const csvKey = `${spec.subject}|${spec.exam_board.toLowerCase()}|${dbTopic.level}|${dbCleanedTitle}`;
    let csvTopic = csvTopics.get(csvKey);

    // If no exact match, try fuzzy matching (DB title is prefix of CSV title)
    if (!csvTopic) {
      const specLevelKey = `${spec.subject}|${spec.exam_board.toLowerCase()}|${dbTopic.level}`;
      const candidates = csvTopicsBySpecLevel.get(specLevelKey) || [];
      
      // Find CSV topic where cleaned title starts with DB cleaned title
      csvTopic = candidates.find(c => {
        const csvCleaned = c.cleaned_title.toLowerCase();
        const dbCleaned = dbCleanedTitle.toLowerCase();
        return csvCleaned.startsWith(dbCleaned) && csvCleaned.length > dbCleaned.length;
      });
    }

    if (csvTopic) {
      const csvTitle = csvTopic.title;
      const csvCleanedTitle = csvTopic.cleaned_title;
      
      // Check if title needs updating
      if (dbTitle !== csvTitle) {
        // Check if it's encoding issue (titles match when cleaned)
        if (dbCleanedTitle === csvCleanedTitle) {
          fixes.push({
            id: dbTopic.id,
            current_title: dbTitle,
            new_title: csvTitle,
            level: dbTopic.level,
            spec: `${spec.subject} ${spec.exam_board}`,
            reason: 'Encoding issue'
          });
        } 
        // Check if DB title is truncated (CSV title starts with DB title)
        else if (csvCleanedTitle.toLowerCase().startsWith(dbCleanedTitle.toLowerCase()) && 
                 csvCleanedTitle.length > dbCleanedTitle.length) {
          fixes.push({
            id: dbTopic.id,
            current_title: dbTitle,
            new_title: csvTitle,
            level: dbTopic.level,
            spec: `${spec.subject} ${spec.exam_board}`,
            reason: 'Truncated title'
          });
        }
      }
    }
  }

  console.log(`📊 Analysis:`);
  console.log(`   Topics checked: ${allTopics.length}`);
  console.log(`   Topics needing title fix: ${fixes.length}\n`);

  if (fixes.length > 0) {
    console.log('📋 Topics to fix:');
    fixes.slice(0, 20).forEach((fix, idx) => {
      console.log(`\n${idx + 1}. "${fix.current_title}" → "${fix.new_title}"`);
      console.log(`   Level ${fix.level}, ${fix.spec} (${fix.reason || 'Title mismatch'})`);
    });
    if (fixes.length > 20) {
      console.log(`\n   ... and ${fixes.length - 20} more`);
    }

    if (!DRY_RUN) {
      console.log('\n⚠️  Applying fixes...');
      let fixedCount = 0;
      for (const fix of fixes) {
        const { error } = await supabase
          .from('topics')
          .update({ title: fix.new_title })
          .eq('id', fix.id);

        if (error) {
          console.error(`Error fixing topic ${fix.id}:`, error);
        } else {
          fixedCount++;
          if (fixedCount % 10 === 0) {
            console.log(`  Fixed ${fixedCount}/${fixes.length} topics...`);
          }
        }
      }
      console.log(`\n✅ Successfully fixed ${fixedCount}/${fixes.length} topic titles`);
    } else {
      console.log('\n💡 This was a DRY RUN. To apply fixes, run with --live flag:');
      console.log(`   node scripts/fix-truncated-titles.js --live`);
    }
  } else {
    console.log('✅ All topic titles match the CSV!');
  }
}

fixTruncatedTitles().catch(console.error);

