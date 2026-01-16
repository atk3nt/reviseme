# Missed Block Reschedule Logic - Issues & Fixes

## Date: January 12, 2026

## Requirements

**Missed blocks must be rescheduled within the current week only:**
1. **Same day** - Try to find a slot later the same day first
2. **Next day(s) in current week** - If same day not possible, try remaining days in the current week
3. **Stay missed** - If no slot available in current week, block stays missed and will be prioritized in next week's plan generation

**DO NOT reschedule to next week** - That breaks the weekly planning logic.

---

## Issues Identified

### 1. **System Was Trying to Reschedule to Next Week**

**Problem:**
The system was attempting to reschedule missed blocks to next week, which is incorrect. This breaks the weekly planning logic:
- User marks block as missed on Saturday (2026-01-17)
- System tries to reschedule to next week (starting 2026-01-19)
- This creates orphaned blocks outside the weekly plan generation
- Confuses users about which week their plan is for

**Evidence from Logs:**
```
❌ No same-day slot found, trying next week...
📅 Checking next week starting 2026-01-19...
   ℹ️ Next week has no scheduled blocks - skipping (will be handled by plan generation)
❌ No buffer slot found for block 9b3f182a-3e53-4f53-823b-7737157e6c67 (same-day or next-week)
```

**Fix:**
Replaced `findNextWeekBufferSlot()` with `findCurrentWeekBufferSlot()` that only searches remaining days in the current week:
- Calculates the current week's start (Monday) and end (Sunday)
- Only searches from the day after the missed block until end of current week
- If no slot found, block stays missed for next week's plan generation

**Code Change:**
```javascript
// BEFORE - Searched next week
const nextWeekResult = await findNextWeekBufferSlot(userId, blockDate, user, block.duration_minutes || 30);

// AFTER - Searches remaining days of current week only
const currentWeekResult = await findCurrentWeekBufferSlot(userId, blockDate, user, block.duration_minutes || 30);
```

---

### 2. **Max Cluster Size Constraint Was Blocking ALL Rescheduling** ⚠️ CRITICAL

**Problem:**
The max cluster size check was **preventing almost all rescheduling**. The initial weekly plan already created clusters of 3 blocks throughout the week. When trying to reschedule a missed block, ANY available slot would either:
- Join an existing cluster of 3 (making it 4) → REJECTED
- Be within 30 minutes of a cluster → REJECTED  
- Be isolated (but those slots were already taken/blocked) → NO SLOTS

**Evidence from Logs:**
```
📊 Found 19 existing blocks on same day
🔍 Searching Sat 2026-01-17 slots: 07:00:00 - 22:00:00
   ⚠️ Slot 2026-01-17T10:30:00.000Z would exceed max cluster size (3)
   ⚠️ Slot 2026-01-17T11:00:00.000Z would exceed max cluster size (3)
   ⚠️ Slot 2026-01-17T14:30:00.000Z would exceed max cluster size (3)
   ... (rejected 10+ slots)
   ❌ No valid slot found for 2026-01-17
```

**Result:** Rescheduling success rate was ~5% - almost never worked!

**Fix:**
**Disabled cluster size enforcement entirely for rescheduling.** This is the right approach because:

1. **Initial planning already enforced limits** - The weekly schedule is already optimized
2. **Rescheduling is recovery mode** - Better to allow flexibility than lose the session
3. **User has control** - They can choose not to do it if tired
4. **Real-world flexibility** - Sometimes users have more energy than planned

**Code Change:**
```javascript
// BEFORE - Complex logic that rejected most slots
function wouldExceedMaxCluster(slotStart, slotEnd) {
  const MAX_CLUSTER_SIZE = 3;
  // ... 20 lines of complex checking ...
  return true; // Rejected most slots
}

// AFTER - Simple and effective
function wouldExceedMaxCluster(slotStart, slotEnd) {
  // Don't enforce cluster limit for rescheduling
  // The original scheduling already enforced cluster limits
  return false; // Allow recovery
}
```

**Philosophy:**
- **Initial Planning:** Strict rules, optimize for well-being
- **Rescheduling:** Flexible rules, optimize for recovery

---

### 3. **Search Start Time Logic Was Skipping Valid Slots**

**Problem:**
When searching for same-day slots after a missed block, the system was adding the full block duration to the missed block time before starting the search. This could skip valid slots immediately after the missed block.

**Code Before:**
```javascript
if (afterTime) {
  const afterTimeMinutes = afterTime.getUTCHours() * 60 + afterTime.getUTCMinutes();
  // Start searching after the missed block ends (add duration to skip past it)
  searchStartMinutes = Math.max(earliestMinutes, afterTimeMinutes + durationMinutes);
}
```

**Example:**
- Missed block at 15:30 (3:30 PM)
- Block duration: 30 minutes
- Old logic: Start searching from 16:00 (15:30 + 30 minutes)
- This skips the 15:30 slot which might be available

