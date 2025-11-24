# Markr Planner - MVP Launch Plan

## Current Status ✅

### Completed:
- ✅ Authentication with NextAuth (custom Supabase adapter)
- ✅ Fixed onboarding pages (steps 1-3) to work without direct Supabase calls
- ✅ Fixed plan page to display mock data
- ✅ Complete user flow: sign-in → onboarding → plan view
- ✅ All data temporarily stored in localStorage

## Next Steps: MVP Launch Strategy

### Phase 1: Data Import (Limited Scope)
- [ ] Import 7-8 completed AQA subjects from CSV files
- [ ] Complete 3 additional subjects with all exam boards (AQA, Edexcel, OCR)
  - Recommended: Biology, Maths, English Literature
- [ ] Total: ~10-13 subject-board combinations for MVP
- [ ] Note: Remaining subjects can be added post-launch based on user demand

### Phase 2: API Routes for Data Persistence
Replace localStorage with proper Supabase integration:

- [ ] Create `/api/onboarding/subjects` - Save user's subject selections to Supabase
- [ ] Create `/api/onboarding/availability` - Save weekly availability & exam dates to Supabase
- [ ] Create `/api/onboarding/confidence` - Save topic confidence ratings to Supabase
- [ ] Create `/api/plan/mark-done` - Mark study block as completed
- [ ] Create `/api/plan/mark-missed` - Mark study block as missed
- [ ] Create `/api/plan/skip` - Skip a study block
- [ ] Create `/api/plan/regenerate` - Regenerate weekly plan
- [ ] Update onboarding pages (step 1, 2, 3) to call these APIs instead of localStorage
- [ ] Connect to existing `libs/scheduler.js` algorithm for plan generation

### Phase 3: Scheduler Architecture (Hybrid: Algorithm + AI)
**Core Strategy:** Use deterministic algorithm for base plan generation, add AI for dynamic adjustments

#### Core Scheduler (Algorithm - Free & Fast)
- [ ] Implement `libs/scheduler.js` with deterministic algorithm
  - **Input:** Selected subjects, topic ratings, availability, exam dates
  - **Output:** Optimized weekly study blocks with priorities
  - **Logic:** Spaced repetition, exam proximity weighting, difficulty balancing
  - **Cost:** Free (pure JavaScript logic)
  
#### Dynamic Adjustments (AI - Optional, Cheap)
**Why:** Let users naturally say "I have football Tuesday 4-6pm" instead of manual form filling

- [ ] Create `/api/plan/adjust` endpoint using `gpt-4o-mini` model
  - **Model:** `gpt-4o-mini` (cheapest, sufficient for parsing)
  - **Cost:** ~$0.001 per adjustment (~$0.01/month per user)
  - **Use Cases:**
    - "I have football practice every Tuesday 4-6pm"
    - "Add extra biology this Saturday morning"
    - "I'm busy Thursday, move my sessions"
    - "Can't study Monday this week, family thing"
  - **Flow:**
    1. AI parses natural language request
    2. Extracts structured data (day, time, duration, action)
    3. Updates availability in database
    4. Algorithm regenerates affected blocks
    5. Returns confirmation message
    
- [ ] Add "Edit This Day" quick action buttons on plan page
- [ ] Optional: Add chat interface "Tell me about schedule changes..."
- [ ] Optional: Add "Block Out Time" manual form for MVP (skip AI initially)

**Implementation Priority:**
1. **MVP (Phase 3A):** Manual "Block Out Time" form → Algorithm regenerates
2. **Enhancement (Phase 3B):** Add AI parsing for natural language adjustments

### Phase 4: AI Topic Explainer (Instead of CSV Blurbs)
**Why:** Eliminates need to scrape topic descriptions, works for any topic instantly

- [ ] Add OpenAI API key to `.env.local` (OPENAI_API_KEY)
- [ ] Create `/api/topic/explain` endpoint using `gpt-4o-mini` model
  - **Model:** `gpt-4o-mini` (cheapest, fastest, good enough for A-Level content)
  - **Cost:** ~$0.00015 per explanation (basically free)
  - **Input:** `{ subject, topicName, examBoard }`
  - **Output:** 2-3 sentence AI-generated explanation
  - **Config:** Max tokens: 150, Temperature: 0.7
- [ ] Add "What's this topic about? 💬" button to each study block in plan page
- [ ] Display AI explanation in modal/tooltip when clicked
- [ ] Optional: Add caching of common explanations to reduce API costs

**Example API Route Structure:**
```javascript
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  const { subject, topicName, examBoard } = await req.json();
  
  const prompt = `You are a helpful A-Level tutor. 
  
