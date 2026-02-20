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

    const savedAnswers = JSON.parse(localStorage.getItem("quizAnswers") || "{}");
    savedAnswers.name = name;
    savedAnswers.year = year;
    localStorage.setItem("quizAnswers", JSON.stringify(savedAnswers));

    // Save name and year to DB immediately for marketing (Year 12s to target next year)
    // Saves regardless of whether they complete full onboarding
    try {
      const res = await fetch("/api/onboarding/save-name-year", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), year }),
      });
      if (!res.ok) {
        console.warn("save-name-year failed:", res.status, await res.text());
      }
    } catch (err) {
      console.warn("Could not save name/year for marketing:", err);
    }

    unlockSlide(17);

    setTimeout(() => {
      router.push("/onboarding/slide-17");
    }, 300);
  };

  return (
    <div className="text-center w-full h-full flex flex-col justify-between py-adaptive-sm min-h-0">
      {/* Progress */}
      <div className="w-full flex-shrink-0 pb-4 sm:pb-6 md:pb-10">
        <OnboardingProgress 
          currentSlide={3} 
          totalSlides={4} 
          showProgressBar={true}
        />
      </div>

      {/* Question */}
      <div className="space-y-3 sm:space-y-5 flex-grow flex flex-col justify-center pb-4 sm:pb-6 md:pb-10 min-h-0">
        <h1 data-fast-scroll="onboarding_name_year" className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#001433] leading-tight">
          Let's personalise your plan.
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-[#003D99] leading-relaxed">
          What's your first name, and what year are you in?
        </p>
      </div>

      {/* Inputs - flex-shrink allows this to shrink when keyboard appears */}
      <div className="max-w-md mx-auto w-full space-y-3 sm:space-y-4 flex-shrink overflow-y-auto min-h-0">
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

      {/* Navigation - centered, explicit space below for clickability */}
      <div className="flex flex-col justify-center items-center w-full flex-shrink-0 pt-4 sm:pt-6 pb-adaptive-nav">
        <div className="flex justify-center items-center gap-3 sm:gap-6 flex-wrap">
          <button
            onClick={() => router.push("/onboarding/slide-16")}
            className="bg-white border-2 border-[#0066FF] text-[#0066FF] px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-[#0066FF] hover:text-white transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={!name || !year || isLoading}
            className="bg-[#0066FF] hover:bg-[#0052CC] text-white px-5 sm:px-8 py-2 sm:py-2.5 rounded-lg text-sm sm:text-base font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Next..." : "Next"}
          </button>
        </div>
        <div className="w-full min-h-[2.5rem] sm:min-h-[3rem] flex-shrink-0" style={{ minHeight: 'max(2.5rem, env(safe-area-inset-bottom))' }} aria-hidden />
      </div>
    </div>
  );
}

