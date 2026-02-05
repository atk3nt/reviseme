# Time Override Usage Examples

This document provides practical examples of how to use the Time Override feature in your code.

## Basic Usage

### Example 1: Simple Date Check

**Before (without time override):**
```javascript
function isWeekend() {
  const now = new Date();
  const day = now.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}
```

**After (with time override support):**
```javascript
import { getEffectiveDate } from '@/libs/dev-helpers';

function isWeekend() {
  const now = getEffectiveDate(); // Uses overridden time in dev mode
  const day = now.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}
```

### Example 2: Time-Based Feature Toggle

**Before:**
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

**After:**
```javascript
import { getEffectiveDate } from '@/libs/dev-helpers';

function canGeneratePlanToday() {
  const now = getEffectiveDate();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  
  // Can't generate on Sunday after 10 PM
  if (dayOfWeek === 0 && hour >= 22) {
    return false;
  }
  
  return true;
}
```

## React Component Examples

### Example 3: Displaying Time-Based UI

```javascript
"use client";

import { useState, useEffect } from 'react';
import { getEffectiveDate, isTimeOverridden } from '@/libs/dev-helpers';

export default function TimeBasedFeature() {
  const [canGenerate, setCanGenerate] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const checkTime = () => {
      const now = getEffectiveDate();
      setCurrentTime(now);
      
      const dayOfWeek = now.getDay();
      const hour = now.getHours();
      
      // Can't generate on Sunday after 10 PM
      setCanGenerate(!(dayOfWeek === 0 && hour >= 22));
    };
    
    checkTime();
    const interval = setInterval(checkTime, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div>
      {isTimeOverridden() && (
        <div className="bg-amber-100 border border-amber-500 p-3 rounded mb-4">
          ⚠️ Using test time for development
        </div>
      )}
      
      <h2>Current Time: {currentTime.toLocaleString()}</h2>
      
      {canGenerate ? (
        <button className="btn btn-primary">
          Generate Plan for Today
        </button>
      ) : (
        <div className="alert alert-warning">
          Plan generation is not available on Sunday after 10 PM.
          Plans for tomorrow will be available after midnight.
        </div>
      )}
    </div>
  );
}
```

### Example 4: API Route with Time Logic

```javascript
import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { getEffectiveDate } from "@/libs/dev-helpers";

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const now = getEffectiveDate(); // Uses overridden time in dev mode
    const dayOfWeek = now.getDay();
    const hour = now.getHours();
    
    // Check if plan generation is allowed
    if (dayOfWeek === 0 && hour >= 22) {
      return NextResponse.json(
        { 
          error: "Plan generation not available on Sunday after 10 PM",
          nextAvailable: "tomorrow at midnight"
        },
        { status: 403 }
      );
    }
    
    // Generate plan logic here...
    
    return NextResponse.json({ 
      success: true,
      generatedAt: now.toISOString()
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
```

## Testing Scenarios

### Scenario 1: Testing Sunday 10 PM Restriction

1. **Set time override:**
   - Go to `/dev-tools`
   - Click "Sunday 10 PM" button

2. **Test the feature:**
   - Navigate to plan generation page
   - Verify that the "Generate Plan" button is disabled
   - Verify that appropriate warning message is shown

3. **Test edge case (Sunday 9:59 PM):**
   - Go to `/dev-tools`
   - Set custom time: `2024-01-07T21:59`
   - Verify that plan generation is still allowed

4. **Test edge case (Monday 12:01 AM):**
   - Go to `/dev-tools`
   - Set custom time: `2024-01-08T00:01`
   - Verify that plan generation is allowed again

5. **Reset:**
   - Click "Use Real Time" button

### Scenario 2: Testing Day-of-Week Logic

```javascript
import { getEffectiveDate } from '@/libs/dev-helpers';

function getWeekdayName() {
  const now = getEffectiveDate();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[now.getDay()];
}

// Test each day:
// 1. Set "Monday 2 PM" → Should return "Monday"
// 2. Set "Tuesday 10 PM" → Should return "Tuesday"
// 3. Set "Sunday 3 PM" → Should return "Sunday"
// etc.
```

### Scenario 3: Testing Time Ranges

```javascript
import { getEffectiveDate } from '@/libs/dev-helpers';

function isBusinessHours() {
  const now = getEffectiveDate();
  const hour = now.getHours();
  const day = now.getDay();
  
  // Monday-Friday, 9 AM - 5 PM
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
}

// Test cases:
// 1. Set "Monday 2 PM" (14:00) → Should return true
// 2. Set "Friday 5 PM" (17:00) → Should return false (after 5 PM)
// 3. Set "Saturday 11 PM" → Should return false (weekend)
// 4. Set custom "2024-01-08T08:59" → Should return false (before 9 AM)
```

## Advanced Usage

### Example 5: Showing Override Status in UI

```javascript
"use client";

import { isTimeOverridden, getEffectiveDate } from '@/libs/dev-helpers';

export default function Header() {
  const showDevWarning = isTimeOverridden();
  
  if (!showDevWarning) return null;
  
  return (
    <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm">
      ⚠️ Development Mode: Time Override Active ({getEffectiveDate().toLocaleString()})
    </div>
  );
}
```

### Example 6: Conditional Logic Based on Time

```javascript
import { getEffectiveDate } from '@/libs/dev-helpers';

function getGreeting() {
  const now = getEffectiveDate();
  const hour = now.getHours();
  
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getStudyRecommendation() {
  const now = getEffectiveDate();
  const hour = now.getHours();
  const day = now.getDay();
  
  // Weekend morning
  if ((day === 0 || day === 6) && hour < 12) {
    return "Great time for a focused study session!";
  }
  
  // Weekday evening
  if (day >= 1 && day <= 5 && hour >= 18) {
    return "Review today's topics before bed.";
  }
  
  // Late night
  if (hour >= 22 || hour < 6) {
    return "Consider getting some rest. Tomorrow is a new day!";
  }
  
  return "Keep up the good work!";
}
```

## Best Practices

1. **Always use `getEffectiveDate()` instead of `new Date()`** when the date/time affects business logic
2. **Keep time-based logic testable** by extracting it into separate functions
3. **Document time-based features** with comments explaining the logic
4. **Test edge cases** using custom time inputs (midnight, end of day, etc.)
5. **Clear overrides after testing** to avoid confusion

## Common Pitfalls

### ❌ Don't do this:
```javascript
// Using new Date() directly in time-sensitive code
function checkDeadline() {
  const now = new Date(); // Won't respect time override
  // ...
}
```

### ✅ Do this instead:
```javascript
import { getEffectiveDate } from '@/libs/dev-helpers';

function checkDeadline() {
  const now = getEffectiveDate(); // Respects time override in dev mode
  // ...
}
```

### ❌ Don't do this:
```javascript
// Forgetting to update time periodically
const [time] = useState(getEffectiveDate()); // Only set once
```

### ✅ Do this instead:
```javascript
const [time, setTime] = useState(getEffectiveDate());

useEffect(() => {
  const interval = setInterval(() => {
    setTime(getEffectiveDate());
  }, 60000); // Update every minute
  
  return () => clearInterval(interval);
}, []);
```
