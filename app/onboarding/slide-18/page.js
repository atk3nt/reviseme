"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import { unlockSlide } from "@/libs/onboarding-progress";

function Slide18Content() {
  const [isLoading, setIsLoading] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check if dev mode
    setIsDev(
      typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('.local')
      )
    );
  }, []);

  useEffect(() => {
    // Handle dev skip - manually set has_access for testing (dev only)
    if (!isDev) return;
    
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
  }, [searchParams, isDev]);

  const handleNext = () => {
    setIsLoading(true);
    unlockSlide(19);
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
        <h1 className="text-4xl font-bold text-[#001433]">
          Now let's personalize your plan
        </h1>
        <p className="text-xl text-[#003D99]">
          Rate your confidence in each topic so we can create the perfect study schedule for you.
        </p>
      </div>

      {/* What to expect */}
      <div className="max-w-lg mx-auto space-y-4 text-left">
        <div className="flex items-start space-x-3">
          <div className="w-6 h-6 rounded-full bg-[#E5F0FF] border border-[#0066FF]/30 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-[#0066FF] text-sm font-medium">1</span>
          </div>
          <div>
            <h3 className="font-medium text-[#001433]">Rate each topic</h3>
            <p className="text-sm text-[#003D99]">Rate your confidence from 1 (weak) to 5 (strong). If you haven't learned a topic yet, click "Haven't Learned".</p>
          </div>
        </div>
        
        <div className="flex items-start space-x-3">
          <div className="w-6 h-6 rounded-full bg-[#E5F0FF] border border-[#0066FF]/30 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-[#0066FF] text-sm font-medium">2</span>
          </div>
          <div>
            <h3 className="font-medium text-[#001433]">Optional topics</h3>
            <p className="text-sm text-[#003D99]">If a topic is optional and you're not studying it, just leave it unrated.</p>
          </div>
        </div>
        
        <div className="flex items-start space-x-3">
          <div className="w-6 h-6 rounded-full bg-[#E5F0FF] border border-[#0066FF]/30 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-[#0066FF] text-sm font-medium">3</span>
          </div>
          <div>
            <h3 className="font-medium text-[#001433]">Get your plan</h3>
            <p className="text-sm text-[#003D99]">We'll create a personalized schedule based on your ratings</p>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={handleNext}
          disabled={isLoading}
          className="bg-[#0066FF] text-white px-8 py-3 rounded-lg font-medium hover:bg-[#0052CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
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
