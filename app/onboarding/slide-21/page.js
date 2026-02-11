"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import OnboardingProgress from "@/components/OnboardingProgress";
import TimeBlockCalendar from "@/components/TimeBlockCalendar";
import { unlockSlide } from "@/libs/onboarding-progress";

export default function Slide21Page() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  
  // Time preferences (loaded from previous slide)
  const [timePreferences, setTimePreferences] = useState({
    weekdayEarliest: '4:30',
    weekdayLatest: '23:30',
    useSameWeekendTimes: true,
    weekendEarliest: '8:00',
    weekendLatest: '23:30',
  });

  // Blocked times for upcoming week
  const [blockedTimes, setBlockedTimes] = useState([]);

  useEffect(() => {
    // Load saved preferences and blocked times if user goes back
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    if (savedAnswers.timePreferences) {
      setTimePreferences(savedAnswers.timePreferences);
    }
    if (savedAnswers.blockedTimes) {
      setBlockedTimes(savedAnswers.blockedTimes);
    }
  }, []);

  // Auto-reset confirmation after 3 seconds
  useEffect(() => {
    if (confirmReset) {
      const timer = setTimeout(() => {
        setConfirmReset(false);
      }, 3000); // Reset after 3 seconds
      return () => clearTimeout(timer);
    }
  }, [confirmReset]);

  // Get this week's Monday (current week)
  // Use time override in dev mode for testing
  const getThisWeekStart = () => {
    const devTimeOverride = typeof window !== 'undefined' ? localStorage.getItem('devTimeOverride') : null;
    const today = devTimeOverride ? new Date(devTimeOverride) : new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // This Monday
    const thisMonday = new Date(today.setDate(diff));
    thisMonday.setHours(0, 0, 0, 0);
    return thisMonday;
  };

  const weekStart = getThisWeekStart();

  // Handle block toggle in calendar - supports both single and batch toggles
  const handleBlockToggle = (dayOrToggles, timeSlotOrUndefined, isBlockedOrUndefined) => {
    // Check if first argument is an array (batch toggle from drag selection)
    if (Array.isArray(dayOrToggles)) {
      const toggles = dayOrToggles;
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      
      setBlockedTimes(prev => {
        let newBlockedTimes = [...prev];
        
        toggles.forEach(({ day, timeSlot, isBlocked }) => {
          // Validate parameters
          if (!day || !timeSlot || typeof isBlocked !== 'boolean') {
            return; // Skip invalid entries
          }
          
          const [hour, minute] = timeSlot.split(':').map(Number);
          const dayIndex = days.indexOf(day);
          const date = new Date(weekStart);
          date.setDate(weekStart.getDate() + dayIndex);
          date.setHours(hour, minute, 0, 0);
          
          const endTime = new Date(date);
          endTime.setMinutes(endTime.getMinutes() + 30);
          
          if (isBlocked) {
            // Check if this time is already blocked
            const exists = newBlockedTimes.some(blocked => {
              const blockedStart = new Date(blocked.start);
              return blockedStart.getTime() === date.getTime();
            });
            
            if (!exists) {
              newBlockedTimes.push({
                start: date.toISOString(),
                end: endTime.toISOString()
              });
            }
          } else {
            // Remove from blocked times
            newBlockedTimes = newBlockedTimes.filter(blocked => {
              const blockedStart = new Date(blocked.start);
              return blockedStart.getTime() !== date.getTime();
            });
          }
        });
        
        return newBlockedTimes;
      });
      return;
    }
    
    // Single toggle - validate parameters first
    const day = dayOrToggles;
    const timeSlot = timeSlotOrUndefined;
    const isBlocked = isBlockedOrUndefined;
    
    // Validate required parameters
    if (!day || !timeSlot || typeof isBlocked !== 'boolean') {
      console.error('handleBlockToggle: Invalid parameters', { day, timeSlot, isBlocked });
      return;
    }
    
    const [hour, minute] = timeSlot.split(':').map(Number);
    
    // Find the day index
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayIndex = days.indexOf(day);
    
    // Calculate the date for this day
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + dayIndex);
    date.setHours(hour, minute, 0, 0);
    
    const endTime = new Date(date);
    endTime.setMinutes(endTime.getMinutes() + 30); // 30-minute block

    if (isBlocked) {
      // Add to blocked times
      setBlockedTimes(prev => {
        // Check if this time is already blocked
        const exists = prev.some(blocked => {
          const blockedStart = new Date(blocked.start);
          return blockedStart.getTime() === date.getTime();
        });
        
        if (exists) return prev;
        
        return [...prev, {
          start: date.toISOString(),
          end: endTime.toISOString()
        }];
      });
    } else {
      // Remove from blocked times
      setBlockedTimes(prev => prev.filter(blocked => {
        const blockedStart = new Date(blocked.start);
        return blockedStart.getTime() !== date.getTime();
      }));
    }
  };

  const handleReset = () => {
    if (blockedTimes.length === 0) return;
    
    if (!confirmReset) {
      // First click: show confirmation
      setConfirmReset(true);
    } else {
      // Second click: execute reset
      setBlockedTimes([]);
      // Update localStorage
      const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
      savedAnswers.blockedTimes = [];
      localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
      setConfirmReset(false);
      console.log('Slide 21: Reset all blocked times');
    }
  };

  const handleContinue = async () => {
    console.log('Slide 21: Continue button clicked');
    setIsLoading(true);
    
    try {
      // Save to localStorage
      const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
      savedAnswers.blockedTimes = blockedTimes;
      savedAnswers.timePreferences = timePreferences;
      localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
      console.log('Slide 21: Saved blocked times:', blockedTimes.length);

      if (status === 'authenticated' && session?.user) {
        const weekStartDateStr = weekStart.toISOString().split('T')[0];
        fetch('/api/availability/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            timePreferences,
            blockedTimes,
            weekStartDate: weekStartDateStr,
          }),
        }).catch(() => {});
      }
      
      unlockSlide(22);
      
      setTimeout(() => {
        console.log('Slide 21: Navigating to slide 22');
        router.push("/onboarding/slide-22");
      }, 300);
    } catch (error) {
      console.error('Slide 21: Error in handleContinue:', error);
      setIsLoading(false);
      alert('Error saving blocked times. Please try again.');
    }
  };

  return (
    <div className="text-center h-full flex flex-col min-h-0 max-w-none sm:max-w-6xl mx-auto">
      {/* Fixed header */}
      <div className="flex-shrink-0 pt-adaptive sm:pt-6 space-y-2 sm:space-y-4">
        <OnboardingProgress 
          currentSlide={21} 
          totalSlides={12} 
          showProgressBar={true}
        />

        <div className="space-y-2 sm:space-y-4 px-2 sm:px-0">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#001433]">
            Mark your commitments.
          </h1>
          <p className="text-sm sm:text-base md:text-xl text-[#003D99]">
            Block times you're busy. We'll schedule study blocks in the remaining free time, leaving buffer slots for rescheduling and other school assignments or breaks.
          </p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 py-2 sm:py-4">
      {/* Calendar Section */}
      <div className="bg-white border-2 border-[#0066FF]/20 rounded-xl p-2 sm:p-6 overflow-hidden">
        <p className="text-xs sm:text-sm text-[#003D99] mb-3 sm:mb-6 text-left px-1 sm:px-0 leading-relaxed">
          Grey times are outside your study window. Mark busy times in white areas – we'll schedule around them and leave buffer slots for rescheduling and other school assignments or breaks.
        </p>
        
        <TimeBlockCalendar
          weekStart={weekStart}
          blockedTimes={blockedTimes}
          scheduledBlocks={[]} // No scheduled blocks during onboarding
          onBlockToggle={handleBlockToggle}
          timePreferences={timePreferences}
          readOnly={false}
          onReset={handleReset}
          confirmReset={confirmReset}
        />
      </div>

      {/* Summary */}
      <div className="text-center px-2 sm:px-0 pt-2 sm:pt-4">
        <p className="text-xs sm:text-sm text-[#003D99]">
          <span className="font-medium text-[#001433]">{blockedTimes.length}</span> time blocks marked as unavailable
        </p>
      </div>
      </div>

      {/* Fixed bottom nav - extra spacing on this slide so buttons are always clickable */}
      <div
        className="flex-shrink-0 flex flex-col justify-center items-center pt-5 sm:pt-8 px-2 sm:px-0 border-t border-[#0066FF]/10 bg-white"
        style={{
          paddingBottom: 'max(3.5rem, 14vh, calc(env(safe-area-inset-bottom) + 2rem))'
        }}
      >
        <div className="flex justify-center items-center gap-3 sm:gap-6">
          <button
            onClick={() => router.push("/onboarding/slide-20")}
            className="bg-white border-2 border-[#0066FF] text-[#0066FF] px-3 sm:px-6 py-2 sm:py-2.5 rounded-lg text-xs sm:text-base font-medium hover:bg-[#0066FF] hover:text-white transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleContinue}
            disabled={isLoading}
            className="bg-[#0066FF] text-white px-4 sm:px-8 py-2.5 sm:py-3 rounded-lg text-sm sm:text-base font-medium hover:bg-[#0052CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Next..." : "Continue to Summary"}
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
