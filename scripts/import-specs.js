import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SUBJECTS = [
  'biology', 'chemistry', 'physics', 'maths', 
  'psychology', 'business', 'economics', 'english'
];

const BOARDS = ['aqa', 'edexcel', 'ocr'];

async function importSpecs() {
  try {
    console.log('Starting spec import...');

    // Clear existing data
    console.log('Clearing existing data...');
    await supabase.from('topics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('specs').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Import specs and topics
    for (const subject of SUBJECTS) {
      for (const board of BOARDS) {
        const filename = `${subject}-${board}.csv`;
        const filepath = path.join(__dirname, '..', 'data', 'specs', filename);
        
        if (!fs.existsSync(filepath)) {
          console.log(`Skipping ${filename} - file not found`);
          continue;
        }

        console.log(`Importing ${filename}...`);

        // Read CSV file
        const csvContent = fs.readFileSync(filepath, 'utf-8');
        const lines = csvContent.trim().split('\n');
        const headers = lines[0].split(',');
        const rows = lines.slice(1).map(line => {
          const values = line.split(',');
          const row = {};
          headers.forEach((header, index) => {
            row[header.trim()] = values[index]?.trim() || '';
          });
          return row;
        });

        // Create spec
        const { data: spec, error: specError } = await supabase
          .from('specs')
          .insert({
            subject,
            board,
            name: `${subject.charAt(0).toUpperCase() + subject.slice(1)} ${board.toUpperCase()}`
          })
          .select()
          .single();

        if (specError) {
          console.error(`Error creating spec for ${subject}-${board}:`, specError);
          continue;
        }

        console.log(`Created spec: ${spec.name} (${spec.id})`);

        // Create topics
        const topics = [];
        const topicMap = new Map(); // For parent-child relationships

        for (const row of rows) {
          const topic = {
            spec_id: spec.id,
            name: row.name,
            level: parseInt(row.level),
            duration_minutes: parseInt(row.duration_minutes) || 30
          };

          // Handle parent relationship
          if (row.parent_id && row.parent_id !== '') {
            const parentTopic = topicMap.get(row.parent_id);
            if (parentTopic) {
              topic.parent_id = parentTopic.id;
            }
          }

          const { data: createdTopic, error: topicError } = await supabase
            .from('topics')
            .insert(topic)
            .select()
            .single();

          if (topicError) {
            console.error(`Error creating topic ${row.name}:`, topicError);
            continue;
          }

          // Store in map for parent-child relationships
          topicMap.set(row.topic_id, createdTopic);
          topics.push(createdTopic);
        }

        console.log(`Created ${topics.length} topics for ${spec.name}`);
      }
    }

    console.log('Import completed successfully!');
  } catch (error) {
    console.error('Import failed:', error);
  }
}

// Run the import
importSpecs();


