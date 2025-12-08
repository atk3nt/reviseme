// scripts/check-block-hierarchies.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: `${__dirname}/../.env.local` });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkBlockHierarchies() {
  // Find blocks with Equilibrium Constant topics
  const { data: topics } = await supabase
    .from('topics')
    .select('id, title, level, parent_id, spec_id')
    .ilike('title', '%Equilibrium Constant%');

  if (!topics || topics.length === 0) {
    console.log('No Equilibrium Constant topics found');
    return;
  }

  const topicIds = topics.map(t => t.id);
  const { data: blocks } = await supabase
    .from('blocks')
    .select('id, topic_id')
    .in('topic_id', topicIds)
    .limit(10);

  if (!blocks || blocks.length === 0) {
    console.log('No blocks found using Equilibrium Constant topics');
    return;
  }

  // Build topic map
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

  const topicMap = new Map();
  allTopics.forEach(t => topicMap.set(t.id, t));

  // Build hierarchy for each block
  console.log(`Found ${blocks.length} blocks with Equilibrium Constant topics:\n`);
  
  blocks.forEach((block, idx) => {
    const topic = topicMap.get(block.topic_id);
    if (!topic) {
      console.log(`${idx + 1}. Block ${block.id.substring(0, 8)}... - Topic not found`);
      return;
    }

    // Build hierarchy
    const hierarchy = [];
    let current = topic;
    let visited = new Set();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      hierarchy.push(current.title);
      if (current.parent_id) {
        current = topicMap.get(current.parent_id);
      } else {
        current = null;
      }
    }

    console.log(`${idx + 1}. Block ${block.id.substring(0, 8)}...`);
    console.log(`   Topic: "${topic.title}" (Level ${topic.level})`);
    console.log(`   Hierarchy: ${hierarchy.join(' → ')}`);
    console.log(`   Hierarchy length: ${hierarchy.length}`);
    
    if (hierarchy.length < 2) {
      console.log(`   ⚠️  ISSUE: Hierarchy too short - "Find in:" won't show!`);
    } else {
      const context = hierarchy.slice(0, -1).join(' → ');
      console.log(`   ✅ "Find in:" would show: ${context}`);
    }
    console.log('');
  });
}

checkBlockHierarchies().catch(console.error);

