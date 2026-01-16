# Rescheduled Blocks - Grey Out Solution

## Date: January 12, 2026

## The Better Approach

Instead of trying to remove the old block (which was causing duplicates), we now **keep the old block and grey it out** with a "Rescheduled" badge. This provides:

1. ✅ **Better UX** - User sees what happened
2. ✅ **Visual history** - Can see the original time slot
3. ✅ **Simpler code** - No complex removal logic
4. ✅ **No duplicates issue** - Both blocks exist intentionally

---

## How It Works

### Backend Changes

**Old Approach (Caused Issues):**
```javascript
// Update existing block - caused React key issues
UPDATE blocks SET scheduled_at = newTime WHERE id = blockId
```

**New Approach (Clean):**
```javascript
// 1. Create NEW block at new time
INSERT INTO blocks (scheduled_at = newTime, status = 'scheduled')

// 2. Mark OLD block as rescheduled
UPDATE blocks SET status = 'rescheduled' WHERE id = oldBlockId
```

### Frontend Changes

**Block Statuses:**
- `scheduled` - Normal block (clickable, colored)
- `done` - Completed block (green, slightly faded)
- `missed` - Missed block (red, slightly faded)
- `rescheduled` - **NEW** - Rescheduled block (grey, line-through, badge)

---

## Visual Design

### TodayView (List View)

**Rescheduled Block:**
```
┌─────────────────────────────────────┐
│ ↪️ Rescheduled to Wed 5:00 PM       │ ← Badge
│ ─────────────────────────────────   │
│ 🔵 Mathematics                       │ ← Line-through
│ Quadratic Equations                  │ ← Line-through
│ 3:30 PM • 30 minutes                 │ ← Line-through
└─────────────────────────────────────┘
   Grey background, 50% opacity
   Non-clickable
```

**New Block (at 5:00 PM):**
```
┌─────────────────────────────────────┐
│ 🔵 Mathematics                       │
│ Quadratic Equations                  │
│ 5:00 PM • 30 minutes                 │
└─────────────────────────────────────┘
   Normal styling
   Clickable
```

### WeekView (Calendar View)

**Rescheduled Block (Small Card):**
```
┌──────────┐
│ ↪️       │ ← Badge
│ ─────    │
│ 🔵 📚 ✓  │ ← Line-through
│ Quadratic│ ← Line-through
│ 3:30 PM  │ ← Line-through
└──────────┘
   Grey, 50% opacity
```

---

## Implementation Details

### Backend: `/api/plan/mark-missed/route.js`

#### Step 1: Create New Block
```javascript
const { data: newBlock } = await supabaseAdmin
  .from('blocks')
  .insert({
    user_id: userId,
    topic_id: block.topic_id,
    scheduled_at: newTime,
    duration_minutes: block.duration_minutes,
    status: 'scheduled',
    // Copy all relevant fields from old block
  })
  .select()
  .single();
```

#### Step 2: Mark Old Block as Rescheduled
```javascript
await supabaseAdmin
  .from('blocks')
  .update({
    status: 'rescheduled',
    ai_rationale: `Rescheduled to ${newTime} (Block ID: ${newBlock.id})`
  })
  .eq('id', oldBlockId);
```

#### Step 3: Return Both IDs
```javascript
return NextResponse.json({
  success: true,
  rescheduled: true,
  oldBlockId: oldBlockId,
  newBlockId: newBlock.id,
  newTime: newTime
});
```

### Frontend: `/app/plan/page.js`

#### Step 1: Update State
```javascript
// Mark old block as rescheduled
const updated = prev.map(b => 
  b.id === oldBlockId 
    ? { ...b, status: 'rescheduled', rescheduledTo: newTime }
    : b
);

// Add new block
const withNewBlock = [...updated, newBlock].sort(...);
```

#### Step 2: Style Rescheduled Blocks
```javascript
const isRescheduled = block.status === 'rescheduled';

<div className={`
  ${isRescheduled 
    ? 'opacity-50 bg-gray-100 cursor-default' 
    : 'cursor-pointer hover:shadow-md'
  }
`}>
  {isRescheduled && (
    <span className="badge badge-info badge-sm">
      ↪️ Rescheduled to {day} {time}
    </span>
  )}
  <div className={isRescheduled ? 'line-through' : ''}>
    {/* Block content */}
  </div>
</div>
```

#### Step 3: Make Non-Interactive
```javascript
role={isRescheduled ? "presentation" : "button"}
tabIndex={isRescheduled ? -1 : 0}
onClick={() => !isRescheduled && onSelectBlock(...)}
```

