# Complete Dev Tools Guide

## 🎯 Overview

Your dev tools now include two powerful systems for efficient testing:

1. **Time Override** - Test time-based logic without changing system time
2. **Dev User Management** - Reset data quickly without manual database operations

---

## 📍 Access Dev Tools

```
http://localhost:3000/dev-tools
```

**Requirements:**
- Must be on `localhost` or `127.0.0.1`
- OR `NODE_ENV=development`

---

## 🎨 Interface Sections

### 1. Warning Banners (Top)
Shows active overrides:
- **Time Override Active** - Amber banner when time is overridden
- Auto-dismissing status messages (green)

### 2. Time Override Section
**Purpose:** Test time-based features

**Features:**
- Current time display (updates every second)
- 6 quick preset buttons
- Custom datetime input
- Reset button

**Use cases:**
- Testing Sunday 10 PM restriction
- Testing day-of-week logic
- Testing business hours
- Testing deadlines

### 3. Dev User Management Section
**Purpose:** Reset data quickly

**Features:**
- Grant Access button (blue)
- Reset Plan button (yellow)
- Reset Onboarding button (orange)
- Full Reset button (red)

**Use cases:**
- Quick testing iterations
- Testing onboarding flow
- Starting fresh
- Cleaning up test data

### 4. Quick Navigation Section
**Purpose:** Jump to common pages

**Links:**
- Onboarding slides
- Plan page
- Settings
- Payment page

### 5. LocalStorage Management Section
**Purpose:** Manage browser storage

**Features:**
- View localStorage
- Clear onboarding data
- Clear all localStorage

### 6. Test Data Generation Section
**Purpose:** Quickly populate test data

**Features:**
- Set test subjects
- Set test time preferences
- Set test blocked times
- Fill random ratings

### 7. Current State Section
**Purpose:** Debug current state

**Shows:**
- Hostname
- Current path
- LocalStorage keys
- Quiz answers (if any)

---

## 🔄 Complete Testing Workflows

### Workflow A: Daily Development

```bash
# Morning - Start fresh
1. Open dev tools
2. Grant Access (if needed)
3. Complete onboarding (or use existing)
4. Generate plan

# During development
5. Make code changes
6. Test features
7. Reset Plan (keep ratings)
8. Generate new plan
9. Test again
10. Repeat steps 5-9

# End of day
11. Optional: Full Reset for tomorrow
```

### Workflow B: Testing Plan Generation

```bash
# Setup
1. Grant Access
2. Complete onboarding
3. Set test subjects (Maths, Biology, Chemistry)
4. Set test time prefs (8am-10pm)
5. Fill random ratings

# Test different scenarios
6. Generate plan for this week
7. Verify blocks are scheduled
8. Reset Plan
9. Change time preferences
10. Generate plan again
11. Verify different schedule
12. Reset Plan
13. Add blocked times
14. Generate plan again
15. Verify blocks avoid blocked times
```

### Workflow C: Testing Time-Based Features

```bash
# Test Sunday night restriction
1. Set time to "Sunday 10 PM"
2. Try to generate plan
3. Verify: Should show error
4. Reset Plan
5. Set time to "Sunday 3 PM"
6. Generate plan
7. Verify: Should succeed
8. Reset Plan
9. Set time to "Monday 2 PM"
10. Generate plan
11. Verify: Should succeed
12. Use Real Time
```

### Workflow D: Testing Onboarding Changes

```bash
# First onboarding
1. Grant Access
2. Complete onboarding (Maths, Biology)
3. Rate topics (various ratings)
4. Generate plan
5. Test features

# Change subjects
6. Reset Onboarding
7. Complete onboarding (Physics, Chemistry)
8. Rate topics differently
9. Generate plan
10. Verify: New subjects, new ratings
11. Old blocks still visible in history
```

### Workflow E: Testing Full User Journey

```bash
# Complete fresh start
1. Full Reset
2. Verify: Redirected to login/onboarding
3. Grant Access
4. Complete onboarding
   - Select subjects
   - Rate topics
   - Set time preferences
   - Add blocked times
5. Generate plan for this week
6. Complete some blocks
7. Miss some blocks
8. Skip some blocks
9. Re-rate some topics
10. Generate plan for next week
11. Verify: Spaced repetition working
12. Verify: Missed blocks rescheduled
13. Verify: Re-rated topics prioritized
```

