"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import QuizCard from "@/components/QuizCard";
import { unlockSlide } from "@/libs/onboarding-progress";

export default function Slide5Page() {
  const [selectedOption, setSelectedOption] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const options = [
    "Still have time (5–7 months away)",
    "Getting closer (3–4 months away)",
    "Coming up fast (1–2 months away)",
    "Very soon (<1 month away)"
  ];

  useEffect(() => {
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    if (savedAnswers.q4) {
      setSelectedOption(savedAnswers.q4);
    }
  }, []);

  const handleNext = async () => {
    if (!selectedOption) return;
    
    setIsLoading(true);
    
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    savedAnswers.q4 = selectedOption;
    localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
    
    unlockSlide(9);
    
    setTimeout(() => {
      router.push("/onboarding/slide-9");
    }, 300);
  };


  return (
    <div className="text-center w-full h-full flex flex-col justify-between py-adaptive-sm min-h-0">
      {/* Progress */}
      <div className="w-full flex-shrink-0 pb-4 sm:pb-6 md:pb-10">
        <OnboardingProgress 
          currentSlide={5} 
          totalSlides={12} 
          showProgressBar={true}
        />
      </div>

      {/* Question */}
      <div className="space-y-3 sm:space-y-5 flex-grow flex flex-col justify-center pb-4 sm:pb-6 md:pb-10 min-h-0">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#001433] leading-tight">
          When are your exams?
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-[#003D99] leading-relaxed">
          This helps us build the right schedule for you.
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
          onClick={() => router.push("/onboarding/slide-4")}
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

