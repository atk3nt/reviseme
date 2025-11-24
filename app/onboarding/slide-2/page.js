"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import QuizCard from "@/components/QuizCard";

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
    
    // Small delay for better UX
    setTimeout(() => {
      router.push("/onboarding/slide-3");
    }, 300);
  };

  const handleSkip = () => {
    router.push("/onboarding/slide-3");
  };

  return (
    <div className="text-center space-y-8">
      {/* Progress */}
      <OnboardingProgress 
        currentSlide={2} 
        totalSlides={23} 
        showProgressBar={true}
      />

      {/* Question */}
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">
          Question 1
        </h1>
        <p className="text-xl text-gray-600">
          How confident do you feel about revision right now?
        </p>
      </div>

      {/* Options */}
      <div className="max-w-md mx-auto">
        <QuizCard
          options={options}
          selected={selectedOption}
          onSelect={setSelectedOption}
        />
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => router.push("/onboarding/slide-1")}
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

