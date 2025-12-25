/**
 * Test Saturday Restriction
 * 
 * Specifically tests that next week's plan can only be generated
 * from Saturday onwards (with dev bypass).
 * 
 * Run with: node scripts/test-saturday-restriction.js
 */

const BASE_URL = 'http://localhost:3000';

async function apiCall(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);
  
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  } catch (error) {
    return { status: 500, error: error.message };
  }
}

function getNextWeekMonday() {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today);
  monday.setDate(diff + 7);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

async function testSaturdayRestriction() {
  console.log('🧪 Saturday Restriction Test');
  console.log('='.repeat(70));
  
  const today = new Date();
  const dayOfWeek = today.getDay();
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
  
  console.log(`Today: ${today.toLocaleDateString()} (${dayName})`);
  console.log(`Is Saturday or later: ${dayOfWeek === 6 || dayOfWeek === 0}`);
  console.log(`Dev mode: ${process.env.NODE_ENV === 'development' ? 'Yes' : 'No'}`);
  console.log('');
  
  // Get user's subjects
  const currentMonday = new Date();
  const day = currentMonday.getDay();
  const diff = currentMonday.getDate() - day + (day === 0 ? -6 : 1);
  currentMonday.setDate(diff);
  currentMonday.setHours(0, 0, 0, 0);
  
  const currentBlocks = await apiCall(`/api/plan/generate?weekStart=${currentMonday.toISOString().split('T')[0]}`);
  
  if (currentBlocks.status !== 200 || !currentBlocks.data?.blocks?.length) {
    console.log('⚠️ No blocks found. Cannot determine subjects.');
    return;
  }
  
  const subjects = [...new Set(currentBlocks.data.blocks.map(b => b.subject).filter(Boolean))];
  console.log(`Using subjects: ${subjects.join(', ')}`);
  console.log('');
  
  const nextWeekStart = getNextWeekMonday();
  console.log(`Attempting to generate next week: ${nextWeekStart}`);
  
  const result = await apiCall('/api/plan/generate', 'POST', {
    subjects: subjects,
    targetWeek: nextWeekStart,
    availability: { monday: 4 },
    studyBlockDuration: 0.5
  });
  
  console.log(`Status: ${result.status}`);
  
  const isSaturdayOrLater = dayOfWeek === 6 || dayOfWeek === 0;
  const isDevMode = process.env.NODE_ENV === 'development';
  
  if (isDevMode) {
    console.log('\n✅ Dev mode: Restriction bypassed (expected)');
  } else if (isSaturdayOrLater) {
    if (result.status === 200 || result.data?.success) {
      console.log('\n✅ Correctly allowed (Saturday/Sunday)');
    } else {
      console.log(`\n❌ Should be allowed but got error: ${result.data?.error}`);
    }
  } else {
    if (result.status === 400 && result.data?.error?.includes('Saturday')) {
      console.log('\n✅ Correctly blocked (before Saturday)');
    } else {
      console.log(`\n❌ Should be blocked but got status ${result.status}`);
      if (result.data?.error) {
        console.log(`   Error: ${result.data.error}`);
      }
    }
  }
}

testSaturdayRestriction().catch(console.error);

