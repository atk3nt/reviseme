// Quick test to see History Level 2 topics
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

async function test() {
  // Use the spec_id from orphaned topics CSV
  const specId = '098ba4b3-9b03-4679-9f9d-4551bfe2fe7c';
  
  const { data: spec } = await supabase
    .from('specs')
    .select('id, subject, board')
    .eq('id', specId)
    .single();
  
  if (!spec) {
    console.log('Spec not found');
    return;
  }
  
  console.log('Spec:', spec.subject, spec.board);
  
  // Get Level 2 topics that might contain date ranges
  const { data: level2Topics } = await supabase
    .from('topics')
    .select('id, title, level, parent_title')
    .eq('spec_id', specId)
    .eq('level', 2)
    .limit(30);
  
  console.log('\nSample Level 2 History topics:');
  level2Topics?.forEach(t => {
    console.log(`  - "${t.title}"`);
  });
  
  // Get a sample orphaned Level 3 topic
  const { data: orphaned } = await supabase
    .from('topics')
    .select('id, title, level, parent_title')
    .eq('spec_id', historySpec.id)
    .eq('level', 3)
    .is('parent_id', null)
    .not('parent_title', 'is', null)
    .limit(5);
  
  console.log('\nSample orphaned Level 3 topics:');
  orphaned?.forEach(t => {
    console.log(`  - "${t.title}" (parent_title: "${t.parent_title}")`);
    // Check if any Level 2 topic contains this parent_title
    const dateRange = t.parent_title?.match(/(\d{4}[–-]\d{2,4})/);
    if (dateRange) {
      const range = dateRange[1];
      const matches = level2Topics?.filter(l2 => l2.title.includes(range));
      console.log(`    Date range: ${range}`);
      console.log(`    Level 2 matches: ${matches?.length || 0}`);
      if (matches && matches.length > 0) {
        matches.forEach(m => console.log(`      - "${m.title}"`));
      }
    }
  });
}

test().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});

