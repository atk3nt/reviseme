"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import apiClient from "@/libs/api";
import {
  getEffectiveDate,
  isTimeOverridden,
  clearTimeOverride,
  setTimeOverride,
  formatDevDate,
} from "@/libs/dev-helpers";

export default function DevTools() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  const [error, setError] = useState(null);
  
  // Time Override State
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timeOverridden, setTimeOverridden] = useState(false);
  const [customTime, setCustomTime] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  
  // Dev User Management State
  const [isResetting, setIsResetting] = useState(false);
  
  // Plan Regeneration State
  const [allowRegeneration, setAllowRegeneration] = useState(false);
  
  // Onboarding Revisit State
  const [allowOnboardingRevisit, setAllowOnboardingRevisit] = useState(false);

  const createTestPayment = async () => {
    setIsCreatingPayment(true);
    setError(null);
    setPaymentResult(null);

    try {
      const response = await fetch('/api/dev/create-test-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (response.ok) {
        setPaymentResult(data);
      } else {
        // More detailed error messages
        if (response.status === 401) {
          setError('⚠️ Not logged in. Please sign in first, then try again.');
        } else if (data.details) {
          setError(`${data.error}: ${data.details}`);
        } else {
          setError(data.error || 'Failed to create test payment');
        }
        console.error('Create payment error:', data);
      }
    } catch (err) {
      setError(`Network error: ${err.message || 'Failed to create test payment'}`);
      console.error('Create payment exception:', err);
    } finally {
      setIsCreatingPayment(false);
    }
  };

  const setAccess = async () => {
    try {
      const response = await fetch('/api/dev/set-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (response.ok) {
        alert('Access granted! Refresh the page.');
        window.location.reload();
      } else {
        alert(data.error || 'Failed to set access');
      }
    } catch (err) {
      alert(err.message || 'Failed to set access');
    }
  };

  // Time Override Functions
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getEffectiveDate());
      setTimeOverridden(isTimeOverridden());
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  // Load regeneration bypass state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('devAllowRegeneration');
      setAllowRegeneration(stored === 'true');
      
      const storedOnboarding = localStorage.getItem('devAllowOnboardingRevisit');
      setAllowOnboardingRevisit(storedOnboarding === 'true');
    }
  }, []);

  const showStatus = (message) => {
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(""), 5000);
  };

  const handlePresetTime = (isoString) => {
    setTimeOverride(isoString);
    setTimeOverridden(true);
    showStatus("✅ Time override set! Refresh to see changes.");
  };

  const handleCustomTime = () => {
    if (!customTime) {
      showStatus("⚠️ Please enter a date and time");
      return;
    }
    setTimeOverride(customTime);
    setTimeOverridden(true);
    setCustomTime("");
    showStatus("✅ Custom time override set! Refresh to see changes.");
  };

  const handleClearTimeOverride = () => {
    clearTimeOverride();
    setTimeOverridden(false);
    showStatus("✅ Time override cleared. Using real time.");
  };

  // Dev User Management Functions
  const handleGrantAccess = async () => {
    try {
      const response = await apiClient.post("/dev/set-access");
      if (response.success) {
        showStatus("✅ Access granted! You now have full access.");
      } else {
        showStatus("⚠️ " + (response.error || "Failed to grant access"));
      }
    } catch (error) {
      console.error("Error granting access:", error);
      showStatus("❌ Error: " + error.message);
    }
  };

  const handleResetPlan = async () => {
    if (!confirm("Are you sure you want to delete ALL blocks? This cannot be undone.")) {
      return;
    }
    
    setIsResetting(true);
    try {
      const response = await apiClient.post("/dev/reset-plan");
      if (response.success) {
        // Clear cached plan data so plan page doesn't show stale blocks
        sessionStorage.removeItem('preloadedPlanData');
        sessionStorage.setItem('planJustReset', '1'); // Plan page will clear blocks and refetch
        showStatus(`✅ Deleted ${response.deletedCount ?? 0} blocks. You can now generate a fresh plan.`);
      } else {
        showStatus("⚠️ " + (response.error || "Failed to reset plan"));
      }
    } catch (error) {
      console.error("Error resetting plan:", error);
      showStatus("❌ Error: " + error.message);
    } finally {
      setIsResetting(false);
    }
  };

  const handleUnlockAllSlides = () => {
    // Set max slide to highest possible (22)
    localStorage.setItem('onboardingProgress', JSON.stringify({ maxSlide: 22 }));
    showStatus("✅ All onboarding slides unlocked! You can now navigate anywhere.");
  };

  const handleResetOnboarding = async () => {
    if (!confirm("Reset onboarding progress? This will clear all onboarding data from the database.")) {
      return;
    }
    
    setIsResetting(true);
    try {
      const response = await apiClient.post("/dev/reset-onboarding");
      if (response.success) {
        // Also clear localStorage (including progress tracking)
        localStorage.removeItem('quizAnswers');
        localStorage.removeItem('onboardingProgress');
        showStatus("✅ Onboarding reset complete. You can start fresh.");
      } else {
        showStatus("⚠️ " + (response.error || "Failed to reset onboarding"));
      }
    } catch (error) {
      console.error("Error resetting onboarding:", error);
      showStatus("❌ Error: " + error.message);
    } finally {
      setIsResetting(false);
    }
  };

  const handleFullReset = async () => {
    if (!confirm("⚠️ FULL RESET: This will delete ALL your data (blocks, ratings, onboarding). Are you absolutely sure?")) {
      return;
    }
    
    if (!confirm("This is your last chance. Really delete everything?")) {
      return;
    }
    
    setIsResetting(true);
    try {
      const response = await apiClient.post("/dev/full-reset");
      if (response.success) {
        // Clear localStorage too
        localStorage.clear();
        showStatus("✅ Full reset complete. All data cleared.");
        // Reload after a short delay
        setTimeout(() => window.location.reload(), 2000);
      } else {
        showStatus("⚠️ " + (response.error || "Failed to perform full reset"));
      }
    } catch (error) {
      console.error("Error performing full reset:", error);
      showStatus("❌ Error: " + error.message);
    } finally {
      setIsResetting(false);
    }
  };
  
  const handleToggleRegeneration = () => {
    const newValue = !allowRegeneration;
    setAllowRegeneration(newValue);
    localStorage.setItem('devAllowRegeneration', newValue.toString());
    showStatus(newValue 
      ? "✅ Plan regeneration enabled! You can now regenerate plans after clearing blocks."
      : "⚠️ Plan regeneration disabled. Current week protection is active."
    );
  };
  
  const handleToggleOnboardingRevisit = () => {
    const newValue = !allowOnboardingRevisit;
    setAllowOnboardingRevisit(newValue);
    localStorage.setItem('devAllowOnboardingRevisit', newValue.toString());
    showStatus(newValue 
      ? "✅ Onboarding revisit enabled! You can now go back to onboarding slides."
      : "⚠️ Onboarding revisit disabled. You'll be redirected to plan page."
    );
  };

  // Show loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  // Show login required message
  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-100">
        <div className="card bg-base-200 shadow-xl max-w-md">
          <div className="card-body text-center">
            <h2 className="card-title justify-center text-2xl mb-4">Login Required</h2>
            <p className="mb-4">You need to be logged in to use the dev tools.</p>
            <button 
              onClick={() => router.push('/api/auth/signin')}
              className="btn btn-primary"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Dev Tools</h1>
          <button 
            onClick={() => router.push('/plan')}
            className="btn btn-outline"
          >
            Back to App
          </button>
        </div>

        {/* User Info */}
        <div className="alert alert-info mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <div>
            <div className="font-bold">Logged in as:</div>
            <div className="text-sm">{session?.user?.email}</div>
          </div>
        </div>

        <div className="alert alert-warning mb-8">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>⚠️ Development Mode Only - These tools are for testing purposes</span>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className="alert alert-info mb-4">
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Time Override Section */}
        <div className="card bg-base-200 shadow-xl mb-6">
          <div className="card-body">
            <h2 className="card-title text-2xl mb-4">⏰ Time Override</h2>
            
            {/* Warning Banner if time is overridden */}
            {timeOverridden && (
              <div className="alert alert-warning mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>⚠️ Time is currently overridden! All time-based features will use the fake time.</span>
              </div>
            )}

            {/* Current Time Display */}
            <div className="bg-base-300 p-4 rounded-lg mb-4">
              <div className="text-sm text-base-content/70 mb-1">Current Effective Time:</div>
              <div className="text-2xl font-bold font-mono">{formatDevDate(currentTime)}</div>
              <div className="text-xs text-base-content/50 mt-1">
                {timeOverridden ? "🔴 Overridden" : "🟢 Real Time"}
              </div>
            </div>

            <p className="text-base-content/70 mb-4">
              Override the current date/time for testing time-based features (scheduling, week calculations, etc.)
            </p>

            {/* Preset Times */}
            <div className="mb-4">
              <div className="text-sm font-semibold mb-2">Quick Presets:</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <button
                  onClick={() => handlePresetTime("2024-01-08T14:00:00")}
                  className="btn btn-sm btn-outline"
                >
                  Monday 2 PM
                </button>
                <button
                  onClick={() => handlePresetTime("2024-01-09T22:00:00")}
                  className="btn btn-sm btn-outline"
                >
                  Tuesday 10 PM
                </button>
                <button
                  onClick={() => handlePresetTime("2024-01-07T15:00:00")}
                  className="btn btn-sm btn-outline"
                >
                  Sunday 3 PM
                </button>
                <button
                  onClick={() => handlePresetTime("2024-01-07T22:00:00")}
                  className="btn btn-sm btn-outline"
                >
                  Sunday 10 PM
                </button>
                <button
                  onClick={() => handlePresetTime("2024-01-12T17:00:00")}
                  className="btn btn-sm btn-outline"
                >
                  Friday 5 PM
                </button>
                <button
                  onClick={() => handlePresetTime("2024-01-13T23:00:00")}
                  className="btn btn-sm btn-outline"
                >
                  Saturday 11 PM
                </button>
              </div>
            </div>

            {/* Custom Time Input */}
            <div className="mb-4">
              <div className="text-sm font-semibold mb-2">Custom Time:</div>
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="input input-bordered flex-1"
                />
                <button
                  onClick={handleCustomTime}
                  className="btn btn-primary"
                >
                  Set Custom Time
                </button>
              </div>
            </div>

            {/* Clear Override Button */}
            {timeOverridden && (
              <div className="card-actions">
                <button
                  onClick={handleClearTimeOverride}
                  className="btn btn-error"
                >
                  Use Real Time
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Dev User Management Section */}
        <div className="card bg-base-200 shadow-xl mb-6">
          <div className="card-body">
            <h2 className="card-title text-2xl mb-4">🛠️ Dev User Management</h2>
            <p className="text-base-content/70 mb-4">
              Quickly reset your dev user data for testing without manual database cleanup
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Grant Access */}
              <button
                onClick={handleGrantAccess}
                className="btn btn-success btn-block"
                disabled={isResetting}
              >
                🔓 Grant Access
              </button>

              {/* Unlock All Slides */}
              <button
                onClick={handleUnlockAllSlides}
                className="btn btn-primary btn-block"
                disabled={isResetting}
              >
                🔓 Unlock All Slides
              </button>

              {/* Delete All Blocks */}
              <button
                onClick={handleResetPlan}
                className="btn btn-warning btn-block"
                disabled={isResetting}
              >
                {isResetting ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Deleting...
                  </>
                ) : (
                  "🗑️ Delete All Blocks"
                )}
              </button>

              {/* Reset Onboarding */}
              <button
                onClick={handleResetOnboarding}
                className="btn btn-info btn-block"
                disabled={isResetting}
              >
                {isResetting ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Resetting...
                  </>
                ) : (
                  "🔄 Reset Onboarding"
                )}
              </button>

              {/* Full Reset */}
              <button
                onClick={handleFullReset}
                className="btn btn-error btn-block"
                disabled={isResetting}
              >
                {isResetting ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Resetting...
                  </>
                ) : (
                  "💥 Full Reset (Delete Everything)"
                )}
              </button>
            </div>

            <div className="text-xs text-base-content/50 mt-4">
              <p><strong>Grant Access:</strong> Bypass payment requirement</p>
              <p><strong>Delete All Blocks:</strong> Clear study plan, keep ratings & onboarding</p>
              <p><strong>Reset Onboarding:</strong> Clear ratings & onboarding, keep blocks</p>
              <p><strong>Full Reset:</strong> Delete ALL data (blocks, ratings, onboarding, preferences)</p>
            </div>
            
            {/* Plan Regeneration Toggle */}
            <div className="divider mt-6 mb-4">Plan Regeneration</div>
            
            <div className={`alert ${allowRegeneration ? 'alert-success' : 'alert-warning'} mb-4`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <div className="font-bold">
                  {allowRegeneration ? '✅ Regeneration Enabled' : '🔒 Current Week Protected'}
                </div>
                <div className="text-xs mt-1">
                  {allowRegeneration 
                    ? 'You can regenerate plans for the current week after clearing blocks'
                    : 'Current week cannot be regenerated to prevent accidental data loss'
                  }
                </div>
              </div>
            </div>
            
            <button
              onClick={handleToggleRegeneration}
              className={`btn btn-block ${allowRegeneration ? 'btn-warning' : 'btn-success'}`}
            >
              {allowRegeneration ? '🔒 Disable Regeneration' : '🔓 Enable Regeneration'}
            </button>
            
            <div className="text-xs text-base-content/50 mt-2">
              <p><strong>Why this matters:</strong> By default, the plan page won't regenerate blocks for the current week to prevent accidental deletion. Enable this to test regeneration after clearing blocks.</p>
            </div>
            
            {/* Onboarding Revisit Toggle */}
            <div className="divider mt-6 mb-4">Onboarding Access</div>
            
            <div className={`alert ${allowOnboardingRevisit ? 'alert-success' : 'alert-warning'} mb-4`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <div className="font-bold">
                  {allowOnboardingRevisit ? '✅ Onboarding Revisit Enabled' : '🔒 Onboarding Locked'}
                </div>
                <div className="text-xs mt-1">
                  {allowOnboardingRevisit 
                    ? 'You can revisit onboarding slides even after completing them'
                    : 'Completed onboarding redirects to plan page (normal behavior)'
                  }
                </div>
              </div>
            </div>
            
            <button
              onClick={handleToggleOnboardingRevisit}
              className={`btn btn-block ${allowOnboardingRevisit ? 'btn-warning' : 'btn-success'}`}
            >
              {allowOnboardingRevisit ? '🔒 Lock Onboarding' : '🔓 Allow Onboarding Revisit'}
            </button>
            
            <div className="text-xs text-base-content/50 mt-2">
              <p><strong>Why this matters:</strong> By default, users who complete onboarding are redirected to the plan page. Enable this to go back and modify onboarding data (like unavailable times) for testing.</p>
            </div>
          </div>
        </div>

        {/* Test Payment Section */}
        <div className="card bg-base-200 shadow-xl mb-6">
          <div className="card-body">
            <h2 className="card-title text-2xl mb-4">🧪 Test Payment</h2>
            <p className="text-base-content/70 mb-4">
              Create a test payment to test the refund flow. This will create a "paid" payment 
              in your database that you can use to test refund functionality.
            </p>

            <div className="card-actions">
              <button 
                onClick={createTestPayment}
                className="btn btn-primary"
                disabled={isCreatingPayment}
              >
                {isCreatingPayment ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Creating...
                  </>
                ) : (
                  'Create Test Payment'
                )}
              </button>
            </div>

            {paymentResult && (
              <div className="alert alert-success mt-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h3 className="font-bold">{paymentResult.message}</h3>
                  {paymentResult.payment && (
                    <div className="text-sm mt-2">
                      <p>Amount: £{paymentResult.payment.amountInPounds || (paymentResult.payment.amount / 100).toFixed(2)}</p>
                      <p>Status: {paymentResult.payment.status}</p>
                      {paymentResult.payment.daysRemaining && (
                        <p>Days remaining for refund: {paymentResult.payment.daysRemaining}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="alert alert-error mt-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Grant Access Section */}
        <div className="card bg-base-200 shadow-xl mb-6">
          <div className="card-body">
            <h2 className="card-title text-2xl mb-4">🔓 Grant Access</h2>
            <p className="text-base-content/70 mb-4">
              Grant yourself access to the app without making a payment. Useful for testing 
              features that require paid access.
            </p>

            <div className="card-actions">
              <button 
                onClick={setAccess}
                className="btn btn-secondary"
              >
                Grant Access
              </button>
            </div>
          </div>
        </div>

        {/* Quick Navigation - Onboarding Slides */}
        <div className="card bg-base-200 shadow-xl mb-6">
          <div className="card-body">
            <h2 className="card-title text-2xl mb-4">🎯 Quick Navigation - Onboarding</h2>
            <p className="text-base-content/70 mb-4">
              Jump directly to any onboarding slide for testing
            </p>
            
            <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
              {[1, 2, 4, 5, 9, 16, 16.5, 17, 19, 20, 21, 22].map((slideNum) => (
                <button
                  key={slideNum}
                  onClick={() => {
                    const slideUrl = slideNum === 16.5 
                      ? '/onboarding/slide-16-5' 
                      : `/onboarding/slide-${slideNum}`;
                    router.push(slideUrl);
                  }}
                  className="btn btn-sm btn-outline"
                >
                  {slideNum === 16.5 ? '16.5' : slideNum}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h2 className="card-title text-2xl mb-4">🔗 Quick Links - Pages</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button 
                onClick={() => router.push('/onboarding/slide-1')}
                className="btn btn-outline btn-block justify-start"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Start Onboarding
              </button>

              <button 
                onClick={() => router.push('/plan/generating')}
                className="btn btn-outline btn-block justify-start"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Plan Generating Page
              </button>

              <button 
                onClick={() => router.push('/plan')}
                className="btn btn-outline btn-block justify-start"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Revision Plan
              </button>

              <button 
                onClick={() => router.push('/settings')}
                className="btn btn-outline btn-block justify-start"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings (Test Refund)
              </button>
              
              <button 
                onClick={() => router.push('/')}
                className="btn btn-outline btn-block justify-start"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Home Page
              </button>

              <button 
                onClick={() => window.open('https://supabase.com', '_blank')}
                className="btn btn-outline btn-block justify-start"
              >
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M13.5 2c-5.629 0-10.212 4.436-10.475 10h3.025c.26-3.954 3.474-7 7.45-7 4.136 0 7.5 3.364 7.5 7.5s-3.364 7.5-7.5 7.5c-3.976 0-7.19-3.046-7.45-7h-3.025c.263 5.564 4.846 10 10.475 10 5.799 0 10.5-4.701 10.5-10.5s-4.701-10.5-10.5-10.5z"/>
                </svg>
                Supabase Dashboard
              </button>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 prose max-w-none">
          <h3>📋 How to Test Refund Flow</h3>
          <ol>
            <li><strong>Create Test Payment:</strong> Click "Create Test Payment" above</li>
            <li><strong>Open Support Modal:</strong> Go to your app and open the support modal</li>
            <li><strong>Click "Guarantee":</strong> Select the refund/guarantee option</li>
            <li><strong>Enter Feedback:</strong> Type at least 10 characters of feedback</li>
            <li><strong>Confirm Refund:</strong> Click the confirm button to test the flow</li>
            <li><strong>Check Logs:</strong> Go to Supabase and check the logs table for the feedback</li>
          </ol>

          <h3>🔍 View Feedback in Supabase</h3>
          <div className="mockup-code">
            <pre><code>{`SELECT 
  l.created_at,
  u.email,
  l.event_data->>'feedback' as feedback,
  l.event_data->>'amount' as amount
FROM logs l
JOIN users u ON l.user_id = u.id
WHERE l.event_type = 'refund_requested'
ORDER BY l.created_at DESC;`}</code></pre>
          </div>
        </div>
      </div>
    </div>
  );
}