---

## User Experience Flow

### Scenario: User Marks Block as Missed at 3:30 PM

**Step 1: User clicks "Mark as Missed"**
- Block at 3:30 PM shows loading state

**Step 2: Backend processes**
- Finds available slot at 5:00 PM
- Creates new block at 5:00 PM
- Marks old block (3:30 PM) as 'rescheduled'

**Step 3: Frontend updates**
- Fetches new block from database
- Updates old block status to 'rescheduled'
- Adds new block to state
- Re-renders

**Step 4: User sees**
- **3:30 PM slot:** Grey block with badge "↪️ Rescheduled to Wed 5:00 PM"
- **5:00 PM slot:** Normal blue block (clickable)
- Modal: "Block rescheduled to later today"

---

## Styling Details

### Colors & Opacity
```css
/* Rescheduled Block */
background-color: #f3f4f6 (gray-100)
border-color: #d1d5db (gray-300)
opacity: 0.5 (50%)
cursor: default (not clickable)

/* Badge */
badge-info (blue badge)
badge-sm or badge-xs (size based on view)
```

### Text Decoration
```css
/* All content in rescheduled block */
text-decoration: line-through
```

### Badge Text
- **TodayView:** `↪️ Rescheduled to Wed 5:00 PM`
- **WeekView:** `↪️` (just icon, space is limited)

---

## Benefits of This Approach

### 1. Clear Communication
- User immediately understands what happened
- Can see both old and new time slots
- Badge provides context

### 2. No Technical Issues
- No React key problems
- No duplicate removal complexity
- Simple state management

### 3. Better UX
- Visual history of changes
- Non-intrusive (greyed out)
- Clear call-to-action (new block is prominent)

### 4. Accessibility
- Rescheduled blocks marked as `role="presentation"`
- Not in tab order (`tabIndex={-1}`)
- Screen readers can still read the content

---

## Edge Cases Handled

### 1. Multiple Reschedules
If a block is rescheduled multiple times:
- Each old block stays greyed out
- Latest block is the active one
- User can see the history

### 2. Rescheduled Block Clicked
- Nothing happens (non-interactive)
- Could add tooltip: "This block has been rescheduled"

### 3. Rescheduled to Next Day
- Old block shows: "↪️ Rescheduled to Thu 2:00 PM"
- New block appears on Thursday
- Both visible in week view

### 4. Same-Day Reschedule
- Old block shows: "↪️ Rescheduled to later today"
- New block appears later same day
- Clear visual progression

---

## Database Schema

### Blocks Table
```sql
-- Existing fields
id UUID PRIMARY KEY
user_id UUID
topic_id UUID
scheduled_at TIMESTAMP
duration_minutes INTEGER
status VARCHAR  -- 'scheduled', 'done', 'missed', 'rescheduled'
ai_rationale TEXT

-- ai_rationale now stores reschedule info for rescheduled blocks:
-- "Rescheduled to 2026-01-13T17:00:00Z (Block ID: abc-123)"
```

### Frontend State
```javascript
{
  id: 'old-block-id',
  status: 'rescheduled',
  rescheduledTo: '2026-01-13T17:00:00Z',  // Added in frontend
  scheduled_at: '2026-01-13T15:30:00Z',   // Original time
  // ... other fields
}
```

---

## Testing Checklist

- [ ] Mark block as missed early in day → Reschedules same day
- [ ] Mark block as missed late in day → Reschedules next day
- [ ] Old block shows grey with badge
- [ ] New block shows normal styling
- [ ] Old block is not clickable
- [ ] New block is clickable
- [ ] Badge shows correct new time
- [ ] Line-through applied to old block content
- [ ] Works in both TodayView and WeekView
- [ ] Modal shows correct information
- [ ] No duplicate blocks (both exist intentionally)

---

## Files Modified

1. `/app/api/plan/mark-missed/route.js`
   - Create new block instead of updating
   - Mark old block as 'rescheduled'
   - Return both old and new block IDs

2. `/app/plan/page.js`
   - Update state to mark old block as rescheduled
   - Add new block to state
   - Style rescheduled blocks (TodayView)
   - Style rescheduled blocks (WeekView)
   - Make rescheduled blocks non-interactive

---

## Success Metrics

✅ **No duplicate confusion** - Both blocks exist intentionally
✅ **Clear visual feedback** - User knows what happened
✅ **Simple implementation** - No complex removal logic
✅ **Better UX** - Can see history of changes
✅ **Accessible** - Non-interactive blocks properly marked

**Status: IMPLEMENTED** 🎉

