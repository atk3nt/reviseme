# Network Retry & Idempotency Fix

## Problem Summary

During plan generation, if a network error occurred (e.g., `ERR_NETWORK_CHANGED`), the following would happen:

1. POST to `/api/plan/generate` succeeds on the server ✅
2. Blocks are saved to the database ✅
3. Network error prevents response from reaching the browser ❌
4. Frontend shows error and redirects back to onboarding ❌
5. User tries to generate plan again
6. API tries to INSERT the same blocks → **Unique constraint violation** ❌

**Error:** "Failed to save blocks to database"

## Root Cause

The API was using `.insert()` which fails if blocks with the same `(user_id, topic_id, scheduled_at)` already exist. This made the API **non-idempotent** - retrying after a network failure would fail.

## The Fix

Changed the INSERT operation to UPSERT in `/app/api/plan/generate/route.js` (line ~1138):

### Before:
```javascript
const { data: inserted, error: insertError } = await supabaseAdmin
  .from('blocks')
  .insert(recordsToInsert)
  .select('...');

if (insertError) {
  throw new Error('Failed to save blocks to database');
}
```

### After:
```javascript
const { data: upserted, error: upsertError } = await supabaseAdmin
  .from('blocks')
  .upsert(recordsToInsert, {
    onConflict: 'user_id,topic_id,scheduled_at',
    ignoreDuplicates: false // Update existing rows
  })
  .select('...');

if (upsertError) {
  console.error('Failed to upsert blocks:', upsertError);
  throw new Error('Failed to save blocks to database');
}
```

## How It Works

**UPSERT behavior:**
- If a block with matching `(user_id, topic_id, scheduled_at)` **doesn't exist** → INSERT it
- If a block with matching `(user_id, topic_id, scheduled_at)` **already exists** → UPDATE it

This makes the API **idempotent** - calling it multiple times with the same data produces the same result.

## Benefits

1. **Network resilience:** If the response is lost due to network issues, retrying succeeds
2. **No duplicate errors:** The unique constraint is respected, but conflicts are handled gracefully
3. **Safe retries:** Users can retry plan generation without database errors
4. **Consistent state:** The database always reflects the latest plan generation attempt

## Scenarios Handled

### Scenario 1: Network Failure During Response
1. API saves blocks ✅
2. Network fails before response reaches browser ❌
3. User retries → UPSERT updates existing blocks ✅
4. Success! ✅

### Scenario 2: User Clicks Generate Twice Quickly
1. First call saves blocks ✅
2. Second call (if it gets through) → UPSERT updates same blocks ✅
3. No error, consistent state ✅

### Scenario 3: Normal Generation
1. No existing blocks → UPSERT inserts new blocks ✅
2. Works exactly like INSERT ✅

## Testing

### Before Fix:
- Network error → Retry → "Failed to save blocks to database"
- Duplicate call → "Failed to save blocks to database"

### After Fix:
- Network error → Retry → ✅ Success (blocks updated)
- Duplicate call → ✅ Success (blocks updated)
- Normal generation → ✅ Success (blocks inserted)

## Related Fixes

This fix works in conjunction with:
1. **Duplicate API call prevention** (`hasStartedGeneration` guard in generating page)
2. **OAuth account linking** (ensures user exists before blocks are created)
3. **Unique constraint** (`unique_user_topic_scheduled` prevents actual duplicates)

## Technical Details

**Supabase UPSERT syntax:**
```javascript
.upsert(data, {
  onConflict: 'column1,column2,column3', // Columns that define uniqueness
  ignoreDuplicates: false // false = update, true = ignore
})
```

**Our constraint:** `unique_user_topic_scheduled` on `(user_id, topic_id, scheduled_at)`

**Result:** If a block with the same user, topic, and time exists, it gets updated with new values (duration, rationale, session numbers, etc.)

## Production Safety

✅ **Backwards compatible** - Works with existing data
✅ **No data loss** - Updates preserve block IDs
✅ **Idempotent** - Safe to retry
✅ **Performant** - UPSERT is optimized in PostgreSQL
✅ **Logged** - Enhanced logging for debugging

## Notes

- The unique constraint is still enforced - this prevents actual duplicates
- UPSERT is the standard solution for idempotent APIs
- This pattern should be used for any API that creates resources that might be retried
