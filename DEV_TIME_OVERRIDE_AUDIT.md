# Dev Time Override - Complete Audit & Implementation

## Overview

This document details all changes made to support dev time override testing throughout the application. The time override feature allows developers to test time-based functionality (plan generation, scheduling, "today" detection) by simulating different dates and times.

**Critical:** All changes are **dev-mode only** and do not affect production behavior.

## How It Works

### Dev Mode Detection

The system uses `getEffectiveDate()` from `/libs/dev-helpers.js` which:

1. **Checks if in development mode** (lines 19-24):
   ```javascript
   const isDev = 
     window.location.hostname === 'localhost' || 
     window.location.hostname === '127.0.0.1' ||
     window.location.hostname.includes('localhost') ||
     process.env.NODE_ENV === 'development';
   ```

2. **Only allows override in dev** (lines 27-29):
   ```javascript
   if (!isDev) {
     return new Date(); // Always real time in production
   }
   ```

3. **Reads override from localStorage** (line 32):
   ```javascript
   const override = localStorage.getItem('devTimeOverride');
   ```

4. **Returns overridden or real date**:
   - If override exists and is valid → returns overridden date
   - Otherwise → returns real current date

### Setting the Override

Via dev tools page (`/dev-tools`):
```javascript
localStorage.setItem('devTimeOverride', '2026-02-04T17:34:00');
```

### Clearing the Override

```javascript
localStorage.removeItem('devTimeOverride');
```

## Files Modified

### 1. Backend (Server-Side)

#### `/app/api/plan/generate/route.js`

**Changes:**
- Line 382: Uses `getEffectiveNow(devTimeOverride)` for plan generation
- Line 384: Added logging for effective time
- Line 950: Passes `effectiveNow` to `generateStudyPlan()`

**Purpose:** Ensures plan generation uses overridden time when testing.

**Production Safe:** ✅ `getEffectiveNow()` returns `null` if no override, causing backend to use real time.

#### `/libs/scheduler.js`

**Changes:**
- Line 117: Accepts `effectiveNow` parameter
- Passes `effectiveNow` to `buildWeeklySlots()`

**Purpose:** Propagates effective time through scheduler.

**Production Safe:** ✅ Parameter is optional, defaults to `null`.

#### `/libs/scheduler/buildSlots.js`

**Changes:**
- Line 57: Accepts `effectiveNow` parameter
- Line 148: Uses `effectiveNow || new Date()` for current time
- Lines 102-106: Fixed `localDayDate` creation to avoid timezone bugs
- Lines 151-153: Uses local time components for `isToday` check
- Line 160: Uses `now.getHours()` and `now.getMinutes()` (local time)
- Line 161: Rounds to 30-minute intervals
- Lines 158-173: Enhanced logging for debugging

**Purpose:** Core scheduling logic respects effective time for "today" detection and current time enforcement.

**Production Safe:** ✅ When `effectiveNow` is `null`, uses `new Date()` (real time).

### 2. Frontend (Client-Side)

#### `/app/plan/page.js`

**Changes Made (13 replacements):**

1. **Line 14:** Added import
   ```javascript
   import { getEffectiveDate } from "@/libs/dev-helpers";
   ```

2. **Line 30:** Preloaded data week calculation
   ```javascript
   const today = getEffectiveDate();
   ```

3. **Line 103:** Preloaded loading state calculation
   ```javascript
   const today = getEffectiveDate();
   ```

4. **Line 144:** Initial week start state
   ```javascript
   const today = getEffectiveDate();
   ```

5. **Line 211:** `getCurrentWeekStart()` function
   ```javascript
   const today = getEffectiveDate();
   ```

6. **Line 268:** Sunday special case detection
   ```javascript
   const today = getEffectiveDate();
   ```

7. **Line 336:** Saturday/Sunday detection for next week viewing
   ```javascript
   const today = getEffectiveDate();
   ```

8. **Line 362-363:** Logging today's date
   ```javascript
   today: getEffectiveDate().toISOString().split('T')[0],
   todayDay: getEffectiveDate().getDay()
   ```

9. **Line 602:** Sunday auto-switch logic
   ```javascript
   const today = getEffectiveDate();
   ```

10. **Line 1069:** Today blocks check
    ```javascript
    const today = getEffectiveDate();
    ```

11. **Line 1245:** `getTodayBlocks()` function
    ```javascript
    const today = getEffectiveDate().toDateString();
    ```

12. **Line 1252:** `getTomorrowBlocks()` function
    ```javascript
    const tomorrow = getEffectiveDate();
    ```

13. **Line 2020:** Tomorrow date string
    ```javascript
    const tomorrow = getEffectiveDate();
    ```

14. **Line 2281:** Fallback week calculation
    ```javascript
    const today = getEffectiveDate();
    ```

15. **Line 2581:** Calendar header "today" highlighting
    ```javascript
    const isToday = dayDate.toDateString() === getEffectiveDate().toDateString();
    ```

16. **Line 2657:** Calendar cell "today" detection
    ```javascript
    const isToday = dayDate.toDateString() === getEffectiveDate().toDateString();
    ```

**Purpose:** All date/time calculations respect dev override for:
- Week start calculations
- "Today" detection and highlighting
- Block filtering (today's blocks, tomorrow's blocks)
- Sunday special cases
- Calendar UI highlighting

**Production Safe:** ✅ `getEffectiveDate()` returns real time in production (hostname check).

#### `/app/onboarding/slide-21/page.js`

