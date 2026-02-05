# Time Override Feature for Development Testing

## 📖 Overview

The Time Override feature allows developers to test time-based logic by simulating different dates and times without changing system time. This is essential for testing features like:

- Same-day plan generation restrictions
- Business hours validation
- Weekend vs weekday behavior
- Deadline checks
- Time-based UI changes
- Scheduled events

**Key Features:**
- ✅ Development-only (automatically disabled in production)
- ✅ Easy-to-use UI with preset buttons
- ✅ Custom time input for edge cases
- ✅ Visual warnings when override is active
- ✅ Persistent across page refreshes
- ✅ Simple API: just replace `new Date()` with `getEffectiveDate()`

---

## 🚀 Quick Start

### 1. Access the Dev Tools
```
http://localhost:3000/dev-tools
```

### 2. Set a Time Override
Click any preset button (e.g., "Sunday 10 PM") or enter a custom time.

### 3. Test Your Feature
Navigate to the feature you want to test. The app will behave as if it's the overridden time.

### 4. Clear Override
Click "Use Real Time" when done.

**👉 For detailed quick start guide, see:** [`TIME_OVERRIDE_QUICK_START.md`](./TIME_OVERRIDE_QUICK_START.md)

---

## 📁 Documentation Files

| File | Description |
|------|-------------|
| **[TIME_OVERRIDE_QUICK_START.md](./TIME_OVERRIDE_QUICK_START.md)** | 5-minute quick start guide with common scenarios |
| **[TIME_OVERRIDE_FEATURE.md](./TIME_OVERRIDE_FEATURE.md)** | Complete feature documentation and technical details |
| **[TIME_OVERRIDE_USAGE_EXAMPLES.md](./TIME_OVERRIDE_USAGE_EXAMPLES.md)** | Practical code examples and patterns |
| **[TIME_OVERRIDE_UI_REFERENCE.md](./TIME_OVERRIDE_UI_REFERENCE.md)** | Visual UI layout and design reference |
| **[TIME_OVERRIDE_IMPLEMENTATION_SUMMARY.md](./TIME_OVERRIDE_IMPLEMENTATION_SUMMARY.md)** | Implementation details and testing checklist |

---

## 💻 Implementation Files

### Core Library: `/libs/dev-helpers.js`

```javascript
import { getEffectiveDate } from '@/libs/dev-helpers';

// Instead of: const now = new Date();
const now = getEffectiveDate(); // Uses overridden time in dev mode
```

**Available Functions:**
- `getEffectiveDate()` - Get current or overridden date
- `isTimeOverridden()` - Check if time is overridden
- `setTimeOverride(isoString)` - Set time override
- `clearTimeOverride()` - Clear time override
- `formatDevDate(date)` - Format date for display

### UI: `/app/dev-tools/page.js`

The dev tools page includes a complete Time Override section with:
- Warning banner when override is active
- Current time display (updates every second)
- 6 quick preset buttons
- Custom datetime input
- Reset button

---

## 🎯 Available Preset Times

| Preset Button | Date/Time | ISO Format | Use Case |
|---------------|-----------|------------|----------|
| Monday 2 PM | Jan 8, 2024 2:00 PM | `2024-01-08T14:00:00` | Weekday afternoon |
| Tuesday 10 PM | Jan 9, 2024 10:00 PM | `2024-01-09T22:00:00` | Late evening |
| Sunday 3 PM | Jan 7, 2024 3:00 PM | `2024-01-07T15:00:00` | Sunday afternoon |
| Sunday 10 PM | Jan 7, 2024 10:00 PM | `2024-01-07T22:00:00` | Sunday night restriction |
| Friday 5 PM | Jan 12, 2024 5:00 PM | `2024-01-12T17:00:00` | End of work week |
| Saturday 11 PM | Jan 13, 2024 11:00 PM | `2024-01-13T23:00:00` | Saturday night |

---

## 🔒 Security Features

### Development Only
Time override **only works** when:
- Hostname is `localhost` or `127.0.0.1`
- OR `NODE_ENV === 'development'`

### Production Safety
- In production, `getEffectiveDate()` **always** returns real time
- No way to override time in production environment
- Explicit hostname check excludes production domains

### Server-Side Safety
- Server-side rendering always uses real time
- No localStorage access on server

---

## 📝 Usage Example

### Before (without time override):
```javascript
function canGeneratePlanToday() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  
  // Can't generate on Sunday after 10 PM
  if (dayOfWeek === 0 && hour >= 22) {
    return false;
  }
  
  return true;
}
```

### After (with time override support):
```javascript
import { getEffectiveDate } from '@/libs/dev-helpers';

function canGeneratePlanToday() {
  const now = getEffectiveDate(); // 👈 Just change this line!
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  
  // Can't generate on Sunday after 10 PM
  if (dayOfWeek === 0 && hour >= 22) {
    return false;
  }
  
  return true;
}
```

### Testing:
1. Go to `/dev-tools`
2. Click "Sunday 10 PM"
3. Run `canGeneratePlanToday()` → Returns `false` ✅
4. Click "Sunday 3 PM"
5. Run `canGeneratePlanToday()` → Returns `true` ✅

---

## 🎓 Common Test Scenarios

### Scenario 1: Test Time Restriction
**Goal:** Verify feature is blocked at certain times

