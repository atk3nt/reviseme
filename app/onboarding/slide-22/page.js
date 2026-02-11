"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import OnboardingProgress from "@/components/OnboardingProgress";
import config from "@/config";
import { unlockSlide } from "@/libs/onboarding-progress";
import { getEffectiveDate, hasSlotsToday } from "@/libs/dev-helpers";

export default function Slide22Page() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [summary, setSummary] = useState({
    subjects: [],
    totalTopics: 0,
    totalHours: 0
  });
  const [isDev, setIsDev] = useState(false);
  const [showStartToggle, setShowStartToggle] = useState(false);
  const [startToday, setStartToday] = useState(true);

  // Set isDev only on client side to avoid hydration mismatch
  useEffect(() => {
    setIsDev(
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.includes('localhost')
    );
  }, []);

  // Prior check: only offer "start today" if there are slots left today (next :00 or :30 before latest).
  // Otherwise force "start tomorrow". Fallback to 9 PM rule when time preferences not yet available.
  useEffect(() => {
    const now = getEffectiveDate();
    let timePreferences = null;
    try {
      const quizAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
      timePreferences = quizAnswers.timePreferences || null;
    } catch (_) {
      // ignore
    }

    const hasPrefs = timePreferences?.weekdayEarliest && timePreferences?.weekdayLatest;
    const slotsToday = hasPrefs ? hasSlotsToday(now, timePreferences) : null;
    const fallbackAfter9PM = now.getHours() >= 21;

    if (slotsToday === false) {
      setShowStartToggle(false);
      setStartToday(false);
      console.log('📅 No slots left today (prior check) — plan will start tomorrow');
    } else if (slotsToday === true) {
      setShowStartToggle(true);
      setStartToday(true);
      console.log('📅 Slots available today — user can choose when to start');
    } else if (fallbackAfter9PM) {
      setShowStartToggle(false);
      setStartToday(false);
      console.log('📅 After 9 PM (no prefs) — plan will start tomorrow');
    } else {
      setShowStartToggle(true);
      setStartToday(true);
      console.log('📅 Before 9 PM (no prefs) — user can choose when to start');
    }
  }, []);

  const sanitizeQuizAnswers = (answers) => {
    if (!answers || typeof answers !== 'object') return {};
    const sanitized = { ...answers };
    const uuidRegex = /^[0-9a-fA-F-]{36}$/;

    if (sanitized.topicRatings && typeof sanitized.topicRatings === 'object') {
      sanitized.topicRatings = Object.fromEntries(
        Object.entries(sanitized.topicRatings).filter(([topicId, rating]) => uuidRegex.test(topicId) && rating !== undefined)
      );
    }

    if (sanitized.topicStatus && typeof sanitized.topicStatus === 'object') {
      sanitized.topicStatus = Object.fromEntries(
        Object.entries(sanitized.topicStatus).filter(([topicId]) => uuidRegex.test(topicId))
      );
    }

    return sanitized;
  };

  // Calculate availability from time preferences and blocked times
  const calculateAvailabilityFromPreferences = (timePreferences, blockedTimes = []) => {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const availability = {};
    
    days.forEach((day, dayIndex) => {
      // Determine if it's a weekday or weekend
      const isWeekend = dayIndex >= 5; // Saturday (5) or Sunday (6)
      
      // Get earliest/latest times
      let earliest, latest;
      if (isWeekend && !timePreferences.useSameWeekendTimes) {
        earliest = timePreferences.weekendEarliest || '8:00';
        latest = timePreferences.weekendLatest || '23:30';
      } else {
        earliest = timePreferences.weekdayEarliest || '4:30';
        latest = timePreferences.weekdayLatest || '23:30';
      }
      
      // Parse times
      const [earliestHour, earliestMin] = earliest.split(':').map(Number);
      const [latestHour, latestMin] = latest.split(':').map(Number);
      
      // Calculate total minutes available
      const earliestMinutes = earliestHour * 60 + earliestMin;
      const latestMinutes = latestHour * 60 + latestMin;
      const totalMinutes = latestMinutes - earliestMinutes;
      
      // Count blocked minutes for this day
      const weekStart = new Date();
      const dayOffset = weekStart.getDay() === 0 ? -6 : 1 - weekStart.getDay(); // Monday
      weekStart.setDate(weekStart.getDate() + dayOffset);
      weekStart.setHours(0, 0, 0, 0);
      
      const dayDate = new Date(weekStart);
      dayDate.setDate(weekStart.getDate() + dayIndex);
      
      let blockedMinutes = 0;
      blockedTimes.forEach(blocked => {
        const blockedStart = new Date(blocked.start);
        const blockedEnd = new Date(blocked.end);
        
        // Check if blocked time overlaps with this day
        if (blockedStart.toDateString() === dayDate.toDateString()) {
          const blockedStartMinutes = blockedStart.getHours() * 60 + blockedStart.getMinutes();
          const blockedEndMinutes = blockedEnd.getHours() * 60 + blockedEnd.getMinutes();
          
          // Calculate overlap with available time window
          const overlapStart = Math.max(earliestMinutes, blockedStartMinutes);
          const overlapEnd = Math.min(latestMinutes, blockedEndMinutes);
          
          if (overlapStart < overlapEnd) {
            blockedMinutes += overlapEnd - overlapStart;
          }
        }
      });
      
      // Calculate available hours (total - blocked) / 60
      const availableMinutes = totalMinutes - blockedMinutes;
      availability[day] = Math.max(0, availableMinutes / 60); // Convert to hours
    });
    
    return availability;
  };

  // Helper function to map subject ID to display name
  const getSubjectDisplayName = (subjectId) => {
    const mapping = {
      'maths': 'Mathematics',
      'psychology': 'Psychology',
      'biology': 'Biology',
      'chemistry': 'Chemistry',
      'business': 'Business',
      'sociology': 'Sociology',
      'physics': 'Physics',
      'economics': 'Economics',
      'history': 'History',
      'geography': 'Geography',
      'computerscience': 'Computer Science'
    };
    return mapping[subjectId] || subjectId.charAt(0).toUpperCase() + subjectId.slice(1);
  };

  // Helper function to get subject color from config
  const getSubjectColor = (subjectId) => {
    return config.subjects[subjectId]?.color || '#6b7280';
  };

  // Helper function to get subject icon from config
  const getSubjectIcon = (subjectId) => {
    return config.subjects[subjectId]?.icon || '📚';
  };

  // Helper function to create a subtle/light version of a color
  const getSubtleColor = (hexColor) => {
    // Convert hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    
    // Mix with white (90% white, 10% original color) for a very subtle tint
    const subtleR = Math.round(r * 0.1 + 255 * 0.9);
    const subtleG = Math.round(g * 0.1 + 255 * 0.9);
    const subtleB = Math.round(b * 0.1 + 255 * 0.9);
    
    return `rgb(${subtleR}, ${subtleG}, ${subtleB})`;
  };

  const loadSummary = () => {
    const savedAnswers = sanitizeQuizAnswers(JSON.parse(localStorage.getItem('quizAnswers') || '{}'));
    localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
    
    const selectedSubjects = savedAnswers.selectedSubjects || [];
    const subjectBoards = savedAnswers.subjectBoards || {};
    const topicRatings = savedAnswers.topicRatings || {};
    const timePreferences = savedAnswers.timePreferences || {
      weekdayEarliest: '4:30',
      weekdayLatest: '23:30',
      useSameWeekendTimes: true
    };
    const blockedTimes = savedAnswers.blockedTimes || [];
    
    // Calculate total topics rated
    const ratedTopics = Object.keys(topicRatings).filter(
      key => topicRatings[key] !== undefined && topicRatings[key] !== -2
    ).length;
    
    // Calculate total study hours per week from time preferences
    const availability = calculateAvailabilityFromPreferences(timePreferences, blockedTimes);
    const totalHours = Object.values(availability).reduce((sum, hours) => sum + hours, 0);
    
    setSummary({
      subjects: selectedSubjects.map(sub => ({
        id: sub,
        name: getSubjectDisplayName(sub),
        board: subjectBoards[sub]
      })),
      totalTopics: ratedTopics,
      totalHours: Math.round(totalHours * 10) / 10 // Round to 1 decimal
    });
  };

  useEffect(() => {
    loadSummary();
    
    // If user just signed in and we have pending onboarding data, restore it
    if (status === 'authenticated' && sessionStorage.getItem('pendingOnboarding')) {
      try {
        const pendingData = sanitizeQuizAnswers(JSON.parse(sessionStorage.getItem('pendingOnboarding')));
        localStorage.setItem('quizAnswers', JSON.stringify(pendingData));
        sessionStorage.removeItem('pendingOnboarding');
        loadSummary(); // Reload summary with restored data
      } catch (error) {
        console.error('Error restoring pending onboarding data:', error);
      }
    }
  }, [status]);

  // Validate that user has rated at least 50% of topics per subject
  const validateTopicRatings = async () => {
    const savedAnswers = sanitizeQuizAnswers(JSON.parse(localStorage.getItem('quizAnswers') || '{}'));
    const selectedSubjects = savedAnswers.selectedSubjects || [];
    const subjectBoards = savedAnswers.subjectBoards || {};
    const topicRatings = savedAnswers.topicRatings || {};
    
    const subjectMapping = {
      'maths': 'Mathematics',
      'psychology': 'Psychology',
      'biology': 'Biology',
      'chemistry': 'Chemistry',
      'business': 'Business',
      'sociology': 'Sociology',
      'physics': 'Physics',
      'economics': 'Economics',
      'history': 'History',
      'geography': 'Geography',
      'computerscience': 'Computer Science'
    };
    
    const validationErrors = [];
    const MIN_TOPICS_ABSOLUTE = 5; // Minimum 5 topics per subject
    const MIN_PERCENTAGE = 0.4; // 40% of topics per subject
    
    // Check each subject
    for (const subjectId of selectedSubjects) {
      const board = subjectBoards[subjectId];
      if (!board) continue;
      
      const dbSubject = subjectMapping[subjectId];
      
      try {
        const response = await fetch('/api/topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            subjects: [dbSubject],
            boards: [board]
          })
        });
        
        if (!response.ok) {
          console.error(`Failed to fetch topics for ${dbSubject}`);
          continue;
        }
        
        const data = await response.json();
        const topics = data.topics || [];
        const totalTopics = topics.length;
        
        // Count rated topics for this subject (0-5 are valid ratings, -2 and undefined are not)
        const ratedTopics = topics.filter(topic => {
          const rating = topicRatings[topic.id];
          return rating !== undefined && rating !== null && rating !== -2;
        }).length;
        
        // Calculate required: 40% of total, but minimum 5 topics
        const minRequired = Math.max(MIN_TOPICS_ABSOLUTE, Math.ceil(totalTopics * MIN_PERCENTAGE));
        
        if (ratedTopics < minRequired) {
          validationErrors.push({
            subject: dbSubject,
            board: board.toUpperCase(),
            rated: ratedTopics,
            total: totalTopics,
            required: minRequired,
            percentage: Math.round((ratedTopics / totalTopics) * 100)
          });
        }
      } catch (error) {
        console.error(`Error validating ${dbSubject}:`, error);
      }
    }
    
    return validationErrors;
  };

  const handleGeneratePlan = async () => {
    // isDev is now a state variable set in useEffect
    
    console.log('🔍 Auth check:', {
      isDev,
      hostname: typeof window !== 'undefined' ? window.location.hostname : 'N/A',
      status,
      hasSession: !!session,
      userId: session?.user?.id,
      startToday
    });
    
    // Check if user is authenticated (skip in dev mode)
    if (!isDev && (status === 'unauthenticated' || !session?.user?.id)) {
      console.log('⚠️ Not authenticated and not in dev mode, redirecting to sign in');
      // Redirect to sign-in, then come back to generating page
      const quizAnswers = JSON.stringify(sanitizeQuizAnswers(JSON.parse(localStorage.getItem('quizAnswers') || '{}')));
      sessionStorage.setItem('pendingOnboarding', quizAnswers);
      router.push(`/api/auth/signin?callbackUrl=${encodeURIComponent('/plan/generating')}`);
      return;
    }
    
    if (isDev) {
      console.log('🔧 Dev mode: Skipping authentication check, proceeding with plan generation');
    }

    // Validate topic ratings (50% per subject, minimum 5 topics)
    console.log('📊 Validating topic ratings...');
    const validationErrors = await validateTopicRatings();
    
    if (validationErrors.length > 0) {
      const errorMessages = validationErrors.map(err => 
        `• ${err.subject} (${err.board}): ${err.rated}/${err.total} topics rated (need ${err.required}, currently ${err.percentage}%)`
      ).join('\n');
      
      alert(
        `Please rate more topics before generating your plan:\n\n${errorMessages}\n\n` +
        `You need to rate at least 40% of topics (minimum 5) in each subject.\n\n` +
        `Unrated topics are fine - they'll be marked as "not doing". ` +
        `But you need to rate enough topics to show you've engaged with each subject.`
      );
      
      router.push("/onboarding/slide-19");
      return;
    }

    // Save the startToday preference to localStorage
    const savedAnswers = sanitizeQuizAnswers(JSON.parse(localStorage.getItem('quizAnswers') || '{}'));
    savedAnswers.startToday = startToday;
    localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
    
    console.log('💾 Saved startToday preference:', startToday);

    // Unlock the plan generation page (not a numbered slide, but allows access to /plan/generating)
    unlockSlide(23);

    // Navigate to loading page which will handle the plan generation
    router.push("/plan/generating");
  };

  // isDev is now a state variable set in useEffect above

  return (
    <div className="text-center h-full flex flex-col min-h-0">
      {/* Fixed header */}
      <div className="flex-shrink-0 pt-adaptive space-y-3 sm:space-y-4">
        <OnboardingProgress 
          currentSlide={22} 
          totalSlides={12} 
          showProgressBar={true}
        />

        <div className="space-y-3 sm:space-y-6">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#001433] leading-tight">
            Time to create your plan.
            <br />
            We've got everything we need.
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-[#003D99]">
            Let's create your personalised revision schedule.
          </p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 py-2 sm:py-4 space-y-4 sm:space-y-6">
      {/* Summary Card */}
      <div className="max-w-lg mx-auto bg-white border-2 border-[#0066FF]/20 rounded-xl p-4 sm:p-6 md:p-8 shadow-lg">
        <div className="space-y-4 sm:space-y-6">
          {/* Subjects */}
          <div>
            <h3 className="text-sm font-medium text-[#003D99] mb-3">Your Subjects</h3>
            <div className="space-y-2">
              {summary.subjects.map((subject, index) => {
                const subjectColor = getSubjectColor(subject.id);
                const subjectIcon = getSubjectIcon(subject.id);
                const subtleColor = getSubtleColor(subjectColor);

                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg border-2 transition-all"
                    style={{
                      backgroundColor: subtleColor,
                      borderColor: `${subjectColor}40`
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{subjectIcon}</span>
                      <span className="font-medium text-[#001433]">{subject.name}</span>
                    </div>
                    <span className="text-xs text-[#003D99] font-medium">{subject.board}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#0066FF]/20">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Topics Rated</h3>
              <p className="text-2xl font-bold text-[#001433]">{summary.totalTopics}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Weekly Availability</h3>
              <p className="text-2xl font-bold text-[#001433]">{summary.totalHours}h</p>
            </div>
          </div>
        </div>
      </div>

      {/* Start Time Toggle (conditional) */}
      {showStartToggle && (
        <div className="max-w-md mx-auto bg-blue-50 border-2 border-blue-200 rounded-xl p-4 sm:p-6">
          <h3 className="text-sm font-medium text-[#003D99] mb-3">When would you like to start studying?</h3>
          <div className="space-y-2">
            <label
              className="flex items-center p-3 rounded-lg border-2 cursor-pointer transition-all hover:bg-blue-100"
              style={{
                backgroundColor: startToday ? '#e0f2fe' : 'white',
                borderColor: startToday ? '#0066FF' : '#cbd5e1'
              }}
            >
              <input
                type="radio"
                name="startTime"
                checked={startToday}
                onChange={() => setStartToday(true)}
                className="w-4 h-4 text-[#0066FF] focus:ring-[#0066FF]"
              />
              <span className="ml-3 text-sm font-medium text-[#001433]">Start today</span>
            </label>
            <label
              className="flex items-center p-3 rounded-lg border-2 cursor-pointer transition-all hover:bg-blue-100"
              style={{
                backgroundColor: !startToday ? '#e0f2fe' : 'white',
                borderColor: !startToday ? '#0066FF' : '#cbd5e1'
              }}
            >
              <input
                type="radio"
                name="startTime"
                checked={!startToday}
                onChange={() => setStartToday(false)}
                className="w-4 h-4 text-[#0066FF] focus:ring-[#0066FF]"
              />
              <span className="ml-3 text-sm font-medium text-[#001433]">Start tomorrow</span>
            </label>
          </div>
        </div>
      )}

      {/* Message when no choice (no slots today or after 9 PM) */}
      {!showStartToggle && (
        <div className="max-w-md mx-auto bg-amber-50 border-2 border-amber-200 rounded-xl p-4 sm:p-6">
          <p className="text-sm text-amber-800">
            Your study plan will start tomorrow morning so you can get a fresh start.
          </p>
        </div>
      )}

      {/* Auth messages (in scroll area) */}
      {!isDev && status === 'unauthenticated' ? (
        <p className="text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg max-w-md mx-auto">
          You'll need to sign in to save your plan. We'll redirect you after you click the button.
        </p>
      ) : isDev ? (
        <p className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded opacity-75 max-w-md mx-auto">
          🔧 Dev mode: Authentication check bypassed
        </p>
      ) : null}
      </div>

      {/* Fixed bottom nav - extra spacing so buttons are always clickable */}
      <div
        className="flex-shrink-0 flex flex-col justify-center items-center pt-5 sm:pt-8 border-t border-[#0066FF]/10 bg-white"
        style={{
          paddingBottom: 'max(3.5rem, 14vh, calc(env(safe-area-inset-bottom) + 2rem))'
        }}
      >
        <div className="flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-6 w-full">
          <button
            onClick={handleGeneratePlan}
            disabled={!isDev && status === 'loading'}
            className="w-full sm:w-auto bg-[#0066FF] text-white px-6 sm:px-12 py-3 sm:py-4 rounded-lg text-base sm:text-lg font-medium hover:bg-[#0052CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed order-1"
          >
            {(!isDev && status === 'loading') ? (
              "Checking authentication..."
            ) : (
              "Generate My Study Plan"
            )}
          </button>
          <button
            onClick={() => router.push("/onboarding/slide-21")}
            className="w-full sm:w-auto bg-white border-2 border-[#0066FF] text-[#0066FF] px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium hover:bg-[#0066FF] hover:text-white transition-colors order-2"
          >
            Back
          </button>
        </div>
        {/* Generous spacer below buttons so they're never flush with the bottom */}
        <div
          className="w-full flex-shrink-0"
          style={{ minHeight: 'max(3.5rem, calc(env(safe-area-inset-bottom) + 1.5rem))' }}
          aria-hidden
        />
      </div>
    </div>
  );
}
