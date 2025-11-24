"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import TimeBlockCalendar from "@/components/TimeBlockCalendar";

export default function Slide21Page() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  
  // Time preferences (loaded from previous slide)
  const [timePreferences, setTimePreferences] = useState({
    weekdayEarliest: '6:00',
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

  // Get this week's Monday (current week)
  const getThisWeekStart = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // This Monday
    const thisMonday = new Date(today.setDate(diff));
    thisMonday.setHours(0, 0, 0, 0);
    return thisMonday;
  };

  const weekStart = getThisWeekStart();

  // Handle block toggle in calendar
  const handleBlockToggle = (day, timeSlot, isBlocked) => {
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

  const handleContinue = async () => {
    console.log('Slide 21: Continue button clicked');
    setIsLoading(true);
    
    try {
      // Save to localStorage
      const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
      savedAnswers.blockedTimes = blockedTimes;
      localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
      console.log('Slide 21: Saved blocked times:', blockedTimes.length);
      
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
    <div className="text-center space-y-8 max-w-6xl mx-auto px-4">
      <OnboardingProgress 
        currentSlide={21} 
        totalSlides={24} 
        showProgressBar={true}
      />

      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">
          Block Unavailable Times
        </h1>
        <p className="text-xl text-gray-600">
          Click or drag to block times when you can't study
        </p>
      </div>

      {/* Calendar Section */}
      <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
        <p className="text-sm text-gray-600 mb-6 text-left">
          Hours outside your preferred times (from the previous step) are greyed out and cannot be blocked. Only mark times within your available window as unavailable.
        </p>
        
        <TimeBlockCalendar
          weekStart={weekStart}
          blockedTimes={blockedTimes}
          scheduledBlocks={[]} // No scheduled blocks during onboarding
          onBlockToggle={handleBlockToggle}
          timePreferences={timePreferences}
          readOnly={false}
        />
      </div>

      {/* Summary */}
      <div className="text-center">
        <p className="text-sm text-gray-600">
          <span className="font-medium text-gray-900">{blockedTimes.length}</span> time blocks marked as unavailable
        </p>
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => router.push("/onboarding/slide-20")}
          className="text-gray-500 hover:text-gray-700 text-sm underline"
        >
          ← Back
        </button>
        
        <button
          onClick={handleContinue}
          disabled={isLoading}
          className="bg-blue-500 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
        >
          {isLoading ? "Next..." : "Continue to Summary"}
        </button>
      </div>
    </div>
  );
}
