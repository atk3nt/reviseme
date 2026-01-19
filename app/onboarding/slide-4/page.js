"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import QuizCard from "@/components/QuizCard";
import { unlockSlide } from "@/libs/onboarding-progress";

export default function Slide4Page() {
  const [selectedOption, setSelectedOption] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const options = [
    "I can't stay consistent with my revision schedule",
    "I don't know what topics to focus on",
    "I keep putting revision off (procrastination)",
    "I get distracted easily when studying",
    "I want to focus on studying, not on figuring out what and when to study"
  ];

  useEffect(() => {
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    if (savedAnswers.q3) {
      setSelectedOption(savedAnswers.q3);
    }
  }, []);

  const handleNext = async () => {
    if (!selectedOption) return;
    
    setIsLoading(true);
    
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    savedAnswers.q3 = selectedOption;
    localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
    
    unlockSlide(5);
    
    setTimeout(() => {
      router.push("/onboarding/slide-5");
    }, 300);
  };

  const handleSkip = () => {
    unlockSlide(5);
    router.push("/onboarding/slide-5");
  };

  return (
    <div className="text-center w-full h-full flex flex-col justify-between py-8 sm:py-10 md:py-12">
      {/* Progress */}
      <div className="w-full flex-shrink-0 pb-6 sm:pb-8 md:pb-10">
        <OnboardingProgress 
          currentSlide={4} 
          totalSlides={12} 
          showProgressBar={true}
        />
      </div>

      {/* Question */}
      <div className="space-y-4 sm:space-y-5 flex-grow flex flex-col justify-center pb-6 sm:pb-8 md:pb-10">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#001433] leading-tight">
          What's your biggest challenge?
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-[#003D99] leading-relaxed">
          Everyone struggles with something. What's yours?
        </p>
        <p className="text-sm sm:text-base text-[#0066FF] font-medium leading-relaxed pt-2">
          We'll help you tackle it.
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
      <div className="flex justify-between items-center w-full flex-shrink-0 pt-6 sm:pt-8">
        <button
          onClick={() => router.push("/onboarding/slide-2")}
          className="bg-[#E5F0FF] border border-[#0066FF]/20 text-[#003D99] px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg text-xs font-medium hover:bg-[#0066FF]/10 hover:border-[#0066FF]/40 transition-colors"
        >
          ← Back
        </button>
        
        <div className="flex space-x-3 sm:space-x-4">
          <button
            onClick={handleSkip}
            className="text-gray-500 hover:text-gray-700 text-xs sm:text-sm underline"
          >
            Skip
          </button>
          <button
            onClick={handleNext}
            disabled={!selectedOption || isLoading}
            className="bg-[#0066FF] hover:bg-[#0052CC] text-white px-4 sm:px-6 py-1.5 sm:py-2 rounded-lg text-sm sm:text-base font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Next..." : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