Briefly explain this topic in 2-3 sentences for a student:

Subject: ${subject}
Topic: ${topicName}
Exam Board: ${examBoard}

Focus on:
- What the topic covers
- Key concepts they'll learn
- Why it's important

Keep it concise and encouraging.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 150,
    temperature: 0.7,
  });

  return NextResponse.json({ 
    explanation: completion.choices[0].message.content 
  });
}
```

### Phase 5: Polish & Launch Prep
- [ ] Fix Stripe checkout URL error (success_url configuration)
- [ ] Test complete flow: signup → onboarding → plan generation → block interactions
- [ ] Verify AI explanations work for all imported subjects
- [ ] Add "Beta: Limited subjects available" messaging to UI
- [ ] Prepare user feedback collection mechanism
- [ ] Test scheduler algorithm with real data
- [ ] Add loading states and error handling
- [ ] Test manual schedule adjustments (Block Out Time form)
- [ ] Optional: Test AI schedule parsing if implemented

### Phase 6: Optional Enhancements (Post-Launch)
- [ ] Email templates (welcome, weekly summary) using Resend
- [ ] Weekly auto-regeneration cron job
- [ ] Settings page for updating availability/exam dates
- [ ] Progress tracking and insights
- [ ] 7-day refund flow
- [ ] Admin dashboard for monitoring
- [ ] Upgrade AI schedule adjustments from manual form to natural language chat
- [ ] Add voice input for schedule changes ("Hey, I'm busy Thursday...")

## Benefits of This Approach

✅ **Launch MVP faster** - Don't wait for all 24 CSV files
✅ **Hybrid scheduler** - Algorithm for reliability, AI for flexibility
✅ **AI explanations** - Eliminate need to scrape topic blurbs
✅ **Expand gradually** - Add subjects based on user demand
✅ **Infrastructure-ready** - Works with 3 subjects or 30 subjects
✅ **Focus on UX** - Build core scheduler/plan features instead of data collection
✅ **Low costs** - Algorithm is free, AI features cost pennies per user
✅ **Future-proof** - Can add AI enhancements (chat, voice) without rewriting core logic

## Technical Notes

### Current Database Schema
- Tables already exist in Supabase (from SETUP_DATABASE.sql)
- Just need to populate with limited curriculum data
- API routes will connect to existing schema

### Cost Estimates (AI Features)
**Topic Explanations:**
- GPT-4o-mini: ~$0.00015 per topic explanation
- 100 explanations = $0.015 (1.5 cents)
- 1,000 explanations = $0.15 (15 cents)
- 10,000 explanations = $1.50

**Schedule Adjustments (if AI enabled):**
- GPT-4o-mini: ~$0.001 per schedule adjustment
- Average user: 2-5 adjustments/week = ~$0.005/week (~$0.02/month)
- 100 users = ~$2/month
- 1,000 users = ~$20/month

**Total AI costs extremely low** - Use manual form for MVP, upgrade to AI later if needed

### Launch Timeline
- Phase 1 (Data Import): 1-2 days
- Phase 2 (API Routes): 2-3 days
- Phase 3 (Scheduler Algorithm + Manual Adjustments): 2-3 days
- Phase 4 (AI Explainer): 1 day
- Phase 5 (Polish & Testing): 1-2 days
- **Total: ~1-1.5 weeks to MVP**

## Success Metrics
- Users can complete onboarding
- Plan generates successfully with imported subjects
- Scheduler algorithm produces balanced, realistic study plans
- Users can manually adjust schedule (block out times, mark conflicts)
- AI explanations work for all topics
- Stripe checkout functions (for paid users)
- Users can mark blocks as done/missed/skip
- Data persists to Supabase (not localStorage)
- Plan regenerates correctly after adjustments

---

**Last Updated:** October 20, 2025
**Status:** Ready to begin Phase 1

## Key Architecture Decision: Hybrid Scheduler

**Core Plan Generation:** Deterministic algorithm (fast, free, reliable)
- Spaced repetition logic
- Exam proximity weighting  
- Difficulty balancing across weeks
- Optimizes for user's availability

**Dynamic Adjustments:** Optional AI layer (flexible, cheap)
- MVP: Manual "Block Out Time" form
- Future: Natural language AI parsing ("I have football Tuesday 4-6pm")
- Cost: ~$0.001 per adjustment (basically free)

**Why This Works:**
✅ Algorithm provides consistent, predictable base plans
✅ AI handles special cases and one-off changes
✅ Best of both worlds: reliable + flexible
✅ Can launch with just algorithm, add AI later
✅ Keeps costs extremely low while maintaining great UX


