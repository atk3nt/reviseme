// scripts/organize-orphaned-by-level1.js
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

async function organizeByLevel1() {
  // Read the orphaned topics CSV
  const csvPath = join(__dirname, '..', 'docs', 'skipped-topics-2025-12-02.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',');
  
  // Parse CSV rows
  const orphanedTopics = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g) || [];
    const row = {};
    headers.forEach((header, index) => {
      let value = values[index] || '';
      // Remove surrounding quotes
      value = value.replace(/^"|"$/g, '');
      // Remove double quotes from inside
      value = value.replace(/""/g, '"');
      row[header.trim()] = value;
    });
    orphanedTopics.push(row);
  }

  console.log(`📋 Found ${orphanedTopics.length} orphaned topics`);
  
  // Fetch all topics to build hierarchy map
  console.log('📥 Fetching all topics to build hierarchy...');
  const allTopics = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: page, error } = await supabase
      .from('topics')
      .select('id, title, level, parent_id, spec_id')
      .order('spec_id')
      .order('level')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Error fetching topics:', error);
      break;
    }

    if (page && page.length > 0) {
      allTopics.push(...page);
      from += pageSize;
      hasMore = page.length === pageSize;
      console.log(`  Fetched ${allTopics.length} topics so far...`);
    } else {
      hasMore = false;
    }
  }

  console.log(`✅ Fetched ${allTopics.length} topics`);

  // Fetch specs to get subject and board names
  console.log('📥 Fetching specs to get subject and exam board names...');
  // Try to get all columns to see what's available
  const { data: specs, error: specsError } = await supabase
    .from('specs')
    .select('*');

  if (specsError) {
    console.error('Error fetching specs:', specsError);
  }

  const specMap = new Map();
  specs?.forEach(spec => {
    // Try both 'board' and 'exam_board' columns
    const board = spec.board || spec.exam_board || 'Unknown';
    specMap.set(spec.id, {
      ...spec,
      board: board,
      exam_board: board,
      name: spec.name || `${spec.subject || 'Unknown'} ${board !== 'Unknown' ? board.toUpperCase() : ''}`
    });
  });
  console.log(`✅ Fetched ${specs?.length || 0} specs`);
  
  // Show sample spec to verify columns
  if (specs && specs.length > 0) {
    console.log(`   Sample spec: ${specs[0].subject} ${specs[0].board || specs[0].exam_board || 'N/A'}`);
  }

  // Build topic map
  const topicMap = new Map();
  allTopics.forEach(topic => {
    topicMap.set(topic.id, topic);
  });

  // Function to find Level 1 parent by traversing up the hierarchy
  function findLevel1Parent(topicId, specId) {
    let current = topicMap.get(topicId);
    if (!current) return null;

    // If it's already Level 1, return it
    if (current.level === 1) {
      return current;
    }

    // Traverse up the parent chain
    let visited = new Set();
    while (current && current.parent_id && !visited.has(current.id)) {
      visited.add(current.id);
      current = topicMap.get(current.parent_id);
      if (!current) break;
      
      // Make sure we're still in the same spec
      if (current.spec_id !== specId) break;
      
      if (current.level === 1) {
        return current;
      }
    }

    return null;
  }

  // Group topics by spec_id
  const topicsBySpec = {};
  orphanedTopics.forEach(topic => {
    if (!topicsBySpec[topic.spec_id]) {
      topicsBySpec[topic.spec_id] = [];
    }
    topicsBySpec[topic.spec_id].push(topic);
  });

  // For each spec, get all Level 1 topics and try to match orphaned topics
  console.log('🔍 Organizing topics by Level 1 parents...');
  const organizedTopics = [];

  for (const [specId, topics] of Object.entries(topicsBySpec)) {
    // Get all Level 1 topics for this spec
    const level1Topics = allTopics
      .filter(t => t.spec_id === specId && t.level === 1)
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    // Get all Level 2 topics for this spec (to help with matching)
    const level2Topics = allTopics
      .filter(t => t.spec_id === specId && t.level === 2);

    // For each orphaned topic, try to find which Level 1 it might belong to
    // by looking at Level 2 topics that might be its parent
    for (const orphaned of topics) {
      let suggestedLevel1 = null;
      
      // If it's a Level 3 topic, try to find Level 2 topics that match parent_title
      if (orphaned.level === '3' && orphaned.parent_title) {
        const matchingLevel2 = level2Topics.filter(l2 => {
          const l2Title = (l2.title || '').toLowerCase().trim();
          const parentTitle = orphaned.parent_title.toLowerCase().trim();
          return l2Title === parentTitle || l2Title.includes(parentTitle) || parentTitle.includes(l2Title);
        });

        if (matchingLevel2.length > 0) {
          // Find Level 1 parent of the matching Level 2
          const level1 = findLevel1Parent(matchingLevel2[0].id, specId);
          if (level1) {
            suggestedLevel1 = level1;
          }
        }
      }

      // If it's a Level 2 topic, try to find Level 1 topics that match parent_title
      if (orphaned.level === '2' && orphaned.parent_title) {
        const matchingLevel1 = level1Topics.filter(l1 => {
          const l1Title = (l1.title || '').toLowerCase().trim();
          const parentTitle = orphaned.parent_title.toLowerCase().trim();
          return l1Title === parentTitle || l1Title.includes(parentTitle) || parentTitle.includes(l1Title);
        });

        if (matchingLevel1.length > 0) {
          suggestedLevel1 = matchingLevel1[0];
        }
      }

      const spec = specMap.get(specId);
      organizedTopics.push({
        ...orphaned,
        suggested_level1_id: suggestedLevel1?.id || '',
        suggested_level1_title: suggestedLevel1?.title || '',
        all_level1_options: level1Topics.map(t => `${t.title} (${t.id})`).join('; '),
        subject: spec?.subject || 'Unknown',
        board: spec?.board || 'Unknown',
        spec_name: spec?.name || 'Unknown',
        level1_parent_title: suggestedLevel1?.title || ''  // Level 1 title for easy reference
      });
    }
  }

  // Sort by subject, then board, then spec_id, then by suggested Level 1, then by level, then by title
  organizedTopics.sort((a, b) => {
    // First by subject
    if (a.subject !== b.subject) {
      return a.subject.localeCompare(b.subject);
    }
    // Then by board
    if (a.board !== b.board) {
      return a.board.localeCompare(b.board);
    }
    // Then by spec_id
    if (a.spec_id !== b.spec_id) {
      return a.spec_id.localeCompare(b.spec_id);
    }
    // Then by suggested Level 1 title
    if (a.suggested_level1_title !== b.suggested_level1_title) {
      return (a.suggested_level1_title || '').localeCompare(b.suggested_level1_title || '');
    }
    // Then by level
    if (a.level !== b.level) {
      return parseInt(a.level) - parseInt(b.level);
    }
    // Finally by title
    return (a.title || '').localeCompare(b.title || '');
  });

  // Create output CSV with subject separators
  const outputLines = [];
  outputLines.push('id,title,level,parent_title,subject,exam_board,level1_parent_title,spec_id,is_critical,parent_id');

  let currentSubject = '';
  let currentBoard = '';
  let currentSpecId = '';

  for (const topic of organizedTopics) {
    // Add separator when subject changes
    if (topic.subject !== currentSubject) {
      if (currentSubject !== '') {
        // Add empty row as separator (10 columns)
        outputLines.push(',,,,,,,,,');
      }
      outputLines.push(`# SUBJECT: ${topic.subject.toUpperCase()},,,,,,,,,`);
      currentSubject = topic.subject;
      currentBoard = '';
      currentSpecId = '';
    }

    // Add separator when board changes (within same subject)
    if (topic.board !== currentBoard) {
      if (currentBoard !== '') {
        outputLines.push(',,,,,,,,,');
      }
      outputLines.push(`# BOARD: ${topic.board.toUpperCase()},,,,,,,,,`);
      currentBoard = topic.board;
      currentSpecId = '';
    }

    // Add separator when spec changes (within same subject/board)
    if (topic.spec_id !== currentSpecId) {
      if (currentSpecId !== '') {
        outputLines.push(',,,,,,,,,');
      }
      const spec = specMap.get(topic.spec_id);
      const specName = spec?.name || `${spec?.subject || 'Unknown'} ${spec?.exam_board || spec?.board || ''}`;
      outputLines.push(`# SPEC: ${specName},,,,,,,,,`);
      currentSpecId = topic.spec_id;
    }

    const spec = specMap.get(topic.spec_id);
    const row = [
      `"${topic.id}"`,
      `"${(topic.title || '').replace(/"/g, '""')}"`,
      `"${topic.level}"`,
      `"${(topic.parent_title || '').replace(/"/g, '""')}"`,
      `"${spec?.subject || 'Unknown'}"`,
      `"${spec?.exam_board || spec?.board || 'Unknown'}"`,
      `"${(topic.level1_parent_title || '').replace(/"/g, '""')}"`,  // Level 1 parent title for reference
      `"${topic.spec_id}"`,
      `"${topic.is_critical}"`,
      `""`  // Empty parent_id column for manual filling
    ];
    outputLines.push(row.join(','));
  }

  // Write output
  const outputPath = join(__dirname, '..', 'docs', 'skipped-topics-by-level1-2025-12-02.csv');
  fs.writeFileSync(outputPath, outputLines.join('\n'));
  console.log(`✅ Organized CSV saved to: ${outputPath}`);
  console.log(`📊 Total topics: ${organizedTopics.length}`);
  
  // Show summary by Level 1
  const byLevel1 = {};
  organizedTopics.forEach(t => {
    const key = t.suggested_level1_title || 'UNKNOWN';
    if (!byLevel1[key]) {
      byLevel1[key] = 0;
    }
    byLevel1[key]++;
  });
  
  console.log('\n📈 Summary by suggested Level 1:');
  Object.entries(byLevel1)
    .sort((a, b) => b[1] - a[1])
    .forEach(([level1, count]) => {
      console.log(`  ${level1}: ${count} topics`);
    });
}

organizeByLevel1().catch(console.error);

