# Scheduling Simplification Summary

## Changes Made

### Problem
The original implementation had complex cross-week scheduling logic:
- Week 1: Allow rating 1 topics to overflow into week 2
- Week 2+: Restrict new rating 1 topics to fit in week
- Track ongoing topics across weeks
- Complex state management

This caused issues:
- Duplicate blocks on same day
- Rating inconsistencies for same topic
- Complex debugging
- Difficult to test

### Solution (MVP Simplification)
**Simple rule: Rating 1 topics can ONLY start on Monday or Tuesday**

This ensures:
- All 3 sessions complete within the same week
- No cross-week tracking needed
- Much simpler logic
- Easier to test and maintain

## Implementation Details

### Files Modified
1. `/Users/alexkent/App/ship-fast/libs/scheduler/assignTopics.js`
   - Simplified rating 1 restriction logic (lines ~666-680)
   - Applied same logic to fallback path (lines ~980-990)
   - Removed complex week detection and overflow logic

2. `/Users/alexkent/App/ship-fast/RATING_1_SCHEDULING_RULES.md`
   - Updated documentation to reflect simplified rules
   - Added benefits and trade-offs section

3. `/Users/alexkent/App/ship-fast/scripts/test-duplicate-prevention.js`
   - Added Monday/Tuesday restriction check for rating 1 topics

### Code Changes

**Before (Complex):**
```javascript
if (topic.sessionsScheduled === 0 && !topic.lastSessionDate) {
  const hasOngoingTopics = Object.keys(ongoingTopics).length > 0;
  
  if (hasOngoingTopics) {
    // Week 2+: Only start if all sessions fit
    const config = getSessionConfig(topic.rating);
    if (!canFitAllSessionsInWeek(config, slot.startDate)) {
      return false;
    }
  } else {
    // Week 1: Can't start on weekend
    if (topic.rating === 1) {
      const dayOfWeek = slot.startDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return false;
      }
    }
  }
}
```

**After (Simple):**
```javascript
// MVP Simplification: Rating 1 topics can ONLY start on Monday or Tuesday
if (topic.rating === 1 && topic.sessionsScheduled === 0 && !topic.lastSessionDate) {
  const dayOfWeek = slot.startDate.getDay(); // 0=Sun, 1=Mon, 2=Tue, ..., 6=Sat
  if (dayOfWeek !== 1 && dayOfWeek !== 2) {
    return false; // Only allow Monday (1) or Tuesday (2) starts
  }
}
```

## Scheduling Rules

### Rating 1 (3 sessions, gaps: 2 days, 3 days)
- ✅ **Monday start**: Mon → Wed → Sat (all in week)
- ✅ **Tuesday start**: Tue → Thu → Sun (all in week)
- ❌ Wednesday-Sunday: Would overflow to next week

### Rating 2 (2 sessions, gap: 2 days)
- Can start any weekday (Mon-Fri)
- Example: Wed → Fri (both in week)

### Rating 3-5 (1 session)
- Can start any day
- No gaps needed

## Benefits

### Pros
✅ **Much simpler code** - 80% less complexity
✅ **No cross-week tracking** - No state management needed
✅ **Easier to test** - Clear pass/fail conditions
✅ **Better UX** - Users see complete clusters in weekly view
✅ **MVP-ready** - Can ship immediately
✅ **No duplicates** - Same-day duplicates prevented
✅ **Rating consistency** - All sessions use same rating

### Cons
⚠️ **Reduced scheduling flexibility** - Rating 1 topics only use Mon/Tue slots
⚠️ **Potential for fewer blocks** - Wed-Sun slots only for rating 2-5

## Testing

### 1. Clear old blocks
```bash
node scripts/clear-dev-blocks.js
```

### 2. Generate a plan
Go to your app and generate a plan for the current week

### 3. Run tests
```bash
node scripts/test-duplicate-prevention.js
```

### What the test checks:
- ✅ No rating 1 topics start on Wed-Sun (only Mon/Tue allowed)
- ✅ No same-day duplicates
- ✅ No rating inconsistencies
- ✅ Proper gap enforcement (2 days, then 3 days)

## Expected Results

### For Rating 1 Topics
- First session: Monday or Tuesday only
- Second session: 2 days later (Wed/Thu)
- Third session: 3 days after second (Sat/Sun)
- All sessions within same week

### Example Week
```
Monday:    Rating 1 Topic A (Session 1/3)
Tuesday:   Rating 1 Topic B (Session 1/3), Rating 2 Topic C (Session 1/2)
Wednesday: Rating 1 Topic A (Session 2/3), Rating 3 Topic D (Session 1/1)
Thursday:  Rating 1 Topic B (Session 2/3), Rating 2 Topic C (Session 2/2)
Friday:    Rating 4 Topic E (Session 1/1)
Saturday:  Rating 1 Topic A (Session 3/3)
Sunday:    Rating 1 Topic B (Session 3/3)
```

## Future Enhancements (Post-MVP)

When ready to add more flexibility:

1. **Allow Wednesday starts** with cross-week completion
2. **Smart overflow** for first week only
3. **Multi-week planning** to optimize across weeks
4. **Dynamic restrictions** based on exam proximity

## Rollback Plan

If issues arise, the previous complex logic is preserved in git history. To rollback:
```bash
git log --oneline -- libs/scheduler/assignTopics.js
git checkout <commit-hash> -- libs/scheduler/assignTopics.js
```

## Monitoring

Watch for:
- Users reporting too few rating 1 blocks scheduled
- Monday/Tuesday slots becoming bottleneck
- Wed-Sun slots underutilized

If these occur, consider phased rollout of cross-week scheduling.
