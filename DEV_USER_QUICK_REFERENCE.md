# Dev User System - Quick Reference

## 🎯 One-Page Cheat Sheet

### Access Dev Tools
```
http://localhost:3000/dev-tools
```

---

## 🔑 Grant Access
**Button:** "🔓 Grant Full Access"

**What it does:** Gives you `has_access: true` without payment

**When to use:** First step after creating account

---

## 🗑️ Reset Plan
**Button:** "🗑️ Delete All Blocks"

**What it deletes:**
- ✅ All blocks (scheduled, done, missed)

**What it keeps:**
- ✅ Ratings
- ✅ Onboarding data
- ✅ Time preferences
- ✅ Blocked times

**When to use:**
- Testing plan generation
- Want fresh schedule with same ratings
- Testing scheduling algorithms

**Time:** ~1 second

---

## 🔄 Reset Onboarding
**Button:** "🔄 Reset Onboarding"

**What it deletes:**
- ✅ All ratings
- ✅ Onboarding status
- ✅ Time preferences

**What it keeps:**
- ✅ All blocks
- ✅ Blocked times
- ✅ Account info

**When to use:**
- Testing onboarding flow
- Want to change subjects
- Testing rating system

**Time:** ~1 second

---

## 💣 Full Reset
**Button:** "💣 Full Reset (Delete Everything)"

**What it deletes:**
- ✅ ALL blocks
- ✅ ALL ratings
- ✅ Onboarding data
- ✅ Time preferences
- ✅ Blocked times
- ✅ Repeatable events
- ✅ Week preferences
- ✅ Access status
- ✅ Stripe data
- ✅ Logs

**What it keeps:**
- ✅ Email
- ✅ Name

**When to use:**
- Starting completely fresh
- Testing entire flow from scratch

**Time:** ~2 seconds + page reload

---

## ⏰ Time Override
**Section:** "⏰ Time Override (Testing)"

**Quick Presets:**
- Monday 2 PM
- Tuesday 10 PM
- Sunday 3 PM
- Sunday 10 PM
- Friday 5 PM
- Saturday 11 PM

**Custom Time:** Enter any date/time

**Reset:** "Use Real Time" button

**When to use:**
- Testing time-based restrictions
- Testing day-of-week logic
- Testing deadline checks

---

## 🎮 Common Workflows

### Workflow 1: Quick Plan Testing
```
1. Grant Access
2. Complete Onboarding
3. Generate Plan
4. Test Features
5. Reset Plan ← Fast!
6. Generate New Plan
7. Repeat
```

### Workflow 2: Onboarding Testing
```
1. Grant Access
2. Complete Onboarding (subjects A, B, C)
3. Generate Plan
4. Reset Onboarding ← Fast!
5. Complete Onboarding (subjects X, Y, Z)
6. Generate New Plan
```

### Workflow 3: Time-Based Testing
```
1. Set Time Override (Sunday 10 PM)
2. Try to Generate Plan (should fail)
3. Reset Plan
4. Set Time Override (Monday 2 PM)
5. Generate Plan (should succeed)
6. Use Real Time
```

### Workflow 4: Fresh Start
```
1. Full Reset
2. Grant Access
3. Complete Onboarding
4. Generate Plan
5. Test Everything
```

---

## 🚨 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Button not working | Check you're on localhost, refresh page |
| "Dev mode only" error | Verify `NODE_ENV=development` |
| Data not clearing | Try Full Reset, check console |
| Page not reloading | Manually refresh |

---

## 💡 Pro Tips

1. **Use Reset Plan for iterations** - Fastest way to test different plans
2. **Combine with Time Override** - Powerful testing combo
3. **Grant Access first** - Always first step
4. **Full Reset = Nuclear option** - Only when you need it
5. **Check console** - Errors show in browser console

---

## 📊 What Each Reset Does

| Feature | Reset Plan | Reset Onboarding | Full Reset |
|---------|-----------|------------------|------------|
| Blocks | ✅ Delete | ❌ Keep | ✅ Delete |
| Ratings | ❌ Keep | ✅ Delete | ✅ Delete |
| Onboarding | ❌ Keep | ✅ Reset | ✅ Reset |
| Time Prefs | ❌ Keep | ✅ Clear | ✅ Clear |
| Blocked Times | ❌ Keep | ❌ Keep | ✅ Delete |
| Events | ❌ Keep | ❌ Keep | ✅ Delete |
| Access | ❌ Keep | ❌ Keep | ✅ Revoke |
| Account | ❌ Keep | ❌ Keep | ❌ Keep |

---

## 🎯 Decision Tree

```
Need to test plan generation with same ratings?
└─ Use: Reset Plan

Need to change subjects or re-rate topics?
└─ Use: Reset Onboarding

Need to test entire flow from scratch?
└─ Use: Full Reset

Need to test time-based features?
└─ Use: Time Override (no reset needed)

Need to test different blocked times?
└─ Use: Reset Plan (or Full Reset if needed)
```

---

## ⚡ Keyboard Shortcuts (Future Enhancement)

```
Ctrl/Cmd + Shift + R → Reset Plan
Ctrl/Cmd + Shift + O → Reset Onboarding
Ctrl/Cmd + Shift + F → Full Reset (with confirmation)
Ctrl/Cmd + Shift + T → Toggle Time Override
```

---

## 📝 Testing Checklist

Before committing changes:

- [ ] Test with fresh user (Full Reset)
- [ ] Test with existing user (Reset Plan)
- [ ] Test onboarding flow (Reset Onboarding)
- [ ] Test time restrictions (Time Override)
- [ ] Test edge cases
- [ ] Clear all overrides
- [ ] Document any issues

---

## 🔗 Related Documentation

- **Full Guide:** `DEV_USER_SYSTEM.md`
- **Time Override:** `TIME_OVERRIDE_FEATURE.md`
- **Time Override Examples:** `TIME_OVERRIDE_USAGE_EXAMPLES.md`
- **Time Override Quick Start:** `TIME_OVERRIDE_QUICK_START.md`

---

## 🎉 Quick Start (30 seconds)

```bash
1. Go to http://localhost:3000/dev-tools
2. Click "Grant Full Access"
3. Complete onboarding
4. Generate plan
5. Test features
6. Click "Reset Plan" when done
7. Repeat!
```

**That's it!** No more manual database resets. 🚀
