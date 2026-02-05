# Dev Guide: Plan Regeneration After Clearing Blocks

## Problem

When you clear blocks for testing and try to regenerate, the system redirects you back to the plan page showing "No blocks scheduled this week" instead of regenerating.

## Why This Happens

The plan page has a **safety feature** that prevents regenerating blocks for the current week when no blocks are found. This is intentional to prevent accidental deletion of existing blocks when:

1. User navigates away and comes back
2. Database query temporarily fails
3. Network issues cause blocks to not load

**The logic:**
```javascript
// In app/plan/page.js, around line 663
if (isViewingCurrentWeek && !allowRegeneration) {
  console.log('⚠️ Viewing current week with no blocks found - NOT regenerating');
  setBlocks([]);
  return; // Stops here, doesn't regenerate
}
```

## Solution: Dev Bypass Flag

### Option 1: Using Dev Tools (Recommended)

1. **Go to Dev Tools:**
   - Navigate to `/dev-tools` in your browser
   - Or click the dev tools link from your app

2. **Enable Regeneration:**
   - Scroll to the "Dev User Management" section
   - Find the "Plan Regeneration" area
   - Click **"🔓 Enable Regeneration"**
   - You'll see: ✅ Regeneration Enabled

3. **Clear Blocks:**
   - Click **"🗑️ Delete All Blocks"** in the same section
   - Confirm the deletion

4. **Regenerate:**
   - Go to `/plan/generating` or click "Plan Generating Page" in dev tools
   - Or go back through onboarding to slide 22 and click "Generate My Study Plan"
   - The plan will now regenerate successfully

5. **Disable When Done (Optional):**
   - Go back to dev tools
   - Click **"🔒 Disable Regeneration"** to restore protection

### Option 2: Using Browser Console

If you prefer the console:

```javascript
// Enable regeneration
localStorage.setItem('devAllowRegeneration', 'true');

// Verify it's set
console.log('Regeneration allowed:', localStorage.getItem('devAllowRegeneration'));

// Reload the page
location.reload();
```

To disable:
```javascript
localStorage.setItem('devAllowRegeneration', 'false');
// or
localStorage.removeItem('devAllowRegeneration');
```

## How It Works

**When `devAllowRegeneration` is enabled:**

1. Plan page detects you're in dev mode (localhost)
2. Checks for the `devAllowRegeneration` flag in localStorage
3. If `true`, bypasses the current week protection
4. Allows regeneration even when viewing current week with no blocks

**Console logs to watch for:**

```
🔧 Dev mode: Regeneration allowed via devAllowRegeneration flag
📝 No existing blocks found, generating new plan...
```

## Complete Testing Workflow

### Scenario 1: Test Fresh Plan Generation

```bash
# 1. Enable regeneration
localStorage.setItem('devAllowRegeneration', 'true');

# 2. Clear all data
# Go to /dev-tools → Click "💥 Full Reset"

# 3. Go through onboarding
# Navigate to /onboarding/slide-1

# 4. Generate plan
# Complete onboarding → Generate plan

# 5. Disable regeneration (optional)
localStorage.setItem('devAllowRegeneration', 'false');
```

### Scenario 2: Test Regeneration After Changes

```bash
# 1. Enable regeneration
localStorage.setItem('devAllowRegeneration', 'true');

# 2. Delete blocks only
# Go to /dev-tools → Click "🗑️ Delete All Blocks"

# 3. Regenerate
# Go to /plan/generating or /onboarding/slide-22

# 4. Verify new blocks appear
# Check /plan page

# 5. Disable regeneration
localStorage.setItem('devAllowRegeneration', 'false');
```

### Scenario 3: Test Time-Based Generation

```bash
# 1. Set time override
# Go to /dev-tools → Set time to "Sunday 10 PM"

# 2. Enable regeneration
localStorage.setItem('devAllowRegeneration', 'true');

# 3. Clear blocks
# /dev-tools → Delete All Blocks

# 4. Generate plan
# Should generate for next week (Monday)

# 5. Verify week
# Check console logs for "Generated blocks for week: 2024-01-08"

# 6. Clean up
localStorage.removeItem('devTimeOverride');
localStorage.setItem('devAllowRegeneration', 'false');
```

## Important Notes

### ⚠️ Dev Mode Only

This bypass **only works in dev mode** (localhost). In production, the protection is always active.

```javascript
const devMode = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.includes('localhost')
);
```

### 🔒 Why Protection Exists

**Without this protection:**
- User generates plan on Monday
- User closes browser
- User reopens on Tuesday
- Database query fails temporarily
- System thinks "no blocks found, let's regenerate"
- User's Monday blocks get deleted
- User loses their progress

**With protection:**
- Same scenario
- System sees "current week, no blocks, but could be temporary issue"
- Doesn't regenerate
- Shows empty state instead
- User can refresh or try again
- Blocks are safe

### 🎯 When to Use This

**Enable regeneration when:**
- Testing plan generation logic
- Testing unavailable times
- Testing time-based features (start today/tomorrow)
- Testing week transitions (Sunday → Monday)
- Debugging scheduler issues

**Keep it disabled when:**
- Testing normal user flow
- Testing navigation
- Testing UI/UX
- Not actively working on plan generation

## Troubleshooting

### "Still not regenerating after enabling"

**Check:**
1. Are you in dev mode? (localhost URL)
2. Is the flag set correctly?
   ```javascript
   console.log(localStorage.getItem('devAllowRegeneration')); // Should be "true"
   ```
3. Did you reload the page after setting the flag?
4. Check console for logs:
   ```
   🔧 Dev mode: Regeneration allowed via devAllowRegeneration flag
   ```

### "Regeneration works but blocks are wrong"

This is a different issue - the bypass is working, but there's a problem with:
- Unavailable times not loading (see `UNAVAILABLE_TIMES_FIX.md`)
- Time override not working (check `devTimeOverride`)
- Scheduler logic (check `/api/plan/generate` logs)

### "Accidentally left it enabled"

No worries! The flag is stored in localStorage, so:
- It's per-browser (doesn't affect other developers)
- It's per-domain (doesn't affect production)
- It resets when you clear localStorage
- It's disabled by default

To disable:
```javascript
localStorage.setItem('devAllowRegeneration', 'false');
```

Or use dev tools → "🔒 Disable Regeneration"

## Related Files

- `/app/plan/page.js` - Contains the regeneration logic and bypass check
- `/app/dev-tools/page.js` - UI for toggling the bypass flag
- `/app/plan/generating/page.js` - Plan generation orchestration
- `/app/api/plan/generate/route.js` - Backend plan generation API

## Related Documentation

- `UNAVAILABLE_TIMES_FIX.md` - Fix for unavailable times not being respected
- `SAME_DAY_PLAN_GENERATION_IMPLEMENTATION.md` - Start today/tomorrow logic
- `TESTING_SAME_DAY_PLAN.md` - Testing guide for time-based features

---

**Last Updated:** January 30, 2026
