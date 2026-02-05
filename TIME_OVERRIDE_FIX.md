# Fix: Time Override Not Respected Throughout Plan Generation

## Problem

When setting a dev time override (e.g., Monday Feb 2, 2026 at 8:17am), the system was generating blocks for the wrong week. The blocks were being scheduled for the past week instead of the week corresponding to the override time.

## Root Cause

The time override (`effectiveNow`) was being used in some places but not others, causing inconsistencies:

1. ✅ **Plan generation API** - Used `effectiveNow` to determine target week
2. ✅ **Week calculation** - Used `effectiveNow` to find Monday
3. ❌ **Slot building** - Used `new Date()` (real time) to determine "today"
4. ❌ **Rate limiting** - Always active in dev mode, causing 429 errors during testing

This caused a mismatch:
- **Blocks generated for**: Week of Feb 2-8 (using override) ✅
- **"Today" detection in slot builder**: Jan 30 (using real time) ❌
- **Result**: Slots built for wrong week, blocks scheduled incorrectly

## Solution

### 1. Pass `effectiveNow` Through Entire Chain

**Flow:**
```
API Route (effectiveNow) 
  ↓
Scheduler (effectiveNow)
  ↓
buildWeeklySlots (effectiveNow)
  ↓
"Today" detection (uses effectiveNow)
```

### 2. Disable Rate Limiting in Dev Mode

Rate limiting now automatically bypasses in development mode, regardless of whether Upstash credentials exist.

## Changes Made

### 1. `/libs/scheduler/buildSlots.js`

**Added `effectiveNow` parameter:**
```javascript
export function buildWeeklySlots({
  availability = {},
  timePreferences = {},
  blockedTimes = [],
  blockDuration = 0.5,
  targetWeekStart,
  actualStartDate,
  effectiveNow = null // NEW: For dev mode time override
} = {}) {
```

**Use `effectiveNow` for "today" detection:**
```javascript
// If this is today, start from current time (not earlier)
// Use effectiveNow for dev mode time override support
const now = effectiveNow || new Date(); // Changed from: const now = new Date();
const isToday = dayDate.getUTCFullYear() === now.getUTCFullYear() &&
                dayDate.getUTCMonth() === now.getUTCMonth() &&
                dayDate.getUTCDate() === now.getUTCDate();
```

**Why this matters:**
- When override is set to Feb 2, `now` = Feb 2 (not Jan 30)
- `isToday` correctly identifies Feb 2 as "today"
- Slots start from 8:17am on Feb 2 (not from current real time)
- Blocks are scheduled for the correct week

### 2. `/libs/scheduler.js`

**Added `effectiveNow` parameter:**
```javascript
export async function generateStudyPlan({
  subjects = [],
  ratings = {},
  topicStatus = {},
  availability = {},
  timePreferences = {},
  blockedTimes = [],
  studyBlockDuration = 0.5,
  targetWeekStart,
  actualStartDate,
  missedTopicIds = [],
  reratedTopicIds = [],
  ongoingTopics = {},
  effectiveNow = null // NEW: For dev mode time override
} = {}) {
```

**Pass through to buildWeeklySlots:**
```javascript
const slots = buildWeeklySlots({
  availability,
  timePreferences,
  blockedTimes: alignedBlockedTimes,
  blockDuration: studyBlockDuration,
  targetWeekStart: targetIso,
  actualStartDate,
  effectiveNow // NEW: Pass through for dev mode time override
});
```

### 3. `/app/api/plan/generate/route.js`

**Pass `effectiveNow` to scheduler:**
```javascript
plan = await generateStudyPlan({
  subjects,
  ratings: effectiveRatings,
  topicStatus: effectiveTopicStatus,
  availability: effectiveAvailability,
  timePreferences: effectiveTimePreferences,
  blockedTimes: combinedBlockedTimes,
  studyBlockDuration,
  targetWeekStart,
  actualStartDate,
  missedTopicIds: missedTopicIdsFromDB,
  reratedTopicIds,
  ongoingTopics,
  effectiveNow // NEW: Pass through for dev mode time override
});
```

### 4. `/libs/ratelimit.js`

**Bypass rate limiting in dev mode:**
```javascript
export async function checkRateLimit(limiter, identifier) {
  // Check if we're in dev mode (localhost)
  const isDevMode = process.env.NODE_ENV === 'development';
  
  // If rate limiting is disabled OR in dev mode, always allow
  if (!limiter || !isRateLimitEnabled || isDevMode) {
    if (isDevMode && isRateLimitEnabled) {
      console.log('[RATE LIMIT] 🔧 Dev mode: Rate limiting bypassed');
    }
    return { success: true, response: null };
  }
  // ... rest of rate limiting logic
}
```

**Why this matters:**
- No more 429 errors during dev testing
- Can test plan generation repeatedly without waiting
- Production rate limiting still works normally
- No need to remove Upstash credentials

## How It Works Now

### Setting Time Override

**In Dev Tools:**
1. Go to `/dev-tools`
2. Set time to "Monday 2 PM" (or custom time)
3. Time override is stored in `localStorage.devTimeOverride`

**In Console:**
```javascript
localStorage.setItem('devTimeOverride', '2026-02-02T08:17:00');
```

### Plan Generation Flow