```javascript
// 1. Set time to restricted period
Go to /dev-tools → Click "Sunday 10 PM"

// 2. Test
Navigate to feature → Should be blocked ✅

// 3. Set time to allowed period
Go to /dev-tools → Click "Monday 2 PM"

// 4. Test
Navigate to feature → Should be allowed ✅

// 5. Clean up
Click "Use Real Time"
```

### Scenario 2: Test Edge Cases
**Goal:** Test boundary conditions

```javascript
// Test just before restriction (Sunday 9:59 PM)
Set custom time: 2024-01-07T21:59
Test → Should be allowed ✅

// Test at restriction start (Sunday 10:00 PM)
Set custom time: 2024-01-07T22:00
Test → Should be blocked ✅

// Test after restriction ends (Monday 12:01 AM)
Set custom time: 2024-01-08T00:01
Test → Should be allowed ✅
```

### Scenario 3: Test Weekday vs Weekend
**Goal:** Verify different behavior by day of week

```javascript
// Test weekday
Click "Monday 2 PM" → Test weekday logic ✅

// Test weekend
Click "Sunday 3 PM" → Test weekend logic ✅
```

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Time override not working | Check you're on localhost, refresh page, clear localStorage |
| Time not updating | Use `getEffectiveDate()` instead of `new Date()` |
| Override persists after clearing | Manually clear: `localStorage.removeItem('devTimeOverride')` |
| Server-side not affected | Expected behavior - override only affects client-side |

---

## ⚠️ Important Notes

### ✅ DO:
- Replace `new Date()` with `getEffectiveDate()` in time-sensitive code
- Clear override after testing
- Use presets for common scenarios
- Use custom time for edge cases
- Test both allowed and restricted times

### ❌ DON'T:
- Forget to clear override (persists across refreshes)
- Worry about production (automatically disabled)
- Expect server-side code to be affected (client-only)
- Use for non-time-based testing

---

## 📚 API Reference

### `getEffectiveDate()`
Returns the current date, or overridden date in development mode.

```javascript
import { getEffectiveDate } from '@/libs/dev-helpers';

const now = getEffectiveDate();
console.log(now); // Date object (real or overridden)
```

### `isTimeOverridden()`
Checks if time is currently overridden.

```javascript
import { isTimeOverridden } from '@/libs/dev-helpers';

if (isTimeOverridden()) {
  console.log('Using test time');
}
```

### `setTimeOverride(isoString)`
Sets a time override (usually called by UI).

```javascript
import { setTimeOverride } from '@/libs/dev-helpers';

setTimeOverride('2024-01-07T22:00:00');
```

### `clearTimeOverride()`
Clears the time override (usually called by UI).

```javascript
import { clearTimeOverride } from '@/libs/dev-helpers';

clearTimeOverride();
```

### `formatDevDate(date)`
Formats a date for display in dev tools.

```javascript
import { formatDevDate } from '@/libs/dev-helpers';

const formatted = formatDevDate(new Date());
console.log(formatted); // "Sunday, January 7, 2024 at 10:30 PM"
```

---

## 🎨 UI Components

### Warning Banner
Appears at top of dev tools when time is overridden:
```
⚠️ TIME OVERRIDE ACTIVE
Using test time instead of real time
```

### Current Time Display
Shows effective time with day of week:
```
Current Time:
Sunday, January 7, 2024 at 10:30 PM
(OVERRIDDEN)
```

### Preset Buttons
6 quick-access buttons for common test scenarios

### Custom Time Input
HTML5 datetime-local input for any date/time

### Reset Button
- Amber when override is active: "🔄 Use Real Time (Clear Override)"
- Gray when no override: "✓ Using Real Time"

---

## 🔧 Technical Details

### Storage
- Uses `localStorage.devTimeOverride`
- Stores ISO 8601 date string
- Persists across page refreshes
- Cleared manually or by reset button

### Format
- ISO 8601: `YYYY-MM-DDTHH:MM:SS`
- Example: `2024-01-07T22:00:00`

### Updates
- Dev tools UI updates every second
- Shows real-time clock when no override
- Shows static time when override is active

### Browser Support
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires localStorage API
- Requires HTML5 datetime-local input

---

## 🚀 Getting Started Checklist

- [ ] Read [Quick Start Guide](./TIME_OVERRIDE_QUICK_START.md)
- [ ] Access dev tools at `http://localhost:3000/dev-tools`
- [ ] Try a preset button (e.g., "Sunday 10 PM")
- [ ] Verify warning banner appears
- [ ] Check current time display shows overridden time
- [ ] Navigate to a feature and test time-based logic
- [ ] Click "Use Real Time" to clear override
- [ ] Identify time-based code in your app
- [ ] Replace `new Date()` with `getEffectiveDate()`
- [ ] Test with various time scenarios

---

## 📞 Support

For questions or issues:
1. Check the [Quick Start Guide](./TIME_OVERRIDE_QUICK_START.md)
2. Review [Usage Examples](./TIME_OVERRIDE_USAGE_EXAMPLES.md)
3. Check [Feature Documentation](./TIME_OVERRIDE_FEATURE.md)
4. Review implementation in `/libs/dev-helpers.js`

---

## 📄 License

This feature is part of the ShipFast SaaS boilerplate.

---

**Happy Testing! 🎉**

Remember: Always clear your time override when done testing!
