# Rating 1 Topic Scheduling Rules (MVP - Simplified)

## Overview
This document describes the **simplified** scheduling rules for Rating 1 topics (3 sessions with 2-day and 3-day gaps).

**MVP Simplification**: No cross-week scheduling. All rating 1 clusters must start AND complete within the same week.

## Session Requirements
- **Sessions needed**: 3
- **Gap after session 1**: 2 days
- **Gap after session 2**: 3 days
- **Total span**: 5 days from first to last session

Example timelines:
- **Monday start**: Mon → Wed → Sat (all in week ✅)
- **Tuesday start**: Tue → Thu → Sun (all in week ✅)
- **Wednesday start**: Wed → Fri → Mon (overflows ❌)

## Scheduling Rules (All Weeks)

### Simple Rule: Monday or Tuesday ONLY
**Rule**: Rating 1 topics can ONLY start on Monday or Tuesday

**Rationale**:
- Monday start: Mon → Wed → Sat (all in same week)
- Tuesday start: Tue → Thu → Sun (all in same week)
- Wednesday or later would overflow into next week
- No cross-week tracking needed for MVP
- Simpler logic, easier to understand and maintain

**Allowed**:
- ✅ **Monday start** → Sessions on Mon, Wed, Sat
- ✅ **Tuesday start** → Sessions on Tue, Thu, Sun

**Not Allowed**:
- ❌ Wednesday start → Would end on Monday (next week)
- ❌ Thursday start → Would end on Tuesday (next week)
- ❌ Friday start → Would end on Wednesday (next week)
- ❌ Saturday start → Would end on Thursday (next week)
- ❌ Sunday start → Would end on Tuesday (next week)

### Other Ratings
- **Rating 2** (2 sessions): Can start any weekday (Mon-Fri)
- **Rating 3-5** (1 session): Can start any day

## Implementation

### Location
`/Users/alexkent/App/ship-fast/libs/scheduler/assignTopics.js`

### Key Logic (Simplified)
```javascript
// MVP Simplification: Rating 1 topics can ONLY start on Monday or Tuesday
if (topic.rating === 1 && topic.sessionsScheduled === 0 && !topic.lastSessionDate) {
  const dayOfWeek = slot.startDate.getDay(); // 0=Sun, 1=Mon, 2=Tue, ..., 6=Sat
  if (dayOfWeek !== 1 && dayOfWeek !== 2) {
    return false; // Only allow Monday (1) or Tuesday (2) starts
  }
}
```

### Why This is Better
- ✅ **Much simpler** - no complex week tracking
- ✅ **No cross-week logic** - all sessions complete in same week
- ✅ **Easier to test** - clear pass/fail conditions
- ✅ **Better UX** - users see complete clusters in weekly view
- ✅ **MVP-ready** - can add cross-week support later if needed

## Testing

### Test Script
`scripts/test-duplicate-prevention.js`

### What It Checks
1. No rating 1 topics start on Wed-Sun (only Mon/Tue allowed)
2. No same-day duplicates
3. No rating inconsistencies
4. Proper gap enforcement (2 days, then 3 days)

### Run Test
```bash
# Clear old blocks first
node scripts/clear-dev-blocks.js

# Generate a plan in your app, then run:
node scripts/test-duplicate-prevention.js
```

## Related Features

### Duplicate Prevention
- No same topic on same day
- No rating inconsistencies for same topic
- Enforced in both primary and fallback scheduling paths

### Gap Enforcement
- Within-week gaps: Tracked via `lastScheduledDateThisWeek`
- Cross-week gaps: Tracked via `lastSessionDate` from ongoing topics
- Proper calendar day calculation using UTC midnight

### Rating Consistency
- All sessions for a topic use the same rating
- Tracked via `topicRatingsMap` during generation
- Errors logged if inconsistency detected

## Benefits

1. **Simple Logic**: Easy to understand and maintain
2. **No Cross-Week Complexity**: All sessions complete in same week
3. **Predictable Scheduling**: Users see complete clusters in weekly view
4. **MVP-Ready**: Can ship without complex ongoing topic tracking
5. **No Duplicates**: Same-day duplicates and rating inconsistencies prevented
6. **Proper Gaps**: 2-day and 3-day gaps enforced correctly

## Trade-offs

### Pros
- ✅ Much simpler code
- ✅ Easier to test and debug
- ✅ Better UX (complete clusters visible)
- ✅ No cross-week state management

### Cons
- ⚠️ Rating 1 topics only use Mon/Tue slots (may reduce total blocks)
- ⚠️ Wed-Sun slots only used for rating 2-5 topics

## Future Enhancements (Post-MVP)

If users need more rating 1 scheduling:
1. **Allow Wednesday starts** with cross-week completion tracking
2. **Smart overflow** for first week only
3. **Multi-week planning** to optimize across weeks
4. **Dynamic gap adjustment** based on exam proximity
