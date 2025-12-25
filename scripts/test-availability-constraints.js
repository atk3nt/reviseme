/**
 * Test Availability Constraints
 * 
 * Verifies that the scheduler respects user's daily availability settings:
 * - Monday: X slots
 * - Tuesday: Y slots
 * - etc.
 * 
 * Run with: node scripts/test-availability-constraints.js
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

function getCurrentWeekMonday() {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatDate(date) {
  return new Date(date).toISOString().split('T')[0];
}

function getDayName(date) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
}

// Count blocks per day
function countBlocksPerDay(blocks) {
  const dayCounts = {
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0,
    saturday: 0,
    sunday: 0
  };
  
  blocks.forEach(block => {
    const blockDate = new Date(block.scheduled_at);
    const day = blockDate.getDay();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    dayCounts[dayNames[day]]++;
  });
  
  return dayCounts;
}

async function testAvailabilityConstraints() {
  console.log('🧪 Availability Constraints Test');
  console.log('='.repeat(70));
  
  // Get current week
  const currentMonday = getCurrentWeekMonday();
  const weekStart = formatDate(currentMonday);
  
  console.log(`Week: ${weekStart}\n`);
  
  // Get existing blocks to determine subjects
  const existingBlocks = await apiCall(`/api/plan/generate?weekStart=${weekStart}`);
  
  if (existingBlocks.status !== 200 || !existingBlocks.data?.blocks?.length) {
    console.log('⚠️ No existing blocks found. Cannot determine subjects.');
    console.log('   Please generate a plan first through the UI.');
    return;
  }
  
  // Analyze existing blocks
  console.log('🔍 Analyzing existing blocks distribution...\n');
  
  // Get existing blocks
  const blocksResult = await apiCall(`/api/plan/generate?weekStart=${weekStart}`);
  
  if (blocksResult.status !== 200 || !blocksResult.data?.blocks?.length) {
    console.log('⚠️ No blocks found to analyze');
    console.log('\n💡 Note: This test analyzes existing blocks.');
    console.log('   Generate a plan through the UI first, then run this test again.');
    return;
  }
  
  const blocks = blocksResult.data.blocks.filter(b => b.status === 'scheduled');
  
  console.log('ℹ️  Note: Availability is calculated from:');
  console.log('   - Time preferences (weekday/weekend earliest/latest times)');
  console.log('   - Blocked times');
  console.log('   - Study block duration');
  console.log('   This test shows the actual block distribution.\n');
  console.log(`Found ${blocks.length} scheduled blocks\n`);
  
  // Count blocks per day
  const dayCounts = countBlocksPerDay(blocks);
  
  // Calculate total available hours per day (estimate based on common settings)
  // This is just for reference - actual calculation is more complex
  const estimatedAvailability = {
    monday: 8,    // 9am-5pm = 8 hours
    tuesday: 8,
    wednesday: 8,
    thursday: 8,
    friday: 8,
    saturday: 6,  // 10am-4pm = 6 hours
    sunday: 6
  };
  
  // Report results
  console.log('📊 Actual Block Distribution:');
  console.log('-'.repeat(70));
  const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  dayNames.forEach(day => {
    const count = dayCounts[day];
    const dayName = day.charAt(0).toUpperCase() + day.slice(1);
    const estimatedSlots = Math.floor(estimatedAvailability[day] / 0.5); // Assuming 30min blocks
    const percentage = estimatedSlots > 0 ? Math.round((count / estimatedSlots) * 100) : 0;
    
    // Visual indicator
    let indicator = '✅';
    if (percentage > 100) indicator = '⚠️';
    if (percentage > 120) indicator = '❌';
    
    console.log(`   ${indicator} ${dayName.padEnd(10)}: ${count} block${count !== 1 ? 's' : ''} (${percentage}% of estimated capacity)`);
  });
  
  console.log('='.repeat(70));
  console.log(`\n📈 Summary: ${blocks.length} total blocks scheduled`);
  
  // Check for potential issues
  const issues = [];
  dayNames.forEach(day => {
    const count = dayCounts[day];
    const estimatedSlots = Math.floor(estimatedAvailability[day] / 0.5);
    if (count > estimatedSlots * 1.2) {
      issues.push({
        day: day.charAt(0).toUpperCase() + day.slice(1),
        blocks: count,
        estimated: estimatedSlots
      });
    }
  });
  
  if (issues.length === 0) {
    console.log('✅ Block distribution looks reasonable');
    console.log('   (Based on estimated 8hr weekdays, 6hr weekends, 30min blocks)');
  } else {
    console.log(`\n⚠️  Potential issues (blocks exceed estimated capacity):`);
    issues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue.day}: ${issue.blocks} blocks (estimated max: ~${issue.estimated})`);
    });
    console.log('\n   Note: This might be normal if:');
    console.log('   - Your time preferences allow longer days');
    console.log('   - You have fewer blocked times');
    console.log('   - Your study block duration is shorter');
  }
  
  // Show detailed breakdown
  if (blocks.length > 0) {
    console.log('\n📋 Detailed breakdown:');
    Object.entries(dayCounts).forEach(([day, count]) => {
      if (count > 0) {
        const dayBlocks = blocks.filter(b => {
          const blockDate = new Date(b.scheduled_at);
          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          return dayNames[blockDate.getDay()] === day;
        });
        
        console.log(`\n   ${day.charAt(0).toUpperCase() + day.slice(1)} (${count} block${count !== 1 ? 's' : ''}):`);
        dayBlocks.slice(0, 5).forEach((block, i) => {
          const blockTime = new Date(block.scheduled_at);
          const time = blockTime.toTimeString().split(' ')[0].substring(0, 5);
          console.log(`      ${i + 1}. ${time} - ${block.topic_name?.substring(0, 40)}`);
        });
        if (dayBlocks.length > 5) {
          console.log(`      ... and ${dayBlocks.length - 5} more`);
        }
      }
    });
  }
  
  console.log('='.repeat(70));
  
  // Provide guidance
  console.log('\n💡 Understanding Availability:');
  console.log('   Availability is calculated from:');
  console.log('   1. Time preferences (earliest/latest times for weekdays/weekends)');
  console.log('   2. Blocked times (specific time slots you\'ve blocked)');
  console.log('   3. Study block duration (typically 30 minutes)');
  console.log('\n   Formula: Available hours = (Latest - Earliest) - Blocked time');
  console.log('   Available slots = Available hours / Block duration');
  console.log('\n   To verify your plan respects availability:');
  console.log('   1. Check your time preferences in settings');
  console.log('   2. Check your blocked times');
  console.log('   3. Compare the block distribution above with your expected availability');
  console.log('   4. If blocks exceed availability, check for:');
  console.log('      - Missing blocked times in the system');
  console.log('      - Time preferences not matching your settings');
  console.log('      - Plan generated with different settings');
}

testAvailabilityConstraints().catch(console.error);

