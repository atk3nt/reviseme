"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import QuizCard from "@/components/QuizCard";

export default function Slide3Page() {
  const [selectedOption, setSelectedOption] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const options = [
    "Every day",
    "A few times", 
    "Rarely"
  ];

  useEffect(() => {
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    if (savedAnswers.q2) {
      setSelectedOption(savedAnswers.q2);
    }
  }, []);

  const handleNext = async () => {
    if (!selectedOption) return;
    
    setIsLoading(true);
    
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    savedAnswers.q2 = selectedOption;
    localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
    
    setTimeout(() => {
      router.push("/onboarding/slide-4");
    }, 300);
  };

  const handleSkip = () => {
    router.push("/onboarding/slide-4");
  };

  return (
    <div className="text-center space-y-4 sm:space-y-6 md:space-y-8 w-full flex flex-col justify-between min-h-full">
      {/* Progress */}
      <div className="w-full">
        <OnboardingProgress 
          currentSlide={3} 
          totalSlides={23} 
          showProgressBar={true}
        />
      </div>

      {/* Question */}
      <div className="space-y-2 sm:space-y-3 md:space-y-4 flex-grow flex flex-col justify-center">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#001433] px-4 sm:px-0">
          Question 2
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-[#003D99] px-4 sm:px-0">
          How often do you currently revise each week?
        </p>
      </div>

      {/* Options */}
      <div className="max-w-md mx-auto w-full px-4 sm:px-0">
        <QuizCard
          options={options}
          selected={selectedOption}
          onSelect={setSelectedOption}
        />
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center pt-4 sm:pt-6 w-full">
        <button
          onClick={() => router.push("/onboarding/slide-2")}
          className="bg-[#E5F0FF] border border-[#0066FF]/20 text-[#003D99] px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg text-xs font-medium hover:bg-[#0066FF]/10 hover:border-[#0066FF]/40 transition-colors"
        >
          ← Back
        </button>
        
        <div className="flex space-x-2 sm:space-x-3">
          <button
            onClick={handleSkip}
            className="text-gray-500 hover:text-gray-700 text-xs sm:text-sm underline"
          >
            Skip
          </button>
          <button
            onClick={handleNext}
            disabled={!selectedOption || isLoading}
            className="bg-[#0066FF] text-white px-4 sm:px-6 py-1.5 sm:py-2 rounded-lg text-sm sm:text-base font-medium hover:bg-[#0052CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Next..." : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

