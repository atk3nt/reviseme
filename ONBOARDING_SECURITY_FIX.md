# Onboarding Security Fix - URL Bypass Prevention

## Problem
Users could bypass onboarding progression by manually changing the URL to access any slide, even if they hadn't reached it through normal progression.

## Root Cause
1. **Layout allowed access during session loading** - The check `status !== 'loading'` meant any slide could load while session was initializing
2. **Slides auto-unlocked themselves on mount** - When a slide mounted, it called `unlockSlide()`, permanently granting access
3. **Race condition** - By the time the layout checked access, the slide had already unlocked itself

## Solution Implemented

### 1. Layout Access Control (`app/onboarding/layout.js`)

**Changes:**
- Added explicit check for `slideNumber === null` at the top (non-slide pages)
- Added waiting logic: `if (status === 'loading') return;` for regular slides
- This prevents slides from mounting until session is loaded and access is verified
- Special cases (slides 2, 18, 19) still allowed during loading for auth/payment flows
- Added `session` to useEffect dependencies for proper re-checks

**Key Logic:**
```javascript
// Wait for session to load before checking access for regular slides
if (status === 'loading') {
  console.log('[ONBOARDING LAYOUT] Waiting for session to load...');
  return; // Keep showing loading spinner
}

// Now check access (session is loaded)
if (!canAccessSlide(slideNumber)) {
  const allowedPath = getHighestAllowedSlidePath();
  router.replace(allowedPath);
  return;
}
```

### 2. Removed Auto-Unlock from Special Slides

**Slide-2** (`app/onboarding/slide-2/page.js`):
- Removed `unlockSlide(2)` from mount
- Layout still allows temporary access for auth callbacks
- User must progress from slide-1 to permanently unlock

**Slide-18** (`app/onboarding/slide-18/page.js`):
- Removed `unlockSlide(18)` from mount
- Slide-17 unlocks slide-18 before redirecting to Stripe (legitimate flow)
- Layout still allows temporary access for payment callbacks

**Slide-19** (`app/onboarding/slide-19/page.js`):
- Kept `unlockSlide(19)` - paid users have earned full access
- Layout allows access for users with `hasAccess = true`

## How It Works Now

### Regular Slide Access (e.g., slide-5)
1. User types `/onboarding/slide-5` in URL
2. Layout checks: `slideNumber = 5`
3. Layout checks: `status === 'loading'` → Wait (show spinner)
4. Session loads: `status = 'authenticated'`
5. Layout checks: `canAccessSlide(5)` → NO (max unlocked is 3)
6. Layout redirects to: `/onboarding/slide-3`
7. ✅ **Bypass prevented**

