# Testing Guide: Same-Day Plan Generation

## Quick Start Testing

### Option 1: Manual Time Override (Fastest)

Open browser console (F12) and run these commands:

```javascript
// Test Monday 2 PM (before 9 PM)
localStorage.setItem('devTimeOverride', '2024-01-08T14:00:00');
location.reload();
// Expected: Toggle shown, default "start today", user can choose

// Test Tuesday 10 PM (after 9 PM)
localStorage.setItem('devTimeOverride', '2024-01-09T22:00:00');
location.reload();
// Expected: No toggle, message shown, forced to start tomorrow

// Test Wednesday 3:07 PM (before 9 PM, odd time)
localStorage.setItem('devTimeOverride', '2024-01-10T15:07:00');
location.reload();
// Expected: Toggle shown, first block at 3:15 PM or later (rounded up)

// Reset to real time
localStorage.removeItem('devTimeOverride');
location.reload();
```

### Option 2: Use Dev Tools (After Other Agent Completes)

1. Navigate to `/dev-tools`
2. Use the Time Override section
3. Click preset buttons to test different scenarios
4. Go through onboarding to slide 22

## Complete Test Flow

### Test 1: Before 9 PM Signup (User Chooses "Start Today")

**Setup:**
```javascript
localStorage.setItem('devTimeOverride', '2024-01-08T14:00:00'); // Monday 2 PM
location.reload();
```

**Steps:**
1. Clear localStorage: `localStorage.clear()`
2. Go to onboarding: `/onboarding/slide-1`
3. Complete all slides up to slide 22
4. **Verify on slide 22:**
   - ✅ Toggle IS visible
   - ✅ "Start today" is selected by default
   - ✅ Can switch to "Start tomorrow"
5. Leave "Start today" selected
6. Click "Generate My Study Plan"
7. Wait for plan generation
8. **Verify on plan page:**
   - ✅ First block should be TODAY (Monday)
   - ✅ Time should be 2:00 PM or later (after current time)
   - ✅ No blocks scheduled before 2 PM

**Check console logs:**
```
🕐 Time check: { currentHour: 14, isAfter9PM: false }
📅 Before 9 PM: User can choose when to start (default: today)
💾 Saved startToday preference: true
📅 Plan generation settings: { startToday: true }
📅 Today's slots start from current time: { currentMinutes: 840, candidateMinutes: 840 }
```

---

### Test 2: Before 9 PM Signup (User Chooses "Start Tomorrow")

**Setup:**
```javascript
localStorage.setItem('devTimeOverride', '2024-01-08T14:00:00'); // Monday 2 PM
location.reload();
```

**Steps:**
1. Clear localStorage: `localStorage.clear()`
2. Go to onboarding and complete to slide 22
3. **Verify on slide 22:**
   - ✅ Toggle IS visible
   - ✅ "Start today" is selected by default
4. Select "Start tomorrow"
5. Click "Generate My Study Plan"
6. **Verify on plan page:**
   - ✅ First block should be TOMORROW (Tuesday)
   - ✅ No blocks scheduled for today

**Check console logs:**
```
💾 Saved startToday preference: false
📅 Plan generation timing: { startToday: false, message: 'Starting plan tomorrow' }
```

---

### Test 3: After 9 PM Signup (Forced Tomorrow)

**Setup:**
```javascript
localStorage.setItem('devTimeOverride', '2024-01-09T22:00:00'); // Tuesday 10 PM
location.reload();
```

**Steps:**
1. Clear localStorage: `localStorage.clear()`
2. Go to onboarding: `/onboarding/slide-1`
3. Complete all slides up to slide 22
4. **Verify on slide 22:**
   - ❌ No toggle visible
   - ✅ Message shown: "It's late! Your plan will start tomorrow morning..."
5. Click "Generate My Study Plan"
6. **Verify on plan page:**
   - ✅ First block should be TOMORROW (Wednesday)
   - ✅ No blocks for today (Tuesday)

**Check console logs:**
```
🕐 Time check: { currentHour: 22, isAfter9PM: true }
📅 After 9 PM: Plan will start tomorrow (no choice)
💾 Saved startToday preference: false
```

---

### Test 4: Odd Time - Current Time Rounding

**Setup:**
```javascript
localStorage.setItem('devTimeOverride', '2024-01-10T15:07:00'); // Wednesday 3:07 PM
location.reload();
```

