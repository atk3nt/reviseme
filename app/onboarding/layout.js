"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import DevPanel from "@/components/DevPanel";

export default function OnboardingLayout({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    // If user is already authenticated and has access, redirect to plan
    if (status === 'authenticated' && session?.user?.hasAccess) {
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
      
      // Clear localStorage
      localStorage.removeItem('quizAnswers');
      
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

  return (
    <div className="min-h-screen bg-white">
      <div className="min-h-screen flex flex-col">
        {/* Reset button in top right */}
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={handleReset}
            className="btn btn-sm btn-error"
            disabled={isResetting}
          >
            {isResetting ? (
              <>
                <span className="loading loading-spinner loading-xs"></span>
                Resetting...
              </>
            ) : (
              '🔄 Reset'
            )}
          </button>
        </div>
        
        {/* Main content area */}
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-2xl mx-auto">
            {children}
          </div>
        </main>
        
        {/* Dev Panel */}
        <DevPanel />
      </div>
    </div>
  );
}