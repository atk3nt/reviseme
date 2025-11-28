"use client";

import { useState, useEffect, Suspense } from "react";
import { supabase } from "@/libs/supabase";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import SupportModal from "@/components/SupportModal";

function SettingsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState(null);
  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push('/api/auth/signin');
        return;
      }

      setUser(authUser);

      // Load payment history
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .eq('user_id', authUser.id)
        .order('created_at', { ascending: false });

      if (paymentsData) {
        setPayments(paymentsData);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefundRequest = async () => {
    const latestPayment = payments.find(p => p.status === 'paid');
    
    if (!latestPayment) {
      alert('No eligible payments found for refund');
      return;
    }

    const paymentDate = new Date(latestPayment.paid_at);
    const daysSincePayment = Math.floor((Date.now() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSincePayment > 7) {
      alert('Refund period has expired (7 days)');
      return;
    }

    if (confirm('Are you sure you want to request a refund? This will revoke your access to Markr Planner.')) {
      try {
        const response = await fetch('/api/refund/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId: latestPayment.id })
        });

        if (response.ok) {
          alert('Refund request submitted successfully. You will receive a confirmation email shortly.');
          router.push('/');
        } else {
          const error = await response.json();
          alert(`Refund request failed: ${error.error}`);
        }
      } catch (error) {
        console.error('Refund request error:', error);
        alert('Failed to submit refund request. Please try again.');
      }
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg"></span>
          <p className="mt-4">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-base-100">
        {/* Fixed Menu Button - Top Left */}
        <button
          type="button"
          className="fixed top-4 left-4 z-50 inline-flex items-center justify-center rounded-md p-2 bg-base-200 hover:bg-base-300 transition shadow-lg"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            className="w-6 h-6 text-base-content"
          >
            <rect x="1" y="11" width="22" height="2" fill="currentColor" strokeWidth="0"></rect>
            <rect x="1" y="4" width="22" height="2" strokeWidth="0" fill="currentColor"></rect>
            <rect x="1" y="18" width="22" height="2" strokeWidth="0" fill="currentColor"></rect>
          </svg>
        </button>

        {/* Header */}
        <div className="bg-base-200">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div>
              <h1 className="text-3xl font-bold">Settings</h1>
              <p className="text-base-content/70">
                  Manage your account and preferences
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Account Information */}
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-xl mb-4">Account Information</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="label label-text">Name</label>
                  <input
                    type="text"
                    value={user?.name || ''}
                    className="input input-bordered w-full"
                    disabled
                  />
                </div>
                
                <div>
                  <label className="label label-text">Email</label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    className="input input-bordered w-full"
                    disabled
                  />
                </div>
                
                <div>
                  <label className="label label-text">Member Since</label>
                  <input
                    type="text"
                    value={user?.created_at ? new Date(user.created_at).toLocaleDateString() : ''}
                    className="input input-bordered w-full"
                    disabled
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Payment Information */}
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-xl mb-4">Payment Information</h2>
              
              {payments.length === 0 ? (
                <p className="text-base-content/70">No payment history found.</p>
              ) : (
                <div className="space-y-4">
                  {payments.map(payment => (
                    <div key={payment.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-medium">Exam Season Pass</p>
                          <p className="text-sm text-base-content/70">
                            {new Date(payment.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">£{(payment.amount / 100).toFixed(2)}</p>
                          <span className={`badge ${
                            payment.status === 'paid' ? 'badge-success' :
                            payment.status === 'refunded' ? 'badge-warning' :
                            'badge-error'
                          }`}>
                            {payment.status}
                          </span>
                        </div>
                      </div>
                      
                      {payment.status === 'paid' && (
                        <div className="mt-3">
                          <button
                            onClick={handleRefundRequest}
                            className="btn btn-sm btn-outline btn-error"
                          >
                            Request Refund
                          </button>
                          <p className="text-xs text-base-content/50 mt-1">
                            7-day refund guarantee
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Preferences */}
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-xl mb-4">Preferences</h2>
              
              <div className="space-y-4">
                <div className="form-control">
                  <label className="label cursor-pointer">
                    <span className="label-text">Anonymous Analytics</span>
                    <input type="checkbox" className="toggle toggle-primary" />
                  </label>
                  <p className="text-xs text-base-content/50">
                    Help improve Markr Planner with anonymous usage data
                  </p>
                </div>
                
                <div className="form-control">
                  <label className="label cursor-pointer">
                    <span className="label-text">Email Notifications</span>
                    <input type="checkbox" className="toggle toggle-primary" defaultChecked />
                  </label>
                  <p className="text-xs text-base-content/50">
                    Receive weekly summaries and important updates
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-xl mb-4">Actions</h2>
              
              <div className="space-y-4">
                <button
                  onClick={() => router.push('/onboarding')}
                  className="btn btn-outline w-full"
                >
                  Reset Onboarding
                </button>
                
                <button
                  onClick={() => router.push('/plan')}
                  className="btn btn-outline w-full"
                >
                  View My Plan
                </button>
                
                <button
                  onClick={handleSignOut}
                  className="btn btn-error w-full"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-base-200 shadow-xl transform transition-transform duration-300 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-4 border-b border-base-300">
            <h2 className="text-xl font-bold">Menu</h2>
            <button
              type="button"
              className="btn btn-sm btn-circle btn-ghost"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          {/* Sidebar Navigation */}
          <nav className="flex-1 p-4">
            <ul className="space-y-2">
              <li>
                <Link
                  href="/plan"
                  className={`block px-4 py-3 rounded-lg transition ${
                    pathname === '/plan' 
                      ? 'bg-primary text-primary-content' 
                      : 'hover:bg-base-300'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📅</span>
                    <span className="font-medium">Revision Plan</span>
                  </div>
                </Link>
              </li>
              <li>
                <Link
                  href="/insights"
                  className={`block px-4 py-3 rounded-lg transition ${
                    pathname === '/insights' 
                      ? 'bg-primary text-primary-content' 
                      : 'hover:bg-base-300'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📊</span>
                    <span className="font-medium">Study Stats</span>
                  </div>
                </Link>
              </li>
              <li>
                <Link
                  href="/settings/availability"
                  className={`block px-4 py-3 rounded-lg transition ${
                    pathname === '/settings/availability' 
                      ? 'bg-primary text-primary-content' 
                      : 'hover:bg-base-300'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">⏰</span>
                    <span className="font-medium">Availability</span>
                  </div>
                </Link>
              </li>
              <li>
                <div>
                  <button
                    onClick={() => setSettingsDropdownOpen(!settingsDropdownOpen)}
                    className={`w-full block px-4 py-3 rounded-lg transition ${
                      pathname?.startsWith('/settings') 
                        ? 'bg-primary text-primary-content' 
                        : 'hover:bg-base-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">⚙️</span>
                        <span className="font-medium">Settings</span>
                      </div>
                      <svg
                        className={`w-4 h-4 transition-transform ${settingsDropdownOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  
                  {settingsDropdownOpen && (
                    <ul className="ml-4 mt-2 space-y-1">
                      <li>
                        <Link
                          href="/settings?section=preferences"
                          className={`block px-4 py-2 rounded-lg transition text-sm hover:bg-base-300 ${
                            pathname === '/settings' && searchParams?.get('section') === 'preferences' ? 'bg-primary/20' : ''
                          }`}
                          onClick={() => setSidebarOpen(false)}
                        >
                          Study Preferences
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/settings?section=account"
                          className={`block px-4 py-2 rounded-lg transition text-sm hover:bg-base-300 ${
                            pathname === '/settings' && searchParams?.get('section') === 'account' ? 'bg-primary/20' : ''
                          }`}
                          onClick={() => setSidebarOpen(false)}
                        >
                          Account Information
                        </Link>
                      </li>
                      <li>
                        <button
                          onClick={() => {
                            setSupportModalOpen(true);
                            setSidebarOpen(false);
                          }}
                          className="block w-full text-left px-4 py-2 rounded-lg transition text-sm hover:bg-base-300"
                        >
                          Support
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => {
                            setSidebarOpen(false);
                            signOut({ callbackUrl: '/' });
                          }}
                          className="w-full text-left block px-4 py-2 rounded-lg transition text-sm hover:bg-base-300 text-error"
                        >
                          Sign Out
                        </button>
                      </li>
                    </ul>
                  )}
                </div>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      {/* Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      <SupportModal isOpen={supportModalOpen} onClose={() => setSupportModalOpen(false)} />
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg"></span>
          <p className="mt-4">Loading...</p>
        </div>
      </div>
    }>
      <SettingsPageContent />
    </Suspense>
  );
}
