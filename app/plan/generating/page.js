"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function GeneratingPlanPage() {
  const router = useRouter();
  const { data: session, status, update: updateSession } = useSession();
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Initializing resources");

  useEffect(() => {
    const generatePlan = async () => {
      try {
        // Check if we're in dev mode (inline check to ensure it's accurate)
        const devMode = typeof window !== 'undefined' && (
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1' ||
          window.location.hostname.includes('localhost')
        );

        // Check authentication (skip in dev mode - API routes will use dev user automatically)
        if (!devMode && (status === 'unauthenticated' || !session?.user?.id)) {
          console.log('⚠️ Not authenticated, redirecting to sign in');
          const quizAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
          sessionStorage.setItem('pendingOnboarding', JSON.stringify(quizAnswers));
          router.push(`/api/auth/signin?callbackUrl=${encodeURIComponent('/plan/generating')}`);
          return;
        }

        if (devMode) {
          console.log('🔧 Dev mode: Skipping authentication check - API routes will use dev user automatically');
        }

        // Step 1: Save onboarding data (0-25%)
        setProgress(12);
        setStatusText("Initializing resources");
        await new Promise(resolve => setTimeout(resolve, 400));

        setProgress(25);
        setStatusText("Saving your preferences...");

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
          throw new Error(errorData.error || `Failed to save data (${saveResponse.status})`);
        }

        // Refresh the session to get updated hasCompletedOnboarding flag
        // This ensures the plan page won't redirect back to onboarding
        if (!devMode && updateSession) {
          try {
            console.log('🔄 Refreshing session to update onboarding status...');
            
            // Trigger NextAuth to refresh the session from the database
            // The session callback will fetch the updated has_completed_onboarding value
            await updateSession();
            
            console.log('✅ Session refreshed successfully');
            
            // Small delay to ensure session is fully updated
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            console.error('⚠️ Failed to refresh session:', error);
            // Session refresh failed - this might cause redirect to onboarding
            // But we'll continue anyway since the data is saved
            // User can refresh the page to get the updated session
            console.warn('⚠️ Session refresh failed. If you get redirected to onboarding, please refresh the page.');
          }
        } else if (!devMode && !updateSession) {
          console.warn('⚠️ Session update function not available. This may cause redirect issues.');
        }

        // Step 2: Calculate availability (25-50%)
        setProgress(31);
        setStatusText("Loading user data");
        await new Promise(resolve => setTimeout(resolve, 300));

        setProgress(50);
        setStatusText("Analyzing your schedule...");

        const calculateAvailabilityFromPreferences = (timePreferences, blockedTimes = []) => {
          const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
          const availability = {};
          
          days.forEach((day, dayIndex) => {
            const isWeekend = dayIndex >= 5;
            
            let earliest, latest;
            if (isWeekend && !timePreferences.useSameWeekendTimes) {
              earliest = timePreferences.weekendEarliest || '8:00';
              latest = timePreferences.weekendLatest || '23:30';
            } else {
              earliest = timePreferences.weekdayEarliest || '4:30';
              latest = timePreferences.weekdayLatest || '23:30';
            }
            
            const [earliestHour, earliestMin] = earliest.split(':').map(Number);
            const [latestHour, latestMin] = latest.split(':').map(Number);
            
            const earliestMinutes = earliestHour * 60 + earliestMin;
            const latestMinutes = latestHour * 60 + latestMin;
            const totalMinutes = latestMinutes - earliestMinutes;
            
            const weekStart = new Date();
            const dayOffset = weekStart.getDay() === 0 ? -6 : 1 - weekStart.getDay();
            weekStart.setDate(weekStart.getDate() + dayOffset);
            weekStart.setHours(0, 0, 0, 0);
            
            const dayDate = new Date(weekStart);
            dayDate.setDate(weekStart.getDate() + dayIndex);
            
            let blockedMinutes = 0;
            blockedTimes.forEach(blocked => {
              const blockedStart = new Date(blocked.start);
              const blockedEnd = new Date(blocked.end);
              
              if (blockedStart.toDateString() === dayDate.toDateString()) {
                const blockedStartMinutes = blockedStart.getHours() * 60 + blockedStart.getMinutes();
                const blockedEndMinutes = blockedEnd.getHours() * 60 + blockedEnd.getMinutes();
                
                const overlapStart = Math.max(earliestMinutes, blockedStartMinutes);
                const overlapEnd = Math.min(latestMinutes, blockedEndMinutes);
                
                if (overlapStart < overlapEnd) {
                  blockedMinutes += overlapEnd - overlapStart;
                }
              }
            });
            
            const availableMinutes = totalMinutes - blockedMinutes;
            availability[day] = Math.max(0, availableMinutes / 60);
          });
          
          return availability;
        };

        quizAnswers = sanitizeQuizAnswers(JSON.parse(localStorage.getItem('quizAnswers') || '{}'));
        const selectedSubjects = quizAnswers.selectedSubjects || [];
        const topicRatings = quizAnswers.topicRatings || {};
        const timePreferences = quizAnswers.timePreferences || {
          weekdayEarliest: '4:30',
          weekdayLatest: '23:30',
          useSameWeekendTimes: true
        };
        const blockedTimes = quizAnswers.blockedTimes || [];
        
        const availability = calculateAvailabilityFromPreferences(timePreferences, blockedTimes);
        quizAnswers.weeklyAvailability = availability;
        localStorage.setItem('quizAnswers', JSON.stringify(quizAnswers));

        // Step 3: Generate plan (50-90%)
        setProgress(60);
        setStatusText("Fetching user info");
        await new Promise(resolve => setTimeout(resolve, 300));

        // Validate that we have ratings before generating plan
        // topicRatings was already defined above on line 172
        const ratedTopicsCount = Object.keys(topicRatings).filter(
          topicId => topicRatings[topicId] !== undefined && topicRatings[topicId] !== -2
        ).length;
        
        if (ratedTopicsCount === 0) {
          throw new Error('No topic ratings found. Please go back and rate your topics on slide 19.');
        }
        
        if (selectedSubjects.length === 0) {
          throw new Error('No subjects selected. Please go back and select your subjects.');
        }
        
        console.log(`✅ Validation passed: ${selectedSubjects.length} subjects, ${ratedTopicsCount} rated topics`);

        setProgress(75);
        setStatusText("Generating your study plan...");

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
            studyBlockDuration: 0.5
          }),
        });

        if (!planResponse.ok) {
          const errorData = await planResponse.json().catch(() => ({ error: 'Unknown error' }));
          const errorMessage = errorData.error || `Failed to generate plan (${planResponse.status})`;
          
          // Provide more context for common errors
          if (errorMessage.includes('Saturday')) {
            throw new Error(
              'Next week\'s plan can only be generated from Saturday onwards.\n\n' +
              'You can generate your current week\'s plan anytime, but planning for next week ' +
              'is only available on weekends (Saturday-Sunday) to ensure your current week is complete.'
            );
          }
          
          throw new Error(errorMessage);
        }

        const planData = await planResponse.json();
        console.log('✅ Generated plan:', planData);
        
        // Check if plan generation returned any blocks
        if (!planData.blocks || planData.blocks.length === 0) {
          console.error('⚠️ Generated plan is empty:', planData);
          throw new Error(
            'Unable to generate study blocks. This could be due to:\n\n' +
            '• Not enough available study time in your schedule\n' +
            '• Too many blocked times conflicting with your availability\n' +
            '• All topics marked as "Not Doing"\n\n' +
            'Please review your availability settings and topic ratings, then try again.'
          );
        }
        
        console.log(`✅ Plan generated successfully with ${planData.blocks.length} study blocks`);

        // Step 4: Pre-load the plan data so the plan page doesn't need to load again (90-100%)
        setProgress(90);
        setStatusText("Finalizing your plan...");

        const finalQuizAnswers = sanitizeQuizAnswers(JSON.parse(localStorage.getItem('quizAnswers') || '{}'));
        localStorage.setItem('selectedSubjects', JSON.stringify(
          Object.fromEntries((finalQuizAnswers.selectedSubjects || []).map(sub => [sub, true]))
        ));
        localStorage.setItem('topicRatings', JSON.stringify(finalQuizAnswers.topicRatings || {}));
        localStorage.setItem('topicStatus', JSON.stringify(finalQuizAnswers.topicStatus || {}));
        localStorage.setItem('availability', JSON.stringify(finalQuizAnswers.weeklyAvailability || {}));
        localStorage.setItem('examDates', JSON.stringify(finalQuizAnswers.examDates || {}));

        // Pre-fetch the blocks from the API so the plan page can display immediately
        setProgress(95);
        setStatusText("Loading your schedule...");

        // Calculate current week start for fetching blocks
        const today = new Date();
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(today);
        monday.setDate(diff);
        monday.setHours(0, 0, 0, 0);
        const weekStartStr = monday.toISOString().split('T')[0];

        const blocksResponse = await fetch(`/api/plan/generate?weekStart=${weekStartStr}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (blocksResponse.ok) {
          const blocksData = await blocksResponse.json();
          // Store pre-loaded data in sessionStorage for the plan page to use
          const preloadedData = {
            blocks: blocksData.blocks || [],
            blockedTimes: blocksData.blockedTimes || [],
            weekStart: blocksData.weekStart || weekStartStr,
            timestamp: Date.now()
          };
          sessionStorage.setItem('preloadedPlanData', JSON.stringify(preloadedData));
          
          // Force a synchronous write by reading it back immediately
          const verify = sessionStorage.getItem('preloadedPlanData');
          if (!verify) {
            console.warn('⚠️ Failed to write pre-loaded data to sessionStorage');
          }
          
          console.log('✅ Pre-loaded plan data:', {
            blocksCount: preloadedData.blocks.length || 0,
            blockedTimesCount: preloadedData.blockedTimes.length || 0,
            verified: !!verify
          });
        }

        setProgress(100);
        setStatusText("Plan generated successfully!");
        
        // Wait a bit longer to ensure all data is fully saved and sessionStorage is ready
        // This ensures the plan page can immediately use pre-loaded data without showing loading
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Navigate to plan page - it will use the pre-loaded data immediately from initial state
        router.push("/plan?view=week");
      } catch (error) {
        console.error('Plan generation error:', error);
        const errorMessage = error.message || 'Failed to generate plan. Please try again.';
        alert(`Error: ${errorMessage}\n\nCheck the browser console for more details.`);
        router.push("/onboarding/slide-22");
      }
    };

    // In dev mode, proceed immediately (API routes will use dev user)
    // In production, wait for auth check to complete
    const devMode = typeof window !== 'undefined' && (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.includes('localhost')
    );

    if (devMode) {
      // In dev mode, start immediately - don't wait for auth status
      generatePlan();
    } else if (status !== 'loading') {
      // In production, wait for auth check to complete
      generatePlan();
    }
  }, [status, session, router]);

  // Calculate the stroke-dashoffset for the circular progress
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="min-h-screen bg-[#001433] flex items-center justify-center">
      <div className="text-center space-y-8">
        {/* Circular Progress Indicator */}
        <div className="relative w-48 h-48 mx-auto">
          <svg className="transform -rotate-90 w-48 h-48">
            {/* Background circle */}
            <circle
              cx="96"
              cy="96"
              r={radius}
              stroke="#1a3a66"
              strokeWidth="8"
              fill="none"
            />
            {/* Progress circle */}
            <circle
              cx="96"
              cy="96"
              r={radius}
              stroke={progress >= 75 ? "#00BFFF" : "#0066FF"}
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-500 ease-out"
            />
          </svg>
          {/* Percentage text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-bold text-white">{progress}%</span>
          </div>
        </div>

        {/* Status Text */}
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-white">Calculating</h2>
          <p className="text-base text-gray-400">{statusText}</p>
        </div>
      </div>
    </div>
  );
}

