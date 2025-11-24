<!-- d4cafbbf-c254-47fa-aee6-11144aff9d7d 27750ebb-a3b0-46a7-97a0-3c54be9254cf -->
# Add Topic Skip Options to Onboarding Step 2

## Changes to `/app/onboarding/step2/page.js`

### 1. Update State Management

Add new state for tracking skipped/not-covered topics:

```javascript
const [ratings, setRatings] = useState({});
const [topicStatus, setTopicStatus] = useState({}); // NEW: track skip/learn-later status
```

Possible values for `topicStatus[topicId]`:

- `null` or `undefined`: Topic is active (needs rating)
- `"skip"`: Skip completely (not in course/optional)
- `"learn-later"`: Haven't covered yet (deprioritized)

### 2. Update Topic Card UI

Modify the topic card (lines 214-240) to include skip option buttons:

**Add after the confidence rating buttons** (after line 237):

```javascript
<div className="divider my-2 text-xs">OR</div>
<button
  onClick={() => handleSkipTopic(topic.id)}
  className={`btn btn-xs btn-ghost w-full ${
    topicStatus[topic.id] ? 'btn-active' : ''
  }`}
>
  {topicStatus[topic.id] === 'skip' ? '✓ Skipped' : 
   topicStatus[topic.id] === 'learn-later' ? '✓ Learn Later' :
   "Haven't Learned This Yet"}
</button>
```

### 3. Add Skip Modal/Dropdown

When user clicks "Haven't Learned This Yet", show a modal or inline choice:

```javascript
const [skipModalTopic, setSkipModalTopic] = useState(null);

const handleSkipTopic = (topicId) => {
  setSkipModalTopic(topicId);
};

const confirmSkip = (topicId, skipType) => {
  setTopicStatus(prev => ({
    ...prev,
    [topicId]: skipType
  }));
  
  // Clear rating if topic is skipped
  if (skipType) {
    setRatings(prev => {
      const newRatings = { ...prev };
      delete newRatings[topicId];
      return newRatings;
    });
  }
  
  setSkipModalTopic(null);
  saveRatings(); // Auto-save
};
```

**Modal UI** (add before closing div):

```javascript
{skipModalTopic && (
  <div className="modal modal-open">
    <div className="modal-box">
      <h3 className="font-bold text-lg">Haven't covered this topic?</h3>
      <p className="py-4">What would you like to do?</p>
      
      <div className="space-y-2">
        <button
          onClick={() => confirmSkip(skipModalTopic, 'skip')}
          className="btn btn-outline btn-error w-full"
        >
          Skip Completely
          <span className="text-xs block">Not in my course / Optional topic I won't study</span>
        </button>
        
        <button
          onClick={() => confirmSkip(skipModalTopic, 'learn-later')}
          className="btn btn-outline btn-warning w-full"
        >
          Learn It Later
          <span className="text-xs block">Haven't covered yet, but will need to study it</span>
        </button>
        
        <button
          onClick={() => setSkipModalTopic(null)}
          className="btn btn-ghost w-full"
        >
          Cancel
        </button>
      </div>
    </div>
    <div className="modal-backdrop" onClick={() => setSkipModalTopic(null)} />
  </div>
)}
```

### 4. Update Save Function

Modify `saveRatings()` (line 85) to also save topic status:

```javascript
const saveRatings = async () => {
  if (isSaving) return;
  if (!session?.user?.id) return;
  
  setIsSaving(true);
  try {
    // Save both ratings and skip status
    localStorage.setItem('topicRatings', JSON.stringify(ratings));
    localStorage.setItem('topicStatus', JSON.stringify(topicStatus)); // NEW
    
    await new Promise(resolve => setTimeout(resolve, 300));
  } catch (error) {
    console.error('Error saving ratings:', error);
  } finally {
    setIsSaving(false);
  }
};
```

### 5. Update Progress Calculation

Modify `getProgress()` (line 120) to count skipped topics as "complete":

```javascript
const getProgress = () => {
  const total = topics.length;
  const rated = Object.values(ratings).filter(r => r > 0).length;
  const skipped = Object.values(topicStatus).filter(s => s).length;
  return total > 0 ? ((rated + skipped) / total) * 100 : 0;
};
```

