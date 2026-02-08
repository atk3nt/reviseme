"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import OnboardingProgress from "@/components/OnboardingProgress";
import config from "@/config";
import { unlockSlide } from "@/libs/onboarding-progress";

export default function Slide17Page() {
  const [isLoading, setIsLoading] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Check if we're in development - explicitly exclude production domain
    const hostname = window.location.hostname;
    const isProduction = hostname === 'reviseme.co' || hostname.endsWith('.reviseme.co');
    setIsDev(
      !isProduction && (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.includes('.local')
      )
    );
  }, []);

  useEffect(() => {
    // Auto-skip to Slide 19 if user already has access (family/paid users)
    if (status === 'authenticated' && session?.user?.hasAccess) {
      console.log('[Slide 17] User has access, skipping to Slide 19');
      unlockSlide(19);
      router.push("/onboarding/slide-19");
      return;
    }

    // Track when user reaches payment page (for funnel analytics) - only when they need to pay
    if (status === 'authenticated' && !session?.user?.hasAccess) {
      fetch("/api/onboarding/reached-payment", { method: "POST" }).catch(() => {});
    }
  }, [session, status, router]);

  const handleStartTrial = async () => {
    setIsLoading(true);
    try {
      // Unlock slide-19 before redirecting to payment (so return URL works)
      unlockSlide(19);
      
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
          successUrl: `${window.location.origin}/onboarding/slide-19?payment=success`,
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
    unlockSlide(19);
    router.push("/onboarding/slide-19?payment=success&dev_skip=true");
  };


  return (
    <div className="text-center w-full h-full flex flex-col justify-between py-adaptive-sm min-h-0">
      {/* Progress */}
      <div className="w-full flex-shrink-0 pb-4 sm:pb-6 md:pb-10">
        <OnboardingProgress 
          currentSlide={4} 
          totalSlides={4} 
          showProgressBar={true}
        />
      </div>

      {/* Title */}
      <div className="space-y-2 sm:space-y-4 flex-shrink-0 pb-4 sm:pb-6">
        <h1
          data-fast-scroll="onboarding_payment_page"
          className="text-xl sm:text-2xl md:text-3xl font-bold text-[#001433] leading-tight"
        >
          One payment.<br />Your entire exam season sorted.
        </h1>
        <p className="text-sm sm:text-base md:text-lg text-[#003D99] leading-relaxed">
          Full access until July. No subscriptions.<br />7-day money-back guarantee.
        </p>
      </div>

      {/* Pricing Card */}
      <div className="max-w-lg mx-auto bg-white border-2 border-[#0066FF]/20 rounded-xl p-5 sm:p-6 md:p-8 shadow-lg flex-shrink-0">
        <div className="space-y-3 sm:space-y-4">
          {/* Plan Name and Pricing Header */}
          <div className="flex items-center justify-between gap-4 mb-2 sm:mb-3">
            {/* Plan Name and Duration - Left Side */}
            <div className="text-left">
              <div className="text-lg sm:text-xl md:text-2xl font-bold text-[#001433] leading-tight">Exam Season</div>
              <div className="text-lg sm:text-xl md:text-2xl font-bold text-[#001433] leading-tight">Pass</div>
              <div className="text-xs sm:text-sm text-[#003D99] mt-1">Jan–July 2026</div>
            </div>
            
            {/* Pricing Information - Right Side, Centered */}
            <div className="text-center flex-shrink-0 min-w-[160px] sm:min-w-[180px] md:min-w-[200px]">
              <div className="text-xs md:text-sm text-[#0066FF]/50 line-through whitespace-nowrap">£12.99 1-Month Plan</div>
              <div className="text-4xl md:text-5xl font-semibold text-[#001433] leading-none">£29.99</div>
            </div>
          </div>

          {/* CTA Button */}
          <button
            data-fast-goal="payment_button_clicked"
            onClick={handleStartTrial}
            disabled={isLoading}
            className="w-full bg-[#0066FF] text-white py-2 sm:py-2.5 px-6 rounded-lg font-medium text-base hover:bg-[#0052CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Processing..." : "Get Your Plan"}
          </button>
          
          {/* Features */}
          <div className="space-y-2 text-left">
            <div className="text-xs sm:text-sm font-medium text-[#001433]">Included:</div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-xs sm:text-sm text-[#001433]">Smart scheduling</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-xs sm:text-sm text-[#001433]">Unlimited Weekly Revision Plans</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-xs sm:text-sm text-[#001433]">Spaced Repetition Logic</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-xs sm:text-sm text-[#001433]">Built-in Pomodoro Timer</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-xs sm:text-sm text-[#001433]">Exam Practice Blocks</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-xs sm:text-sm text-[#001433]">8+ A-Level subjects</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-xs sm:text-sm text-[#001433]">Progress tracking & insights</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-xs sm:text-sm text-[#001433]">7-day money-back guarantee</span>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="text-center pt-2 sm:pt-3 border-t border-[#0066FF]/20">
            <div className="text-xs sm:text-sm text-[#003D99] mb-1">Secure payment with</div>
            <div className="flex justify-center space-x-3">
              <div className="text-xs sm:text-sm font-medium text-gray-700">💳 Card</div>
              <div className="text-xs sm:text-sm font-medium text-gray-700">🍎 Apple Pay</div>
              <div className="text-xs sm:text-sm font-medium text-gray-700">📱 Google Pay</div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-center items-center w-full flex-shrink-0 pt-4 sm:pt-6">
        <button
          onClick={() => router.push("/onboarding/slide-9")}
          className="bg-white border-2 border-[#0066FF] text-[#0066FF] px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg text-sm sm:text-base font-medium hover:bg-[#0066FF] hover:text-white transition-colors"
        >
          Back
        </button>
        
        {/* Dev-only skip button */}
        {isDev && (
          <button
            onClick={handleSkip}
            className="ml-4 text-[#003D99]/50 hover:text-[#0066FF] text-xs transition-colors"
          >
            [DEV] Skip
          </button>
        )}
      </div>
    </div>
  );
}
