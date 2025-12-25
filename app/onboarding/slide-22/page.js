"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import OnboardingProgress from "@/components/OnboardingProgress";
import config from "@/config";

export default function Slide22Page() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState({
    subjects: [],
    totalTopics: 0,
    totalHours: 0
  });
  const [loadingStep, setLoadingStep] = useState("");
  const [isDev, setIsDev] = useState(false);

  // Set isDev only on client side to avoid hydration mismatch
  useEffect(() => {
    setIsDev(
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.includes('localhost')
    );
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
        earliest = timePreferences.weekdayEarliest || '6:00';
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

  const loadSummary = () => {
    const savedAnswers = sanitizeQuizAnswers(JSON.parse(localStorage.getItem('quizAnswers') || '{}'));
    localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
    
    const selectedSubjects = savedAnswers.selectedSubjects || [];
    const subjectBoards = savedAnswers.subjectBoards || {};
    const topicRatings = savedAnswers.topicRatings || {};
    const timePreferences = savedAnswers.timePreferences || {
      weekdayEarliest: '6:00',
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
        name: sub.charAt(0).toUpperCase() + sub.slice(1),
        board: subjectBoards[sub]
      })),
      totalTopics: ratedTopics,
      totalHours: Math.round(totalHours * 10) / 10 // Round to 1 decimal
    });
  };

  const handleGeneratePlan = async () => {
    // isDev is now a state variable set in useEffect
    
    console.log('🔍 Auth check:', {
      isDev,
      hostname: typeof window !== 'undefined' ? window.location.hostname : 'N/A',
      status,
      hasSession: !!session,
      userId: session?.user?.id
    });
    
    // Check if user is authenticated (skip in dev mode)
    if (!isDev && (status === 'unauthenticated' || !session?.user?.id)) {
      console.log('⚠️ Not authenticated and not in dev mode, redirecting to sign in');
      // Redirect to sign-in, then come back to this page
      const quizAnswers = JSON.stringify(sanitizeQuizAnswers(JSON.parse(localStorage.getItem('quizAnswers') || '{}')));
      sessionStorage.setItem('pendingOnboarding', quizAnswers);
      router.push(`/api/auth/signin?callbackUrl=${encodeURIComponent('/onboarding/slide-22')}`);
      return;
    }
    
    if (isDev) {
      console.log('🔧 Dev mode: Skipping authentication check, proceeding with plan generation');
    }

    setIsLoading(true);
    
    try {
      // Step 1: Save onboarding data to Supabase
      setLoadingStep("Saving your preferences...");
      
      let quizAnswers = sanitizeQuizAnswers(JSON.parse(localStorage.getItem('quizAnswers') || '{}'));
      
      const saveResponse = await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quizAnswers
        }),
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Save response error:', {
          status: saveResponse.status,
          statusText: saveResponse.statusText,
          errorData
        });
        throw new Error(errorData.error || `Failed to save data (${saveResponse.status})`);
      }

      // Step 2: Get quiz data from localStorage
      quizAnswers = sanitizeQuizAnswers(JSON.parse(localStorage.getItem('quizAnswers') || '{}'));
      const selectedSubjects = quizAnswers.selectedSubjects || [];
      const subjectBoards = quizAnswers.subjectBoards || {};
      const topicRatings = quizAnswers.topicRatings || {};
      const timePreferences = quizAnswers.timePreferences || {
        weekdayEarliest: '6:00',
        weekdayLatest: '23:30',
        useSameWeekendTimes: true
      };
      const blockedTimes = quizAnswers.blockedTimes || [];
      
      // Step 3: Calculate availability from time preferences
      const availability = calculateAvailabilityFromPreferences(timePreferences, blockedTimes);
      quizAnswers.weeklyAvailability = availability;
      localStorage.setItem('quizAnswers', JSON.stringify(quizAnswers));
      
      // Step 4: Generate study plan
      setLoadingStep("Analyzing your strengths...");
      
      const planResponse = await fetch('/api/plan/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subjects: selectedSubjects,
          ratings: quizAnswers.topicRatings || {},
          topicStatus: quizAnswers.topicStatus || {},
          availability: availability,
          examDates: quizAnswers.examDates || {},
          studyBlockDuration: 0.5 // 30 minutes per block
        }),
      });

      if (!planResponse.ok) {
        const errorData = await planResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Plan generation response error:', {
          status: planResponse.status,
          statusText: planResponse.statusText,
          errorData
        });
        const errorMsg = errorData.error || `Failed to generate plan (${planResponse.status})`;
        throw new Error(errorMsg);
      }

      const planData = await planResponse.json();
      console.log('✅ Generated plan:', planData);
      
      // Save data in the format the plan page expects (separate localStorage keys)
      const finalQuizAnswers = sanitizeQuizAnswers(JSON.parse(localStorage.getItem('quizAnswers') || '{}'));
      localStorage.setItem('selectedSubjects', JSON.stringify(
        Object.fromEntries((finalQuizAnswers.selectedSubjects || []).map(sub => [sub, true]))
      ));
      localStorage.setItem('topicRatings', JSON.stringify(finalQuizAnswers.topicRatings || {}));
      localStorage.setItem('topicStatus', JSON.stringify(finalQuizAnswers.topicStatus || {}));
      localStorage.setItem('availability', JSON.stringify(finalQuizAnswers.weeklyAvailability || {}));
      localStorage.setItem('examDates', JSON.stringify(finalQuizAnswers.examDates || {}));
      
      console.log('✅ Saved data to localStorage in plan page format');
      
      setLoadingStep("Plan generated successfully!");
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Navigate directly to plan page with week view
      console.log('🚀 Navigating to /plan?view=week');
      router.push("/plan?view=week");
    } catch (error) {
      console.error('Plan generation error:', error);
      const errorMessage = error.message || 'Failed to generate plan. Please try again.';
      console.error('Full error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      alert(`Error: ${errorMessage}\n\nCheck the browser console for more details.`);
      setIsLoading(false);
      setLoadingStep("");
    }
  };

  // isDev is now a state variable set in useEffect above

  return (
    <div className="text-center space-y-8">
      <OnboardingProgress 
        currentSlide={22} 
        totalSlides={24} 
        showProgressBar={true}
      />

      <div className="space-y-6">
        <h1 className="text-4xl font-bold text-gray-900">
          Ready to build your personalized study plan?
        </h1>
        <p className="text-xl text-gray-600">
          Let's create a schedule tailored to your strengths and availability
        </p>
      </div>

      {/* Summary Card */}
      <div className="max-w-lg mx-auto bg-white border-2 border-gray-200 rounded-xl p-8 shadow-lg">
        <div className="space-y-6">
          {/* Subjects */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-3">Your Subjects</h3>
            <div className="space-y-2">
              {summary.subjects.map((subject, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="font-medium text-gray-900">{subject.name}</span>
                  <span className="text-sm text-gray-600">{subject.board}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Topics Rated</h3>
              <p className="text-2xl font-bold text-gray-900">{summary.totalTopics}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Weekly Availability</h3>
              <p className="text-2xl font-bold text-gray-900">{summary.totalHours}h</p>
            </div>
          </div>
        </div>
      </div>

      {/* Generate Button */}
      <div className="flex flex-col items-center space-y-3">
        {!isDev && status === 'unauthenticated' ? (
          <p className="text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg">
            You'll need to sign in to save your plan. We'll redirect you after you click the button.
          </p>
        ) : isDev ? (
          <p className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded opacity-75">
            🔧 Dev mode: Authentication check bypassed
          </p>
        ) : null}
        <button
          onClick={handleGeneratePlan}
          disabled={isLoading || (!isDev && status === 'loading')}
          className="bg-blue-500 text-white px-12 py-4 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
        >
          {isLoading ? (
            <div className="flex items-center space-x-2">
              <span className="loading loading-spinner loading-sm"></span>
              <span>{loadingStep || "Generating..."}</span>
            </div>
          ) : (!isDev && status === 'loading') ? (
            "Checking authentication..."
          ) : (
            "Generate My Study Plan"
          )}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex justify-start">
        <button
          onClick={() => router.push("/onboarding/slide-21")}
          className="text-gray-500 hover:text-gray-700 text-sm underline"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
