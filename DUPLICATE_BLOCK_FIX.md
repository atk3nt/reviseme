# Fixed: Duplicate Blocks After Rescheduling

## Date: January 12, 2026

## The Problem

When marking a block as missed and it gets rescheduled, users were seeing **two blocks**:
1. The original block (at old time, marked as missed)
2. The "new" block (at new time, marked as scheduled)

But actually, it's the **same block** - just moved to a new time!

---

## Root Cause

The issue was in the **frontend optimistic update** logic:

### What Was Happening:

1. User clicks "Mark as Missed" on a block at 3:30 PM
2. **Frontend immediately updates** (optimistic): Shows block as "missed" at 3:30 PM
3. **Backend processes**:
   - Marks block as missed
   - Finds a slot at 5:00 PM
   - Updates the SAME block: `scheduled_at: 5:00 PM`, `status: scheduled`
4. **Frontend reloads blocks** from database
5. **React renders**:
   - Optimistic update still shows: Block at 3:30 PM (missed)
   - Database shows: Block at 5:00 PM (scheduled)
   - **Result: User sees TWO blocks!**

### The Core Issue:

The optimistic update changed the **status** but kept the **same time**.
When the block was rescheduled, it changed **both status AND time**.
React saw these as two different blocks temporarily.

---

## The Fix

### Changed Frontend Logic:

**1. Skip optimistic update for missed blocks**
```javascript
// BEFORE - Always did optimistic update
setBlocks(prev => prev.map(b => 
  deriveBlockKey(b) === blockKey 
    ? { ...b, status: newStatus }
    : b
));

// AFTER - Skip optimistic update for missed blocks
if (newStatus !== 'missed') {
  setBlocks(prev => prev.map(b => 
    deriveBlockKey(b) === blockKey 
      ? { ...b, status: newStatus }
      : b
  ));
}
```

**Why:** Missed blocks might be rescheduled (time changes), so we can't optimistically update them.

**2. Always reload blocks after marking as missed**
```javascript
// BEFORE - Only reloaded if rescheduled
if (responseData.rescheduled && responseData.newTime) {
  // ... show modal ...
  await loadBlocks();
}

// AFTER - Always reload, show modal if rescheduled
await loadBlocks(); // Always reload

if (responseData.rescheduled && responseData.newTime) {
  // ... show modal ...
}
```

**Why:** Even if not rescheduled, we need to refresh to show the missed status.

---

## How It Works Now

### Scenario 1: Block Successfully Rescheduled

1. User clicks "Mark as Missed" at 3:30 PM
2. Frontend: **No optimistic update** (waits for server)
3. Backend: Reschedules block to 5:00 PM
4. Frontend: Reloads blocks from database
5. **Result:** Block appears at 5:00 PM (scheduled) ✅
6. Modal shows: "Block rescheduled to later today"

### Scenario 2: Block Cannot Be Rescheduled

1. User clicks "Mark as Missed" at 9:00 PM (no slots left)
2. Frontend: **No optimistic update** (waits for server)
3. Backend: Cannot find slot, keeps block as missed
4. Frontend: Reloads blocks from database
5. **Result:** Block appears at 9:00 PM (missed) ✅
6. Message: "No available slot remaining this week"

---

## Technical Details

### Backend Behavior (Unchanged):
- **Updates** the existing block (doesn't create new one)
- Changes: `scheduled_at`, `status`, `completed_at`
- Same `block.id` throughout

### Frontend Behavior (Fixed):
- **Waits** for server response before updating UI for missed blocks
- **Reloads** entire block list after marking as missed
- **Shows modal** only if successfully rescheduled

### Why Update Instead of Delete/Create?

We **update** the existing block rather than delete/create because:
1. ✅ Preserves block history and ID
2. ✅ Maintains referential integrity
3. ✅ Logs track the same block throughout its lifecycle
4. ✅ Simpler database operations
5. ✅ No orphaned references

---

## Testing

### Test 1: Successful Reschedule
1. Mark a block as missed early in the day
2. Should see block disappear briefly, then reappear at new time
3. Should see modal: "Block rescheduled to later today"
4. Should NOT see duplicate blocks

### Test 2: Failed Reschedule
1. Mark a block as missed late in the day (no slots)
2. Should see block stay at same time but marked as missed
3. Should see message about next week's plan
4. Should NOT see duplicate blocks

### Test 3: Multiple Missed Blocks
1. Mark 3 blocks as missed in sequence
2. Each should reschedule independently
3. Should NOT see any duplicates
4. Should see all rescheduled blocks at new times

---

## Files Modified

1. `/app/plan/page.js`
   - Skip optimistic update for missed blocks (line 873-882)
   - Always reload blocks after marking as missed (line 909-923)

---

## User Experience

### Before Fix:
- ❌ Confusing: Two blocks appear (old + new)
- ❌ User thinks block was duplicated
- ❌ Unclear which block is "real"

### After Fix:
- ✅ Clear: Block moves to new time
- ✅ Smooth transition (brief loading state)
- ✅ Modal explains what happened
- ✅ No duplicates

---

## Philosophy

**Optimistic updates are great for instant feedback**, but they should only be used when:
1. The operation is simple (status change only)
2. The operation is unlikely to fail
3. The operation doesn't change multiple properties

For **missed blocks that might be rescheduled**, we:
- Skip optimistic update (operation is complex)
- Wait for server response (might change time + status)
- Reload fresh data (ensure consistency)
- Show modal for feedback (user knows what happened)

This provides a better, more reliable user experience.

