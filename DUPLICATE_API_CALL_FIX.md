# Duplicate API Call Fix - Plan Generation

## Problem Summary

During onboarding, when users clicked "Generate Plan", the `/api/plan/generate` endpoint was being called **multiple times**, causing duplicate block insertion attempts that violated the unique constraint `unique_user_topic_scheduled`.

**Error:** "Failed to save blocks to database"

## Root Cause

The `useEffect` in `/app/plan/generating/page.js` had `session` in its dependency array (line 355):

```javascript
}, [status, session, router]);
```

**The problematic flow:**

1. Page loads → `useEffect` runs → Calls `generatePlan()`
2. Inside `generatePlan()`, line 89 calls `updateSession()` to refresh the session
3. `updateSession()` updates the `session` object
4. React detects `session` changed → Re-runs `useEffect`
5. `useEffect` runs again → Calls `generatePlan()` **AGAIN**
6. Both API calls try to insert the same blocks → Second call fails with unique constraint violation

## The Fix

Added a `hasStartedGeneration` state guard to prevent duplicate executions:

```javascript
const [hasStartedGeneration, setHasStartedGeneration] = useState(false);

useEffect(() => {
  // Guard against duplicate calls
  if (hasStartedGeneration) {
    console.log('⚠️ Plan generation already started, preventing duplicate API call');
    return;
  }
  
  const generatePlan = async () => {
    // Set flag immediately to prevent duplicates
    setHasStartedGeneration(true);
    
    try {
      // ... existing code ...
    } catch (error) {
      // Reset flag on error so user can retry
      setHasStartedGeneration(false);
      // ... error handling ...
    }
  };
  
  // ... rest of code ...
}, [status, session, router, hasStartedGeneration]);
```

## How It Works

1. **First call:** `hasStartedGeneration` is `false` → Effect runs → Flag set to `true` → Plan generates
2. **Session updates:** `hasStartedGeneration` is `true` → Effect exits early → No duplicate call
3. **On error:** Flag resets to `false` → User can retry if needed

## Changes Made

**File:** `/app/plan/generating/page.js`

1. Added `hasStartedGeneration` state variable (line 12)
2. Added guard check at the start of `useEffect` (lines 14-17)
3. Set flag immediately in `generatePlan()` (line 21)
4. Reset flag on error (line 337)
5. Added `hasStartedGeneration` to dependency array (line 358)

## Testing

### Before Fix:
- Multiple API calls visible in console
- "Failed to save blocks to database" error
- Unique constraint violation in database logs

### After Fix:
- Single API call
- No duplicate insertion attempts
- Plan generates successfully

## Related Issues Fixed

This fix also resolves:
- Duplicate blocks being created in development (React Strict Mode + session update)
- Race conditions during plan generation
- Unnecessary API load from duplicate calls

## Prevention

The guard pattern used here can be applied to any `useEffect` that:
1. Makes API calls
2. Updates state/session that's in the dependency array
3. Should only run once per user action

## Notes

- The unique constraint `unique_user_topic_scheduled` is working as designed - it prevented corrupt data
- The OAuth account linking fixes (from previous work) are working correctly
- This fix is production-safe and doesn't affect existing functionality
