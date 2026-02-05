# Testing Guide: Unavailable Times Fix

## Quick Test (5 minutes)

### Setup
1. Clear all data:
   ```javascript
   localStorage.clear();
   sessionStorage.clear();
   location.reload();
   ```

2. Open browser console (F12)
3. Open terminal to watch server logs

### Test Case 1: Lunch Break (Basic Test)

**Add unavailable time during onboarding:**
- Slide 21: Add unavailable time
- Monday-Friday, 12:00 PM - 1:00 PM
- Label: "Lunch Break"

**Expected Console Logs (Browser):**
```
✅ Onboarding data saved successfully: { hasBlockedTimes: true, blockedTimesCount: 5 }
```

**Expected Console Logs (Server):**
```
🚫 Blocked times from frontend: { count: 0 }
📥 No blocked times from frontend, loading from database...
✅ Loaded unavailable times from database: { count: 5 }
🚫 FINAL combined blocked times for scheduler: { totalCount: 5 }
⏭️ Skipping slot due to blocked time: { day: 'monday', slotTime: '2024-01-08T12:00:00...' }
⏭️ Skipping slot due to blocked time: { day: 'tuesday', slotTime: '2024-01-09T12:00:00...' }
(etc. for Wed, Thu, Fri)
```

**Verify on Plan Page:**
- ✅ NO blocks between 12:00-1:00 PM on Mon-Fri
- ✅ Unavailable times visible as gray blocks
- ✅ Study blocks scheduled before/after lunch

---

### Test Case 2: Multiple Unavailable Times

**Add multiple times:**
- Monday 9:00-10:00 AM (Doctor appointment)
- Wednesday 2:00-4:00 PM (Meeting)
- Friday 5:00-6:00 PM (Gym)

**Expected:**
- ✅ 3 unavailable times saved
- ✅ Server logs show count: 3
- ✅ NO blocks during these times
- ✅ All 3 visible on calendar

---

### Test Case 3: Repeatable Event

**Add repeatable event:**
- Every Tuesday and Thursday
- 4:00-6:00 PM
- Label: "Soccer Practice"

**Expected:**
- ✅ Server logs show repeatable events: count: 2
- ✅ Combined blocked times: count: 2
- ✅ NO blocks on Tue/Thu 4-6 PM
- ✅ Visible on calendar

---

### Test Case 4: No Unavailable Times

**Skip adding any unavailable times**

**Expected:**
- ✅ Server logs: "Loaded unavailable times from database: { count: 0 }"
- ✅ Blocks scheduled throughout the day
- ✅ No errors

---

## Detailed Test (15 minutes)

### Scenario 1: Verify Database Save

**Step 1: Add unavailable time**
- Lunch: Mon-Fri 12-1 PM

**Step 2: Check database** (before generating plan)
```sql
SELECT * FROM unavailable_times 
WHERE user_id = 'YOUR_USER_ID' 
ORDER BY created_at DESC;
```

**Expected:**
- ✅ 5 rows (one for each weekday)
- ✅ start_datetime: 12:00:00
- ✅ end_datetime: 13:00:00

**Step 3: Generate plan**

**Step 4: Check blocks don't overlap**
```sql
SELECT b.scheduled_at, b.duration_minutes, u.start_datetime, u.end_datetime
FROM blocks b
CROSS JOIN unavailable_times u
WHERE b.user_id = 'YOUR_USER_ID'
  AND u.user_id = 'YOUR_USER_ID'
  AND b.scheduled_at < u.end_datetime
  AND (b.scheduled_at + (b.duration_minutes || ' minutes')::interval) > u.start_datetime;
```

**Expected:**
- ✅ 0 rows (no overlaps)

---

### Scenario 2: Race Condition Test

**Test if delay is sufficient:**

**Step 1: Add unavailable time**
- Lunch: Mon-Fri 12-1 PM

**Step 2: Watch timing in console**
```
[Time 0ms] Saving your preferences...
[Time 500ms] ✅ Onboarding data saved
[Time 1500ms] Generating your study plan...
```

**Expected:**
- ✅ At least 1000ms between save and generate
- ✅ Unavailable times loaded successfully

**If it fails:**
- Increase delay in generating/page.js (currently 1000ms)
- Try 1500ms or 2000ms

---

### Scenario 3: Visual Verification

**Step 1: Generate plan with unavailable times**

**Step 2: On plan page, verify:**
- ✅ Gray blocks show unavailable times
- ✅ Blue blocks (study blocks) don't overlap gray blocks
- ✅ Gap between blocks at unavailable times
- ✅ Hover over gray block shows "Unavailable"

**Step 3: Check specific times:**
- If lunch is 12-1 PM
- Last block before lunch should end at 11:30 AM or earlier
- First block after lunch should start at 1:00 PM or later

---

## Debug Checklist

If blocks still overlap unavailable times:

### Check 1: Are unavailable times saved?
```javascript
// Browser console
fetch('/api/availability/get')
  .then(r => r.json())
  .then(data => console.log('Blocked times:', data.blockedTimes));
```

**Expected:** Array with your unavailable times

**If empty:**
- ❌ Onboarding save failed
- Check server logs for errors in `/api/onboarding/save`

---

### Check 2: Are they loaded during generation?
**Server logs should show:**
```
✅ Loaded unavailable times from database: { count: X }
```

**If count is 0:**
- ❌ Database query failed or returned nothing
- Check user_id matches
- Check date range is correct

---

### Check 3: Are they passed to scheduler?
**Server logs should show:**
```
🚫 FINAL combined blocked times for scheduler: { totalCount: X }
```

**If count is 0:**
- ❌ Blocked times not combined correctly
- Check repeatableEvents are loading
- Check sanitizeBlockedTimes function

---

### Check 4: Is scheduler respecting them?
**Server logs should show:**
```
⏭️ Skipping slot due to blocked time: { ... }
```

**If no skips shown:**
- ❌ Scheduler not checking overlaps
- Check overlaps() function in buildSlots.js
- Check blockedIntervals array is populated

---

## Success Criteria

✅ **All tests pass:**
- No blocks overlap unavailable times
- Unavailable times visible on calendar
- Console logs show correct counts
- Database has unavailable times saved

✅ **Performance:**
- Plan generation completes in 5-10 seconds
- No errors in console
- No errors in server logs

✅ **User Experience:**
- Unavailable times respected
- Plan looks correct
- No confusion about overlapping blocks

---

## Common Issues

### Issue 1: "Still seeing overlaps"

**Cause:** Delay not sufficient for database commit

**Solution:**
```javascript
// In generating/page.js, increase delay:
await new Promise(resolve => setTimeout(resolve, 2000)); // Increase to 2 seconds
```

---

### Issue 2: "Unavailable times not showing on calendar"

**Cause:** Frontend not loading them for display

**Solution:** This is a separate display issue, not related to scheduling. Blocks should still respect them even if not visible.

---

### Issue 3: "Count is 0 in logs"

**Cause:** Unavailable times not saved to database

**Solution:**
- Check onboarding/save API logs for errors
- Verify unavailable_times table exists
- Check user_id is correct

---

## Rollback Plan

If this fix causes issues:

1. **Revert the delay:**
   ```javascript
   // Remove these lines from generating/page.js:
   await new Promise(resolve => setTimeout(resolve, 1000));
   ```

2. **Keep the logging** - it's helpful for debugging

3. **Alternative fix:**
   - Pass blockedTimes directly from frontend
   - Don't rely on database load

---

**Last Updated:** January 30, 2026
