"use client";

import { useState, useEffect } from "react";
import { signIn, getProviders } from "next-auth/react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";

export default function Slide1Page() {
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const router = useRouter();

  // Check if Google OAuth is available
  useEffect(() => {
    const checkProviders = async () => {
      try {
        const providers = await getProviders();
        if (providers && providers.google) {
          setGoogleAvailable(true);
        }
      } catch (error) {
        console.error("Error checking providers:", error);
      }
    };
    checkProviders();
  }, []);

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

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setError("");
    
    try {
      const result = await signIn("google", {
        redirect: true,
        callbackUrl: "/onboarding/slide-2"
      });
      
      // Note: signIn with redirect: true will navigate away, so this code may not execute
      if (result?.error) {
        setError("Failed to sign in with Google. Please try again.");
        setIsGoogleLoading(false);
      }
    } catch (error) {
      console.error('Google sign-in error:', error);
      setError("Failed to sign in with Google. Please try again.");
      setIsGoogleLoading(false);
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
        {/* Google Sign-in Button (only shown if Google OAuth is configured) */}
        {googleAvailable && (
          <>
            <button
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-300 text-gray-700 py-3 px-6 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGoogleLoading ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or</span>
              </div>
            </div>
          </>
        )}

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
            {isLoading ? "Sending link..." : "Continue with Email"}
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
