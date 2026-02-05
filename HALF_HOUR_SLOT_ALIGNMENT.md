# Fix: Align All Blocks to Half-Hour Boundaries

## Problem

Blocks were being scheduled at quarter-hour times (e.g., 9:45, 10:15) when users signed up at odd times, which was unintended behavior.

**Example:**
- User signs up at **9:36 AM**
- System rounded to **9:45 AM** (15-minute interval)
- First block: **9:45-10:15 AM** ❌
- Second block: **10:15-10:45 AM** ❌

**Expected:**
- User signs up at **9:36 AM**
- System should round to **10:00 AM** (30-minute interval)
- First block: **10:00-10:30 AM** ✅
- Second block: **10:30-11:00 AM** ✅

## Root Cause

The current time rounding was using **15-minute intervals** instead of **30-minute intervals** (matching the block duration).

```javascript
// BEFORE (WRONG)
const roundedCurrentMinutes = Math.ceil(currentMinutes / 15) * 15;
// 9:36 → 9:45 (quarter hour)
```

This created a mismatch:
- Rounding: 15-minute granularity
- Block duration: 30 minutes
- Increment: 30 minutes
- Result: Blocks could start at :15 or :45 (quarter hours)

## Solution

Changed rounding to use **30-minute intervals** to match the block duration:

```javascript
// AFTER (CORRECT)
const roundedCurrentMinutes = Math.ceil(currentMinutes / 30) * 30;
// 9:36 → 10:00 (half hour)
```

Now everything aligns:
- Rounding: 30-minute granularity ✅
- Block duration: 30 minutes ✅
- Increment: 30 minutes ✅
- Result: All blocks at :00 or :30 only ✅

## Changes Made

### `/libs/scheduler/buildSlots.js`

**1. Line 161 - Changed rounding interval:**
```javascript
// Before
const roundedCurrentMinutes = Math.ceil(currentMinutes / 15) * 15;

// After
const roundedCurrentMinutes = Math.ceil(currentMinutes / 30) * 30;
```

**2. Line 177 - Updated max iterations:**
```javascript
// Before
const maxIterations = 96; // at 15-minute granularity this covers the day

// After
const maxIterations = 48; // at 30-minute granularity this covers the day
```

**3. Line 158 - Updated comment:**
```javascript
// Before
// For today, start from current time (rounded up to next 15-min interval)

// After
// For today, start from current time (rounded up to next 30-min interval)
```

## How It Works Now

### Example 1: Sign up at 9:36 AM

**Step 1: Calculate current time**
```
currentMinutes = 9 * 60 + 36 = 576 minutes
```

**Step 2: Round to next 30-minute boundary**
```
roundedCurrentMinutes = Math.ceil(576 / 30) * 30 = 600 minutes (10:00 AM)
```

**Step 3: Create blocks**
```
First block:  10:00-10:30 AM ✅
Second block: 10:30-11:00 AM ✅
Third block:  11:00-11:30 AM ✅
```

### Example 2: Sign up at 5:34 PM

**Step 1: Calculate current time**
```
currentMinutes = 17 * 60 + 34 = 1054 minutes
```

**Step 2: Round to next 30-minute boundary**
```
roundedCurrentMinutes = Math.ceil(1054 / 30) * 30 = 1080 minutes (6:00 PM)
```

**Step 3: Create blocks**
```
First block:  6:00-6:30 PM ✅
Second block: 6:30-7:00 PM ✅
Third block:  7:00-7:30 PM ✅
```

### Example 3: Sign up at 10:00 AM (exactly on the hour)

**Step 1: Calculate current time**
```
currentMinutes = 10 * 60 + 0 = 600 minutes
```

**Step 2: Round to next 30-minute boundary**
```
roundedCurrentMinutes = Math.ceil(600 / 30) * 30 = 600 minutes (10:00 AM)
```

**Step 3: Create blocks**
```
First block:  10:00-10:30 AM ✅ (starts immediately)
Second block: 10:30-11:00 AM ✅
Third block:  11:00-11:30 AM ✅
```

## Unavailable Times Handling

The system already respects unavailable times for the first block and all subsequent blocks.

### Example: Sign up at 9:36 AM with unavailable 10:00-11:00 AM

**Step 1: Round to 10:00 AM**

**Step 2: Check slots**
```
10:00-10:30 → Overlaps with unavailable time → ❌ Skip
10:30-11:00 → Overlaps with unavailable time → ❌ Skip
11:00-11:30 → No overlap → ✅ First block created here
11:30-12:00 → No overlap → ✅ Second block
```

**Result:**
- First block: 11:00-11:30 AM ✅
- Automatically skipped unavailable period
- All blocks still at :00 or :30

## Benefits

### ✅ Consistent Scheduling
- All blocks at :00 or :30 (half-hour boundaries)
- No unexpected quarter-hour blocks
- Predictable for users

### ✅ Aligned with Block Duration
- 30-minute rounding matches 30-minute blocks
- No granularity mismatch
- Cleaner scheduling logic

### ✅ Respects Current Time
- Still enforces "no blocks before signup time"
- Rounds up to next available half-hour
- Works with time override for testing

### ✅ Respects Unavailable Times
- First block never overlaps unavailable times
- Automatically finds next available slot
- Maintains half-hour alignment

## Testing

### Test Case 1: Odd Signup Time

**Setup:**
```javascript
localStorage.setItem('devTimeOverride', '2026-02-04T09:36:00');
```

**Expected:**
- ✅ First block: 10:00 AM (not 9:45 AM)
- ✅ All blocks at :00 or :30
- ✅ Console shows `roundedTo: '10:00'`

### Test Case 2: Just After Half Hour

**Setup:**
```javascript
localStorage.setItem('devTimeOverride', '2026-02-04T14:31:00');
```

**Expected:**
- ✅ First block: 3:00 PM (not 2:45 PM)
- ✅ Rounds up from 2:31 to 3:00
- ✅ All blocks at :00 or :30

### Test Case 3: Exactly on Half Hour

**Setup:**
```javascript
localStorage.setItem('devTimeOverride', '2026-02-04T15:30:00');
```

**Expected:**
- ✅ First block: 3:30 PM (starts immediately)
- ✅ No rounding needed
- ✅ All blocks at :00 or :30

### Test Case 4: With Unavailable Times

**Setup:**
```javascript
localStorage.setItem('devTimeOverride', '2026-02-04T09:36:00');
// Set unavailable: 10:00-11:00 AM
```

**Expected:**
- ✅ Rounds to 10:00 AM
- ✅ Skips 10:00-10:30 and 10:30-11:00 (unavailable)
- ✅ First block: 11:00-11:30 AM
- ✅ All blocks at :00 or :30

## Verification Checklist

- [ ] Set time override to odd time (e.g., 9:36 AM)
- [ ] Generate plan
- [ ] Check console log shows rounding to next half-hour
- [ ] Verify first block is at :00 or :30
- [ ] Verify all subsequent blocks are at :00 or :30
- [ ] Test with unavailable times overlapping rounded time
- [ ] Verify first block skips unavailable period
- [ ] Test with real time (no override)
- [ ] Verify production behavior unchanged

## Related Files

- `/libs/scheduler/buildSlots.js` - Updated rounding and max iterations
- `TIMEZONE_FIX_CURRENT_TIME.md` - Related timezone fix documentation

---

**Status:** ✅ Fixed
**Date:** January 30, 2026
**Impact:** All blocks now align to half-hour boundaries (:00 or :30)
**Production Safe:** Yes (improves consistency, no breaking changes)