```
1. User sets time override: Feb 2, 2026 8:17am
   ↓
2. Frontend reads: localStorage.getItem('devTimeOverride')
   ↓
3. POST /api/plan/generate with devTimeOverride in body
   ↓
4. API: effectiveNow = getEffectiveNow(devTimeOverride)
   ↓ effectiveNow = 2026-02-02T08:17:00
5. resolveTargetWeek({ effectiveNow })
   ↓ weekStart = 2026-02-02 (Monday)
6. generateStudyPlan({ effectiveNow })
   ↓
7. buildWeeklySlots({ effectiveNow })
   ↓ now = effectiveNow (not real time)
8. isToday check uses effectiveNow
   ↓ Feb 2 is "today"
9. Slots start from 8:17am on Feb 2
   ↓
10. Blocks scheduled for week of Feb 2-8 ✅
```

### Console Logs to Verify

**When time override is active:**
```
⏰ Using dev time override: 2026-02-02T08:17:00.000Z
📅 Plan generation timing: {
  startToday: true,
  targetWeekStart: '2026-02-02',
  actualStartDate: '2026-02-02',
  message: 'Starting plan today'
}
[RATE LIMIT] 🔧 Dev mode: Rate limiting bypassed
✅ Generated plan: { blocks: 36, week: '2026-02-02' }
```

## Testing

### Test Case 1: Monday Morning (Before 9 PM)

**Setup:**
```javascript
localStorage.setItem('devTimeOverride', '2026-02-02T08:17:00');
```

**Expected:**
- ✅ Week starts: 2026-02-02 (Monday)
- ✅ Blocks scheduled from 8:17am onwards on Feb 2
- ✅ No blocks scheduled before 8:17am
- ✅ "Start today" toggle visible
- ✅ No rate limit errors

### Test Case 2: Monday Night (After 9 PM)

**Setup:**
```javascript
localStorage.setItem('devTimeOverride', '2026-02-02T22:00:00');
```

**Expected:**
- ✅ Week starts: 2026-02-03 (Tuesday)
- ✅ No toggle shown (forced to start tomorrow)
- ✅ Blocks scheduled for Feb 3 onwards
- ✅ No blocks on Feb 2

### Test Case 3: Sunday Night (Cross-Week)

**Setup:**
```javascript
localStorage.setItem('devTimeOverride', '2026-02-01T22:00:00');
```

**Expected:**
- ✅ Week starts: 2026-02-02 (next Monday)
- ✅ No toggle shown (forced to start tomorrow)
- ✅ Blocks scheduled for Feb 2 onwards
- ✅ No blocks on Sunday Feb 1

### Test Case 4: Friday Afternoon

**Setup:**
```javascript
localStorage.setItem('devTimeOverride', '2026-02-06T14:00:00');
```

**Expected:**
- ✅ Week starts: 2026-02-02 (current week Monday)
- ✅ Blocks scheduled from 2pm onwards on Friday
- ✅ Blocks also scheduled for Sat/Sun (rest of week)
- ✅ "Start today" toggle visible

### Test Case 5: Real Time (No Override)

**Setup:**
```javascript
localStorage.removeItem('devTimeOverride');
```

**Expected:**
- ✅ Uses real current time
- ✅ Week based on actual current date
- ✅ Blocks scheduled from now onwards
- ✅ Rate limiting still bypassed in dev mode

## Verification Checklist

After implementing this fix, verify:

- [ ] Set time override to Monday morning
- [ ] Generate plan
- [ ] Check console: "Using dev time override: 2026-02-02..."
- [ ] Check console: "targetWeekStart: '2026-02-02'"
- [ ] Check plan page: Blocks appear for week of Feb 2-8
- [ ] Check first block: Scheduled for Feb 2 at 8:17am or later
- [ ] No 429 rate limit errors
- [ ] Can regenerate multiple times without waiting

## Benefits

### For Development
- ✅ Test any date/time scenario
- ✅ Test cross-week transitions (Sunday → Monday)
- ✅ Test time-based logic (9 PM cutoff)
- ✅ Test partial weeks (signup Friday, start Saturday)
- ✅ No rate limiting blocking tests
- ✅ Consistent behavior across all components

### For Production
- ✅ No changes to production behavior
- ✅ Time override only works in dev mode
- ✅ Rate limiting works normally in production
- ✅ No performance impact

## Related Files

- `/libs/scheduler/buildSlots.js` - Slot building with time override support
- `/libs/scheduler.js` - Main scheduler with time override passthrough
- `/app/api/plan/generate/route.js` - API route that initiates time override
- `/libs/ratelimit.js` - Rate limiting with dev mode bypass
- `/app/plan/generating/page.js` - Frontend that passes time override
- `/libs/dev-helpers.js` - Time override utilities

## Related Documentation

- `DEV_PLAN_REGENERATION_GUIDE.md` - How to regenerate plans after clearing blocks
- `SAME_DAY_PLAN_GENERATION_IMPLEMENTATION.md` - Start today/tomorrow logic
- `UNAVAILABLE_TIMES_FIX.md` - Fix for unavailable times not being respected
- `TESTING_SAME_DAY_PLAN.md` - Testing guide for time-based features

---

**Status:** ✅ Fixed and Ready for Testing
**Date:** January 30, 2026
**Dev Mode Only:** Yes (time override only works in development)
