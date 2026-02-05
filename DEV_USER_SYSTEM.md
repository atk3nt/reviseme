# Dev User System - Testing Without Database Resets

## 🎯 Problem Solved

**Before:** Testing required constantly resetting the database, losing all data, and starting from scratch.

**After:** Quick reset buttons let you clear specific data (blocks, onboarding, or everything) in seconds, without manual database operations.

## 🚀 Quick Start

### 1. Access Dev Tools
```
http://localhost:3000/dev-tools
```

### 2. Grant Yourself Access
Click **"Grant Full Access"** to bypass payment (dev mode only)

### 3. Test Your Feature
Generate plans, complete blocks, test features normally

### 4. Reset When Needed
Choose the appropriate reset button:
- **Reset Plan** - Delete all blocks, keep ratings
- **Reset Onboarding** - Clear onboarding, keep blocks
- **Full Reset** - Delete everything, start fresh

## 📋 Available Reset Options

### Option 1: Reset Plan (Delete All Blocks)

**What it does:**
- ✅ Deletes all scheduled blocks
- ✅ Keeps your ratings (user_topic_confidence)
- ✅ Keeps onboarding data
- ✅ Keeps time preferences
- ✅ Keeps unavailable times

**Use when:**
- Testing plan generation with different parameters
- Want to generate a fresh plan without losing ratings
- Testing scheduling logic

**Example workflow:**
```
1. Generate a plan
2. Test the plan
3. Click "Reset Plan"
4. Generate a new plan with different settings
5. Repeat
```

---

### Option 2: Reset Onboarding

**What it does:**
- ✅ Clears all topic ratings (user_topic_confidence)
- ✅ Resets onboarding status to incomplete
- ✅ Clears time preferences
- ✅ Keeps all blocks (scheduled, done, missed)

**Use when:**
- Testing the onboarding flow
- Want to change subjects/topics
- Testing rating system
- Need to re-rate topics

**Example workflow:**
```
1. Complete onboarding
2. Generate plans and test
3. Click "Reset Onboarding"
4. Go through onboarding again with different choices
5. Repeat
```

---

### Option 3: Full Reset (Danger Zone)

**What it does:**
- ❌ Deletes ALL blocks
- ❌ Deletes ALL ratings
- ❌ Resets onboarding to incomplete
- ❌ Clears time preferences
- ❌ Deletes unavailable times
- ❌ Deletes repeatable events
- ❌ Clears week-specific preferences
- ❌ Removes Stripe data
- ❌ Revokes access
- ✅ Keeps your email and name (account remains)

**Use when:**
- Starting completely fresh
- Testing the entire flow from scratch
- Cleaning up after extensive testing

**Example workflow:**
```
1. Test everything thoroughly
2. Click "Full Reset"
3. Confirm twice (it's destructive!)
4. Page reloads automatically
5. Start from scratch
```

---

## 🎮 Testing Workflows

### Workflow 1: Testing Plan Generation

```bash
# 1. Grant access
Click "Grant Full Access"

# 2. Complete onboarding
Go through onboarding flow → Set subjects, rate topics, set times

# 3. Generate initial plan
Generate plan for this week

# 4. Test different scenarios
- Mark some blocks as done
- Mark some as missed
- Skip some blocks

# 5. Reset plan only
Click "Reset Plan" → All blocks deleted, ratings kept

# 6. Generate new plan
Generate fresh plan → Should use same ratings, different schedule

# 7. Repeat as needed
```

---

### Workflow 2: Testing Onboarding Changes

```bash
# 1. Complete onboarding with subjects A, B, C
Complete onboarding → Generate plan

# 2. Test the plan
Use the plan normally

# 3. Reset onboarding only
Click "Reset Onboarding" → Ratings cleared, blocks kept

# 4. Complete onboarding with subjects X, Y, Z
Go through onboarding again with different choices

# 5. Generate new plan
New plan uses new subjects/ratings

# 6. Old blocks remain
Previous blocks still visible in history
```

---

### Workflow 3: Testing Time-Based Features

```bash
# 1. Set time override
Go to Time Override section → Click "Sunday 10 PM"

# 2. Test time-based logic
- Try generating plan (should be blocked if after 10 PM Sunday)
- Test any time-dependent features

# 3. Change time
Click "Monday 2 PM" → Test again

# 4. Reset plan if needed
Click "Reset Plan" to clear blocks and try again

# 5. Clear time override
Click "Use Real Time" when done
```

