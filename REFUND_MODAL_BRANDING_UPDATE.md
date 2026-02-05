# Refund Modal Branding Update

## Overview
Updated the refund feedback modal to align with ReviseMe brand colors and improved the copy to be more empathetic and clear.

## Brand Colors Applied

### Primary Colors
- **Primary Blue:** `#0066FF` - Used for feedback section border
- **Text Dark:** `#001433` - Headlines and important text
- **Text Medium:** `#003D99` - Body text and labels
- **Background Light:** `#E5F0FF` - Card backgrounds and feedback section
- **White:** `#FFFFFF` - Base backgrounds

### Status Colors
- **Success Green:** `#10b981` - Days remaining, valid feedback indicator
- **Warning Yellow:** `#F59E0B` / `#FEF3C7` - Important warning message
- **Error Red:** `#EF4444` / `#FEE2E2` - Not eligible message, confirm button

## Copy Improvements

### Before:
- "Before we process your refund"
- "We'd love to understand what didn't work for you. Your feedback helps us improve Markr Planner for future students."
- Generic placeholder text

### After:
- "Help us improve ReviseMe"
- "We're sorry to see you go. Your honest feedback helps us make ReviseMe better for future students. What could we have done differently?"
- Specific, helpful placeholder examples: "e.g., The scheduling didn't fit my timetable, I found it hard to use, I needed different features..."

## Visual Changes

### Refund Details Card
- Border color: `#E5F0FF` (brand light blue)
- Text colors match brand hierarchy
- Clean, professional look

### Feedback Section
- Background: `#E5F0FF` (brand light blue)
- Border: `#0066FF` (brand primary blue)
- Textarea border changes to green when valid (10+ characters)
- Character counter shows progress: "15/10" format
- More helpful placeholder text with examples

### Warning Message
- Yellow/amber color scheme for "Important" message
- Clear, empathetic messaging
- Maintains urgency without being harsh

### Buttons
- Cancel: Outlined with `#003D99` (brand text medium)
- Confirm Refund: Red `#EF4444` when enabled, gray when disabled
- Smooth transitions and hover states

### Not Eligible Message
- Red background `#FEE2E2` with red border
- Clear icon and heading
- Branded back button

## User Experience Improvements

1. **Visual Feedback:**
   - Textarea border turns green when valid
   - Character counter shows progress (e.g., "15/10")
   - Button clearly disabled/enabled states

2. **Better Copy:**
   - More empathetic tone ("We're sorry to see you go")
   - Specific placeholder examples
   - Clear explanation of what happens

3. **Brand Consistency:**
   - All colors match ReviseMe brand palette
   - Typography hierarchy maintained
   - Professional, trustworthy appearance

## Technical Details

### Files Modified
- `/components/SupportModal.js` - Updated refund eligible and not eligible sections

### Styling Approach
- Inline styles for precise brand color control
- Maintains responsive design
- Accessible color contrasts
- Smooth transitions

## Testing

After the update, the modal should:
- ✅ Display brand colors consistently
- ✅ Show helpful placeholder text
- ✅ Provide clear visual feedback
- ✅ Maintain professional appearance
- ✅ Work on all screen sizes

## Before/After Comparison

### Before:
- Generic DaisyUI colors (base-content, warning, error)
- Basic placeholder text
- Standard button styling
- Less specific guidance

### After:
- ReviseMe brand colors throughout
- Empathetic, helpful copy
- Custom button styling with brand colors
- Specific examples in placeholder
- Better visual hierarchy

## Impact

The updated modal now:
1. **Looks professional** - Matches ReviseMe brand identity
2. **Feels empathetic** - Copy shows you care about user feedback
3. **Guides users** - Specific examples help them provide better feedback
4. **Builds trust** - Consistent branding reinforces legitimacy
5. **Improves UX** - Clear visual feedback and progress indicators

## Notes

- All brand colors are from `config.js`
- Copy emphasizes "ReviseMe" brand name
- Maintains 7-day money-back guarantee messaging
- Feedback remains required (10 character minimum)
- No functional changes, only visual and copy improvements
