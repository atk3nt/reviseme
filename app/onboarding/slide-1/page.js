"use client";

import { useState, useEffect } from "react";
import { signIn, getProviders } from "next-auth/react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import { unlockSlide } from "@/libs/onboarding-progress";

export default function Slide1Page() {
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const router = useRouter();

  // Initialize onboarding progress and check providers
  useEffect(() => {
    // Unlock slide 1 when user visits it
    unlockSlide(1);
    
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
      // Unlock slide 16 so the magic link callback can access it (subject selection)
      unlockSlide(16);
      
      // Use EmailProvider which sends magic link
      const result = await signIn("email", {
        email,
        redirect: false,
        callbackUrl: "/onboarding/slide-16"
      });
      
      if (result?.error) {
        setError("Failed to send sign-in link. Please try again.");
      } else if (result?.ok) {
        // Magic link sent successfully
        setEmailSent(true);
        // DataFast: track signup initiated
        if (typeof window !== 'undefined' && window.datafast) {
          window.datafast('signup');
        }
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
      // Unlock slide 16 so the OAuth callback can access it (subject selection)
      unlockSlide(16);
      // DataFast: track signup initiated (before redirect)
      if (typeof window !== 'undefined' && window.datafast) {
        window.datafast('signup');
      }
      const result = await signIn("google", {
        redirect: true,
        callbackUrl: "/onboarding/slide-16"
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
      <div className="text-center w-full h-full flex flex-col justify-between py-adaptive-sm min-h-0">
        {/* Progress */}
        <div className="w-full flex-shrink-0 pb-4 sm:pb-6 md:pb-10">
          <OnboardingProgress 
            currentSlide={1} 
            totalSlides={4} 
            showProgressBar={true}
          />
        </div>

        {/* Content */}
        <div className="space-y-3 sm:space-y-5 flex-grow flex flex-col justify-center pb-4 sm:pb-6 md:pb-10 min-h-0">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-[#E5F0FF] rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 sm:w-10 sm:h-10 text-[#0066FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#001433] leading-tight">
            Check your email!
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-[#003D99] leading-relaxed">
            We've sent a sign-in link to <span className="font-semibold text-[#001433]">{emailAddress}</span>
          </p>
          <p className="text-sm sm:text-base text-[#003D99] leading-relaxed">
            It may take a minute or two to arrive. Check your spam folder if you don't see it.
          </p>
        </div>

      </div>
    );
  }

  return (
    <div className="text-center w-full h-full flex flex-col justify-between py-adaptive-sm min-h-0">
      {/* Progress */}
      <div className="w-full flex-shrink-0 pb-4 sm:pb-6 md:pb-10">
        <OnboardingProgress 
          currentSlide={1} 
          totalSlides={4} 
          showProgressBar={true}
        />
      </div>

      {/* Title */}
      <div className="space-y-3 sm:space-y-5 flex-shrink-0 pb-4 sm:pb-6 md:pb-10">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#001433] leading-tight">
          Let's get your revision sorted.
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-[#003D99] leading-relaxed">
          Sign in to start building your personalised study plan
        </p>
      </div>

      {/* Sign-in Options - flex-grow allows this section to shrink when keyboard appears */}
      <div className="space-y-3 sm:space-y-4 w-full max-w-md mx-auto flex-shrink overflow-y-auto min-h-0">
        {/* Google Sign-in Button (only shown if Google OAuth is configured) */}
        {googleAvailable && (
          <>
            <button
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading}
              className="w-full flex items-center justify-center gap-2 sm:gap-3 bg-white border-2 border-[#0066FF]/20 text-[#003D99] py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg text-sm sm:text-base font-medium hover:border-[#0066FF]/40 hover:bg-[#E5F0FF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGoogleLoading ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" viewBox="0 0 24 24">
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
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#0066FF]/20"></div>
              </div>
              <div className="relative flex justify-center text-xs sm:text-sm">
                <span className="px-2 bg-white text-gray-500">Or</span>
              </div>
            </div>
          </>
        )}

        {/* Email Sign-in Form */}
        <form onSubmit={handleEmailSignIn} className="space-y-3 sm:space-y-4">
          <input
            type="email"
            name="email"
            placeholder="Your email address"
            required
            className="w-full px-4 py-2.5 sm:py-3 text-sm sm:text-base border-2 border-[#0066FF]/20 rounded-lg focus:border-[#0066FF] focus:outline-none transition-colors"
          />
          
          <button
            type="submit"
            disabled={isLoading}
            className="bg-[#0066FF] hover:bg-[#0052CC] text-white w-full py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg text-sm sm:text-base font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Sending link..." : "Continue with Email"}
          </button>
        </form>
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-error text-xs sm:text-sm bg-error/10 p-2 sm:p-3 rounded-lg max-w-md mx-auto mt-2">
          {error}
        </div>
      )}

    </div>
  );
}
