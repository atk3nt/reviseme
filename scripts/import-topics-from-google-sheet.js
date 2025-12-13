// scripts/import-topics-from-google-sheet.js
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

// Proper CSV parser that handles quoted fields with commas
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
        i++;
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
  result.push(current.trim());
  
  return result;
}

const DRY_RUN = process.argv.includes('--live') ? false : true;
const CSV_FILE = process.argv.find(arg => arg.endsWith('.csv')) || 'data/topics-import.csv';

async function importTopicsFromGoogleSheet() {
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  } else {
    console.log('⚠️  LIVE MODE - Changes will be applied to database\n');
  }

  // Read CSV file
  const csvPath = join(__dirname, '..', CSV_FILE);
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    console.error('   Place your exported Google Sheet CSV in the data/ directory');
    console.error('   Or specify path: node scripts/import-topics-from-google-sheet.js [path/to/file.csv]');
    return;
  }

  console.log(`📄 Reading CSV from: ${csvPath}\n`);
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n');

  // Parse header
  const header = parseCSVLine(lines[0]);
  const subjectIdx = header.indexOf('subject');
  const examBoardIdx = header.indexOf('exam_board');
  const levelIdx = header.indexOf('level');
  const titleIdx = header.indexOf('title');
  const parentTitleIdx = header.indexOf('parent_title');
  const orderIndexIdx = header.indexOf('order_index');

  if (subjectIdx === -1 || examBoardIdx === -1 || levelIdx === -1 || titleIdx === -1) {
    console.error('❌ CSV missing required columns: subject, exam_board, level, title');
    console.error(`   Found columns: ${header.join(', ')}`);
    return;
  }

  // Parse rows
  const topics = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const values = parseCSVLine(line);
    if (values.length < header.length) {
      console.warn(`⚠️  Skipping line ${i + 1}: not enough columns (expected ${header.length}, got ${values.length})`);
      continue;
    }

    const topic = {
      subject: values[subjectIdx]?.trim(),
      exam_board: values[examBoardIdx]?.trim(),
      level: parseInt(values[levelIdx]) || null,
      title: values[titleIdx]?.trim(),
      parent_title: values[parentTitleIdx]?.trim() || '',
      order_index: parseInt(values[orderIndexIdx]) || 0
    };

    if (topic.subject && topic.exam_board && topic.title && topic.level) {
      topics.push(topic);
    }
  }

  console.log(`📊 Parsed ${topics.length} topics from CSV\n`);

  // Get or create specs
  console.log('📥 Fetching/creating specs...');
  const specs = new Map();
  const uniqueSpecs = new Set(topics.map(t => `${t.subject}|${t.exam_board}`));
  
  for (const specKey of uniqueSpecs) {
    const [subject, exam_board] = specKey.split('|');
    const { data: existingSpecs } = await supabase
      .from('specs')
      .select('id, subject, exam_board')
      .eq('subject', subject)
      .eq('exam_board', exam_board.toLowerCase())
      .single();

    if (existingSpecs) {
      specs.set(specKey, existingSpecs);
      console.log(`  ✅ Found spec: ${subject} ${exam_board}`);
    } else {
      if (!DRY_RUN) {
        const { data: newSpec, error } = await supabase
          .from('specs')
          .insert({
            subject,
            exam_board: exam_board.toLowerCase(),
            name: `${subject} ${exam_board.toUpperCase()}`
          })
          .select()
          .single();

        if (error) {
          console.error(`  ❌ Error creating spec ${specKey}:`, error);
          continue;
        }
        specs.set(specKey, newSpec);
        console.log(`  ✅ Created spec: ${newSpec.name}`);
      } else {
        console.log(`  🔍 Would create spec: ${subject} ${exam_board}`);
        specs.set(specKey, { id: 'DRY_RUN_ID', subject, exam_board: exam_board.toLowerCase() });
      }
    }
  }

  // Build topic map by spec for parent matching
  const topicsBySpec = {};
  topics.forEach(topic => {
    const specKey = `${topic.subject}|${topic.exam_board}`;
    const spec = specs.get(specKey);
    if (!spec) {
      console.warn(`⚠️  Skipping topic "${topic.title}" - spec not found for ${specKey}`);
      return;
    }

    if (!topicsBySpec[spec.id]) {
      topicsBySpec[spec.id] = [];
    }
    topicsBySpec[spec.id].push({ ...topic, spec_id: spec.id });
  });

  // Fetch existing topics to match by title
  console.log('\n📥 Fetching existing topics for matching...');
  const existingTopics = [];
  for (const specId of Object.keys(topicsBySpec)) {
    if (specId === 'DRY_RUN_ID') continue;
    
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: page } = await supabase
        .from('topics')
        .select('id, title, level, spec_id')
        .eq('spec_id', specId)
        .range(from, from + pageSize - 1);

      if (page && page.length > 0) {
        existingTopics.push(...page);
        from += pageSize;
        hasMore = page.length === pageSize;
      } else {
        hasMore = false;
      }
    }
  }

  console.log(`  Found ${existingTopics.length} existing topics`);

  // Build maps for matching
  const existingBySpecAndTitle = new Map();
  existingTopics.forEach(t => {
    const key = `${t.spec_id}_${(t.title || '').toLowerCase().trim()}`;
    existingBySpecAndTitle.set(key, t);
  });

  // Process topics and find parents
  console.log('\n🔍 Processing topics and finding parents...');
  const topicsToUpdate = [];
  const topicsToCreate = [];
  const stats = {
    matched: 0,
    new: 0,
    parentFound: 0,
    parentNotFound: 0
  };

  for (const [specId, specTopics] of Object.entries(topicsBySpec)) {
    if (specId === 'DRY_RUN_ID') continue;

    // Build title map for this spec (for parent matching)
    const titleMap = new Map();
    specTopics.forEach(t => {
      const key = (t.title || '').toLowerCase().trim();
      if (!titleMap.has(key)) {
        titleMap.set(key, []);
      }
      titleMap.get(key).push(t);
    });

    for (const topic of specTopics) {
      // Find parent by parent_title
      let parent_id = null;
      if (topic.parent_title) {
        const parentKey = (topic.parent_title || '').toLowerCase().trim();
        const potentialParents = titleMap.get(parentKey) || [];
        
        // Find parent with correct level
        const expectedParentLevel = topic.level - 1;
        const parent = potentialParents.find(p => p.level === expectedParentLevel);
        
        if (parent) {
          // Find existing topic ID
          const existingKey = `${specId}_${(parent.title || '').toLowerCase().trim()}`;
          const existing = existingBySpecAndTitle.get(existingKey);
          if (existing) {
            parent_id = existing.id;
            stats.parentFound++;
          } else {
            // Parent will be created, we'll need to update after
            stats.parentNotFound++;
          }
        } else {
          stats.parentNotFound++;
        }
      }

      // Check if topic already exists
      const existingKey = `${specId}_${(topic.title || '').toLowerCase().trim()}`;
      const existing = existingBySpecAndTitle.get(existingKey);

      const topicData = {
        spec_id: specId,
        title: topic.title,
        level: topic.level,
        parent_id: parent_id,
        order_index: topic.order_index
      };

      if (existing) {
        // Check if update needed
        const needsUpdate = 
          existing.level !== topic.level || 
          existing.parent_id !== parent_id ||
          existing.title !== topic.title;

        if (needsUpdate) {
          topicsToUpdate.push({ id: existing.id, ...topicData });
          stats.matched++;
        }
      } else {
        topicsToCreate.push(topicData);
        stats.new++;
      }
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Topics to create: ${topicsToCreate.length}`);
  console.log(`   Topics to update: ${topicsToUpdate.length}`);
  console.log(`   Parents found: ${stats.parentFound}`);
  console.log(`   Parents not found: ${stats.parentNotFound}`);
  console.log(`   Total: ${topicsToCreate.length + topicsToUpdate.length}`);

  if (topicsToCreate.length > 0) {
    console.log(`\n📋 Sample topics to create (first 5):`);
    topicsToCreate.slice(0, 5).forEach(t => {
      console.log(`   - "${t.title}" (Level ${t.level}, spec: ${t.spec_id})`);
    });
  }

  if (topicsToUpdate.length > 0) {
    console.log(`\n📋 Sample topics to update (first 5):`);
    topicsToUpdate.slice(0, 5).forEach(t => {
      console.log(`   - "${t.title}" (Level ${t.level}, ID: ${t.id})`);
    });
  }

  if (!DRY_RUN && (topicsToCreate.length > 0 || topicsToUpdate.length > 0)) {
    console.log('\n⚠️  Applying changes...');
    
    // Create new topics in batches
    if (topicsToCreate.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < topicsToCreate.length; i += batchSize) {
        const batch = topicsToCreate.slice(i, i + batchSize);
        const { error } = await supabase
          .from('topics')
          .insert(batch);
        
        if (error) {
          console.error(`❌ Error creating topics batch ${i / batchSize + 1}:`, error);
        } else {
          console.log(`  ✅ Created batch ${i / batchSize + 1} (${batch.length} topics)`);
        }
      }
    }

    // Update existing topics
    let updateCount = 0;
    for (const topic of topicsToUpdate) {
      const { id, ...updateData } = topic;
      const { error } = await supabase
        .from('topics')
        .update(updateData)
        .eq('id', id);
      
      if (error) {
        console.error(`❌ Error updating topic ${id}:`, error);
      } else {
        updateCount++;
        if (updateCount % 50 === 0) {
          console.log(`  ✅ Updated ${updateCount}/${topicsToUpdate.length} topics...`);
        }
      }
    }
    
    if (updateCount > 0) {
      console.log(`✅ Updated ${updateCount} topics`);
    }
  } else if (DRY_RUN) {
    console.log('\n💡 This was a DRY RUN. To apply changes, run with --live flag:');
    console.log(`   node scripts/import-topics-from-google-sheet.js --live ${CSV_FILE}`);
  }
}

importTopicsFromGoogleSheet().catch(console.error);