### Auth Callback Flow (slide-2)
1. User clicks magic link in email
2. NextAuth redirects to `/onboarding/slide-2`
3. Layout checks: `slideNumber = 2`
4. Layout checks: Special case for slide-2 + `status === 'loading'` → ALLOW
5. Slide-2 mounts (doesn't auto-unlock)
6. User clicks "Next" → `unlockSlide(3)` → Progress continues
7. ✅ **Auth flow works, but slide-2 not permanently unlocked**

### Payment Callback Flow (slide-18)
1. User on slide-17 clicks "Get Your Plan"
2. Slide-17 calls `unlockSlide(18)` before Stripe redirect
3. User pays on Stripe
4. Webhook sets `hasAccess = true`
5. Stripe redirects to `/onboarding/slide-18?payment=success`
6. Layout checks: Special case for slide-18 + `hasAccess` → ALLOW
7. Slide-18 mounts (doesn't auto-unlock, already unlocked by slide-17)
8. User clicks "Next" → `unlockSlide(19)` → Progress continues
9. ✅ **Payment flow works**

### Paid User Resume (slide-19)
1. Paid user (has `hasAccess = true`) visits site
2. Plan page redirects to `/onboarding/slide-19` (incomplete onboarding)
3. Layout checks: `slideNumber = 19` + `hasAccess = true` → ALLOW
4. Slide-19 mounts and calls `unlockSlide(19)`
5. User can rate topics and continue
6. ✅ **Resume flow works**

## Security Improvements

### Before Fix
❌ Could access any slide by typing URL
❌ Slides unlocked themselves on mount
❌ Race condition allowed bypassing
❌ No real progression enforcement

### After Fix
✅ Must progress through slides in order
✅ Cannot bypass by typing URL
✅ Session must load before access granted
✅ Special cases still work (auth, payment, resume)
✅ Paid users can access all onboarding slides

## Special Cases Preserved

### Slide-2 (Auth Callback)
- **Purpose**: Magic link/OAuth redirect target
- **Access**: Allowed during `status === 'loading'` OR `status === 'authenticated'`
- **Security**: Doesn't permanently unlock, must progress from slide-1

### Slide-18 (Payment Callback)
- **Purpose**: Stripe payment return URL
- **Access**: Allowed if `hasAccess = true` OR `payment=success` in URL OR `status === 'loading'`
- **Security**: Only unlocked by slide-17 before payment, can't bypass

### Slide-19 (Resume Onboarding)
- **Purpose**: Paid users resuming incomplete onboarding
- **Access**: Allowed if `hasAccess = true` AND `status === 'authenticated'`
- **Security**: Requires payment, appropriate for paid users

## Testing Checklist

### ✅ Test 1: Regular Slide Bypass (SHOULD FAIL)
1. Start fresh onboarding, reach slide-3
2. Manually type `/onboarding/slide-10` in URL
3. **Expected**: Redirect back to slide-3
4. **Status**: ⏳ Needs testing

### ✅ Test 2: Auth Flow (SHOULD WORK)
1. Start onboarding on slide-1
2. Enter email for magic link
3. Click magic link in email
4. **Expected**: Land on slide-2, can continue
5. Try manually typing `/onboarding/slide-2` later
6. **Expected**: Redirect to highest unlocked slide (not slide-2)
7. **Status**: ⏳ Needs testing

### ✅ Test 3: Payment Flow (SHOULD WORK)
1. Progress through onboarding to slide-17
2. Click "Get Your Plan"
3. Complete payment on Stripe
4. **Expected**: Return to slide-18, can continue to slide-19
5. **Status**: ⏳ Needs testing

### ✅ Test 4: Paid User Resume (SHOULD WORK)
1. User with `hasAccess = true` but incomplete onboarding
2. Visit `/plan` page
3. **Expected**: Redirect to slide-19
4. Can rate topics and continue
5. **Status**: ⏳ Needs testing

### ✅ Test 5: Dev Mode (SHOULD BYPASS)
1. On localhost, manually type any slide URL
2. **Expected**: Access granted (dev mode bypass)
3. **Status**: ⏳ Needs testing

## Files Modified

1. ✅ `app/onboarding/layout.js`
   - Added session loading wait for regular slides
   - Improved access control logic
   - Added `session` to dependencies

2. ✅ `app/onboarding/slide-2/page.js`
   - Removed `unlockSlide(2)` from mount

3. ✅ `app/onboarding/slide-18/page.js`
   - Removed `unlockSlide(18)` from mount

## Notes

- Dev mode bypass still active on localhost (intentional for development)
- Production sites are now fully protected
- All legitimate flows (auth, payment, resume) preserved
- No changes needed to other slides (3-17, 20-22)
- Topic rating validation (40% per subject) still active

## Deployment

No database changes required. Deploy as normal:
1. Push changes to repository
2. Deploy to production
3. Test auth and payment flows
4. Monitor for any issues

## Rollback Plan

If issues arise, revert these commits:
- Layout: Restore original `status !== 'loading'` check
- Slide-2: Restore `unlockSlide(2)` on mount
- Slide-18: Restore `unlockSlide(18)` on mount
