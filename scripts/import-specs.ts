/**
 * Import CSV files into Supabase specs and topics tables
 * 
 * CSV Format: subject | exam_board | level | title | parent_title | order_index
 * File naming: subject_exam_board.csv (e.g., biology_aqa.csv)
 * 
 * Environment Variables Required:
 * - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 * - SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env.local
config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Supabase client with service role key
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Parse CSV file into rows
 */
function parseCSV(filepath: string): Array<{
  subject: string;
  exam_board: string;
  level: string;
  title: string;
  parent_title: string;
  order_index: string;
}> {
  const csvContent = fs.readFileSync(filepath, 'utf-8');
  const lines = csvContent.trim().split('\n');
  
  // Skip header row and parse data
  const rows = lines.slice(1).map(line => {
    // Handle CSV with pipe separator or comma separator
    const values = line.includes('|') 
      ? line.split('|').map(v => v.trim())
      : line.split(',').map(v => v.trim());
    
    return {
      subject: values[0] || '',
      exam_board: values[1] || '',
      level: values[2] || '',
      title: values[3] || '',
      parent_title: values[4] || '',
      order_index: values[5] || '0'
    };
  });
  
  return rows.filter(row => row.subject && row.title); // Filter out empty rows
}

/**
 * Map subject IDs to full subject names (matching config.js and slide-16)
 */
const SUBJECT_NAME_MAP: Record<string, string> = {
  'maths': 'Mathematics',
  'psychology': 'Psychology',
  'biology': 'Biology',
  'chemistry': 'Chemistry',
  'business': 'Business',
  'sociology': 'Sociology',
  'physics': 'Physics',
  'economics': 'Economics',
  'history': 'History',
  'geography': 'Geography',
  'computerscience': 'Computer Science'
};

/**
 * Extract subject and exam_board from filename
 * Example: "biology_aqa.csv" → { subject: "Biology", exam_board: "aqa" }
 */
function extractSubjectAndBoard(filename: string): { subject: string; exam_board: string } {
  const match = filename.match(/^(.+)_(.+)\.csv$/);
  if (!match) {
    throw new Error(`Invalid filename format: ${filename}. Expected format: subject_exam_board.csv`);
  }
  
  const subjectId = match[1];
  const examBoard = match[2].toLowerCase();
  
  // Map subject ID to full name
  const subject = SUBJECT_NAME_MAP[subjectId] || subjectId.charAt(0).toUpperCase() + subjectId.slice(1);
  
  return {
    subject,
    exam_board: examBoard
  };
}

/**
 * Import a single CSV file
 */
async function importCSVFile(filepath: string): Promise<number> {
  const filename = path.basename(filepath);
  console.log(`\n📄 Processing: ${filename}`);
  
  try {
    // Extract subject and exam_board from filename
    const { subject, exam_board } = extractSubjectAndBoard(filename);
    console.log(`   Subject: ${subject}, Exam Board: ${exam_board}`);
    
    // Parse CSV
    const rows = parseCSV(filepath);
    console.log(`   Found ${rows.length} rows`);
    
    if (rows.length === 0) {
      console.log(`   ⚠️  No data rows found, skipping...`);
      return 0;
    }
    
    // Upsert spec
    const { data: spec, error: specError } = await supabase
      .from('specs')
      .upsert(
        { 
          subject, 
          exam_board 
        },
        { 
          onConflict: 'subject,exam_board' 
        }
      )
      .select('id')
      .single();
    
    if (specError) {
      console.error(`   ❌ Error upserting spec:`, specError);
      return 0;
    }
    
    console.log(`   ✅ Spec upserted: ${spec.id}`);
    
    // Clear existing topics for this spec (optional - comment out if you want to keep old data)
    const { error: deleteError } = await supabase
      .from('topics')
      .delete()
      .eq('spec_id', spec.id);
    
    if (deleteError) {
      console.warn(`   ⚠️  Error clearing existing topics:`, deleteError);
    } else {
      console.log(`   🗑️  Cleared existing topics for this spec`);
    }
    
    // Prepare topics for insertion
    const topicsToInsert = rows.map(row => ({
      spec_id: spec.id,
      level: parseInt(row.level) || 1,
      title: row.title,
      parent_title: row.parent_title || null,
      order_index: parseInt(row.order_index) || 0
    }));
    
    // Insert topics in batches (Supabase has a limit of ~1000 rows per insert)
    const batchSize = 200;
    let totalInserted = 0;
    
    for (let i = 0; i < topicsToInsert.length; i += batchSize) {
      const batch = topicsToInsert.slice(i, i + batchSize);
      
      const { data: insertedTopics, error: insertError } = await supabase
        .from('topics')
        .insert(batch)
        .select('id');
      
      if (insertError) {
        console.error(`   ❌ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, insertError);
        continue;
      }
      
      totalInserted += insertedTopics.length;
      console.log(`   ✅ Inserted batch ${Math.floor(i / batchSize) + 1}: ${insertedTopics.length} topics`);
    }
    
    console.log(`   ✅ Completed: ${filename} (${totalInserted} topics)`);
    
    return totalInserted;
  } catch (error) {
    console.error(`   ❌ Error processing ${filename}:`, error);
    return 0;
  }
}

/**
 * Main import function
 */
async function importAllCSVs() {
  try {
    console.log('🚀 Starting topic import...\n');
    
    const specsDir = path.join(__dirname, '..', 'data', 'specs');
    
    // Check if directory exists
    if (!fs.existsSync(specsDir)) {
      console.error(`❌ Directory not found: ${specsDir}`);
      process.exit(1);
    }
    
    // Get all CSV files with underscore naming
    const files = fs.readdirSync(specsDir)
      .filter(file => file.endsWith('.csv') && file.includes('_'))
      .sort();
    
    if (files.length === 0) {
      console.log('❌ No CSV files found in data/specs/');
      console.log('   Expected format: subject_exam_board.csv (e.g., biology_aqa.csv)');
      return;
    }
    
    console.log(`📁 Found ${files.length} CSV files\n`);
    
    let totalTopics = 0;
    let successfulFiles = 0;
    
    for (const file of files) {
      const filepath = path.join(specsDir, file);
      const count = await importCSVFile(filepath);
      if (count > 0) {
        totalTopics += count;
        successfulFiles++;
      }
    }
    
    console.log(`\n🎉 Import completed!`);
    console.log(`   Files processed: ${successfulFiles}/${files.length}`);
    console.log(`   Total topics imported: ${totalTopics}`);
    
    // Run validation query
    console.log(`\n📊 Validation:`);
    const { data: validation, error: validationError } = await supabase
      .from('topics')
      .select(`
        spec_id,
        specs!inner(subject, exam_board)
      `)
      .limit(1);
    
    if (!validationError && validation && validation.length > 0) {
      console.log(`   ✅ Topics table is accessible and contains data`);
    } else {
      console.warn(`   ⚠️  Could not validate topics table`);
    }
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

// Run the import
importAllCSVs();

