"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";

export default function Slide10Page() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleNext = () => {
    setIsLoading(true);
    setTimeout(() => {
      router.push("/onboarding/slide-11");
    }, 300);
  };

  return (
    <div className="text-center space-y-8">
      <OnboardingProgress 
        currentSlide={10} 
        totalSlides={23} 
        showProgressBar={true}
      />

      <div className="space-y-6">
        <h1 className="text-4xl font-bold text-gray-900">
          Most students revise aimlessly
        </h1>
        <p className="text-xl text-gray-600">
          — repeating what they already know.
        </p>
        
        {/* Placeholder for visual */}
        <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center">
          <div className="text-gray-500 text-lg">
            📊 Flat line showing "effort vs progress"
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <button
          onClick={() => router.push("/onboarding/slide-9")}
          className="text-gray-500 hover:text-gray-700 text-sm underline"
        >
          ← Back
        </button>
        
        <button
          onClick={handleNext}
          disabled={isLoading}
          className="bg-blue-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Next..." : "Next"}
        </button>
      </div>
    </div>
  );
}

