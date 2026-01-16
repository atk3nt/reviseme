# Debugging: Duplicate Blocks After Rescheduling

## Issue
After marking a block as missed and it gets rescheduled, the UI shows **two blocks**:
1. Original block at old time (should be gone)
2. Rescheduled block at new time (correct)

## What Should Happen
The backend **updates** the existing block (not creates a new one):
- Same `block.id`
- New `scheduled_at` time
- Status changes: `missed` → `scheduled`

The old block should **disappear** and the block should **appear at the new time**.

## Added Debugging

### Backend Logging (`/api/plan/mark-missed`)
Now logs:
```javascript
📝 Updating block ${blockId}: ${oldTime} → ${newTime}
✅ Block ${blockId} rescheduled successfully: {
  oldTime: '2026-01-13T15:30:00Z',
  newTime: '2026-01-13T18:00:00Z',
  updatedRows: 1,
  updatedBlock: { id, scheduled_at, status, ... }
}
```

This tells us:
- ✅ Is the update query running?
- ✅ How many rows were updated?
- ✅ What's the new data in the database?

### Frontend Logging (`/plan/page.js`)
Now logs:
```javascript
🔄 Block marked as missed, response: { rescheduled: true, newTime: '...' }
📥 Reloading blocks from database...
✅ Blocks reloaded
✅ Block was rescheduled to: 2026-01-13T18:00:00Z
```

This tells us:
- ✅ Did the backend say it rescheduled?
- ✅ Is the frontend reloading blocks?
- ✅ What data came back from the reload?

## How to Debug

### Step 1: Mark a block as missed
Watch the console logs in both:
1. **Server logs** (terminal running `npm run dev`)
2. **Browser console** (DevTools)

### Step 2: Check Server Logs
Look for:
```
📝 Updating block abc-123: 2026-01-13T15:30:00Z → 2026-01-13T18:00:00Z
✅ Block abc-123 rescheduled successfully: {
  oldTime: '2026-01-13T15:30:00Z',
  newTime: '2026-01-13T18:00:00Z',
  updatedRows: 1  ← Should be 1 (one row updated)
}
```

**If `updatedRows: 0`** → Database update failed (block not found or wrong user_id)
**If `updatedRows: 1`** → Database update succeeded ✅

### Step 3: Check Browser Console
Look for:
```
🔄 Block marked as missed, response: { rescheduled: true, newTime: '2026-01-13T18:00:00Z' }
📥 Reloading blocks from database...
✅ Blocks reloaded
✅ Block was rescheduled to: 2026-01-13T18:00:00Z
```

Then check what blocks were loaded:
```
📊 GET response: { blocksCount: 70, hasBlocks: true }
```

### Step 4: Check if duplicate exists
After reload, look at the blocks array in React DevTools or console:
```javascript
// In browser console:
// Check if the block appears twice
blocks.filter(b => b.topic_id === 'same-topic-id')
```

## Possible Causes

### 1. Database Update Not Working
**Symptom:** `updatedRows: 0` in logs
**Cause:** 
- Block ID doesn't match
- User ID doesn't match
- Block was deleted

**Fix:** Check the `.eq('id', blockId).eq('user_id', userId)` query

### 2. Frontend Not Reloading Properly
**Symptom:** Logs show update succeeded, but UI still shows old block
**Cause:**
- `loadBlocks()` not awaited
- React state not updating
- Stale data in cache

**Fix:** Ensure `await loadBlocks()` completes before rendering

### 3. React Rendering Issue
**Symptom:** Both blocks show briefly, then one disappears
**Cause:**
- Optimistic update not cleared
- Multiple renders with stale data
- Key prop issues in list rendering

**Fix:** We already disabled optimistic update for missed blocks

### 4. Database Query Issue
**Symptom:** GET request returns old data
**Cause:**
- Supabase caching
- Query not filtering correctly
- Timezone issues

**Fix:** Check GET endpoint query and date filtering

### 5. Multiple Block IDs
**Symptom:** Two different block IDs for same topic
**Cause:**
- Backend created a new block instead of updating
- Duplicate blocks in database

**Fix:** Check if backend is calling `.insert()` instead of `.update()`

## What We've Fixed So Far

### ✅ Removed `missed_at` Column Reference
Was causing database errors:
```javascript
// BEFORE (error)
.update({ missed_at: null })

// AFTER (works)
.update({ completed_at: null })
```

### ✅ Disabled Optimistic Update for Missed Blocks
Prevents showing stale data:
```javascript
// Skip optimistic update for missed blocks
if (newStatus !== 'missed') {
  setBlocks(prev => prev.map(...));
}
```

### ✅ Always Reload After Marking as Missed
Ensures fresh data:
```javascript
await loadBlocks(); // Always reload
```

### ✅ Added Comprehensive Logging
Helps debug what's happening:
- Backend: Shows database update details
- Frontend: Shows reload process

## Next Steps

1. **Test with logging enabled**
   - Mark a block as missed
   - Watch both server and browser logs
   - Share the logs to identify the issue

2. **Check for duplicate block IDs**
   - If you see two blocks, check if they have the same ID
   - If different IDs → backend is creating instead of updating
   - If same ID → frontend rendering issue

3. **Verify database state**
   - After rescheduling, check the database directly
   - Query: `SELECT * FROM blocks WHERE id = 'block-id'`
   - Should show only ONE block with the NEW time

## Files Modified

1. `/app/api/plan/mark-missed/route.js`
   - Added detailed logging for database updates
   - Returns updated block data with `.select()`

2. `/app/plan/page.js`
   - Added logging for reload process
   - Disabled optimistic update for missed blocks
   - Always reload after marking as missed

## Expected Behavior

### Correct Flow:
1. User clicks "Mark as Missed" → Block at 3:30 PM
2. Backend updates database → Block moves to 5:00 PM
3. Frontend reloads blocks → Shows block at 5:00 PM only
4. Modal shows: "Block rescheduled to later today"

### What You're Seeing:
1. User clicks "Mark as Missed" → Block at 3:30 PM
2. Backend updates database → Block moves to 5:00 PM
3. Frontend reloads blocks → Shows BOTH blocks (3:30 PM + 5:00 PM)
4. Modal shows: "Block rescheduled to later today"

**The logs will tell us why step 3 is showing both blocks.**

