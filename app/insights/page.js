"use client";

import { useState, useEffect, Suspense } from "react";
import { supabase } from "@/libs/supabase";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import SupportModal from "@/components/SupportModal";

function InsightsPageContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [insights, setInsights] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  
  // Stats data - will be populated from API when available
  const [hoursRevised, setHoursRevised] = useState(0);
  const [estimatedGrade, setEstimatedGrade] = useState(null);
  const [gradeProgress, setGradeProgress] = useState({ current: 'C', next: 'B', percentage: 45 });
  const [completionPercentage, setCompletionPercentage] = useState(0);
  const [blocksDone, setBlocksDone] = useState(0);
  const [blocksMissed, setBlocksMissed] = useState(0);
  const [blocksScheduled, setBlocksScheduled] = useState(0);
  const [activeDays, setActiveDays] = useState(0);
  const [lastActivity, setLastActivity] = useState(null);
  const [avgConfidence, setAvgConfidence] = useState(0);

  useEffect(() => {
    loadInsights();
    loadStats();
  }, []);

  // Convert confidence (1-5) to UK A-Level grade
  const confidenceToGrade = (confidence) => {
    if (!confidence || confidence === 0) return { grade: 'N/A', minConfidence: 0, maxConfidence: 0 };
    if (confidence >= 4.5) return { grade: 'A*', minConfidence: 4.5, maxConfidence: 5.0 };
    if (confidence >= 4.0) return { grade: 'A', minConfidence: 4.0, maxConfidence: 4.5 };
    if (confidence >= 3.5) return { grade: 'B', minConfidence: 3.5, maxConfidence: 4.0 };
    if (confidence >= 3.0) return { grade: 'C', minConfidence: 3.0, maxConfidence: 3.5 };
    if (confidence >= 2.5) return { grade: 'D', minConfidence: 2.5, maxConfidence: 3.0 };
    if (confidence >= 2.0) return { grade: 'E', minConfidence: 2.0, maxConfidence: 2.5 };
    return { grade: 'U', minConfidence: 0, maxConfidence: 2.0 };
  };

  // Calculate progress to next grade
  const calculateGradeProgress = (confidence) => {
    if (!confidence || confidence === 0) {
      return { current: 'N/A', next: 'E', percentage: 0 };
    }

    const currentGradeInfo = confidenceToGrade(confidence);
    
    // If already at A*, show progress within A*
    if (currentGradeInfo.grade === 'A*') {
      const progress = ((confidence - 4.5) / 0.5) * 100;
      return {
        current: 'A*',
        next: 'A*',
        percentage: Math.min(100, Math.max(0, progress))
      };
    }

    // Calculate progress to next grade
    const range = currentGradeInfo.maxConfidence - currentGradeInfo.minConfidence;
    const progress = ((confidence - currentGradeInfo.minConfidence) / range) * 100;
    
    // Get next grade
    const gradeOrder = ['U', 'E', 'D', 'C', 'B', 'A', 'A*'];
    const currentIndex = gradeOrder.indexOf(currentGradeInfo.grade);
    const nextGrade = currentIndex < gradeOrder.length - 1 ? gradeOrder[currentIndex + 1] : 'A*';

    return {
      current: currentGradeInfo.grade,
      next: nextGrade,
      percentage: Math.min(100, Math.max(0, progress))
    };
  };

  const loadInsights = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: insightsData } = await supabase
        .from('user_insights')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (insightsData) {
        setInsights(insightsData);
      }
    } catch (error) {
      console.error('Error loading insights:', error);
    }
  };

  const loadStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // Try to load stats from user_stats view
      const { data: statsData } = await supabase
        .from('user_stats')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (statsData) {
        setStats(statsData);
        
        // Extract stats
        const done = statsData.blocks_done || 0;
        const missed = statsData.blocks_missed || 0;
        const scheduled = statsData.blocks_scheduled || 0;
        const confidence = statsData.avg_confidence || 0;
        
        setBlocksDone(done);
        setBlocksMissed(missed);
        setBlocksScheduled(scheduled);
        setActiveDays(statsData.active_days || 0);
        setAvgConfidence(confidence);
        setLastActivity(statsData.last_activity);
        
        // Calculate hours revised from completed blocks
        try {
          const { data: blocksData } = await supabase
            .from('blocks')
            .select('duration_minutes')
            .eq('user_id', user.id)
            .eq('status', 'done');

          if (blocksData && blocksData.length > 0) {
            const totalMinutes = blocksData.reduce((sum, block) => sum + (block.duration_minutes || 30), 0);
            const hours = totalMinutes / 60;
            setHoursRevised(hours);
          }
        } catch (error) {
          console.error('Error loading hours revised:', error);
        }
        
        // Calculate estimated grade and progress
        if (confidence > 0) {
          const gradeInfo = confidenceToGrade(confidence);
          setEstimatedGrade(gradeInfo.grade);
          
          const progress = calculateGradeProgress(confidence);
          setGradeProgress(progress);
        }
        
        // Calculate completion percentage
        const totalBlocks = done + missed + scheduled;
        if (totalBlocks > 0) {
          const percentage = (done / totalBlocks) * 100;
          setCompletionPercentage(percentage);
        }
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getInsightTypeLabel = (type) => {
    switch (type) {
      case 'setup_summary': return 'Initial Assessment';
      case 'weekly_feedback': return 'Weekly Summary';
      case 'block_rationale': return 'Study Tip';
      default: return type;
    }
  };

  const getInsightTypeIcon = (type) => {
    switch (type) {
      case 'setup_summary': return '🎯';
      case 'weekly_feedback': return '📊';
      case 'block_rationale': return '💡';
      default: return '📝';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg"></span>
          <p className="mt-4">Loading your insights...</p>
      </div>
      
      <SupportModal isOpen={supportModalOpen} onClose={() => setSupportModalOpen(false)} />
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
              <h1 className="text-3xl font-bold">Study Stats</h1>
              <p className="text-base-content/70">
                  Track your revision progress and performance
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Stats Overview - 6 cards in 2 rows */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Row 1 */}
          <div className="stat bg-base-100 shadow-sm rounded-lg">
            <div className="stat-figure text-primary">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div className="stat-title">Hours Revised</div>
            <div className="stat-value text-primary">{hoursRevised.toFixed(1)}</div>
            <div className="stat-desc">Total study time</div>
          </div>

          <div className="stat bg-base-100 shadow-sm rounded-lg">
            <div className="stat-figure text-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"></path>
              </svg>
            </div>
            <div className="stat-title">Estimated Grade</div>
            <div className="stat-value text-secondary text-4xl">{estimatedGrade || 'N/A'}</div>
            <div className="stat-desc">Based on confidence</div>
          </div>

          <div className="stat bg-base-100 shadow-sm rounded-lg">
            <div className="stat-figure text-accent">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
              </svg>
            </div>
            <div className="stat-title">Completion %</div>
            <div className="stat-value text-accent">{completionPercentage.toFixed(0)}%</div>
            <div className="stat-desc">Blocks completed</div>
          </div>

          {/* Row 2 */}
          <div className="stat bg-base-100 shadow-sm rounded-lg">
            <div className="stat-figure text-info">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div className="stat-title">Blocks Completed</div>
            <div className="stat-value text-info">{blocksDone}</div>
            <div className="stat-desc">Total revision sessions</div>
          </div>

          <div className="stat bg-base-100 shadow-sm rounded-lg">
            <div className="stat-figure text-success">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"></path>
              </svg>
            </div>
            <div className="stat-title">Active Days</div>
            <div className="stat-value text-success">{activeDays}</div>
            <div className="stat-desc">Days with completed blocks</div>
          </div>

          <div className="stat bg-base-100 shadow-sm rounded-lg">
            <div className="stat-figure text-warning">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div className="stat-title">Last Activity</div>
            <div className="stat-value text-warning text-sm">
              {lastActivity ? 
                new Date(lastActivity).toLocaleDateString() : 
                'Never'
              }
            </div>
            <div className="stat-desc">Most recent session</div>
          </div>
        </div>

        {/* Grade Progress Card */}
        {estimatedGrade && estimatedGrade !== 'N/A' && (
          <div className="card bg-base-100 shadow-sm mb-8">
            <div className="card-body">
              <h2 className="card-title text-2xl mb-4">Progress to Next Grade</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-semibold">Current Grade: <span className="text-primary text-2xl">{gradeProgress.current}</span></p>
                    <p className="text-sm text-base-content/70">Target: {gradeProgress.next}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">{gradeProgress.percentage.toFixed(0)}%</p>
                    <p className="text-sm text-base-content/70">Complete</p>
                  </div>
                </div>
                
                <div className="w-full">
                  <progress 
                    className="progress progress-primary w-full h-6" 
                    value={gradeProgress.percentage} 
                    max="100"
                  ></progress>
                </div>
                
                <div className="flex justify-between text-xs text-base-content/50">
                  <span>{gradeProgress.current}</span>
                  <span>{gradeProgress.next}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Completion Progress Card */}
        {(blocksDone > 0 || blocksMissed > 0 || blocksScheduled > 0) && (
          <div className="card bg-base-100 shadow-sm mb-8">
            <div className="card-body">
              <h2 className="card-title text-2xl mb-4">Completion Overview</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-semibold">Completion Rate</p>
                    <p className="text-sm text-base-content/70">
                      {blocksDone} of {blocksDone + blocksMissed + blocksScheduled} blocks
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-accent">{completionPercentage.toFixed(0)}%</p>
                  </div>
                </div>
                
                <div className="w-full">
                  <progress 
                    className={`progress w-full h-6 ${
                      completionPercentage >= 80 ? 'progress-success' :
                      completionPercentage >= 60 ? 'progress-info' :
                      completionPercentage >= 40 ? 'progress-warning' :
                      'progress-error'
                    }`}
                    value={completionPercentage} 
                    max="100"
                  ></progress>
                </div>
                
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-success">{blocksDone}</p>
                    <p className="text-sm text-base-content/70">Completed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-error">{blocksMissed}</p>
                    <p className="text-sm text-base-content/70">Missed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-info">{blocksScheduled}</p>
                    <p className="text-sm text-base-content/70">Scheduled</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Insights */}
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body">
            <h2 className="card-title text-2xl mb-6">AI Insights & Feedback</h2>
            
            {insights.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🤖</div>
                <h3 className="text-xl font-bold mb-2">No insights yet</h3>
                <p className="text-base-content/70">
                  Complete some revision blocks to start receiving AI-powered feedback and insights.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {insights.map(insight => (
                  <div key={insight.id} className="card bg-base-200 shadow-sm">
                    <div className="card-body">
                      <div className="flex items-start space-x-4">
                        <div className="text-2xl">
                          {getInsightTypeIcon(insight.insight_type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold">
                              {getInsightTypeLabel(insight.insight_type)}
                            </h3>
                            <span className="text-sm text-base-content/50">
                              {new Date(insight.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="prose prose-sm max-w-none">
                            <p className="whitespace-pre-wrap">{insight.content}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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

export default function InsightsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg"></span>
          <p className="mt-4">Loading...</p>
        </div>
      </div>
    }>
      <InsightsPageContent />
    </Suspense>
  );
}
