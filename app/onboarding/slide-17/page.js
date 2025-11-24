"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import config from "@/config";

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
        <h1 className="text-4xl font-bold text-gray-900">
          Ready to build your study plan?
        </h1>
        <p className="text-xl text-gray-600">
          Get your personalized revision schedule in minutes
        </p>
      </div>

      {/* Pricing Card */}
      <div className="max-w-lg mx-auto bg-white border-2 border-gray-200 rounded-xl p-8 shadow-lg">
        <div className="space-y-6">
          {/* Value Framing */}
          <div className="text-center">
            <div className="text-sm text-gray-500 line-through mb-1">Monthly Plan £12.99</div>
            <div className="text-4xl font-bold text-gray-900">£4.16</div>
            <div className="text-lg text-gray-600">per month</div>
            <div className="text-sm text-gray-500 mb-2">One-time payment: £24.99</div>
            <div className="text-sm text-blue-600 font-medium">Exam Season Pass: Jan–July 2026</div>
          </div>
          
          {/* Features */}
          <div className="space-y-3 text-left">
            <div className="flex items-center space-x-3">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-gray-700">Personalized study schedule</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-gray-700">AI-powered topic explanations</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-gray-700">Progress tracking & analytics</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-gray-700">7-day refund guarantee</span>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="text-center pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600 mb-2">Secure payment with</div>
            <div className="flex justify-center space-x-4">
              <div className="text-sm font-medium text-gray-700">💳 Card</div>
              <div className="text-sm font-medium text-gray-700">🍎 Apple Pay</div>
              <div className="text-sm font-medium text-gray-700">📱 Google Pay</div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <button
          onClick={handleStartTrial}
          disabled={isLoading}
          className="w-full bg-blue-500 text-white py-4 px-8 rounded-lg font-medium text-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Processing..." : "Get Exam Season Pass - £24.99"}
        </button>
        
        {/* Dev-only skip button */}
        {isDev && (
          <button
            onClick={handleSkip}
            className="w-full bg-yellow-500 text-white py-2 px-4 rounded-lg font-medium text-sm hover:bg-yellow-600 transition-colors"
          >
            [DEV] Skip Payment
          </button>
        )}
        
        <p className="text-sm text-gray-500">
          7-day refund guarantee • One-time payment
        </p>
      </div>

      <div className="flex justify-start">
        <button
          onClick={() => router.push("/onboarding/slide-16-5")}
          className="text-gray-500 hover:text-gray-700 text-sm underline"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