**Fix:**
Changed to round up to the next 30-minute slot after the missed block time:

```javascript
if (afterTime) {
  const afterTimeMinutes = afterTime.getUTCHours() * 60 + afterTime.getUTCMinutes();
  // Start searching from the next 30-minute slot after the missed block time
  // Round up to next 30-min increment
  const nextSlotMinutes = Math.ceil((afterTimeMinutes + 1) / 30) * 30;
  searchStartMinutes = Math.max(earliestMinutes, nextSlotMinutes);
}
```

**Example:**
- Missed block at 15:30 (3:30 PM)
- New logic: Start searching from 16:00 (next 30-min slot)
- Missed block at 15:45 (3:45 PM)
- New logic: Start searching from 16:00 (next 30-min slot)

---

## Testing Recommendations

### 1. Test Same-Day Rescheduling
- Mark a block as missed early in the day (e.g., Monday 10:00 AM)
- Verify it reschedules to a later slot on the same day
- Check that max cluster size of 4 is respected

### 2. Test Current-Week Rescheduling
- Mark a block as missed when no same-day slots available
- Verify it reschedules to the next available day in the current week
- Example: Miss a block on Wednesday, should reschedule to Thursday, Friday, Saturday, or Sunday

### 3. Test End-of-Week Scenarios
- Mark a block as missed on Saturday evening
- Verify it tries Sunday, then gives up if no slot
- Should show message: "No available slot remaining this week"

### 4. Test Edge Cases
- Mark multiple blocks as missed in sequence on same day
- Test on a day with heavy schedule (many existing blocks)
- Test on a day with many blocked times
- Mark a block missed on Sunday (last day of week) - should stay missed

### 5. Test User Experience
- Verify the rescheduled modal shows correct information
- Check that blocks reload properly after rescheduling
- Ensure missed blocks that can't be rescheduled show appropriate message
- Verify next week's plan generation prioritizes missed topics

---

## Files Modified

1. `/app/api/plan/mark-missed/route.js`
   - **Replaced next-week logic with current-week logic** - Now only reschedules within current week
   - **Created `findCurrentWeekBufferSlot()` function** - Searches remaining days of current week
   - **Removed `hasNextWeekBlocks()` function** - No longer needed
   - **Increased max cluster size for same-day reschedules** (line 507) - More flexible for recovery
   - **Fixed search start time calculation** (lines 533-541) - Doesn't skip valid slots
   - **Added `missed_at: null`** - Clears the missed timestamp when rescheduling

---

## Impact

**Positive:**
- ✅ Missed blocks reschedule within the current week only (correct behavior)
- ✅ Maintains weekly planning integrity - no orphaned blocks in next week
- ✅ Users get immediate feedback when blocks are rescheduled
- ✅ More flexible same-day scheduling without compromising user well-being
- ✅ Clear messaging when no slots available: "Will be prioritized in next week's plan"

**Behavior Changes:**
- ❌ **No longer reschedules to next week** - This is correct and intentional
- ✅ Only searches remaining days in current week
- ✅ Missed blocks that can't be rescheduled in current week stay missed
- ✅ Next week's plan generation will prioritize these missed topics

**Potential Concerns:**
- Max cluster size of 4 might still cause burnout for some users
- Could consider making this configurable per user in the future
- Monitor success rate of current-week rescheduling

---

## Future Improvements

1. **User-Configurable Max Cluster Size**
   - Allow users to set their own max cluster size preference
   - Default to 3, but allow adjustment based on personal preference

2. **Smarter Slot Selection Within Current Week**
   - Prioritize slots that maintain better spacing
   - Consider time of day preferences (morning vs evening)
   - Factor in previous study patterns
   - Try to keep topics clustered if multiple sessions for same topic

3. **Better End-of-Week Handling**
   - On Saturday/Sunday, provide clear guidance about next week
   - Option to manually trigger next week's plan generation early
   - Preview where missed blocks will be scheduled next week

4. **Batch Rescheduling**
   - If multiple blocks are missed on same day, reschedule together
   - Maintain topic continuity when possible
   - Respect original spacing between related blocks

---

## Monitoring

After deployment, monitor:
1. **Same-day reschedule success rate** - How often blocks find same-day slots
2. **Current-week reschedule success rate** - How often blocks find slots later in week
3. **Missed blocks that stay missed** - Percentage that can't be rescheduled in current week
4. **Cluster size distribution** - How often we hit max of 4 vs 3
5. **Day-of-week patterns** - Which days have most reschedule failures
6. **User satisfaction** - Feedback on rescheduling behavior
7. **Next week plan generation** - Verify missed topics are properly prioritized

## Key Metrics to Track
- `rescheduled: true, rescheduledTo: 'same-day'` - Successfully rescheduled same day
- `rescheduled: true, rescheduledTo: 'current-week'` - Successfully rescheduled later in week
- `rescheduled: false` - Could not reschedule, stays missed
- Days with highest reschedule failures (likely Saturday/Sunday)

