"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import DevPanel from "@/components/DevPanel";
import { getSlideNumberFromPath, canAccessSlide, getHighestAllowedSlidePath } from "@/libs/onboarding-progress";

export default function OnboardingLayout({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [isResetting, setIsResetting] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);

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
    // Check slide access (skip in dev mode for easier development)
    if (isDev) {
      setIsCheckingAccess(false);
      return;
    }

    const slideNumber = getSlideNumberFromPath(pathname);
    
    // Only check access for actual slide pages
    if (slideNumber !== null && !canAccessSlide(slideNumber)) {
      // Redirect to the highest allowed slide
      const allowedPath = getHighestAllowedSlidePath();
      if (pathname !== allowedPath) {
        router.replace(allowedPath);
        return;
      }
    }
    
    setIsCheckingAccess(false);
  }, [pathname, router, isDev]);

  useEffect(() => {
    // Only redirect if user has paid AND completed onboarding
    // This allows users to complete onboarding after payment
    if (status === 'authenticated' && session?.user?.hasAccess && session?.user?.hasCompletedOnboarding) {
      router.push('/plan');
    }
  }, [status, session, router]);

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset everything and start onboarding again? This will delete all your study blocks and preferences.')) {
      return;
    }
    
    setIsResetting(true);
    
    try {
      // Clear database data
      const resetResponse = await fetch('/api/dev/reset-onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!resetResponse.ok) {
        throw new Error('Failed to reset database');
      }
      
      // Clear localStorage (including onboarding progress)
      localStorage.removeItem('quizAnswers');
      localStorage.removeItem('onboardingProgress');
      
      // Wait a moment for database update to propagate, then redirect
      setTimeout(() => {
        // Force full page reload to onboarding (bypasses client-side redirects)
        window.location.href = '/onboarding/slide-1';
      }, 500);
    } catch (error) {
      console.error('Reset error:', error);
      alert('Failed to reset. Please try again.');
      setIsResetting(false);
    }
  };

  // Show loading while checking access
  if (isCheckingAccess) {
    return (
      <div className="h-screen bg-white flex items-center justify-center">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  return (
    <div className="h-screen bg-white overflow-y-auto">
      <div className="min-h-full flex flex-col">
        {/* Reset button in top right - Dev only */}
        {isDev && (
          <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-50">
            <button
              onClick={handleReset}
              className="btn btn-xs sm:btn-sm btn-error"
              disabled={isResetting}
            >
              {isResetting ? (
                <>
                  <span className="loading loading-spinner loading-xs"></span>
                  <span className="hidden sm:inline">Resetting...</span>
                </>
              ) : (
                <span className="text-xs sm:text-sm">🔄 Reset</span>
              )}
            </button>
          </div>
        )}
        
        {/* Main content area - fills viewport with responsive padding */}
        <main className="flex-1 flex items-center justify-center px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-12">
          <div className="w-full max-w-2xl mx-auto h-full flex flex-col justify-center">
            {children}
          </div>
        </main>
        
        {/* Dev Panel */}
        <DevPanel />
      </div>
    </div>
  );
}