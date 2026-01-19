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
    
    // Debug logging
    console.log('[ONBOARDING LAYOUT] Access check:', {
      pathname,
      slideNumber,
      status,
      hasAccess: session?.user?.hasAccess,
      canAccess: slideNumber ? canAccessSlide(slideNumber) : 'N/A'
    });
    
    // If not a slide page, allow access immediately
    if (slideNumber === null) {
      setIsCheckingAccess(false);
      return;
    }
    
    // Special case: Allow slide-2 if user is authenticated OR still loading session
    // This handles the case where user clicks magic link in email and arrives at slide-2
    // We allow access while loading to prevent premature redirects during auth callback
    if (slideNumber === 2 && (status === 'authenticated' || status === 'loading')) {
      console.log('[ONBOARDING LAYOUT] Allowing slide-2 access (auth callback)');
      setIsCheckingAccess(false);
      return;
    }
    
    // Special case: Allow slide-19 if user has paid (hasAccess) OR if payment success URL
    // This handles the case where user completes Stripe payment and returns to slide-19
    // Allow access while session is loading to prevent premature redirects during webhook processing
    // Also handles the case where plan page redirects users back to resume onboarding
    if (slideNumber === 19) {
      const hasAccess = session?.user?.hasAccess;
      const isPaymentSuccess = typeof window !== 'undefined' && 
        window.location.search.includes('payment=success');
      
      if (hasAccess || isPaymentSuccess || status === 'loading') {
        console.log('[ONBOARDING LAYOUT] Allowing slide-19 access (payment callback)', {
          hasAccess,
          isPaymentSuccess,
          status
        });
        setIsCheckingAccess(false);
        return;
      }
      
      // Also allow authenticated users with hasAccess to resume onboarding
      if (status === 'authenticated' && hasAccess) {
        console.log('[ONBOARDING LAYOUT] Allowing slide-19 access (resume onboarding for paid user)');
        setIsCheckingAccess(false);
        return;
      }
    }
    
    // SECURITY FIX: Wait for session to load before checking access for regular slides
    // This prevents pages from mounting and unlocking themselves before we can verify access
    if (status === 'loading') {
      console.log('[ONBOARDING LAYOUT] Waiting for session to load...');
      // Keep showing loading spinner, don't allow page to mount yet
      return;
    }
    
    // Now check access (session is loaded, no longer 'loading')
    if (!canAccessSlide(slideNumber)) {
      const allowedPath = getHighestAllowedSlidePath();
      console.log('[ONBOARDING LAYOUT] Access denied, redirecting to:', allowedPath);
      router.replace(allowedPath);
      return;
    }
    
    // Access granted - allow page to mount
    setIsCheckingAccess(false);
  }, [pathname, router, isDev, status, session]);

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
        <main className="flex-1 flex items-center justify-center px-6 sm:px-8 md:px-12">
          <div className="w-full max-w-2xl mx-auto flex flex-col h-full max-h-[80vh]">
            {children}
          </div>
        </main>
        
        {/* Dev Panel */}
        <DevPanel />
      </div>
    </div>
  );
}