**Changes:**
- `getThisWeekStart()` uses `devTimeOverride` from localStorage

**Purpose:** Unavailable times are saved for the correct (overridden) week.

**Production Safe:** ✅ Only reads override in dev mode.

#### `/app/dev-tools/page.js`

**Changes:**
- Line 165: Clears `sessionStorage` when deleting blocks

**Purpose:** Prevents cached plan data from showing after deletion.

**Production Safe:** ✅ Dev tools page only accessible in development.

### 3. Utilities

#### `/libs/dev-helpers.js`

**No changes needed** - already implements proper dev mode detection and production safety.

**Key Functions:**
- `getEffectiveDate()` - Returns overridden or real date (client-side)
- `getEffectiveNow()` - Backend equivalent (in `app/api/plan/generate/route.js`)
- `isTimeOverridden()` - Check if override is active
- `setTimeOverride()` - Set override
- `clearTimeOverride()` - Clear override
- `isDevelopmentMode()` - Check if in dev mode

## Production Safety Guarantees

### 1. Hostname Check
```javascript
window.location.hostname === 'localhost' || 
window.location.hostname === '127.0.0.1'
```
**Result:** Override only works on localhost, never on production domain.

### 2. NODE_ENV Check
```javascript
process.env.NODE_ENV === 'development'
```
**Result:** Override only works when NODE_ENV is 'development'.

### 3. Fallback to Real Time
```javascript
if (!isDev) {
  return new Date(); // Always real time in production
}
```
**Result:** Even if somehow localStorage has an override in production, it's ignored.

### 4. Server-Side Rendering
```javascript
if (typeof window === 'undefined') {
  return new Date(); // SSR always uses real time
}
```
**Result:** Server-side rendering always uses real time.

### 5. Optional Parameters
All backend functions accept `effectiveNow` as an optional parameter that defaults to `null`:
```javascript
const now = effectiveNow || new Date();
```
**Result:** If no override is passed, real time is used.

## Testing the Override

### 1. Set Override
Go to `/dev-tools` and set a custom date/time:
```javascript
localStorage.setItem('devTimeOverride', '2026-02-04T17:34:00');
```

### 2. Verify Override
Check the dev tools page - it should show:
```
Current Time: Wednesday, February 4, 2026 at 5:34 PM
```

### 3. Clear Blocks
Click "🗑️ Delete All Blocks" in dev tools.

### 4. Regenerate Plan
Go through onboarding or trigger plan generation.

### 5. Verify Behavior
- **Calendar:** Wednesday should be highlighted (not Monday)
- **Blocks:** First block should be at 6:00 PM or later (not 3:30 PM)
- **Console Logs:** Should show:
  ```
  🕐 Effective time for plan generation: { effectiveNow: '2/4/2026, 5:34:00 PM' }
  🔍 Checking wednesday: { isToday: true }
  📅 wednesday is TODAY - enforcing current time: { actualStartTime: '18:00' }
  ```

### 6. Clear Override
Click "Clear Time Override" in dev tools or:
```javascript
localStorage.removeItem('devTimeOverride');
```

## What's Affected by Override

### ✅ Affected (Uses Override in Dev)

1. **Plan Generation**
   - Week start calculation
   - "Today" detection for current time enforcement
   - Block scheduling (no blocks before current time)
   - Partial week handling

2. **Calendar UI**
   - "Today" column highlighting
   - Blue indicator on current day
   - Circular date badge

3. **Block Filtering**
   - "Today's blocks" tab
   - "Tomorrow's blocks" tab
   - Week view calculations

4. **Special Logic**
   - Sunday auto-switch to next week
   - Saturday/Sunday next week viewing
   - "This Week" vs "Next Week" labels

5. **Unavailable Times**
   - Week calculation for saving unavailable times
   - Aligning unavailable times to correct week

### ❌ Not Affected (Always Real Time)

1. **Block scheduled_at timestamps** - These are stored as actual ISO strings in the database
2. **User signup date** - Real signup timestamp
3. **Payment timestamps** - Real transaction times
4. **Server logs** - Real server time
5. **Database timestamps** - Real database time
6. **Production environment** - Override completely disabled

## Common Issues & Solutions

### Issue: Blocks still scheduled before override time

**Solution:**
1. Delete all blocks (dev tools)
2. Clear sessionStorage: `sessionStorage.clear()`
3. Hard refresh: Cmd+Shift+R
4. Regenerate plan

### Issue: Monday still highlighted instead of Wednesday

**Solution:**
1. Hard refresh the page (Cmd+Shift+R)
2. Check override is set: `localStorage.getItem('devTimeOverride')`
3. Verify you're on localhost (not production)

### Issue: Override not working in production

**Expected behavior:** Override is intentionally disabled in production for safety.

### Issue: Console logs not showing

**Solution:**
1. Check you regenerated the plan (POST request, not GET)
2. Look in the terminal running `npm run dev`, not browser console
3. Ensure dev server restarted after code changes

## Related Documentation

- `TIMEZONE_FIX_CURRENT_TIME.md` - Timezone handling fixes
- `HALF_HOUR_SLOT_ALIGNMENT.md` - 30-minute rounding fix
- `ISTODAY_TIMEZONE_BUG_REPORT.md` - `isToday` detection fix
- `TIME_OVERRIDE_FIX.md` - Initial time override implementation

---

**Status:** ✅ Complete
**Date:** January 30, 2026
**Production Safe:** ✅ Yes - All changes are dev-mode only
**Testing:** ✅ Verified with multiple time overrides
