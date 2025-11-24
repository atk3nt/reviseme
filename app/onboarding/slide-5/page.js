"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import QuizCard from "@/components/QuizCard";

export default function Slide5Page() {
  const [selectedOption, setSelectedOption] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const options = [
    "5–7 months",
    "3–4 months",
    "1–2 months",
    "<1 month"
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
    
    setTimeout(() => {
      router.push("/onboarding/slide-6");
    }, 300);
  };

  const handleSkip = () => {
    router.push("/onboarding/slide-6");
  };

  return (
    <div className="text-center space-y-8">
      <OnboardingProgress 
        currentSlide={5} 
        totalSlides={23} 
        showProgressBar={true}
      />

      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">
          Question 4
        </h1>
        <p className="text-xl text-gray-600">
          How close are your A-Levels?
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
          onClick={() => router.push("/onboarding/slide-4")}
          className="text-gray-500 hover:text-gray-700 text-sm underline"
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
            className="bg-blue-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Next..." : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

