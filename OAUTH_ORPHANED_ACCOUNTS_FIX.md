# OAuth Orphaned Accounts Fix

## Problem Summary

During OAuth sign-up (e.g., Google), some users were experiencing a critical issue where:
1. An entry was created in the `accounts` table
2. **No corresponding entry was created in the `users` table**
3. This resulted in "orphaned accounts" - accounts without users
4. When these users tried to use the app, blocks couldn't be saved because there was no `user_id`

## Root Cause

The NextAuth adapter's `linkAccount()` method was being called without verifying that the user exists in the `users` table. This could happen if:
- The `createUser()` method failed silently
- The `createUser()` method was never called
- There was a race condition between user creation and account linking

## Fixes Implemented

### 1. Enhanced Logging in `createUser()` (libs/auth.js)

Added comprehensive logging to track the user creation flow:
- ⭐ Entry point logging with email/name validation
- ✅ Success confirmations
- ❌ Error tracking
- 🔄 Update tracking for existing users

**Key Changes:**
- Added validation to ensure email is present before creating user
- Added emoji-based logging for easier debugging
- Added detailed context in all log messages

### 2. Safety Checks in `linkAccount()` (libs/auth.js)

Added critical safety checks before linking accounts:

```javascript
// 1. Verify userId exists
if (!account.userId) {
  throw new Error('Cannot link account: userId is missing')
}

// 2. Verify user exists in database
const { data: userExists } = await supabaseAdmin
  .from('users')
  .select('id')
  .eq('id', account.userId)
  .single()

if (!userExists) {
  throw new Error('User does not exist in users table')
}

// 3. Handle foreign key constraint violations
if (error.code === '23503') {
  throw new Error('Foreign key constraint violation')
}
```

**Benefits:**
- Prevents orphaned accounts from being created
- Provides clear error messages when something goes wrong
- Fails fast instead of creating invalid data

### 3. Database Foreign Key Constraint

Added a database-level constraint to prevent orphaned accounts:

```sql
ALTER TABLE accounts
ADD CONSTRAINT accounts_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES users(id) 
ON DELETE CASCADE;
```

**Benefits:**
- Database-level protection (can't be bypassed by code)
- Automatic cleanup if a user is deleted
- Prevents invalid data at the source

## How to Apply the Fix

### Step 1: Code Changes (Already Applied)

The code changes in `libs/auth.js` have been implemented:
- Enhanced `createUser()` logging
- Safety checks in `linkAccount()`

### Step 2: Database Migration (Manual)

Run the SQL in `ADD_FOREIGN_KEY_CONSTRAINT.sql`:

1. Open your Supabase dashboard
2. Go to SQL Editor
3. Copy the contents of `ADD_FOREIGN_KEY_CONSTRAINT.sql`
4. Run the SQL

**Important:** The script will first check for existing orphaned accounts. If any exist, delete them before adding the constraint.

### Step 3: Verify the Fix

After applying:

1. **Check for orphaned accounts:**
   ```sql
   SELECT a.*, u.email 
   FROM accounts a 
   LEFT JOIN users u ON a.user_id = u.id 
   WHERE u.id IS NULL;
   ```
   Should return 0 rows.

2. **Verify constraint exists:**
   ```sql
   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'accounts'::regclass
     AND conname = 'accounts_user_id_fkey';
   ```
   Should return 1 row with the constraint definition.

3. **Test OAuth sign-up:**
   - Sign up with Google OAuth
   - Check that user appears in both `users` and `accounts` tables
   - Verify blocks can be saved

## What This Prevents

### Before Fix:
```
OAuth Sign-up Flow (BROKEN):
1. User clicks "Sign in with Google"
2. NextAuth receives OAuth callback
3. createUser() fails or is skipped ❌
4. linkAccount() creates account anyway ❌
5. User has account but no user record ❌
6. Blocks can't be saved (no user_id) ❌
```

### After Fix:
```
OAuth Sign-up Flow (FIXED):
1. User clicks "Sign in with Google"
2. NextAuth receives OAuth callback
3. createUser() creates user ✅
   - Enhanced logging tracks the flow
   - Validation ensures email is present
4. linkAccount() verifies user exists ✅
   - Checks user_id is present
   - Verifies user exists in DB
5. Account is linked to valid user ✅
6. Blocks save successfully ✅
```

## Monitoring

Watch for these log messages in production:

**Good Signs:**
- `[AUTH] ⭐ createUser called: { email: '...', ... }`
- `[AUTH] ✅ createUser success! New user ID: ...`
- `[AUTH] 🔗 linkAccount called: { provider: 'google', ... }`
- `[AUTH] ✅ User verified, proceeding with account linking...`
- `[AUTH] ✅ linkAccount success! Account ID: ...`

**Warning Signs:**
- `[AUTH] ❌ createUser called without email!`
- `[AUTH] ❌ User does not exist in users table`
- `[AUTH] ❌ Foreign key constraint violation!`

## Testing Checklist

- [ ] Run the database migration
- [ ] Verify no orphaned accounts exist
- [ ] Test new OAuth sign-up (Google)
- [ ] Verify user created in `users` table
- [ ] Verify account created in `accounts` table
- [ ] Verify blocks can be saved
- [ ] Check logs for proper flow
- [ ] Test magic link sign-up (should still work)
- [ ] Test existing user OAuth sign-in (should still work)

## Related Files

- `libs/auth.js` - NextAuth configuration and adapter
- `supabase/migrations/013_add_accounts_foreign_key.sql` - Migration file
- `ADD_FOREIGN_KEY_CONSTRAINT.sql` - Manual SQL script

## Notes

- Magic link sign-ups work differently and were not affected by this issue
- The foreign key constraint is the ultimate safeguard
- Enhanced logging helps debug future auth issues
- This fix is backwards compatible with existing users
