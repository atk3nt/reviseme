"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";

function Slide18Content() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Handle dev skip - manually set has_access for testing
    const devSkip = searchParams.get('dev_skip');
    if (devSkip === 'true') {
      // Set has_access in the database for dev testing
      fetch('/api/dev/set-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }).catch(err => {
        console.error('Failed to set dev access:', err);
      });
    }
  }, [searchParams]);

  const handleNext = () => {
    setIsLoading(true);
    setTimeout(() => {
      router.push("/onboarding/slide-19");
    }, 300);
  };

  return (
    <div className="text-center space-y-8">
      <OnboardingProgress 
        currentSlide={18} 
        totalSlides={23} 
        showProgressBar={true}
      />

      <div className="space-y-6">
        <h1 className="text-4xl font-bold text-gray-900">
          Now let's personalize your plan
        </h1>
        <p className="text-xl text-gray-600">
          Rate your confidence in each topic so we can create the perfect study schedule for you.
        </p>
      </div>

      {/* What to expect */}
      <div className="max-w-lg mx-auto space-y-4 text-left">
        <div className="flex items-start space-x-3">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-blue-600 text-sm font-medium">1</span>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Rate each topic</h3>
            <p className="text-sm text-gray-600">Tell us how confident you feel about each topic (Haven't Learned to Very Strong)</p>
          </div>
        </div>
        
        <div className="flex items-start space-x-3">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-blue-600 text-sm font-medium">2</span>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Skip optional topics</h3>
            <p className="text-sm text-gray-600">Mark any optional topics you're not studying with the X button</p>
          </div>
        </div>
        
        <div className="flex items-start space-x-3">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-blue-600 text-sm font-medium">3</span>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Get your plan</h3>
            <p className="text-sm text-gray-600">We'll create a personalized schedule based on your ratings</p>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={handleNext}
          disabled={isLoading}
          className="bg-blue-500 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
        >
          {isLoading ? "Next..." : "Start Rating Topics"}
        </button>
      </div>
    </div>
  );
}

export default function Slide18Page() {
  return (
    <Suspense fallback={<div className="text-center py-12">Loading...</div>}>
      <Slide18Content />
    </Suspense>
  );
}
