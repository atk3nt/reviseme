// scripts/check-csv-topic-ids.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTopics() {
  // These are the IDs from the first 5 rows of the CSV
  const topicIds = [
    '7b9b20e8-c06b-4299-a3d5-82bc0fb1d6d7',
    '535b1e8c-13a0-478b-b86a-af340ae74d1b',
    'f6407d14-b875-465e-81a4-46f4bde47c0b',
    'cf874561-322e-4e72-98ec-1a6ffd0f4018',
    'd5e7ef3d-aae6-4726-a671-59dc025b585f'
  ];

  console.log('🔍 Checking topics in database...\n');

  for (const topicId of topicIds) {
    const { data: topic, error } = await supabase
      .from('topics')
      .select('id, title, level, parent_title, spec_id')
      .eq('id', topicId)
      .single();

    if (error) {
      console.log(`❌ Error fetching topic ${topicId}: ${error.message}`);
      continue;
    }

    if (!topic) {
      console.log(`❌ Topic ${topicId} not found`);
      continue;
    }

    console.log(`\n📋 Topic ID: ${topic.id}`);
    console.log(`   Title: "${topic.title}"`);
    console.log(`   Level: ${topic.level}`);
    console.log(`   Parent Title: "${topic.parent_title || '(none)'}"`);
    console.log(`   Spec ID: ${topic.spec_id}`);

    // Find the Level 2 parent if this is Level 3
    if (topic.level === 3 && topic.parent_title) {
      const { data: level2Parents } = await supabase
        .from('topics')
        .select('id, title, level, parent_id')
        .eq('spec_id', topic.spec_id)
        .eq('level', 2)
        .ilike('title', `%${topic.parent_title}%`);

      if (level2Parents && level2Parents.length > 0) {
        console.log(`   ✅ Found ${level2Parents.length} potential Level 2 parent(s):`);
        for (const l2 of level2Parents) {
          console.log(`      - "${l2.title}" (id: ${l2.id})`);
          
          // Get Level 1 parent
          if (l2.parent_id) {
            const { data: level1 } = await supabase
              .from('topics')
              .select('id, title')
              .eq('id', l2.parent_id)
              .single();
            
            if (level1) {
              console.log(`        → Level 1: "${level1.title}" (id: ${level1.id})`);
            }
          }
        }
      } else {
        console.log(`   ⚠️  No Level 2 parent found matching "${topic.parent_title}"`);
      }
    }
  }
}

checkTopics().catch(console.error);


