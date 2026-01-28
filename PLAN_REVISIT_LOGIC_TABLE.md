# Plan Page Redirect Logic - Truth Table

## The Condition
Redirect to slide-19 ONLY if ALL of these are true:
```javascript
!devMode && 
status === 'authenticated' && 
session?.user && 
!session?.user?.hasCompletedOnboarding && 
!freshGeneration && 
!hasRevisitBypass
```

## Truth Table

| # | devMode | authenticated | user exists | hasCompleted | freshGen | hasRevisit | → Redirect? | Scenario |
|---|---------|---------------|-------------|--------------|----------|------------|-------------|----------|
| 1 | ✅ true | ✅ true | ✅ true | ❌ false | ❌ false | ❌ false | ❌ NO | Dev mode - always bypass |
| 2 | ❌ false | ❌ false | ❌ false | ❌ false | ❌ false | ❌ false | ❌ NO | Not authenticated - different redirect |
| 3 | ❌ false | ✅ true | ❌ false | ❌ false | ❌ false | ❌ false | ❌ NO | No user object - safety check |
| 4 | ❌ false | ✅ true | ✅ true | ✅ true | ❌ false | ❌ false | ❌ NO | Completed onboarding - OK to view |
| 5 | ❌ false | ✅ true | ✅ true | ❌ false | ✅ true | ❌ false | ❌ NO | Has freshGeneration - just generated |
| 6 | ❌ false | ✅ true | ✅ true | ❌ false | ❌ false | ✅ true | ❌ NO | **Has bypass - FIXED SCENARIO** |
| 7 | ❌ false | ✅ true | ✅ true | ❌ false | ❌ false | ❌ false | ✅ YES | New user trying to access - proper redirect |

## Key Scenarios Explained

### Scenario 6 (The Fix) 🎯
**Before the fix:**
- User completes generation → lands on `/plan?freshGeneration=true` → OK
- User clicks "Plan" again → goes to `/plan` (no params)
- Session still has `hasCompletedOnboarding: false` (stale)
- **Result:** Redirected to slide-19 ❌

**After the fix:**
- User completes generation → lands on `/plan?freshGeneration=true` → sets `planRevisitBypass` → OK
- User clicks "Plan" again → goes to `/plan` (no params)
- Session still has `hasCompletedOnboarding: false` (stale)
- BUT `hasRevisitBypass` is true → NO redirect ✅
- **Result:** Stays on plan page ✅

### Scenario 7 (Security Maintained) 🔒
**User who hasn't completed onboarding:**
- New user tries to access `/plan` directly
- No `planRevisitBypass` flag (hasn't generated yet)
- No `freshGeneration` param
- `hasCompletedOnboarding: false`
- **Result:** Redirected to slide-19 (correct behavior) ✅

## When is planRevisitBypass Set?

```javascript
if (typeof window !== 'undefined' && freshGeneration) {
  sessionStorage.setItem('planRevisitBypass', '1');
}
```

**Only set when:**
1. In browser (not SSR)
2. `freshGeneration=true` in URL
3. Which happens when user navigates from `/plan/generating` after successful generation

## When is planRevisitBypass Cleared?

**Automatically cleared when:**
- User closes the browser tab
- User closes the browser
- sessionStorage is manually cleared (e.g., dev tools)

**NOT cleared when:**
- User navigates between pages in same tab
- User refreshes the page
- User's session expires

This is correct behavior - we want the bypass to persist for the tab's lifetime.

## Edge Cases Handled

### ✅ Multiple Tabs
- Each tab has its own sessionStorage
- User in new tab without bypass will still be redirected if needed
- No security leak across tabs

### ✅ Direct URL Access
- User bookmarks `/plan` and opens it
- No bypass flag in new tab
- Session checked properly
- If not completed → redirect (correct)

### ✅ Session Updates
- Eventually session will have `hasCompletedOnboarding: true`
- At that point, bypass flag is no longer needed (but harmless)
- User will see plan either way

### ✅ Dev Mode
- `devMode` check comes first
- All redirects skipped in dev
- Bypass flag not needed but doesn't hurt

## Conclusion
✅ Logic is sound
✅ All scenarios handled correctly
✅ Security maintained
✅ Fix solves the original problem
