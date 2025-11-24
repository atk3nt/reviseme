"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";

export default function Slide20Page() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  
  // Time preferences
  const [timePreferences, setTimePreferences] = useState({
    weekdayEarliest: '6:00',
    weekdayLatest: '23:30',
    useSameWeekendTimes: true,
    weekendEarliest: '8:00',
    weekendLatest: '23:30',
  });

  useEffect(() => {
    // Load saved preferences if user goes back
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    if (savedAnswers.timePreferences) {
      setTimePreferences(savedAnswers.timePreferences);
    }
  }, []);

  // Handle time preference change
  const handleTimePreferenceChange = (field, value) => {
    setTimePreferences(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle weekend toggle
  const handleWeekendToggle = () => {
    setTimePreferences(prev => ({
      ...prev,
      useSameWeekendTimes: !prev.useSameWeekendTimes
    }));
  };

  const handleContinue = async () => {
    console.log('Slide 20: Continue button clicked');
    setIsLoading(true);
    
    try {
      // Save to localStorage
      const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
      savedAnswers.timePreferences = timePreferences;
      localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
      console.log('Slide 20: Saved time preferences:', timePreferences);
      
      setTimeout(() => {
        console.log('Slide 20: Navigating to slide 21');
        router.push("/onboarding/slide-21");
      }, 300);
    } catch (error) {
      console.error('Slide 20: Error in handleContinue:', error);
      setIsLoading(false);
      alert('Error saving preferences. Please try again.');
    }
  };

  // Generate time options for dropdowns
  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 6; hour < 24; hour++) {
      options.push(`${hour.toString().padStart(2, '0')}:00`);
      if (hour < 23) {
        options.push(`${hour.toString().padStart(2, '0')}:30`);
      }
    }
    return options;
  };

  const timeOptions = generateTimeOptions();

  return (
    <div className="text-center space-y-8 max-w-4xl mx-auto px-4">
      <OnboardingProgress 
        currentSlide={20} 
        totalSlides={24} 
        showProgressBar={true}
      />

      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">
          When are you available to study?
        </h1>
        <p className="text-xl text-gray-600">
          Set your preferred study times
        </p>
      </div>

      {/* Time Preferences */}
      <div className="bg-white border-2 border-gray-200 rounded-xl p-8 space-y-6">
        <h2 className="text-2xl font-semibold text-gray-900 text-left">
          Time Preferences
        </h2>
        
        <div className="space-y-6">
          {/* Weekday Times */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 text-left">
              Weekday Study Times (Monday - Friday)
            </label>
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1 text-left">Earliest</label>
                <select
                  value={timePreferences.weekdayEarliest}
                  onChange={(e) => handleTimePreferenceChange('weekdayEarliest', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {timeOptions.map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>
              <span className="text-gray-500 mt-6">to</span>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1 text-left">Latest</label>
                <select
                  value={timePreferences.weekdayLatest}
                  onChange={(e) => handleTimePreferenceChange('weekdayLatest', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {timeOptions.map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Weekend Times */}
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <input
                type="checkbox"
                id="weekendToggle"
                checked={timePreferences.useSameWeekendTimes}
                onChange={handleWeekendToggle}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="weekendToggle" className="text-sm font-medium text-gray-700">
                Use same times for weekends
              </label>
            </div>
            
            {!timePreferences.useSameWeekendTimes && (
              <div className="mt-3 ml-7">
                <label className="block text-sm font-medium text-gray-700 mb-2 text-left">
                  Weekend Study Times (Saturday - Sunday)
                </label>
                <div className="flex items-center space-x-4">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1 text-left">Earliest</label>
                    <select
                      value={timePreferences.weekendEarliest}
                      onChange={(e) => handleTimePreferenceChange('weekendEarliest', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {timeOptions.map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                  <span className="text-gray-500 mt-6">to</span>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1 text-left">Latest</label>
                    <select
                      value={timePreferences.weekendLatest}
                      onChange={(e) => handleTimePreferenceChange('weekendLatest', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {timeOptions.map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> Hours outside your preferred times will be greyed out and unavailable for scheduling. You can block specific unavailable times in the next step.
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => router.push("/onboarding/slide-19")}
          className="text-gray-500 hover:text-gray-700 text-sm underline"
        >
          ← Back
        </button>
        
        <button
          onClick={handleContinue}
          disabled={isLoading}
          className="bg-blue-500 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
        >
          {isLoading ? "Next..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
