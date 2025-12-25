/**
 * Test Session Numbering
 * 
 * Verifies that session numbers are correct across weeks:
 * - Rating 1 topics should have sessions 1, 2, 3
 * - Rating 2 topics should have sessions 1, 2
 * - Rating 3 topics should have session 1
 * - Sessions should be numbered sequentially
 * 
 * Run with: node scripts/test-session-numbering.js
 */

const BASE_URL = 'http://localhost:3000';

async function apiCall(endpoint) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`);
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  } catch (error) {
    return { status: 500, error: error.message };
  }
}

function getCurrentWeekMonday() {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

function formatDate(date) {
  return new Date(date).toISOString().split('T')[0];
}

async function testSessionNumbering() {
  console.log('🧪 Session Numbering Test');
  console.log('='.repeat(70));
  
  const weekStart = getCurrentWeekMonday();
  console.log(`Week: ${weekStart}\n`);
  
  const result = await apiCall(`/api/plan/generate?weekStart=${weekStart}`);
  
  if (result.status !== 200 || !result.data?.blocks?.length) {
    console.log('⚠️ No blocks found');
    return;
  }
  
  const blocks = result.data.blocks.filter(b => b.status === 'scheduled');
  console.log(`Found ${blocks.length} scheduled blocks\n`);
  
  // Group by topic
  const topicGroups = {};
  blocks.forEach(block => {
    if (!topicGroups[block.topic_id]) {
      topicGroups[block.topic_id] = [];
    }
    topicGroups[block.topic_id].push(block);
  });
  
  // Check each topic
  let allCorrect = true;
  const issues = [];
  
  Object.entries(topicGroups).forEach(([topicId, topicBlocks]) => {
    const topicName = topicBlocks[0].topic_name;
    const sessionTotal = topicBlocks[0].session_total;
    
    // Sort by scheduled date
    topicBlocks.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
    
    const sessions = topicBlocks.map(b => b.session_number).sort((a, b) => a - b);
    const expectedSessions = [];
    for (let i = 1; i <= sessionTotal; i++) {
      expectedSessions.push(i);
    }
    
    // Check if all expected sessions are present
    const missing = expectedSessions.filter(s => !sessions.includes(s));
    const extra = sessions.filter(s => !expectedSessions.includes(s));
    
    if (missing.length === 0 && extra.length === 0 && sessions.length === sessionTotal) {
      console.log(`✅ ${topicName.substring(0, 50)}`);
      console.log(`   Rating: ${sessionTotal === 3 ? '1' : sessionTotal === 2 ? '2' : '3'} | Sessions: ${sessions.join(', ')} | Total: ${sessionTotal}`);
    } else {
      console.log(`❌ ${topicName.substring(0, 50)}`);
      console.log(`   Rating: ${sessionTotal === 3 ? '1' : sessionTotal === 2 ? '2' : '3'} | Found: [${sessions.join(', ')}] | Expected: [${expectedSessions.join(', ')}]`);
      if (missing.length > 0) console.log(`   Missing: ${missing.join(', ')}`);
      if (extra.length > 0) console.log(`   Extra: ${extra.join(', ')}`);
      allCorrect = false;
      issues.push({ topic: topicName, sessions, expected: expectedSessions });
    }
    console.log('');
  });
  
  console.log('='.repeat(70));
  if (allCorrect) {
    console.log('🎉 All session numbering is correct!');
  } else {
    console.log(`❌ Found ${issues.length} topic(s) with incorrect session numbering`);
  }
}

testSessionNumbering().catch(console.error);

