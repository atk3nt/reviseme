"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import { unlockSlide } from "@/libs/onboarding-progress";

export default function Slide20Page() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  
  // Time preferences
  const [timePreferences, setTimePreferences] = useState({
    weekdayEarliest: '10:00',
    weekdayLatest: '17:00',
    useSameWeekendTimes: true,
    weekendEarliest: '10:00',
    weekendLatest: '17:00',
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

  // Prevent scrolling when interacting with slider
  const handleSliderInteraction = (e) => {
    e.stopPropagation();
    if (e.type === 'wheel') {
      e.preventDefault();
    }
  };

  // Handle weekend toggle
  const handleWeekendToggle = () => {
    setTimePreferences(prev => {
      const newUseSameWeekendTimes = !prev.useSameWeekendTimes;
      
      // If toggling back to "use same times", revert weekend times to weekday times
      if (newUseSameWeekendTimes) {
        return {
          ...prev,
          useSameWeekendTimes: newUseSameWeekendTimes,
          weekendEarliest: prev.weekdayEarliest,
          weekendLatest: prev.weekdayLatest,
        };
      }
      
      // If unticking, keep current weekend times (or initialize to weekday times if not set)
      return {
        ...prev,
        useSameWeekendTimes: newUseSameWeekendTimes,
        weekendEarliest: prev.weekendEarliest || prev.weekdayEarliest,
        weekendLatest: prev.weekendLatest || prev.weekdayLatest,
      };
    });
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
      
      unlockSlide(21);
      
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

  // Generate time options for sliders
  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 4; hour < 24; hour++) {
      options.push(`${hour.toString().padStart(2, '0')}:00`);
      if (hour < 23) {
        options.push(`${hour.toString().padStart(2, '0')}:30`);
      }
    }
    return options;
  };

  const timeOptions = generateTimeOptions();

  return (
    <div className="text-center space-y-4 sm:space-y-8 max-w-4xl mx-auto pt-adaptive pb-8 sm:pb-12">
      <OnboardingProgress 
        currentSlide={20} 
        totalSlides={12} 
        showProgressBar={true}
      />

      <div className="space-y-2 sm:space-y-4">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#001433]">
          When can you study?
        </h1>
        <p className="text-sm sm:text-base md:text-xl text-[#003D99]">
          Set your study window. We'll schedule revision blocks within these hours, around your commitments.
        </p>
      </div>

      {/* Time Preferences */}
      <div className="bg-white border-2 border-gray-200 rounded-xl p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-900 mb-4 sm:mb-6">
          Study Window
        </h2>
        
        <div className="space-y-6">
          {/* Weekday Times */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Weekday Study Times (Monday - Friday)
            </label>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>Earliest: {timePreferences.weekdayEarliest}</span>
                  <span>Latest: {timePreferences.weekdayLatest}</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Earliest</label>
                    <input
                      type="range"
                      min="0"
                      max={timeOptions.length - 1}
                      value={timeOptions.indexOf(timePreferences.weekdayEarliest)}
                      onChange={(e) => {
                        const index = parseInt(e.target.value);
                        const selectedTime = timeOptions[index];
                        if (selectedTime && timeOptions.indexOf(timePreferences.weekdayLatest) >= index) {
                          handleTimePreferenceChange('weekdayEarliest', selectedTime);
                        }
                      }}
                      onMouseDown={handleSliderInteraction}
                      onTouchStart={handleSliderInteraction}
                      onTouchMove={handleSliderInteraction}
                      onMouseMove={(e) => {
                        if (e.buttons === 1) {
                          e.stopPropagation();
                        }
                      }}
                      onWheel={handleSliderInteraction}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none accent-blue-500 cursor-pointer"
                      style={{ touchAction: 'none' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Latest</label>
                    <input
                      type="range"
                      min="0"
                      max={timeOptions.length - 1}
                      value={timeOptions.indexOf(timePreferences.weekdayLatest)}
                      onChange={(e) => {
                        const index = parseInt(e.target.value);
                        const selectedTime = timeOptions[index];
                        if (selectedTime && timeOptions.indexOf(timePreferences.weekdayEarliest) <= index) {
                          handleTimePreferenceChange('weekdayLatest', selectedTime);
                        }
                      }}
                      onMouseDown={handleSliderInteraction}
                      onTouchStart={handleSliderInteraction}
                      onTouchMove={handleSliderInteraction}
                      onMouseMove={(e) => {
                        if (e.buttons === 1) {
                          e.stopPropagation();
                        }
                      }}
                      onWheel={handleSliderInteraction}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none accent-blue-500 cursor-pointer"
                      style={{ touchAction: 'none' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Weekend Times */}
          <div>
            <div className="flex items-center space-x-3 mb-3">
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
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Weekend Study Times (Saturday - Sunday)
                </label>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                      <span>Earliest: {timePreferences.weekendEarliest}</span>
                      <span>Latest: {timePreferences.weekendLatest}</span>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Earliest</label>
                        <input
                          type="range"
                          min="0"
                          max={timeOptions.length - 1}
                          value={timeOptions.indexOf(timePreferences.weekendEarliest)}
                          onChange={(e) => {
                            const index = parseInt(e.target.value);
                            const selectedTime = timeOptions[index];
                            if (selectedTime && timeOptions.indexOf(timePreferences.weekendLatest) >= index) {
                              handleTimePreferenceChange('weekendEarliest', selectedTime);
                            }
                          }}
                          onMouseDown={handleSliderInteraction}
                          onTouchStart={handleSliderInteraction}
                          onTouchMove={handleSliderInteraction}
                          onMouseMove={(e) => {
                            if (e.buttons === 1) {
                              e.stopPropagation();
                            }
                          }}
                          onWheel={handleSliderInteraction}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none accent-blue-500 cursor-pointer"
                          style={{ touchAction: 'none' }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Latest</label>
                        <input
                          type="range"
                          min="0"
                          max={timeOptions.length - 1}
                          value={timeOptions.indexOf(timePreferences.weekendLatest)}
                          onChange={(e) => {
                            const index = parseInt(e.target.value);
                            const selectedTime = timeOptions[index];
                            if (selectedTime && timeOptions.indexOf(timePreferences.weekendEarliest) <= index) {
                              handleTimePreferenceChange('weekendLatest', selectedTime);
                            }
                          }}
                          onMouseDown={handleSliderInteraction}
                          onTouchStart={handleSliderInteraction}
                          onTouchMove={handleSliderInteraction}
                          onMouseMove={(e) => {
                            if (e.buttons === 1) {
                              e.stopPropagation();
                            }
                          }}
                          onWheel={handleSliderInteraction}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none accent-blue-500 cursor-pointer"
                          style={{ touchAction: 'none' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center pt-6 sm:pt-8 pb-4">
        <button
          onClick={() => router.push("/onboarding/slide-19")}
          className="bg-white border-2 border-[#0066FF] text-[#0066FF] px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg text-sm sm:text-base font-medium hover:bg-[#0066FF] hover:text-white transition-colors"
        >
          Back
        </button>
        
        <button
          onClick={handleContinue}
          disabled={isLoading}
          className="bg-[#0066FF] text-white px-8 py-3 rounded-lg font-medium hover:bg-[#0052CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
        >
          {isLoading ? "Next..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