---

### Workflow 4: Full Testing Cycle

```bash
# 1. Start fresh
Click "Full Reset" → Everything cleared

# 2. Grant access
Click "Grant Full Access"

# 3. Complete onboarding
- Select subjects
- Rate topics
- Set time preferences
- Add blocked times

# 4. Generate plan
Generate plan for this week

# 5. Test features
- Complete blocks
- Miss blocks
- Skip blocks
- Re-rate topics
- Update availability

# 6. Generate next week
Generate plan for next week

# 7. When done testing
Click "Full Reset" → Start over
```

---

## 🔧 API Endpoints

### Grant Access
```
POST /api/dev/set-access
```
- Grants `has_access: true` to current user
- Only works in development mode
- No request body needed

### Reset Plan
```
POST /api/dev/reset-plan
```
- Deletes all blocks for current user
- Returns count of deleted blocks
- Only works in development mode

### Reset Onboarding
```
POST /api/dev/reset-onboarding
```
- Deletes all ratings
- Resets onboarding status
- Clears time preferences
- Only works in development mode

### Full Reset
```
POST /api/dev/full-reset
```
- Deletes everything except account
- Resets user to initial state
- Only works in development mode

---

## 🛡️ Security Features

### Development-Only
All reset endpoints check:
```javascript
const isDevelopment = process.env.NODE_ENV === 'development';
if (!isDevelopment) {
  return NextResponse.json(
    { error: "This endpoint is only available in development mode" },
    { status: 403 }
  );
}
```

### Authentication Required
All endpoints require valid session:
```javascript
const session = await auth();
if (!session?.user?.id) {
  return NextResponse.json(
    { error: "Authentication required" },
    { status: 401 }
  );
}
```

### User Isolation
All operations are scoped to the current user:
```javascript
.eq('user_id', userId)
```

### Production Safety
- Endpoints return 403 in production
- No way to accidentally reset production data
- Dev tools page only shows in development

---

## 💡 Pro Tips

### 1. Use Reset Plan for Quick Iterations
Don't use Full Reset unless you need to. Reset Plan is faster and keeps your ratings.

```bash
# Fast iteration cycle:
Generate plan → Test → Reset Plan → Repeat
```

### 2. Combine with Time Override
Test time-based features efficiently:

```bash
1. Set time to "Sunday 10 PM"
2. Try to generate plan (should fail)
3. Reset plan
4. Set time to "Monday 2 PM"
5. Generate plan (should succeed)
6. Reset plan
7. Repeat with different times
```

### 3. Keep Multiple Browser Profiles
Use different browser profiles for different test scenarios:

```bash
Profile 1: Fresh user (just onboarded)
Profile 2: Active user (many completed blocks)
Profile 3: Power user (multiple subjects, re-ratings)
```

### 4. Use LocalStorage for Quick Tests
Store test data in localStorage for quick restoration:

```javascript
// Save current state
localStorage.setItem('testState', JSON.stringify({
  subjects: ['maths', 'biology'],
  ratings: { /* ... */ }
}));

// Restore later
const state = JSON.parse(localStorage.getItem('testState'));
```

### 5. Document Your Test Scenarios
Keep a test plan document:

```markdown
## Test Scenario 1: Sunday Night Restriction
1. Set time to Sunday 10 PM
2. Try to generate plan
3. Verify error message
4. Reset plan
5. Set time to Monday 2 PM
6. Generate plan successfully
```

---

## 🐛 Troubleshooting

### Problem: Reset button not working
**Solution:**
1. Check you're on `localhost` (not production)
2. Check browser console for errors
3. Verify you're logged in
4. Try refreshing the page

### Problem: Data not clearing
**Solution:**
1. Check browser console for API errors
2. Verify database connection
3. Try Full Reset instead of partial reset
4. Clear browser cache and localStorage

### Problem: "Only available in development mode" error
**Solution:**
1. Verify `NODE_ENV=development` in your `.env`
2. Check you're running on `localhost`
3. Restart your dev server

### Problem: Page not reloading after Full Reset
**Solution:**
1. Manually refresh the page
2. Clear browser cache
3. Check browser console for errors

