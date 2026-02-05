# Time Override Feature - Quick Start Guide

## 🚀 Quick Start (5 Minutes)

### Step 1: Access Dev Tools
Open your browser and navigate to:
```
http://localhost:3000/dev-tools
```

### Step 2: Set a Time Override
Click any preset button, for example:
- **"Sunday 10 PM"** - to test Sunday night restrictions

You'll see:
1. A yellow warning banner at the top
2. The current time display shows "Sunday, January 7, 2024 at 10:00 PM"
3. The reset button turns amber

### Step 3: Test Your Feature
Navigate to the feature you want to test. The app will now behave as if it's Sunday at 10 PM.

### Step 4: Clear Override
When done testing, click the amber **"Use Real Time"** button.

---

## 📝 Common Test Scenarios

### Scenario 1: Test Sunday 10 PM Restriction

**Goal:** Verify that plan generation is blocked on Sunday after 10 PM.

**Steps:**
1. Go to `/dev-tools`
2. Click **"Sunday 10 PM"**
3. Navigate to plan generation page
4. ✅ Verify: Plan generation should be blocked
5. Click **"Use Real Time"**

---

### Scenario 2: Test Weekday vs Weekend Behavior

**Goal:** Verify different behavior on weekdays vs weekends.

**Steps:**
1. Go to `/dev-tools`
2. Click **"Monday 2 PM"**
3. Test weekday behavior
4. Go back to `/dev-tools`
5. Click **"Sunday 3 PM"**
6. Test weekend behavior
7. Click **"Use Real Time"**

---

### Scenario 3: Test Custom Time

**Goal:** Test a specific date/time not covered by presets.

**Steps:**
1. Go to `/dev-tools`
2. In the "Custom Time" field, enter: `2024-03-15T09:30`
3. Click **"Set Custom Time"**
4. Test your feature
5. Click **"Use Real Time"**

---

## 💻 Using in Your Code

### Before (without time override):
```javascript
function checkDeadline() {
  const now = new Date();
  const hour = now.getHours();
  
  if (hour >= 22) {
    return "Too late to generate plan";
  }
  return "OK";
}
```

### After (with time override support):
```javascript
import { getEffectiveDate } from '@/libs/dev-helpers';

function checkDeadline() {
  const now = getEffectiveDate(); // 👈 Changed this line
  const hour = now.getHours();
  
  if (hour >= 22) {
    return "Too late to generate plan";
  }
  return "OK";
}
```

**That's it!** Just replace `new Date()` with `getEffectiveDate()`.

---

## 🎯 Available Preset Times

| Button | Date/Time | Use Case |
|--------|-----------|----------|
| **Monday 2 PM** | 2024-01-08 14:00 | Test weekday afternoon |
| **Tuesday 10 PM** | 2024-01-09 22:00 | Test late evening |
| **Sunday 3 PM** | 2024-01-07 15:00 | Test Sunday afternoon |
| **Sunday 10 PM** | 2024-01-07 22:00 | Test Sunday night restriction |
| **Friday 5 PM** | 2024-01-12 17:00 | Test end of work week |
| **Saturday 11 PM** | 2024-01-13 23:00 | Test Saturday night |

---

## ⚠️ Important Notes

### ✅ DO:
- Clear override after testing (click "Use Real Time")
- Use presets for common scenarios
- Use custom time for edge cases
- Test both allowed and restricted times

### ❌ DON'T:
- Forget to clear override (it persists across page refreshes)
- Use in production (automatically disabled)
- Assume server-side code is affected (only client-side)

---

## 🐛 Troubleshooting

### Problem: Time override not working
**Solution:** 
1. Check you're on `localhost` (not production)
2. Check browser console for errors
3. Try clearing localStorage: `localStorage.clear()`
4. Refresh the page

### Problem: Time not updating
**Solution:**
1. Refresh the page
2. Check that you're using `getEffectiveDate()` not `new Date()`
3. Check browser console for errors

### Problem: Override persists after clearing
**Solution:**
1. Manually clear: `localStorage.removeItem('devTimeOverride')`
2. Or clear all: `localStorage.clear()`
3. Refresh the page

---

## 📚 More Information

- **Full Documentation:** `TIME_OVERRIDE_FEATURE.md`
- **Code Examples:** `TIME_OVERRIDE_USAGE_EXAMPLES.md`
- **UI Reference:** `TIME_OVERRIDE_UI_REFERENCE.md`
- **Implementation Details:** `TIME_OVERRIDE_IMPLEMENTATION_SUMMARY.md`

---

## 🎓 Example: Testing Same-Day Plan Generation

Let's test the rule: "Can't generate plans on Sunday after 10 PM"

### Test Case 1: Sunday 9:59 PM (Should Allow)
```javascript
// 1. Set time override
Go to /dev-tools
Enter custom time: 2024-01-07T21:59
Click "Set Custom Time"

// 2. Test
Navigate to plan generation
✅ Should allow plan generation

// 3. Clean up
Click "Use Real Time"
```

### Test Case 2: Sunday 10:00 PM (Should Block)
```javascript
// 1. Set time override
Go to /dev-tools
Click "Sunday 10 PM"

// 2. Test
Navigate to plan generation
✅ Should block plan generation
✅ Should show appropriate message

// 3. Clean up
Click "Use Real Time"
```

### Test Case 3: Monday 12:01 AM (Should Allow)
```javascript
// 1. Set time override
Go to /dev-tools
Enter custom time: 2024-01-08T00:01
Click "Set Custom Time"

// 2. Test
Navigate to plan generation
✅ Should allow plan generation (new day)

// 3. Clean up
Click "Use Real Time"
```

---

## 🔥 Pro Tips

1. **Keep Dev Tools Open:** Open `/dev-tools` in a separate tab for quick access

2. **Use Browser Console:** Check `localStorage.devTimeOverride` to see current override:
   ```javascript
   localStorage.getItem('devTimeOverride')
   ```

3. **Quick Reset:** Clear override from console:
   ```javascript
   localStorage.removeItem('devTimeOverride')
   ```

4. **Check Override Status:** From console:
   ```javascript
   import { isTimeOverridden } from '@/libs/dev-helpers';
   console.log(isTimeOverridden());
   ```

5. **Test Edge Cases:** Use custom time input for:
   - Midnight transitions (23:59, 00:00, 00:01)
   - End of month (28, 29, 30, 31)
   - Daylight saving time changes
   - Leap year dates (Feb 29)

---

## ✨ That's It!

You're ready to test time-based features. Remember:
1. Set time override in dev tools
2. Test your feature
3. Clear override when done

Happy testing! 🎉