### 6. Visual Indicator for Skipped Topics

Update topic card styling to show when a topic is skipped:

```javascript
<div key={topic.id} className={`card bg-base-100 shadow-sm ${
  topicStatus[topic.id] ? 'opacity-50 border-2 border-dashed' : ''
}`}>
```

### 7. Allow Un-skipping Topics

Add ability to clear skip status and rate normally:

```javascript
{topicStatus[topic.id] && (
  <button
    onClick={() => {
      setTopicStatus(prev => {
        const newStatus = { ...prev };
        delete newStatus[topic.id];
        return newStatus;
      });
    }}
    className="btn btn-xs btn-ghost"
  >
    ✕ Clear
  </button>
)}
```

## Rating Updates After Onboarding

Students need to update ratings after studying or learning new topics in class. Implement multiple touchpoints:

### 1. Update Rating on Plan Page (Next to Study Blocks)

**File:** `/app/plan/page.js`

Add "Update Confidence" button to each study block:

```javascript
<div className="flex items-center space-x-2">
  <button
    onClick={() => handleBlockAction(block.id, 'done')}
    className="btn btn-sm btn-success"
  >
    ✓ Done
  </button>
  
  {/* NEW: Update confidence button */}
  <button
    onClick={() => openRatingModal(block.topic_id)}
    className="btn btn-sm btn-ghost"
  >
    📊 Update Rating
  </button>
</div>
```

**Add rating modal component:**

```javascript
const [ratingModalTopic, setRatingModalTopic] = useState(null);
const [newRating, setNewRating] = useState(null);

const openRatingModal = (topicId) => {
  // Get current rating from localStorage/API
  const currentRatings = JSON.parse(localStorage.getItem('topicRatings') || '{}');
  setNewRating(currentRatings[topicId] || 3);
  setRatingModalTopic(topicId);
};

const saveNewRating = async () => {
  // Update rating in localStorage/API
  const ratings = JSON.parse(localStorage.getItem('topicRatings') || '{}');
  ratings[ratingModalTopic] = newRating;
  localStorage.setItem('topicRatings', JSON.stringify(ratings));
  
  // TODO: Call API to update rating and regenerate plan
  // await apiClient.post('/api/plan/update-rating', { topicId: ratingModalTopic, rating: newRating });
  
  setRatingModalTopic(null);
};
```

### 2. Post-Study Confidence Check

**File:** `/app/plan/page.js`

When user marks block as "Done", show rating update prompt:

```javascript
const handleBlockAction = async (blockId, action) => {
  if (action === 'done') {
    // Find the block
    const block = blocks.find(b => b.id === blockId);
    
    // Show confidence check modal
    setPostStudyTopic({
      id: block.topic_id,
      name: block.topic_name,
      previousRating: getCurrentRating(block.topic_id)
    });
  }
  // ... rest of action handling
};
```

**Post-study modal:**

```javascript
{postStudyTopic && (
  <div className="modal modal-open">
    <div className="modal-box">
      <h3 className="font-bold text-lg">Great work! 🎉</h3>
      <p className="py-4">
        You just studied: <strong>{postStudyTopic.name}</strong>
      </p>
      <p className="text-sm mb-4">How confident do you feel now?</p>
      
      <div className="flex justify-center space-x-2 mb-4">
        {[1, 2, 3, 4, 5].map(rating => (
          <button
            key={rating}
            onClick={() => setNewRating(rating)}
            className={`w-12 h-12 rounded-full text-lg font-bold ${
              newRating === rating
                ? 'bg-primary text-primary-content'
                : 'bg-base-300 hover:bg-base-400'
            }`}
          >
            {rating}
          </button>
        ))}
      </div>
      
      <div className="text-xs text-center text-base-content/70 mb-4">
        Previous rating: {postStudyTopic.previousRating}/5
      </div>
      
      <button
        onClick={() => savePostStudyRating()}
        className="btn btn-primary w-full"
      >
        Save & Continue
      </button>
    </div>
  </div>
)}
```

### 3. "Learn Later" Topic Activation

**File:** `/app/dashboard/page.js` or `/app/plan/page.js`

Show banner for topics marked "learn-later":

