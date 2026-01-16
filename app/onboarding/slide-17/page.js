"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import config from "@/config";
import { unlockSlide } from "@/libs/onboarding-progress";

export default function Slide17Page() {
  const [isLoading, setIsLoading] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Check if we're in development (localhost or dev environment)
    setIsDev(
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.includes('.local')
    );
  }, []);

  const handleStartTrial = async () => {
    setIsLoading(true);
    
    try {
      // Unlock slide-18 before redirecting to payment (so return URL works)
      unlockSlide(18);
      
      // Use price ID from config (matches webhook expectations)
      const priceId = config.stripe.plans[0]?.priceId;
      
      if (!priceId) {
        throw new Error('Price ID not configured');
      }
      
      // Redirect to Stripe checkout
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId,
          successUrl: `${window.location.origin}/onboarding/slide-18?payment=success`,
          cancelUrl: `${window.location.origin}/onboarding/slide-17?payment=cancelled`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      setIsLoading(false);
      alert('Failed to start checkout. Please try again.');
    }
  };

  const handleSkip = () => {
    // Skip payment in development mode
    // Manually set has_access to true for testing
    unlockSlide(18);
    router.push("/onboarding/slide-18?payment=success&dev_skip=true");
  };


  return (
    <div className="text-center space-y-8">
      <OnboardingProgress 
        currentSlide={17} 
        totalSlides={23} 
        showProgressBar={true}
      />

      <div className="space-y-6">
        <h1 className="text-4xl font-bold text-[#001433]">
          One payment. Your revision plan, done.
        </h1>
        <p className="text-xl text-[#003D99]">
          Full access. No subscriptions. No hidden fees.
        </p>
      </div>

      {/* Pricing Card */}
      <div className="max-w-lg mx-auto bg-white border-2 border-[#0066FF]/20 rounded-xl p-8 shadow-lg">
        <div className="space-y-6">
          {/* Plan Name and Pricing Header */}
          <div className="flex items-start justify-between mb-4">
            {/* Plan Name and Duration - Left Side */}
            <div className="text-left">
              <div className="text-3xl font-bold text-[#001433]">Exam Season Pass</div>
              <div className="text-lg text-[#003D99] mt-1">Jan–July 2026</div>
            </div>
            
            {/* Pricing Information - Right Side, Centered */}
            <div className="text-center pt-2">
              <div className="text-sm text-[#0066FF]/50 line-through mb-0.5">£12.99 1-Month Plan</div>
              <div className="text-6xl font-semibold text-[#001433]">£29.99</div>
            </div>
          </div>

          {/* CTA Button */}
          <button
            onClick={handleStartTrial}
            disabled={isLoading}
            className="w-full bg-[#0066FF] text-white py-3 px-8 rounded-lg font-medium text-lg hover:bg-[#0052CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Processing..." : "Get Your Plan"}
          </button>
          
          {/* Features */}
          <div className="space-y-3 text-left pt-2">
            <div className="text-sm font-medium text-[#001433] mb-2">Included features:</div>
            <div className="flex items-center space-x-3">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-[#001433]">Smart scheduling</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-[#001433]">Unlimited Weekly Revision Plans</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-[#001433]">Spaced Repetition Logic</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-[#001433]">Built-in Pomodoro Timer</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-[#001433]">Exam Practice Blocks</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-[#001433]">8+ A-Level subjects</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-[#001433]">Progress tracking & insights</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-[#001433]">7-day money-back guarantee</span>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="text-center pt-4 border-t border-[#0066FF]/20">
            <div className="text-sm text-[#003D99] mb-2">Secure payment with</div>
            <div className="flex justify-center space-x-4">
              <div className="text-sm font-medium text-gray-700">💳 Card</div>
              <div className="text-sm font-medium text-gray-700">🍎 Apple Pay</div>
              <div className="text-sm font-medium text-gray-700">📱 Google Pay</div>
            </div>
          </div>
        </div>
      </div>

      {/* Dev-only skip button */}
      {isDev && (
        <div className="flex justify-center">
          <button
            onClick={handleSkip}
            className="btn btn-xs btn-ghost text-xs opacity-50 hover:opacity-100"
            style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem' }}
          >
            [DEV] Skip
          </button>
        </div>
      )}

      <div className="flex justify-start">
        <button
          onClick={() => router.push("/onboarding/slide-16-5")}
          className="bg-[#E5F0FF] border border-[#0066FF]/20 text-[#003D99] px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg text-xs font-medium hover:bg-[#0066FF]/10 hover:border-[#0066FF]/40 transition-colors"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
