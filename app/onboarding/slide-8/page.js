"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import QuizCard from "@/components/QuizCard";

export default function Slide8Page() {
  const [selectedOption, setSelectedOption] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const options = [
    "Calm and confident",
    "A bit nervous",
    "Pretty stressed"
  ];

  useEffect(() => {
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    if (savedAnswers.q7) {
      setSelectedOption(savedAnswers.q7);
    }
  }, []);

  const handleNext = async () => {
    if (!selectedOption) return;
    
    setIsLoading(true);
    
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    savedAnswers.q7 = selectedOption;
    localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
    
    setTimeout(() => {
      router.push("/onboarding/slide-9");
    }, 300);
  };

  const handleSkip = () => {
    router.push("/onboarding/slide-9");
  };

  return (
    <div className="text-center space-y-8">
      <OnboardingProgress 
        currentSlide={8} 
        totalSlides={23} 
        showProgressBar={true}
      />

      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-[#001433]">
          Question 7
        </h1>
        <p className="text-xl text-[#003D99]">
          How are you feeling about your upcoming exams?
        </p>
      </div>

      <div className="max-w-md mx-auto">
        <QuizCard
          options={options}
          selected={selectedOption}
          onSelect={setSelectedOption}
        />
      </div>

      <div className="flex justify-between items-center">
        <button
          onClick={() => router.push("/onboarding/slide-7")}
          className="bg-[#E5F0FF] border border-[#0066FF]/20 text-[#003D99] px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg text-xs font-medium hover:bg-[#0066FF]/10 hover:border-[#0066FF]/40 transition-colors"
        >
          ← Back
        </button>
        
        <div className="flex space-x-3">
          <button
            onClick={handleSkip}
            className="text-gray-500 hover:text-gray-700 text-sm underline"
          >
            Skip
          </button>
          <button
            onClick={handleNext}
            disabled={!selectedOption || isLoading}
            className="bg-[#0066FF] text-white px-6 py-2 rounded-lg font-medium hover:bg-[#0052CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Next..." : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

