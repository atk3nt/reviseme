"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";

export default function Slide9Page() {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    if (savedAnswers.name) setName(savedAnswers.name);
    if (savedAnswers.age) setAge(savedAnswers.age);
  }, []);

  const handleNext = async () => {
    if (!name || !age) return;
    
    setIsLoading(true);
    
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    savedAnswers.name = name;
    savedAnswers.age = age;
    localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
    
    setTimeout(() => {
      router.push("/onboarding/slide-10");
    }, 300);
  };

  const handleSkip = () => {
    router.push("/onboarding/slide-10");
  };

  return (
    <div className="text-center space-y-8">
      <OnboardingProgress 
        currentSlide={9} 
        totalSlides={23} 
        showProgressBar={true}
      />

      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-[#001433]">
          Question 8
        </h1>
        <p className="text-xl text-[#003D99]">
          Almost done — what's your first name and how old are you?
        </p>
      </div>

      <div className="max-w-md mx-auto space-y-4">
        <input
          type="text"
          placeholder="First name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 border-2 border-[#0066FF]/20 rounded-lg focus:border-[#0066FF] focus:outline-none transition-colors"
        />
        <input
          type="number"
          placeholder="Age (16–19 typical)"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          min="16"
          max="19"
          className="w-full px-4 py-3 border-2 border-[#0066FF]/20 rounded-lg focus:border-[#0066FF] focus:outline-none transition-colors"
        />
      </div>

      <div className="flex justify-between items-center">
        <button
          onClick={() => router.push("/onboarding/slide-8")}
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
            disabled={!name || !age || isLoading}
            className="bg-[#0066FF] text-white px-6 py-2 rounded-lg font-medium hover:bg-[#0052CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Next..." : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

