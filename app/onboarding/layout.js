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
    // Check if dev mode - explicitly exclude production domain
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const isProduction = hostname === 'reviseme.co' || hostname.endsWith('.reviseme.co');
    const devMode = !isProduction && (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.includes('.local')
    );
    setIsDev(devMode);
    
    // If dev mode, immediately allow access without waiting for session
    if (devMode) {
      setIsCheckingAccess(false);
    }
  }, []);

  useEffect(() => {
    // Check if dev mode INLINE (don't rely on state to avoid race conditions)
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const isProduction = hostname === 'reviseme.co' || hostname.endsWith('.reviseme.co');
    const isDevMode = !isProduction && (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.includes('.local')
    );
    
    // Check slide access (skip in dev mode for easier development)
    if (isDevMode) {
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
    
    // Special case: Allow slide-16 if user is authenticated OR still loading session
    // This handles the case where user clicks magic link in email and arrives at slide-16
    // We allow access while loading to prevent premature redirects during auth callback
    if (slideNumber === 16 && (status === 'authenticated' || status === 'loading')) {
      console.log('[ONBOARDING LAYOUT] Allowing slide-16 access (auth callback)');
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

    // Paid user on new device: allow post-payment slides 19–22 without requiring localStorage progress
    // so plan page can send them to their resume slide (e.g. slide-20/21) and they are not kicked to slide-1
    if (slideNumber >= 19 && slideNumber <= 22 && status === 'authenticated' && session?.user?.hasAccess) {
      console.log('[ONBOARDING LAYOUT] Allowing slide', slideNumber, 'access (paid user, post-payment slides)');
      setIsCheckingAccess(false);
      return;
    }
    
    // SECURITY FIX: Wait for session to load before checking access for regular slides
    // This prevents pages from mounting and unlocking themselves before we can verify access
    // HOWEVER: If unauthenticated, allow access to slide 1 (start of onboarding)
    if (status === 'loading') {
      console.log('[ONBOARDING LAYOUT] Waiting for session to load...');
      // Keep showing loading spinner, don't allow page to mount yet
      return;
    }
    
    // If unauthenticated and not on slide 1, redirect to slide 1 (start onboarding)
    if (status === 'unauthenticated' && slideNumber !== 1) {
      console.log('[ONBOARDING LAYOUT] Unauthenticated user, redirecting to slide 1');
      router.replace('/onboarding/slide-1');
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
    // DEV BYPASS: Allow revisiting onboarding in dev mode
    const devBypass = typeof window !== 'undefined' && localStorage.getItem('devAllowOnboardingRevisit') === 'true';
    
    if (status === 'authenticated' && session?.user?.hasAccess && session?.user?.hasCompletedOnboarding && !isDev && !devBypass) {
      router.push('/plan');
    }
  }, [status, session, router, isDev]);

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
      <div className="h-screen-safe bg-white flex items-center justify-center pb-adaptive">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  return (
    <div className="h-screen-safe bg-white overflow-y-auto pb-adaptive">
      <div className="min-h-full flex flex-col">
        {/* Reset button in top right - Dev only */}
        {isDev && (
          <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-50 pt-adaptive px-adaptive">
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
        
        {/* Main content area - fills viewport with adaptive responsive padding */}
        {/* Using min-h-0 to allow flex children to shrink properly for scrolling */}
        <main className="flex-1 flex items-center justify-center px-adaptive min-h-0">
          <div className="w-full max-w-2xl mx-auto flex flex-col min-h-0 h-full page-fade" key={pathname}>
            {children}
          </div>
        </main>
        
        {/* Dev Panel */}
        <DevPanel />
      </div>
    </div>
  );
}