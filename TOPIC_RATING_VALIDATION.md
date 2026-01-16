# Topic Rating Validation Implementation

## Summary
Implemented a validation system to ensure users rate a minimum number of topics before completing onboarding and generating a study plan.

## Validation Rules

### Per-Subject Requirements
- **Minimum Percentage**: 50% of available topics per subject
- **Absolute Minimum**: 5 topics per subject (even if 50% is less)
- **Applies to**: Each subject independently

### Example Scenarios

#### Scenario 1: Subject with 20 topics
- Total topics: 20
- 50% = 10 topics
- **Required**: 10 topics (max of 50% and absolute minimum)

#### Scenario 2: Subject with 8 topics
- Total topics: 8
- 50% = 4 topics
- **Required**: 5 topics (absolute minimum overrides)

#### Scenario 3: Multiple subjects
- Maths (AQA): 30 topics → Need 15 (50%)
- Physics (Edexcel): 25 topics → Need 13 (50% rounded up)
- Biology (OCR): 6 topics → Need 5 (absolute minimum)

## Implementation Details

### Client-Side Validation (`app/onboarding/slide-22/page.js`)

**When**: Before navigating to plan generation
**Function**: `validateTopicRatings()`

**Process**:
1. Fetches topics for each selected subject/board combination
2. Counts rated topics (ratings 0-5, excludes -2 and undefined)
3. Calculates requirement: `max(5, ceil(total * 0.5))`
4. Shows alert with specific errors if validation fails
5. Redirects back to slide-19 (rating page) if insufficient

**User Feedback**:
- Alert message shows which subjects need more ratings
- Shows current count vs required count
- Shows percentage completed
- Explains that unrated topics are fine (marked as "not doing")

### Server-Side Validation (`app/api/onboarding/save/route.js`)

**When**: When saving onboarding data
**Location**: After checking `hasRequiredData`, before updating user

**Process**:
1. Queries Supabase for level-3 topics per subject/board
2. Counts rated topics from `quizAnswers.topicRatings`
3. Validates each subject independently
4. Returns 400 error if validation fails
5. Sets `has_completed_onboarding` to `false` if insufficient ratings

**Security**:
- Prevents users from bypassing client-side validation
- Ensures data integrity in database
- Returns detailed error message for debugging

### UI Indicators (`app/onboarding/slide-22/page.js`)

**Summary Card**:
- Shows "Topics Rated" count
- Displays requirement: "Need 50% per subject (min 5)"
- Helps users understand the requirement before clicking

## Rating System

### Valid Ratings (counted as "rated")
- `0`: Not confident at all
- `1`: Slightly confident
- `2`: Somewhat confident
- `3`: Moderately confident
- `4`: Very confident
- `5`: Extremely confident

### Invalid Ratings (not counted)
- `-2`: Topic skipped/not rated
- `undefined`: Topic not seen yet
- `null`: Topic not rated

## Testing Checklist

### Test Case 1: Insufficient Ratings
1. Select 2 subjects (e.g., Maths + Physics)
2. Rate only 3 topics in Maths (need at least 5)
3. Rate 10 topics in Physics (assume sufficient)
4. Click "Generate My Study Plan"
5. **Expected**: Alert showing Maths needs more ratings
6. **Expected**: Redirect to slide-19

### Test Case 2: Sufficient Ratings
1. Select 2 subjects
2. Rate at least 50% (minimum 5) in each subject
3. Click "Generate My Study Plan"
4. **Expected**: Proceed to plan generation

### Test Case 3: Server-Side Validation
1. Use browser console to bypass client validation
2. Try to save onboarding with insufficient ratings
3. **Expected**: API returns 400 error
4. **Expected**: `has_completed_onboarding` remains `false`

### Test Case 4: Edge Case - Small Subject
1. Select a subject with only 6 topics
2. Rate exactly 5 topics (meets absolute minimum)
3. Click "Generate My Study Plan"
4. **Expected**: Validation passes (5 meets minimum)

### Test Case 5: Edge Case - Large Subject
1. Select a subject with 100 topics
2. Rate exactly 50 topics (meets 50%)
3. Click "Generate My Study Plan"
4. **Expected**: Validation passes (50 meets 50%)

## Configuration

### Adjusting Requirements

To change validation rules, update these constants:

**Client-Side** (`app/onboarding/slide-22/page.js`, line ~224):
```javascript
const MIN_TOPICS_ABSOLUTE = 5; // Minimum topics per subject
const MIN_PERCENTAGE = 0.5; // 50% of topics per subject
```

**Server-Side** (`app/api/onboarding/save/route.js`, line ~158):
```javascript
const MIN_TOPICS_ABSOLUTE = 5; // Minimum topics per subject
const MIN_PERCENTAGE = 0.5; // 50% of topics per subject
```

**Important**: Keep both values in sync!

## Benefits

1. **Better Plans**: Ensures sufficient data for AI to generate quality study plans
2. **User Engagement**: Encourages users to properly evaluate their knowledge
3. **Data Quality**: Prevents incomplete onboarding data
4. **Flexibility**: Allows unrated topics (marked as "not doing") while ensuring minimum engagement
5. **Security**: Server-side validation prevents bypassing

## Files Modified

1. `app/onboarding/slide-22/page.js`
   - Added `validateTopicRatings()` function
   - Updated `handleGeneratePlan()` to validate before proceeding
   - Added UI hint about requirement

2. `app/api/onboarding/save/route.js`
   - Added server-side validation logic
   - Returns 400 error if validation fails
   - Only sets `has_completed_onboarding = true` if validation passes

## Notes

- Validation is per-subject, not total topics
- Unrated topics are acceptable (they'll be marked as "not doing")
- The requirement ensures users engage meaningfully with each subject
- Server-side validation is the source of truth
- Client-side validation provides better UX (immediate feedback)
