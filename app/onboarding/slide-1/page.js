"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";

export default function Slide1Page() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const router = useRouter();

  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    
    const formData = new FormData(e.target);
    const email = formData.get("email");
    setEmailAddress(email);
    
    try {
      // Use EmailProvider which sends magic link
      const result = await signIn("email", {
        email,
        redirect: false,
        callbackUrl: "/onboarding/slide-2"
      });
      
      if (result?.error) {
        setError("Failed to send sign-in link. Please try again.");
      } else if (result?.ok) {
        // Magic link sent successfully
        setEmailSent(true);
      }
    } catch (error) {
      console.error('Sign-in error:', error);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Show success message if email was sent
  if (emailSent) {
    return (
      <div className="text-center space-y-8">
        <OnboardingProgress 
          currentSlide={1} 
          totalSlides={23} 
          showProgressBar={true}
        />

        <div className="max-w-lg mx-auto space-y-6 bg-white border-2 border-blue-200 rounded-xl p-8">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Check your email</h2>
            <p className="text-gray-600">
              We've sent a sign-in link to <span className="font-semibold text-gray-900">{emailAddress}</span>
            </p>
            <p className="text-sm text-gray-500">
              Click the link in your email to continue.
            </p>
            <div className="pt-4">
              <button
                onClick={() => router.push("/onboarding/slide-2")}
                className="text-gray-500 hover:text-gray-700 text-sm underline"
              >
                Skip for now →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center space-y-8">
      {/* Progress */}
      <OnboardingProgress 
        currentSlide={1} 
        totalSlides={23} 
        showProgressBar={true}
      />

      {/* Title */}
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">
          Let's get your revision sorted
        </h1>
        <p className="text-xl text-gray-600">
          Sign in or create an account to start building your personalized study plan
        </p>
      </div>

      {/* Sign-in Options */}
      <div className="space-y-6">
        {/* Divider removed - just show email sign-in for now */}

        {/* Email Sign-in Form */}
        <form onSubmit={handleEmailSignIn} className="space-y-4">
          <input
            type="email"
            name="email"
            placeholder="Enter your email"
            required
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
          />
          
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-500 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Sending link..." : "Continue"}
          </button>
        </form>
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Skip for now */}
      <div className="text-center">
        <button
          onClick={() => router.push("/onboarding/slide-2")}
          className="text-gray-500 hover:text-gray-700 text-sm underline"
        >
          Skip for now →
        </button>
      </div>
    </div>
  );
}
