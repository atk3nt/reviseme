"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import QuizCard from "@/components/QuizCard";
import { unlockSlide } from "@/libs/onboarding-progress";

export default function Slide9Page() {
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const yearOptions = ["Year 12", "Year 13"];

  useEffect(() => {
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    if (savedAnswers.name) setName(savedAnswers.name);
    if (savedAnswers.year) setYear(savedAnswers.year);
  }, []);

  const handleNext = async () => {
    if (!name || !year) return;
    
    setIsLoading(true);
    
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    savedAnswers.name = name;
    savedAnswers.year = year;
    localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
    
    unlockSlide(16);
    
    setTimeout(() => {
      router.push("/onboarding/slide-16");
    }, 300);
  };

  const handleSkip = () => {
    unlockSlide(16);
    router.push("/onboarding/slide-16");
  };

  return (
    <div className="text-center w-full h-full flex flex-col justify-between py-8 sm:py-10 md:py-12">
      {/* Progress */}
      <div className="w-full flex-shrink-0 pb-6 sm:pb-8 md:pb-10">
        <OnboardingProgress 
          currentSlide={9} 
          totalSlides={12} 
          showProgressBar={true}
        />
      </div>

      {/* Question */}
      <div className="space-y-4 sm:space-y-5 flex-grow flex flex-col justify-center pb-6 sm:pb-8 md:pb-10">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#001433] leading-tight">
          Let's personalise your plan.
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-[#003D99] leading-relaxed">
          What's your first name, and what year are you in?
        </p>
      </div>

      {/* Inputs */}
      <div className="max-w-md mx-auto w-full space-y-4 flex-shrink-0">
        <input
          type="text"
          placeholder="First name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 border-2 border-[#0066FF]/20 rounded-lg focus:border-[#0066FF] focus:outline-none transition-colors text-sm sm:text-base"
        />
        <QuizCard
          options={yearOptions}
          selected={year}
          onSelect={setYear}
          horizontal={true}
        />
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center w-full flex-shrink-0 pt-6 sm:pt-8">
        <button
          onClick={() => router.push("/onboarding/slide-5")}
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
            disabled={!name || !year || isLoading}
            className="bg-[#0066FF] hover:bg-[#0052CC] text-white px-4 sm:px-6 py-1.5 sm:py-2 rounded-lg text-sm sm:text-base font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Next..." : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

