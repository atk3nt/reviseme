# Time Override Feature for Development Testing

## Overview
The Time Override feature allows developers to test time-based logic (like same-day plan generation, scheduling features, etc.) by simulating different dates and times without changing system time.

## How It Works

### 1. Helper Functions (`/libs/dev-helpers.js`)

The core functionality is provided by these functions:

- **`getEffectiveDate()`** - Returns the current date/time, or the overridden date if set in dev mode
- **`isTimeOverridden()`** - Checks if time is currently overridden
- **`setTimeOverride(isoString)`** - Sets a time override
- **`clearTimeOverride()`** - Clears the time override
- **`formatDevDate(date)`** - Formats dates for display in dev tools

### 2. Dev Tools Interface (`/app/dev-tools/page.js`)

Access the time override UI at: **http://localhost:3000/dev-tools**

The interface includes:

#### Warning Banner
When time is overridden, a prominent amber warning banner appears at the top:
```
⚠️ TIME OVERRIDE ACTIVE
Using test time instead of real time
```

#### Current Time Display
Shows the effective current time (real or overridden) with day of week, date, and time.

#### Quick Preset Buttons
Six common test scenarios:
- **Monday 2 PM** - `2024-01-08T14:00:00`
- **Tuesday 10 PM** - `2024-01-09T22:00:00`
- **Sunday 3 PM** - `2024-01-07T15:00:00`
- **Sunday 10 PM** - `2024-01-07T22:00:00`
- **Friday 5 PM** - `2024-01-12T17:00:00`
- **Saturday 11 PM** - `2024-01-13T23:00:00`

#### Custom Time Input
HTML5 datetime-local input for setting any custom date/time.

#### Reset Button
"Use Real Time" button to clear the override and return to real time.

## Using in Your Code

### Replace `new Date()` with `getEffectiveDate()`

**Before:**
```javascript
const now = new Date();
const currentHour = now.getHours();
```

**After:**
```javascript
import { getEffectiveDate } from '@/libs/dev-helpers';

const now = getEffectiveDate();
const currentHour = now.getHours();
```

### Example: Testing Same-Day Plan Generation

```javascript
import { getEffectiveDate } from '@/libs/dev-helpers';

function canGeneratePlanToday() {
  const now = getEffectiveDate(); // Uses overridden time in dev mode
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  
  // Can't generate on Sunday after 10 PM
  if (dayOfWeek === 0 && hour >= 22) {
    return false;
  }
  
  return true;
}
```

## Security Features

1. **Development Only** - Time override only works when:
   - Hostname is `localhost` or `127.0.0.1`
   - OR `NODE_ENV === 'development'`

2. **Production Safety** - In production, `getEffectiveDate()` always returns real time, regardless of localStorage

3. **Server-Side Safety** - On server-side rendering, always returns real time

## Testing Workflow

### Example: Testing Sunday 10 PM Restriction

1. Go to http://localhost:3000/dev-tools
2. Click "Sunday 10 PM" preset button
3. Navigate to the plan generation page
4. Verify that same-day plan generation is blocked
5. Click "Use Real Time" to reset

### Example: Testing Custom Scenario

1. Go to http://localhost:3000/dev-tools
2. Enter a custom date/time in the input field (e.g., `2024-03-15T09:30`)
3. Click "Set Custom Time"
4. Test your time-based feature
5. Click "Use Real Time" when done

## Implementation Details

### LocalStorage Key
Time override is stored in: `localStorage.devTimeOverride`

### Format
ISO 8601 string format: `YYYY-MM-DDTHH:MM:SS`

Example: `2024-01-07T22:00:00`

### Auto-Update
The dev tools page updates the current time display every second to show the effective time.

## Best Practices

1. **Always Clear Override After Testing** - Don't forget to click "Use Real Time" when done testing
2. **Document Test Scenarios** - When adding new time-based features, add relevant preset buttons
3. **Use Consistent Dates** - The preset dates are in January 2024 for consistency
4. **Test Edge Cases** - Use the custom input to test boundary conditions (midnight, end of month, etc.)

## Troubleshooting

### Time Override Not Working
- Check that you're in development mode (localhost)
- Check browser console for errors
- Clear localStorage and try again: `localStorage.removeItem('devTimeOverride')`

### Time Not Updating
- Refresh the page
- Check that you're using `getEffectiveDate()` instead of `new Date()`

### Production Concerns
- Time override is automatically disabled in production
- No need to remove dev-helpers imports from production code
