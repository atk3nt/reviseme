// scripts/fix-critical-topics-from-text.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Default to dry-run mode (set DRY_RUN=false to actually make changes)
const DRY_RUN = process.env.DRY_RUN !== 'false';

// Normalize text for matching
function normalizeText(text) {
  if (!text) return '';
  return text.toLowerCase().trim().replace(/\s+/g, ' ').replace(/['"]/g, '');
}

// Fix encoding issues
function fixEncoding(text) {
  if (!text) return text;
  return text
    .replace(/Äì/g, '–')
    .replace(/Aì/g, '–')
    .replace(/Äô/g, "'")
    .replace(/Ãô/g, "'")
    .replace(/Äò/g, "'")
    .trim();
}

// Critical topics with CORRECTED hierarchy information
// Titles are the ACTUAL database titles (shorter versions)
const CRITICAL_TOPICS = [
  // TOPIC 1: Human Geography > Changing Places
  {
    title: "Place Meaning: Lived Experience",
    subject: "Geography",
    examBoard: "AQA",
    level: 3,
    correctParentTitle: "Changing Places",
    level1Parent: "Human Geography"
  },
  // TOPIC 2: Psychology in Context > Research Methods
  {
    title: "Probability",
    subject: "Psychology",
    examBoard: "AQA",
    level: 3,
    correctParentTitle: "Research Methods",
    level1Parent: "Psychology in Context"
  },
  // TOPIC 3: Physical Geography > Non-exam assessment mark scheme guidance
  {
    title: "Mark Scheme Area 4: Conclusions",
    subject: "Geography",
    examBoard: "AQA",
    level: 3,
    correctParentTitle: "Non-exam assessment mark scheme guidance",
    level1Parent: "Physical Geography"
  },
  // TOPIC 4: Psychology in Context > Research Methods
  {
    title: "Primary",
    subject: "Psychology",
    examBoard: "AQA",
    level: 3,
    correctParentTitle: "Research Methods",
    level1Parent: "Psychology in Context"
  },
  // TOPIC 5: Physical Geography > Ecosystems under stress
  {
    title: "Biomes: Concept",
    subject: "Geography",
    examBoard: "AQA",
    level: 3,
    correctParentTitle: "Ecosystems under stress",
    level1Parent: "Physical Geography"
  },
  // TOPIC 6: Psychology in Context > Research Methods
  {
    title: "Features of Science: Objectivity",
    subject: "Psychology",
    examBoard: "AQA",
    level: 3,
    correctParentTitle: "Research Methods",
    level1Parent: "Psychology in Context"
  },
  // TOPIC 7: Geography Fieldwork Investigation > Fieldwork and Investigation Requirements
  {
    title: "Independence",
    subject: "Geography",
    examBoard: "AQA",
    level: 3,
    correctParentTitle: "Fieldwork and Investigation Requirements",
    level1Parent: "Geography Fieldwork Investigation"
  },
  // TOPIC 8: Issues and Options in Psychology > Option: Gender
  {
    title: "Sex",
    subject: "Psychology",
    examBoard: "AQA",
    level: 3,
    correctParentTitle: "Option: Gender",
    level1Parent: "Issues and Options in Psychology"
  },
  // TOPIC 9: Physical Geography > Hazards
  {
    title: "Wildfires: Nature",
    subject: "Geography",
    examBoard: "AQA",
    level: 3,
    correctParentTitle: "Hazards",
    level1Parent: "Physical Geography"
  },
  // TOPIC 10: Human Geography > Resource Security
  {
    title: "Water Security: Supply",
    subject: "Geography",
    examBoard: "AQA",
    level: 3,
    correctParentTitle: "Resource Security",
    level1Parent: "Human Geography"
  },
  // TOPIC 11: Physical Geography > Ecosystems Under Stress
  {
    title: "Ecosystem Processes: Energy",
    subject: "Geography",
    examBoard: "AQA",
    level: 3,
    correctParentTitle: "Ecosystems Under Stress",
    level1Parent: "Physical Geography"
  }
];

async function fixCriticalTopicsFromText() {
  console.log('='.repeat(80));
  console.log('🔧 FIX CRITICAL TOPICS FROM CORRECTED HIERARCHY DATA');
  console.log('='.repeat(80));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '✏️  LIVE (will update database)'}`);
  console.log(`Total topics to process: ${CRITICAL_TOPICS.length}`);
  console.log('');

  const results = {
    fixed: [],
    failed: [],
    notFound: [],
    parentNotFound: []
  };

  try {
    // Process each critical topic
    for (let i = 0; i < CRITICAL_TOPICS.length; i++) {
      const topicData = CRITICAL_TOPICS[i];
      console.log('─'.repeat(80));
      console.log(`📌 Processing Topic ${i + 1} of ${CRITICAL_TOPICS.length}`);
      console.log(`   Level 3 Title: "${topicData.title}"`);
      console.log(`   Subject: ${topicData.subject}`);
      console.log(`   Exam Board: ${topicData.examBoard}`);
      console.log(`   Level 1: ${topicData.level1Parent}`);
      console.log(`   Level 2 (Parent): "${topicData.correctParentTitle}"`);
      console.log('');

      // STEP 1: Find the spec_id
      const { data: spec, error: specError } = await supabase
        .from('specs')
        .select('id')
        .eq('subject', topicData.subject)
        .eq('exam_board', topicData.examBoard.toLowerCase())
        .single();

      if (specError || !spec) {
        console.log(`   ❌ Spec not found for ${topicData.subject} ${topicData.examBoard}`);
        results.notFound.push({
          ...topicData,
          reason: 'Spec not found'
        });
        console.log('');
        continue;
      }

      const specId = spec.id;
      console.log(`   ✅ Found spec_id: ${specId}`);

      // STEP 2: Find the topic by FULL title (exact match preferred, then normalized)
      const fixedTitle = fixEncoding(topicData.title);
      const { data: topics, error: topicError } = await supabase
        .from('topics')
        .select('id, title, level, parent_title, parent_id')
        .eq('spec_id', specId)
        .eq('level', topicData.level);

      if (topicError || !topics) {
        console.log(`   ❌ Failed to fetch topics: ${topicError?.message}`);
        results.failed.push({
          ...topicData,
          error: topicError?.message
        });
        console.log('');
        continue;
      }

      // Find matching topic - try exact match first, then normalized
      let topic = topics.find(t => {
        const tTitle = fixEncoding(t.title);
        return tTitle === fixedTitle;
      });

      // If exact match fails, try normalized match
      if (!topic) {
        topic = topics.find(t => {
          const tTitle = fixEncoding(t.title);
          return normalizeText(tTitle) === normalizeText(fixedTitle);
        });
      }

      if (!topic) {
        console.log(`   ❌ Topic not found: "${topicData.title}"`);
        console.log(`   Searching for exact match of: "${fixedTitle}"`);
        console.log(`   Available Level 3 topics in spec (first 10):`);
        topics.slice(0, 10).forEach(t => {
          console.log(`      - "${t.title}"`);
        });
        results.notFound.push({
          ...topicData,
          reason: 'Topic not found in database'
        });
        console.log('');
        continue;
      }

      console.log(`   ✅ Found topic_id: ${topic.id}`);
      console.log(`   Database title: "${topic.title}"`);
      console.log(`   Current parent_id: ${topic.parent_id || 'NULL'}`);
      console.log(`   Current parent_title: ${topic.parent_title || 'N/A'}`);

      // STEP 3: Find the parent topic (Level 2) using CORRECTED parent title
      const fixedParentTitle = fixEncoding(topicData.correctParentTitle);
      const { data: level2Topics, error: parentError } = await supabase
        .from('topics')
        .select('id, title, level')
        .eq('spec_id', specId)
        .eq('level', 2);

      if (parentError || !level2Topics) {
        console.log(`   ❌ Failed to fetch parent candidates: ${parentError?.message}`);
        results.failed.push({
          ...topicData,
          error: parentError?.message
        });
        console.log('');
        continue;
      }

      // Find matching parent - try exact match first, then normalized
      let parent = level2Topics.find(p => {
        const pTitle = fixEncoding(p.title);
        return pTitle === fixedParentTitle;
      });

      // If exact match fails, try normalized match
      if (!parent) {
        parent = level2Topics.find(p => {
          const pTitle = fixEncoding(p.title);
          return normalizeText(pTitle) === normalizeText(fixedParentTitle);
        });
      }

      // If still not found, try fuzzy match (contains)
      if (!parent) {
        const normalizedTarget = normalizeText(fixedParentTitle);
        parent = level2Topics.find(p => {
          const pTitle = fixEncoding(p.title);
          const normalizedP = normalizeText(pTitle);
          return normalizedP.includes(normalizedTarget) || normalizedTarget.includes(normalizedP);
        });
      }

      if (!parent) {
        console.log(`   ❌ Parent not found: "${topicData.correctParentTitle}"`);
        console.log(`   Searching for: "${fixedParentTitle}"`);
        console.log(`   Available Level 2 topics in spec (first 10):`);
        level2Topics.slice(0, 10).forEach(p => {
          console.log(`      - "${p.title}"`);
        });
        results.parentNotFound.push({
          ...topicData,
          topic_id: topic.id,
          reason: 'Parent topic not found'
        });
        console.log('');
        continue;
      }

      console.log(`   ✅ Found parent_id: ${parent.id}`);
      console.log(`   Parent title: "${parent.title}"`);
      
      // Check if parent title matches exactly (may have slight differences)
      if (normalizeText(fixEncoding(parent.title)) !== normalizeText(fixedParentTitle)) {
        console.log(`   ⚠️  Note: Parent title in DB ("${parent.title}") differs slightly from expected ("${topicData.correctParentTitle}")`);
      }

      // STEP 4: Update the topic
      if (!DRY_RUN) {
        const { error: updateError } = await supabase
          .from('topics')
          .update({ parent_id: parent.id })
          .eq('id', topic.id);

        if (updateError) {
          console.log(`   ❌ Failed to update: ${updateError.message}`);
          results.failed.push({
            ...topicData,
            topic_id: topic.id,
            parent_id: parent.id,
            error: updateError.message
          });
        } else {
          console.log(`   ✅ Updated successfully!`);
          results.fixed.push({
            ...topicData,
            topic_id: topic.id,
            parent_id: parent.id,
            parent_title: parent.title
          });
        }
      } else {
        console.log(`   🔍 Would update: parent_id = ${parent.id}`);
        results.fixed.push({
          ...topicData,
          topic_id: topic.id,
          parent_id: parent.id,
          parent_title: parent.title,
          dry_run: true
        });
      }
      console.log('');
    }

    // STEP 5: Summary
    console.log('='.repeat(80));
    console.log('📋 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
    console.log(`✅ Fixed: ${results.fixed.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`⚠️  Topic Not Found: ${results.notFound.length}`);
    console.log(`⚠️  Parent Not Found: ${results.parentNotFound.length}`);
    console.log('');

    if (results.fixed.length > 0) {
      console.log('Fixed topics:');
      results.fixed.forEach(r => {
        console.log(`  ✅ "${r.title}" → "${r.parent_title}" (${r.parent_id})`);
      });
      console.log('');
    }

    if (results.notFound.length > 0) {
      console.log('Topics not found:');
      results.notFound.forEach(r => {
        console.log(`  ⚠️  "${r.title}" - ${r.reason}`);
      });
      console.log('');
    }

    if (results.parentNotFound.length > 0) {
      console.log('Parents not found:');
      results.parentNotFound.forEach(r => {
        console.log(`  ⚠️  "${r.title}" → Parent "${r.correctParentTitle}" - ${r.reason}`);
      });
      console.log('');
    }

    if (results.failed.length > 0) {
      console.log('Failed updates:');
      results.failed.forEach(r => {
        console.log(`  ❌ "${r.title}" - ${r.error}`);
      });
      console.log('');
    }

    if (!DRY_RUN && results.fixed.length > 0) {
      console.log('⚠️  IMPORTANT: Run the diagnostic script again to verify fixes!');
    }

    return results;

  } catch (error) {
    console.error('\n❌ Script failed:', error);
    throw error;
  }
}

// Run script
fixCriticalTopicsFromText()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

