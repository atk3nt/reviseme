"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import QuizCard from "@/components/QuizCard";
import { unlockSlide } from "@/libs/onboarding-progress";

export default function Slide2Page() {
  const [selectedOption, setSelectedOption] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const options = [
    "Very confident",
    "Somewhat confident", 
    "Not confident yet"
  ];

  useEffect(() => {
    // SECURITY: Don't auto-unlock slide-2 on mount
    // The layout allows temporary access for auth callbacks, but we shouldn't
    // permanently unlock this slide until user progresses naturally from slide-1
    // This prevents bypassing by manually typing the URL
    
    // Load existing answer if user goes back
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    if (savedAnswers.q1) {
      setSelectedOption(savedAnswers.q1);
    }
  }, []);

  const handleNext = async () => {
    if (!selectedOption) return;
    
    setIsLoading(true);
    
    // Save answer to localStorage
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    savedAnswers.q1 = selectedOption;
    localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
    
    // Unlock the next slide
    unlockSlide(4);
    
    // Small delay for better UX
    setTimeout(() => {
      router.push("/onboarding/slide-4");
    }, 300);
  };


  return (
    <div className="text-center w-full h-full flex flex-col justify-between py-adaptive-sm min-h-0">
      {/* Progress */}
      <div className="w-full flex-shrink-0 pb-4 sm:pb-6 md:pb-10">
        <OnboardingProgress 
          currentSlide={2} 
          totalSlides={12} 
          showProgressBar={true}
        />
      </div>

      {/* Question */}
      <div className="space-y-3 sm:space-y-5 flex-grow flex flex-col justify-center pb-4 sm:pb-6 md:pb-10 min-h-0">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#001433] leading-tight">
          How are you feeling?
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-[#003D99] leading-relaxed">
          Let's start with where you're at right now. How confident do you feel about your revision?
        </p>
      </div>

      {/* Options */}
      <div className="max-w-md mx-auto w-full flex-shrink-0">
        <QuizCard
          options={options}
          selected={selectedOption}
          onSelect={setSelectedOption}
        />
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center w-full flex-shrink-0 pt-4 sm:pt-6">
        <button
          onClick={() => router.push("/onboarding/slide-1")}
          className="bg-white border-2 border-[#0066FF] text-[#0066FF] px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-[#0066FF] hover:text-white transition-colors"
        >
          Back
        </button>
        
        <div className="flex space-x-3 sm:space-x-4">
          <button
            onClick={handleNext}
            disabled={!selectedOption || isLoading}
            className="bg-[#0066FF] hover:bg-[#0052CC] text-white px-5 sm:px-8 py-2 sm:py-2.5 rounded-lg text-sm sm:text-base font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Next..." : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