---

## 🎮 Power User Techniques

### Technique 1: Rapid Iteration

```bash
# Fastest way to test plan generation
while (testing) {
  1. Make code change
  2. Click "Reset Plan" (1 second)
  3. Click "Generate Plan"
  4. Verify results
}

# No need to:
- Reset database manually
- Re-complete onboarding
- Re-rate topics
- Re-enter time preferences
```

### Technique 2: Time Travel Testing

```bash
# Test a full week in minutes
1. Set time to "Monday 2 PM"
2. Generate plan
3. Mark Monday blocks as done
4. Set time to "Tuesday 2 PM"
5. Mark Tuesday blocks as done
6. Set time to "Wednesday 2 PM"
7. Mark Wednesday blocks as done
... continue through week
8. Set time to "Saturday 11 PM"
9. Generate next week's plan
10. Verify: Spaced repetition working
```

### Technique 3: Parallel Testing

```bash
# Use multiple browser profiles
Profile 1: Fresh user
- Full Reset
- Just completed onboarding
- No blocks yet

Profile 2: Active user
- Has 1 week of completed blocks
- Some re-ratings
- Testing ongoing features

Profile 3: Power user
- Multiple weeks of data
- Many re-ratings
- Testing edge cases
```

### Technique 4: Automated Testing

```javascript
// Create test script
async function runTestSuite() {
  // 1. Reset
  await fetch('/api/dev/full-reset', { method: 'POST' });
  
  // 2. Grant access
  await fetch('/api/dev/set-access', { method: 'POST' });
  
  // 3. Generate plan
  const response = await fetch('/api/plan/generate', {
    method: 'POST',
    body: JSON.stringify({
      subjects: ['maths', 'biology'],
      ratings: { /* ... */ },
      timePreferences: { /* ... */ }
    })
  });
  
  // 4. Verify
  const data = await response.json();
  console.assert(data.success, 'Plan generation should succeed');
  console.assert(data.blocks.length > 0, 'Should have blocks');
  
  // 5. Reset for next test
  await fetch('/api/dev/reset-plan', { method: 'POST' });
}
```

---

## 🔍 Debugging Tips

### Check Current State

```javascript
// In browser console:

// Check time override
localStorage.getItem('devTimeOverride')

// Check all localStorage
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  console.log(key, localStorage.getItem(key));
}

// Check if dev mode
process.env.NODE_ENV

// Check hostname
window.location.hostname
```

### Common Issues

**Issue:** Buttons not working
```bash
Solution:
1. Check browser console for errors
2. Verify you're on localhost
3. Check you're logged in
4. Refresh page
```

**Issue:** Time override not affecting code
```bash
Solution:
1. Verify you're using getEffectiveDate() not new Date()
2. Check browser console for errors
3. Clear time override and set again
4. Refresh page
```

**Issue:** Reset not clearing data
```bash
Solution:
1. Check browser console for API errors
2. Try Full Reset instead
3. Manually check database
4. Verify database connection
```

**Issue:** "Dev mode only" error
```bash
Solution:
1. Check NODE_ENV=development in .env
2. Verify you're on localhost
3. Restart dev server
4. Check .env is loaded
```

---

## 📊 Feature Comparison

| Feature | Time Override | Dev User Management |
|---------|---------------|---------------------|
| **Purpose** | Test time logic | Reset data quickly |
| **Speed** | Instant | 1-2 seconds |
| **Persistence** | Until cleared | Permanent |
| **Scope** | Client-side only | Database |
| **Safety** | Reversible | Destructive |
| **Use frequency** | Multiple times per session | Once per test cycle |

---

## 🎯 Best Practices

### 1. Always Start with Grant Access
```bash
# Correct order:
1. Grant Access ← First!
2. Complete Onboarding
3. Generate Plan
4. Test Features

# Wrong order:
1. Complete Onboarding
2. Generate Plan ← Fails (no access)
3. Grant Access ← Too late
```

### 2. Use Appropriate Reset Level
```bash
# Testing plan generation?
→ Use Reset Plan (fastest)

# Testing onboarding?
→ Use Reset Onboarding

# Starting completely fresh?
→ Use Full Reset (slowest)
```