```javascript
const [learnLaterTopics, setLearnLaterTopics] = useState([]);

useEffect(() => {
  // Load topics with "learn-later" status
  const topicStatus = JSON.parse(localStorage.getItem('topicStatus') || '{}');
  const learnLater = Object.entries(topicStatus)
    .filter(([id, status]) => status === 'learn-later')
    .map(([id]) => id);
  setLearnLaterTopics(learnLater);
}, []);

// Show prompt banner if any learn-later topics exist
{learnLaterTopics.length > 0 && (
  <div className="alert alert-info mb-6">
    <span>
      📚 You have {learnLaterTopics.length} topic(s) marked as "Learn Later". 
      Have you covered any in class?
    </span>
    <button
      onClick={() => setShowLearnLaterModal(true)}
      className="btn btn-sm"
    >
      Update Now
    </button>
  </div>
)}
```

**Learn-later modal showing topics to activate:**

```javascript
{showLearnLaterModal && (
  <div className="modal modal-open">
    <div className="modal-box">
      <h3 className="font-bold text-lg">Topics You Haven't Covered Yet</h3>
      <p className="py-4">Have you learned any of these in class?</p>
      
      <div className="space-y-3">
        {learnLaterTopics.map(topicId => (
          <div key={topicId} className="card bg-base-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">{getTopicName(topicId)}</span>
              <button
                onClick={() => activateLearnLaterTopic(topicId)}
                className="btn btn-xs btn-primary"
              >
                Rate Now
              </button>
            </div>
          </div>
        ))}
      </div>
      
      <button
        onClick={() => setShowLearnLaterModal(false)}
        className="btn btn-ghost w-full mt-4"
      >
        Maybe Later
      </button>
    </div>
  </div>
)}
```

### 4. Dedicated "Review Topics" Settings Page

**New File:** `/app/settings/topics/page.js`

Create a page accessible from dashboard/settings to review all topics:

```javascript
export default function ReviewTopicsPage() {
  const [topics, setTopics] = useState([]);
  const [ratings, setRatings] = useState({});
  const [topicStatus, setTopicStatus] = useState({});
  
  // Load all topics with current ratings
  // Group by subject
  // Allow bulk updates
  
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Review Your Topics</h1>
      
      {/* Filter: Show All / Only Rated / Only Skipped / Only Learn-Later */}
      <div className="tabs tabs-boxed mb-6">
        <a className="tab tab-active">All Topics</a>
        <a className="tab">Rated</a>
        <a className="tab">Learn Later</a>
        <a className="tab">Skipped</a>
      </div>
      
      {/* List all topics grouped by subject with inline rating updates */}
      {/* Similar UI to onboarding step 2, but with current ratings visible */}
    </div>
  );
}
```

## Scheduler Impact (Future Phase)

When implementing the scheduler algorithm (`libs/scheduler.js`):

- Topics with `status: "skip"` → Completely excluded from study blocks
- Topics with `status: "learn-later"` → Included but:
  - Lower initial priority
  - Scheduled closer to exam date
  - Only if time allows after other topics
- When ratings are updated → Trigger plan regeneration to adjust priorities

## Data Structure

**localStorage format:**

```javascript
{
  "topicRatings": {
    "biology-0": 3,
    "biology-1": 4,
    // "biology-2" is skipped, so no rating
  },
  "topicStatus": {
    "biology-2": "skip",        // Won't study
    "biology-4": "learn-later"  // Will study later
  }
}
```

## Files Modified

1. `/app/onboarding/step2/page.js` - Add skip functionality with modal choice

### To-dos

- [ ] Add topicStatus state and skipModalTopic state to track skipped/learn-later topics
- [ ] Add 'Haven't Learned This Yet' button to each topic card below confidence ratings
- [ ] Create modal with 'Skip Completely' and 'Learn It Later' options
- [ ] Update saveRatings() to save topicStatus to localStorage alongside ratings
- [ ] Update getProgress() to count skipped topics as complete
- [ ] Add visual styling (opacity, border) to show when topics are skipped
- [ ] Add 'Clear' button to allow users to un-skip topics and rate them normally
- [ ] Document skip functionality in MVP-PLAN.md for future scheduler implementation