# Testing Guide: Adaptive Padding Implementation

## Quick Visual Test

### Before Running Tests
1. Start the development server: `npm run dev`
2. Open Chrome DevTools (F12)
3. Enable Device Toolbar (Cmd+Shift+M on Mac, Ctrl+Shift+M on Windows)

### Test Scenarios

#### Test 1: Small Phone (iPhone SE)
```
1. Set DevTools to "iPhone SE" (375 × 667px)
2. Navigate to /onboarding/slide-1
3. Verify:
   ✓ Content has breathing room on all sides (minimum ~16px)
   ✓ Email input field is fully visible
   ✓ Buttons don't touch edges
   ✓ Progress dots are centered and visible
```

#### Test 2: Standard Phone (iPhone 14 Pro)
```
1. Set DevTools to "iPhone 14 Pro" (393 × 852px)
2. Navigate through slides 1-5
3. Verify:
   ✓ Padding is slightly larger than iPhone SE
   ✓ Content is well-centered
   ✓ No horizontal scrolling
   ✓ Bottom navigation is clearly visible
```

#### Test 3: Large Phone (iPhone 14 Pro Max)
```
1. Set DevTools to "iPhone 14 Pro Max" (430 × 932px)
2. Test all quiz slides (2, 4, 5)
3. Verify:
   ✓ Padding scales proportionally
   ✓ Quiz cards have adequate spacing
   ✓ Text is readable
   ✓ Back/Next buttons are accessible
```

#### Test 4: Tablet (iPad)
```
1. Set DevTools to "iPad" (768 × 1024px)
2. Navigate to slide-16 (subject selection)
3. Verify:
   ✓ Grid layout looks balanced
   ✓ Padding doesn't become excessive
   ✓ Subject cards are well-spaced
   ✓ Content doesn't feel lost in space
```

#### Test 5: Desktop Responsive
```
1. Use responsive mode and drag to resize
2. Watch padding change smoothly
3. Verify:
   ✓ No sudden jumps in spacing
   ✓ Smooth transitions as you resize
   ✓ Content stays centered
   ✓ Padding maxes out at reasonable size (~48px sides)
```

#### Test 6: Notch/Safe Area Handling
```
1. Use iPhone X or newer in DevTools
2. Navigate to any slide
3. Toggle portrait/landscape
4. Verify:
   ✓ Content respects notch area
   ✓ Buttons stay above home indicator
   ✓ No overlap with system UI
```

## Automated Visual Regression Test (Optional)

If you have visual regression testing set up:

```javascript
// Test adaptive padding at different viewports
const viewports = [
  { width: 375, height: 667, name: 'iPhone SE' },
  { width: 390, height: 844, name: 'iPhone 14' },
  { width: 430, height: 932, name: 'iPhone 14 Pro Max' },
  { width: 768, height: 1024, name: 'iPad' },
  { width: 1024, height: 1366, name: 'iPad Pro' },
];

viewports.forEach(async ({ width, height, name }) => {
  await page.setViewport({ width, height });
  await page.goto('/onboarding/slide-1');
  await page.screenshot({ 
    path: `screenshots/${name}-slide-1.png`,
    fullPage: true 
  });
});
```

## Manual Inspection Checklist

For each slide, verify:

- [ ] **Slide 1** (Sign in)
  - Email form centered
  - Google button visible
  - Logo/progress visible
  
- [ ] **Slide 2** (Confidence)
  - Quiz options not cut off
  - Navigation buttons visible
  
- [ ] **Slide 4** (Challenges)
  - Long option text wraps properly
  - All options visible without scroll
  
- [ ] **Slide 5** (Exam timing)
  - Radio options centered
  - Back/Next buttons accessible
  
- [ ] **Slide 9** (Name/Year)
  - Input field fully visible
  - Keyboard doesn't cover input (mobile)
  
- [ ] **Slide 16** (Subjects)
  - Grid layout balanced
  - Subject cards not touching edges
  - Board selection buttons visible
  
- [ ] **Slide 16.5** (Study approach)
  - Text readable
  - Options well-spaced
  
- [ ] **Slide 17** (Pricing)
  - Pricing card centered
  - Features list readable
  - CTA button visible
  
- [ ] **Slide 19** (Topic rating)
  - Topic cards scrollable
  - Rating buttons accessible
  - Subject headers visible
  
- [ ] **Slide 20** (Availability)
  - Calendar centered
  - Time slots visible
  - Save button accessible
  
- [ ] **Slide 21** (Weekly schedule)
  - Full week grid visible
  - Time blocks selectable
  - Navigation clear
  
- [ ] **Slide 22** (Summary)
  - Summary cards readable
  - Confirmation visible
  - Final CTA accessible

## Common Issues to Watch For

### Issue: Content Too Close to Edges
**Symptom:** Content touches screen edges on small phones
**Check:** Verify `px-adaptive` is applied to layout
**Fix:** Ensure layout.js has `px-adaptive` class

### Issue: Excessive Padding on Large Screens
**Symptom:** Too much white space on tablets/desktop
**Check:** Verify `clamp()` max values aren't too large
**Fix:** Adjust max value in CSS (currently 3rem horizontal, 2-3rem vertical)

### Issue: Keyboard Covers Input
**Symptom:** Virtual keyboard hides form fields on mobile
**Check:** Ensure parent containers use `min-h-0` and `overflow-y-auto`
**Fix:** Already implemented in slide layouts with flexbox

### Issue: Progress Bar Cut Off
**Symptom:** Progress dots or bar not fully visible
**Check:** OnboardingProgress component spacing
**Fix:** Component already has responsive padding built in

## Browser-Specific Testing

### iOS Safari
- Test with URL bar shown/hidden
- Verify `100dvh` handles viewport changes
- Check safe area insets on iPhone X+

### Android Chrome
- Test with bottom navigation bar
- Verify padding on various screen sizes
- Check notch handling on modern devices

### Desktop Browsers
- Chrome: Test responsive mode
- Firefox: Verify CSS compatibility
- Safari: Check safe-area support
- Edge: Ensure smooth scaling

## Performance Check

The adaptive padding should not impact performance:

```javascript
// Check CSS paint time in DevTools
// 1. Open DevTools Performance tab
// 2. Record while navigating slides
// 3. Verify no layout thrashing
// 4. CSS recalc should be < 50ms per slide change
```

## Accessibility Verification

- [ ] Zoom to 200% - content still usable
- [ ] Text reflow works properly
- [ ] Touch targets still minimum 44x44px
- [ ] Focus indicators not cut off
- [ ] Screen reader navigation not affected

## Sign-Off Criteria

✅ All viewports tested (375px - 1024px)
✅ No horizontal scrolling
✅ Content always has breathing room
✅ Safe areas respected on all devices
✅ Smooth transitions when resizing
✅ No layout shift or jank
✅ Buttons/CTAs always accessible
✅ Text remains readable
✅ No content cut off

## Rollback Trigger

Revert if you observe:
- Content touching screen edges
- Excessive padding causing UX issues
- Layout breaks at any viewport
- Performance degradation
- Browser compatibility issues

See `ADAPTIVE_PADDING_IMPLEMENTATION.md` for rollback instructions.
