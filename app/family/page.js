"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FamilyPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  const activateAccess = async () => {
    setIsLoading(true);
    setMessage('');
    
    try {
      const res = await fetch('/api/dev/set-access', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setMessage('✅ Access granted! Redirecting to onboarding...');
        // Wait a moment then redirect
        setTimeout(() => {
          router.push('/onboarding/slide-1');
        }, 2000);
      } else {
        if (res.status === 403) {
          setMessage('❌ Your email is not on the family access list. Please contact the admin.');
        } else {
          setMessage(`❌ Error: ${data.error || 'Something went wrong'}`);
        }
      }
    } catch (error) {
      setMessage('❌ Error activating access');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };
  
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }
  
  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-8">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-2xl font-bold text-[#001433]">Family Access Activation</h1>
          <p className="text-[#003D99]">Please sign in first to activate your family access.</p>
          <button 
            onClick={() => router.push('/api/auth/signin?callbackUrl=/family')}
            className="btn bg-[#0066FF] text-white hover:bg-[#0052CC] border-0"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-8">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[#001433]">
            Family Access Activation
          </h1>
          <p className="text-[#003D99]">
            Signed in as: <strong>{session?.user?.email}</strong>
          </p>
          <p className="text-sm text-[#003D99]/70">
            Click the button below to activate your free family access.
          </p>
        </div>
        
        <button
          onClick={activateAccess}
          disabled={isLoading}
          className="w-full bg-[#0066FF] text-white py-3 px-6 rounded-lg font-medium hover:bg-[#0052CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              <span className="ml-2">Activating...</span>
            </>
          ) : (
            'Activate My Family Access'
          )}
        </button>
        
        {message && (
          <div className={`p-4 rounded-lg ${
            message.includes('✅') 
              ? 'bg-green-50 text-green-800 border border-green-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message}
          </div>
        )}
        
        <div className="pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            If you're not a family member, this won't work. Please purchase access through the regular onboarding flow.
          </p>
        </div>
      </div>
    </div>
  );
}