---

## 📊 What Gets Deleted

### Reset Plan
| Table | Deleted? | Notes |
|-------|----------|-------|
| `blocks` | ✅ Yes | All blocks for user |
| `user_topic_confidence` | ❌ No | Ratings preserved |
| `users` (onboarding) | ❌ No | Onboarding preserved |
| `unavailable_times` | ❌ No | Blocked times preserved |
| `repeatable_events` | ❌ No | Events preserved |
| `week_time_preferences` | ❌ No | Preferences preserved |

### Reset Onboarding
| Table | Deleted? | Notes |
|-------|----------|-------|
| `blocks` | ❌ No | Blocks preserved |
| `user_topic_confidence` | ✅ Yes | All ratings deleted |
| `users` (onboarding) | ✅ Reset | Status and preferences cleared |
| `unavailable_times` | ❌ No | Blocked times preserved |
| `repeatable_events` | ❌ No | Events preserved |
| `week_time_preferences` | ❌ No | Preferences preserved |

### Full Reset
| Table | Deleted? | Notes |
|-------|----------|-------|
| `blocks` | ✅ Yes | All blocks deleted |
| `user_topic_confidence` | ✅ Yes | All ratings deleted |
| `users` (onboarding) | ✅ Reset | Everything except email/name |
| `unavailable_times` | ✅ Yes | All blocked times deleted |
| `repeatable_events` | ✅ Yes | All events deleted |
| `week_time_preferences` | ✅ Yes | All preferences deleted |
| `logs` | ✅ Yes | History cleared |
| `users` (account) | ❌ No | Email and name preserved |

---

## 🎯 Best Practices

### 1. Always Grant Access First
```bash
# Correct order:
1. Grant Access
2. Complete Onboarding
3. Generate Plan
4. Test Features

# Wrong order:
1. Complete Onboarding
2. Generate Plan (fails - no access)
3. Grant Access (too late)
```

### 2. Use Appropriate Reset Level
```bash
# Testing plan generation? → Reset Plan
# Testing onboarding? → Reset Onboarding
# Starting completely fresh? → Full Reset
```

### 3. Confirm Before Full Reset
Full Reset is destructive. Always double-check before clicking.

### 4. Clear LocalStorage Too
After Full Reset, clear localStorage:
```javascript
localStorage.clear();
```

### 5. Document Your Changes
Keep track of what you're testing:
```markdown
## Testing Session - 2024-01-30
- Tested Sunday night restriction ✅
- Tested plan generation with 3 subjects ✅
- Tested re-rating flow ⚠️ (found bug)
```

---

## 🚀 Advanced Usage

### Testing with Multiple Users
Create multiple test accounts:

```bash
# User 1: Fresh user
Email: test1@example.com
State: Just completed onboarding

# User 2: Active user
Email: test2@example.com
State: Has 2 weeks of completed blocks

# User 3: Power user
Email: test3@example.com
State: Multiple subjects, many re-ratings
```

### Automated Testing Script
Create a test script:

```javascript
// test-workflow.js
async function testPlanGeneration() {
  // 1. Reset
  await fetch('/api/dev/reset-plan', { method: 'POST' });
  
  // 2. Generate
  await fetch('/api/plan/generate', {
    method: 'POST',
    body: JSON.stringify({ /* ... */ })
  });
  
  // 3. Verify
  const response = await fetch('/api/plan?weekStart=2024-01-08');
  const data = await response.json();
  console.assert(data.blocks.length > 0, 'Plan should have blocks');
}
```

### Database Inspection
Check what's in the database:

```sql
-- Count blocks
SELECT COUNT(*) FROM blocks WHERE user_id = 'your-user-id';

-- Count ratings
SELECT COUNT(*) FROM user_topic_confidence WHERE user_id = 'your-user-id';

-- Check onboarding status
SELECT has_completed_onboarding, has_access FROM users WHERE id = 'your-user-id';
```

---

## 📝 Summary

The Dev User System provides:
- ✅ Quick reset buttons (no manual DB operations)
- ✅ Granular control (reset only what you need)
- ✅ Safe (development-only, user-scoped)
- ✅ Fast (reset in seconds, not minutes)
- ✅ Flexible (combine with time override for powerful testing)

**Result:** Test efficiently without constantly resetting your entire database!
