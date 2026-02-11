/**
 * Quick smoke tests for re-login and onboarding persistence changes.
 * Run with: node scripts/test-onboarding-changes.js
 * Requires dev server: npm run dev (default port 3000)
 *
 * Manual browser checks (signed-in user):
 * 1. Plan page: User with hasCompletedOnboarding false + hasAccess false → redirects to /onboarding/slide-2.
 * 2. Plan page: User with hasCompletedOnboarding false + hasAccess true → redirects to resume slide (or slide-19).
 * 3. Plan page: User with hasCompletedOnboarding true → stays on plan, bypass set.
 * 4. Onboarding: Paid user can open /onboarding/slide-20 or slide-21 directly (no kick to slide-1).
 * 5. Slide-20: After setting time prefs and Continue, POST /api/availability/save is sent (check Network tab).
 * 6. Slide-21: After setting blocked times and Continue, POST /api/availability/save with weekStartDate is sent.
 * 7. Unlocking a slide (e.g. complete slide-19) sends POST /api/onboarding/progress with maxUnlockedSlide.
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (e) {
    console.log(`❌ ${name}:`, e.message);
    return false;
  }
}

async function main() {
  console.log('Testing against', BASE, '\n');

  let passed = 0;
  let failed = 0;

  // 1. get-user-data without auth: 401 (prod) or 200 with shape (dev uses dev user)
  const r1 = await test('GET /api/topics/get-user-data (no auth) → 401 or 200 with shape', async () => {
    const res = await fetch(`${BASE}/api/topics/get-user-data`, { credentials: 'omit' });
    if (res.status === 401) return;
    if (res.status === 200) {
      const data = await res.json();
      if (typeof data.hasCompletedOnboarding !== 'boolean' && data.hasCompletedOnboarding !== undefined)
        throw new Error('missing hasCompletedOnboarding');
      if (typeof data.hasAccess !== 'boolean' && data.hasAccess !== undefined)
        throw new Error('missing hasAccess');
      if (!('resumeSlide' in data)) throw new Error('missing resumeSlide');
      return;
    }
    throw new Error(`expected 401 or 200, got ${res.status}`);
  });
  if (r1) passed++; else failed++;

  // 2. onboarding progress without auth returns 401
  const r2 = await test('POST /api/onboarding/progress (no auth) → 401', async () => {
    const res = await fetch(`${BASE}/api/onboarding/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ maxUnlockedSlide: 19 }),
    });
    if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
  });
  if (r2) passed++; else failed++;

  // 3. get-user-data response shape (when 200) includes new fields
  const r3 = await test('GET /api/topics/get-user-data response shape (if 200)', async () => {
    const res = await fetch(`${BASE}/api/topics/get-user-data`, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 200) {
      if (typeof data.hasCompletedOnboarding !== 'boolean' && data.hasCompletedOnboarding !== undefined)
        throw new Error('missing or invalid hasCompletedOnboarding');
      if (typeof data.hasAccess !== 'boolean' && data.hasAccess !== undefined)
        throw new Error('missing or invalid hasAccess');
      if (!('resumeSlide' in data)) throw new Error('missing resumeSlide');
    }
    // 401 is also ok (no session)
    if (res.status !== 200 && res.status !== 401) throw new Error(`unexpected status ${res.status}`);
  });
  if (r3) passed++; else failed++;

  // 4. availability/save without auth: 401 (prod) or 2xx (dev may use dev user)
  const r4 = await test('POST /api/availability/save (no auth) → 401 or 2xx', async () => {
    const res = await fetch(`${BASE}/api/availability/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({
        timePreferences: {
          weekdayEarliest: '09:00',
          weekdayLatest: '17:00',
          useSameWeekendTimes: true,
          weekendEarliest: '09:00',
          weekendLatest: '17:00',
        },
      }),
    });
    if (res.status !== 401 && (res.status < 200 || res.status >= 300))
      throw new Error(`expected 401 or 2xx, got ${res.status}`);
  });
  if (r4) passed++; else failed++;

  console.log('\n---');
  console.log(`Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
