# Rerated Topics Priority Fix - Implementation Summary

## Problem Statement
- Users rerate topics manually (via rerate-topics page) or via modal (after last study block)
- Rerated topics were being mixed with missed topics (same-week catch-up)
- Rating 1 topics could start on Monday or Tuesday, causing week-delay issues
- Rerated topics might not get scheduled until week after next

## Solution Implemented

### 1. Rating 1 Topics: Monday-Only Scheduling
**File:** `libs/scheduler/assignTopics.js` (lines 670-678 and 997-1003)

**Change:** Rating 1 topics can now ONLY start on Monday (removed Tuesday option)

**Rationale:**
- Mon → Wed → Sat pattern ensures all 3 sessions complete by Saturday
- Enables plan generation on Sunday/late Saturday
- Avoids week delays for rerated Rating 1 topics
- Predictable scheduling behavior
- Prevents cross-week scheduling (Tue → Thu → Sun would cross into next week)

**Code:**
```javascript
// Before: dayOfWeek !== 1 && dayOfWeek !== 2 (Mon or Tue)
// After: dayOfWeek !== 1 (Mon only)
```

### 1.5. Rating 2 Topics: No Saturday/Sunday Start
**File:** `libs/scheduler/assignTopics.js` (lines 684-691 and 1011-1019)

**Change:** Rating 2 topics cannot start on Saturday or Sunday

**Rationale:**
- Rating 2 topics need 2 sessions with a 2-day gap
- If they start on Saturday: Sat → Mon (crosses into next week)
- If they start on Sunday: Sun → Tue (crosses into next week)
- Restricting to Mon-Fri ensures both sessions complete within the week

**Valid start days for Rating 2:**
- Mon → Wed ✓
- Tue → Thu ✓
- Wed → Fri ✓
- Thu → Sat ✓
- Fri → Sun ✓

**Code:**
```javascript
if (topic.rating === 2 && topic.sessionsScheduled === 0 && !topic.lastSessionDate) {
  const dayOfWeek = slot.startDate.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) { // No Saturday or Sunday
    return false;
  }
}
```

### 2. Rerated Topics Logging
**File:** `app/api/topics/save-rating/route.js`

**Change:** Manual rerating now logs a `topic_rerated` event

**Rationale:**
- Ensures manual rerating is tracked (same as modal rerating)
- Plan generator can detect rerated topics via logs
- Enables cycle reset and prioritization

**Code:**
```javascript
// Log re-rating event for ratings 1-5
if (rating >= 1 && rating <= 5) {
  await supabaseAdmin.from('logs').insert({
    user_id: userId,
    event_type: 'topic_rerated',
    event_data: {
      topic_id: topicId,
      rerating_score: rating,
      source: 'manual_rerate'
    }
  });
}
```

### 3. Separate Rerated Topics from Missed Topics
**File:** `app/api/plan/generate/route.js`

**Change:** Rerated topics are no longer added to `missedTopicIds`

**Rationale:**
- Missed topics = same-week catch-up (rescheduled within current week)
- Rerated topics = next week priorities (prioritized within rating buckets)
- These are semantically different use cases

**Code:**
```javascript
// Before: const allMissedTopicIds = [...reratedTopicIds, ...missedTopicIdsFromDB]
// After: Pass separately
plan = await generateStudyPlan({
  missedTopicIds: missedTopicIdsFromDB, // Only actual missed blocks
  reratedTopicIds, // Rerated topics (separate)
  // ...
});
```

### 4. Prioritize Rerated Topics Within Rating Buckets
**Files:** 
- `libs/scheduler.js` (function signature)
- `libs/scheduler/prioritizeTopics.js` (sorting logic)

**Change:** Rerated topics are sorted to the front of their rating buckets

**Rationale:**
- Respects the rating system (r1 > r2 > r3)
- Rerated topics get priority within their category
- Missed topics remain separate (highest priority for same-week catch-up)

**Code:**
```javascript
// Sort each bucket: rerated topics first, then by orderIndex
list.sort((a, b) => {
  // Rerated topics come first within their bucket
  if (a.isRerated && !b.isRerated) return -1;
  if (!a.isRerated && b.isRerated) return 1;
  // Then sort by curriculum order
  return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
});
```

## Priority Order (After Changes)

1. **Missed topics** (highest priority - same-week catch-up)
2. **Rerated Rating 1 topics** (within r1 bucket, before other r1 topics)
3. **Other Rating 1 topics** (curriculum order)
4. **Rerated Rating 2 topics** (within r2 bucket, before other r2 topics)
5. **Other Rating 2 topics** (curriculum order)
6. **Rerated Rating 3 topics** (within r3 bucket, before other r3 topics)
7. **Other Rating 3 topics** (curriculum order)
8. **Exam topics** (ratings 4-5, curriculum order)

## Benefits

1. **Semantic correctness:** Rerated topics are not mixed with missed topics
2. **Predictable scheduling:** Rating 1 topics always complete by Saturday
3. **Earlier plan generation:** Can generate next week's plan on Sunday/late Saturday
4. **No week delays:** Rerated topics are scheduled in the immediate next week
5. **Respects rating system:** Priority follows r1 > r2 > r3 hierarchy
6. **Better user experience:** Rerated topics get attention without overriding missed work

## Testing Recommendations

1. Test Rating 1 topics scheduling on Monday only
2. Test manual rerating creates log entries
3. Test rerated topics appear in next week's plan
4. Test rerated topics are prioritized within their rating buckets
5. Test missed topics remain highest priority (separate from rerated)
6. Test plan generation on Sunday/late Saturday includes rerated topics

## Cross-Week Scheduling Prevention Summary

All spaced repetition sessions now complete within the same week:

| Rating | Sessions | Gap Days | Start Restriction | Pattern | Completes By |
|--------|----------|----------|-------------------|---------|--------------|
| 1 | 3 | [2, 3] | Monday only | Mon → Wed → Sat | Saturday ✓ |
| 2 | 2 | [2] | Mon-Fri only (no Sat/Sun) | Mon-Fri → +2 days | Within week ✓ |
| 3 | 1 | [0] | None | Any day | Same day ✓ |
| 4-5 | 1 | [0] | None | Any day | Same day ✓ |

**Cross-week scenarios prevented:**
- ❌ Rating 1 on Tuesday: Tue → Thu → Sun (crosses week)
- ❌ Rating 2 on Saturday: Sat → Mon (crosses week)
- ❌ Rating 2 on Sunday: Sun → Tue (crosses week)

**Ongoing topics exception:**
- Topics that started in previous weeks can schedule remaining sessions across weeks
- This is intentional to ensure continuity of spaced repetition cycles

## Date: 2026-01-14