**Steps:**
1. Clear localStorage: `localStorage.clear()`
2. Go to onboarding and complete to slide 22
3. Select "Start today"
4. Click "Generate My Study Plan"
5. **Verify on plan page:**
   - ✅ First block should be at 3:15 PM or later (NOT 3:07 PM)
   - ✅ Time is rounded up to next 15-minute interval
   - ✅ No blocks before 3:07 PM

**Check console logs:**
```
📅 Today's slots start from current time: { 
  currentMinutes: 907,
  roundedCurrentMinutes: 915,
  candidateMinutes: 915 
}
```

---

### Test 5: Edge Case - Exactly 9 PM

**Setup:**
```javascript
localStorage.setItem('devTimeOverride', '2024-01-08T21:00:00'); // Monday 9:00 PM
location.reload();
```

**Steps:**
1. Complete onboarding to slide 22
2. **Verify:** No toggle shown (>= 21 means "after 9 PM")
3. **Verify:** Message shown about starting tomorrow

---

### Test 6: Late Afternoon with Limited Time

**Setup:**
```javascript
localStorage.setItem('devTimeOverride', '2024-01-08T20:30:00'); // Monday 8:30 PM
location.reload();
```

**Assumptions:**
- User's latest study time is 11:00 PM
- About 2.5 hours left in the day

**Steps:**
1. Complete onboarding to slide 22
2. **Verify:** Toggle is shown (before 9 PM)
3. Select "Start today"
4. Click "Generate My Study Plan"
5. **Verify:**
   - ✅ Plan generation succeeds
   - ✅ First block is TONIGHT at 8:30 PM or later
   - ✅ Limited blocks for today, more tomorrow

---

## Verification Checklist

After each test, verify:

### Frontend (Slide 22)
- [ ] Toggle visibility matches expectations
- [ ] Default selection is correct
- [ ] User can change selection (when toggle shown)
- [ ] Console logs show correct time detection

### API Call
- [ ] `startToday` parameter is in request payload
- [ ] Check browser Network tab → `/api/plan/generate` → Request
- [ ] Value matches user's choice

### Backend Processing
- [ ] Server logs show correct `actualStartDate`
- [ ] `startToday` flag is logged correctly
- [ ] Check terminal output for plan generation logs

### Generated Blocks
- [ ] First block date matches expectations
- [ ] Blocks respect unavailable times
- [ ] Cross-week scheduling works (Sunday → Monday)
- [ ] No duplicate blocks created

---

## Debug Commands

### Check Current State
```javascript
// Check what time the system thinks it is
const { getEffectiveDate } = await import('/libs/dev-helpers.js');
console.log('Current time:', getEffectiveDate().toLocaleString());

// Check saved preference
const quizAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
console.log('startToday preference:', quizAnswers.startToday);

// Check time override
console.log('Time override:', localStorage.getItem('devTimeOverride'));
```

### Check Generated Blocks
```javascript
// After plan generation, check blocks
fetch('/api/plan/generate?weekStart=2024-01-08')
  .then(r => r.json())
  .then(data => {
    console.log('First block:', data.blocks[0]);
    console.log('All blocks:', data.blocks.map(b => ({
      date: b.scheduled_at.split('T')[0],
      time: b.scheduled_at.split('T')[1],
      topic: b.topic_name
    })));
  });
```

### Reset Everything
```javascript
// Clear all test data
localStorage.clear();
sessionStorage.clear();
location.reload();
```

---

## Common Issues & Solutions

### Issue: Toggle not showing when expected
**Solution:** Check console logs for time detection. Verify `getEffectiveDate()` is being used.

### Issue: Plan starts tomorrow even when "start today" selected
**Solution:** Check Network tab to verify `startToday: true` is in API request payload.

### Issue: No blocks generated
**Solution:** Check if there are available time slots. Late night signups might have no slots left today.

### Issue: Time override not working
**Solution:** Verify you're in development mode (localhost). Check `isDev` flag in console.

---

## Success Metrics

After testing, verify:

✅ All 6 test scenarios pass
✅ No console errors
✅ No linter errors
✅ Toggle appears/disappears correctly
✅ User choice is respected
✅ Cross-week logic works (Sunday → Monday)
✅ Backward compatibility maintained

---

**Last Updated:** January 30, 2026
