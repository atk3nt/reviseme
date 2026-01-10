"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";

export default function Slide15Page() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleNext = () => {
    setIsLoading(true);
    setTimeout(() => {
      router.push("/onboarding/slide-16");
    }, 300);
  };

  return (
    <div className="text-center space-y-8">
      <OnboardingProgress 
        currentSlide={15} 
        totalSlides={23} 
        showProgressBar={true}
      />

      <div className="space-y-6">
        <h1 className="text-4xl font-bold text-[#001433]">
          Let's choose your subjects next
        </h1>
        <p className="text-xl text-[#003D99]">
          We'll build your personalized study plan around the subjects you're actually taking.
        </p>
      </div>

      <div className="flex justify-between items-center">
        <button
          onClick={() => router.push("/onboarding/slide-14")}
          className="bg-[#E5F0FF] border border-[#0066FF]/20 text-[#003D99] px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg text-xs font-medium hover:bg-[#0066FF]/10 hover:border-[#0066FF]/40 transition-colors"
        >
          ← Back
        </button>
        
        <button
          onClick={handleNext}
          disabled={isLoading}
          className="bg-[#0066FF] text-white px-8 py-3 rounded-lg font-medium hover:bg-[#0052CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
        >
          {isLoading ? "Next..." : "Choose My Subjects"}
        </button>
      </div>
    </div>
  );
}