### 3. Clear Time Override When Done
```bash
# Always clear time override:
1. Test with time override
2. Click "Use Real Time" ← Don't forget!
3. Continue testing with real time
```

### 4. Document Your Tests
```markdown
## Test Session - 2024-01-30

### Tests Completed
- ✅ Sunday night restriction
- ✅ Plan generation with 3 subjects
- ✅ Spaced repetition logic
- ⚠️ Re-rating flow (found bug)

### Bugs Found
1. Re-rating doesn't reset session count
2. Sunday blocks not showing in calendar

### Next Steps
- Fix re-rating bug
- Test again with Reset Plan
```

### 5. Use Version Control
```bash
# Before major changes:
git commit -m "Working state before testing"

# After testing:
git diff  # Review changes
git commit -m "Fixed bug found during testing"
```

---

## 🚀 Advanced Features

### Custom Time Presets
Edit `app/dev-tools/page.js` to add your own presets:

```javascript
const timePresets = [
  { label: "Monday 2 PM", value: "2024-01-08T14:00:00" },
  { label: "Tuesday 10 PM", value: "2024-01-09T22:00:00" },
  // Add your own:
  { label: "Friday Midnight", value: "2024-01-12T00:00:00" },
  { label: "Saturday Noon", value: "2024-01-13T12:00:00" },
];
```

### Custom Test Data
Edit `app/dev-tools/page.js` to add custom test data generators:

```javascript
const setCustomTestData = () => {
  const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
  
  // Your custom test data
  savedAnswers.selectedSubjects = ['physics', 'chemistry'];
  savedAnswers.topicRatings = {
    'topic-1': 1,  // Needs 3 sessions
    'topic-2': 2,  // Needs 2 sessions
    'topic-3': 5,  // Needs 1 session
  };
  
  localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
  showStatus("✅ Custom test data set");
};
```

### Database Inspection
Add database inspection tools:

```javascript
const inspectDatabase = async () => {
  const response = await fetch('/api/dev/inspect');
  const data = await response.json();
  
  console.table({
    blocks: data.blockCount,
    ratings: data.ratingCount,
    onboarding: data.onboardingComplete ? 'Complete' : 'Incomplete',
    access: data.hasAccess ? 'Granted' : 'Not granted'
  });
  
  showStatus("✅ Check console for database state");
};
```

---

## 📝 Checklist for New Features

When adding new time-based features:

- [ ] Use `getEffectiveDate()` instead of `new Date()`
- [ ] Test with Time Override presets
- [ ] Test edge cases (midnight, end of day, etc.)
- [ ] Document time-based behavior
- [ ] Add test to documentation

When adding new data features:

- [ ] Test with fresh user (Full Reset)
- [ ] Test with existing user (Reset Plan)
- [ ] Test data persistence
- [ ] Test data clearing (Reset Onboarding)
- [ ] Document reset behavior

---

## 🎓 Learning Resources

### Documentation Files
1. **DEV_USER_SYSTEM.md** - Complete dev user guide
2. **DEV_USER_QUICK_REFERENCE.md** - One-page cheat sheet
3. **TIME_OVERRIDE_FEATURE.md** - Time override documentation
4. **TIME_OVERRIDE_USAGE_EXAMPLES.md** - Code examples
5. **TIME_OVERRIDE_QUICK_START.md** - 5-minute guide
6. **TIME_OVERRIDE_UI_REFERENCE.md** - UI layout reference
7. **DEV_TOOLS_COMPLETE_GUIDE.md** - This file

### Code Files
1. **app/dev-tools/page.js** - Dev tools UI
2. **libs/dev-helpers.js** - Helper functions
3. **app/api/dev/set-access/route.js** - Grant access API
4. **app/api/dev/reset-plan/route.js** - Reset plan API
5. **app/api/dev/reset-onboarding/route.js** - Reset onboarding API
6. **app/api/dev/full-reset/route.js** - Full reset API

---

## 🎉 Summary

You now have a complete dev tools system that:

✅ **Saves time** - No more manual database resets
✅ **Increases productivity** - Test faster with quick resets
✅ **Reduces errors** - Consistent testing environment
✅ **Improves testing** - Time override for time-based features
✅ **Maintains safety** - Development-only, user-scoped
✅ **Provides flexibility** - Multiple reset levels for different needs

**Result:** Test efficiently and iterate quickly! 🚀
