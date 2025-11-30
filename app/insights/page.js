"use client";

import { useState, useEffect, Suspense } from "react";
import { supabase } from "@/libs/supabase";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import SupportModal from "@/components/SupportModal";
import config from "@/config";

function InsightsPageContent() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [insights, setInsights] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  
  // Stats data - will be populated from API when available
  const [hoursRevised, setHoursRevised] = useState({ hours: 0, minutes: 0 });
  const [estimatedGrade, setEstimatedGrade] = useState(null);
  const [gradeProgress, setGradeProgress] = useState({ current: 'C', next: 'B', percentage: 45 });
  const [completionPercentage, setCompletionPercentage] = useState(0);
  const [blocksDone, setBlocksDone] = useState(0);
  const [blocksMissed, setBlocksMissed] = useState(0); // Total missed events
  const [currentlyMissedBlocks, setCurrentlyMissedBlocks] = useState(0); // Unique blocks currently missed
  const [blocksScheduled, setBlocksScheduled] = useState(0);
  const [activeDays, setActiveDays] = useState(0);
  const [completedOnFirstAttempt, setCompletedOnFirstAttempt] = useState(0);
  const [totalBlocksOffered, setTotalBlocksOffered] = useState(0);
  const [firstAttemptCompletionRate, setFirstAttemptCompletionRate] = useState(0);
  const [avgConfidence, setAvgConfidence] = useState(0);
  const [examCountdown, setExamCountdown] = useState(null);
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [subjectGrades, setSubjectGrades] = useState([]);
  const [loadingSubjectGrades, setLoadingSubjectGrades] = useState(false);
  const [selectedSubjectDetails, setSelectedSubjectDetails] = useState(null);
  const [completionModalOpen, setCompletionModalOpen] = useState(false);

  useEffect(() => {
    loadInsights();
    loadStats();
    loadSubjectGrades(); // Load subject grades on page load
  }, []);

  // Set up real-time subscription to listen for block changes
  useEffect(() => {
    let channel;
    let mounted = true;
    
    const setupSubscription = async () => {
      try {
        // Check if we're in dev mode
        const isDev = typeof window !== 'undefined' && (
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1' ||
          window.location.hostname.includes('.local')
        );
        
        let userId = null;
        
        // Try NextAuth session first
        if (session?.user?.id) {
          userId = session.user.id;
        } else {
          // Fallback to Supabase auth
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          
          if (user?.id) {
            userId = user.id;
          }
        }
        
        if (!userId && isDev) {
          // In dev mode, try to get dev user via API route (bypasses RLS)
          console.log('🔧 Dev mode: Attempting to load dev user for subscription');
          try {
            const response = await fetch('/api/topics/get-user-data');
            if (response.ok) {
              const data = await response.json();
              if (data.success && data.userId) {
                userId = data.userId;
                console.log('🔧 Dev mode: Using dev user for subscription:', userId);
              }
            }
          } catch (error) {
            console.log('🔧 Dev mode: Error fetching dev user for subscription:', error);
          }
        }
        
        if (!userId) {
          if (isDev) {
            console.log('🔧 Dev mode: No user for real-time subscription, but continuing');
            // In dev mode, we can skip the subscription
            return;
          } else {
            console.log('No user for real-time subscription');
            return;
          }
        }

        console.log('Setting up real-time subscription for user:', userId);

        // Subscribe to changes in blocks table
        channel = supabase
          .channel(`stats-changes-${userId}`)
          .on(
            'postgres_changes',
            {
              event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
              schema: 'public',
              table: 'blocks',
              filter: `user_id=eq.${userId}`
            },
            (payload) => {
              console.log('🔔 Block changed, refreshing stats:', payload);
              if (mounted) {
                // Small delay to ensure database view is updated
                setTimeout(() => {
                  loadStats();
                }, 500);
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'INSERT', // Listen to new log entries (missed events)
              schema: 'public',
              table: 'logs',
              filter: `user_id=eq.${userId}`
            },
            (payload) => {
              console.log('🔔 Log entry added (missed event?), refreshing stats:', payload);
              if (mounted && payload.new?.event_type === 'block_missed') {
                // Small delay to ensure database is updated
                setTimeout(() => {
                  loadStats();
                }, 500);
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*', // Listen to all changes (INSERT, UPDATE, DELETE)
              schema: 'public',
              table: 'user_topic_confidence',
              filter: `user_id=eq.${userId}`
            },
            (payload) => {
              console.log('🔔 Topic confidence rating changed, refreshing stats and grades:', payload);
              if (mounted) {
                // Small delay to ensure database view is updated
                setTimeout(() => {
                  loadStats(); // This will refresh avg_confidence and recalculate grades
                  loadSubjectGrades(); // Also refresh per-subject grades
                }, 500);
              }
            }
          )
          .subscribe((status) => {
            console.log('📡 Subscription status:', status);
          });
      } catch (error) {
        console.error('Error setting up real-time subscription:', error);
      }
    };

    setupSubscription();

    return () => {
      mounted = false;
      if (channel) {
        console.log('Cleaning up real-time subscription');
        supabase.removeChannel(channel);
      }
    };
  }, [session?.user?.id]); // Re-run when user ID changes (stable reference)

  // Refresh stats when navigating to this page
  useEffect(() => {
    if (pathname === '/insights') {
      // Force refresh when navigating to this page
      console.log('🔄 Page navigation detected, refreshing stats...');
      loadStats();
      loadSubjectGrades();
    }
  }, [pathname]);

  // Refresh stats when page becomes visible (user switches back to tab/window)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadStats();
      }
    };

    const handleFocus = () => {
      loadStats();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
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
      console.log('📊 Loading stats...');
      
      // Use API route that handles dev mode and RLS properly
      // Add cache-busting timestamp to ensure fresh data
      const response = await fetch(`/api/stats?t=${Date.now()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store' // Prevent caching
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Error fetching stats:', errorData);
        setIsLoading(false);
        return;
      }
      
      const data = await response.json();
      
      if (data.success && data.stats) {
        const stats = data.stats;
        
        console.log('✅ Stats received:', stats);
        
        setBlocksDone(stats.blocks_done || 0);
        setBlocksMissed(stats.blocks_missed || 0);
        setCurrentlyMissedBlocks(stats.currently_missed_blocks || 0);
        setBlocksScheduled(stats.blocks_scheduled || 0);
        setActiveDays(stats.active_days || 0);
        setCompletedOnFirstAttempt(stats.completed_on_first_attempt || 0);
        setTotalBlocksOffered(stats.total_blocks_offered || 0);
        setFirstAttemptCompletionRate(stats.first_attempt_completion_rate || 0);
        setHoursRevised(stats.hours_revised || { hours: 0, minutes: 0 });
        setCompletionPercentage(stats.completion_percentage || 0);
        setAvgConfidence(stats.avg_confidence || 0);
        
        // Calculate estimated grade and progress
        if (stats.avg_confidence > 0) {
          const gradeInfo = confidenceToGrade(stats.avg_confidence);
          setEstimatedGrade(gradeInfo.grade);
          
          const progress = calculateGradeProgress(stats.avg_confidence);
          setGradeProgress(progress);
        } else {
          setEstimatedGrade(null);
          setGradeProgress({ current: 'N/A', next: 'E', percentage: 0 });
        }
        
        setStats({
          blocks_done: stats.blocks_done,
          blocks_missed: stats.blocks_missed,
          blocks_scheduled: stats.blocks_scheduled,
          active_days: stats.active_days,
          completed_on_first_attempt: stats.completed_on_first_attempt,
          total_blocks_offered: stats.total_blocks_offered,
          first_attempt_completion_rate: stats.first_attempt_completion_rate,
          avg_confidence: stats.avg_confidence
        });
        
        console.log('✅ Stats updated successfully');
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to get subject key from subject name
  const getSubjectKey = (subjectName) => {
    const mapping = {
      'Mathematics': 'maths',
      'Psychology': 'psychology',
      'Biology': 'biology',
      'Chemistry': 'chemistry',
      'Business': 'business',
      'Sociology': 'sociology',
      'Physics': 'physics',
      'Economics': 'economics',
      'History': 'history',
      'Geography': 'geography',
      'Computer Science': 'computerscience'
    };
    return mapping[subjectName] || subjectName.toLowerCase().replace(/\s+/g, '');
  };

  // Get subject color from config
  const getSubjectColor = (subject) => {
    const key = getSubjectKey(subject);
    return config.subjects[key]?.color || '#6b7280';
  };

  const loadSubjectGrades = async () => {
    try {
      setLoadingSubjectGrades(true);
      
      // Check if we're in dev mode
      const isDev = typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('.local')
      );
      
      let userId = null;
      let selectedSubjects = [];
      let subjectBoards = {};
      
      // Use API route to get user data (handles dev mode and RLS properly)
      try {
        const response = await fetch('/api/topics/get-user-data', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            userId = data.userId;
            selectedSubjects = data.selectedSubjects || [];
            subjectBoards = data.subjectBoards || {};
            console.log('✅ Loaded user data from API:', { userId, subjectCount: selectedSubjects.length });
          }
        } else {
          console.log('⚠️ API route returned error, will try localStorage fallback');
        }
      } catch (error) {
        console.log('⚠️ Error fetching user data from API, will try localStorage fallback:', error);
      }
      
      // Fallback to localStorage in dev mode if API didn't work
      if ((selectedSubjects.length === 0 || !userId) && isDev) {
        console.log('🔧 Dev mode: Loading from localStorage fallback');
        try {
          const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
          selectedSubjects = savedAnswers.selectedSubjects || [];
          subjectBoards = savedAnswers.subjectBoards || {};
        } catch (error) {
          console.error('Error loading from localStorage:', error);
        }
      }

      if (selectedSubjects.length === 0) {
        setLoadingSubjectGrades(false);
        return;
      }

      if (selectedSubjects.length === 0) {
        setLoadingSubjectGrades(false);
        return;
      }

      // Subject name mapping
      const subjectMapping = {
        'maths': 'Mathematics',
        'psychology': 'Psychology',
        'biology': 'Biology',
        'chemistry': 'Chemistry',
        'business': 'Business',
        'sociology': 'Sociology',
        'physics': 'Physics',
        'economics': 'Economics',
        'history': 'History',
        'geography': 'Geography',
        'computerscience': 'Computer Science'
      };

      // Get all user's ratings (from API route if userId exists, otherwise from localStorage in dev mode)
      let allRatings = [];
      
      if (userId) {
        console.log(`📊 Loading ratings for user: ${userId}`);
        try {
          // Use API route to get ratings (bypasses RLS)
          const response = await fetch('/api/topics/get-ratings', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            }
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.ratings) {
              // Filter to only positive ratings (1-5) for grade calculation
              allRatings = data.ratings.filter(r => r.rating >= 1 && r.rating <= 5);
              console.log(`✅ Loaded ${allRatings.length} positive ratings from API (out of ${data.ratings.length} total)`);
            }
          } else {
            console.error('❌ Error loading ratings from API:', response.statusText);
            // Fall back to localStorage in dev mode
            if (isDev) {
              console.log('🔧 Dev mode: Falling back to localStorage for ratings');
            }
          }
        } catch (error) {
          console.error('❌ Error fetching ratings from API:', error);
          // Fall back to localStorage in dev mode
          if (isDev) {
            console.log('🔧 Dev mode: Falling back to localStorage for ratings');
          }
        }
      }
      
      // Fallback to localStorage in dev mode if no ratings from database
      if (allRatings.length === 0 && isDev) {
        // In dev mode without userId, try localStorage
        try {
          const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
          const topicRatings = savedAnswers.topicRatings || {};
          
          // Convert localStorage format to array format
          allRatings = Object.entries(topicRatings)
            .filter(([topicId, rating]) => {
              // Only include valid UUIDs and ratings 1-5
              const uuidRegex = /^[0-9a-fA-F-]{36}$/;
              return uuidRegex.test(topicId) && rating >= 1 && rating <= 5;
            })
            .map(([topic_id, rating]) => ({ topic_id, rating }));
        } catch (error) {
          console.error('Error loading ratings from localStorage:', error);
        }
      }

      console.log(`📊 Total ratings loaded: ${allRatings.length}`);
      
      if (!allRatings || allRatings.length === 0) {
        console.log('⚠️ No ratings found - showing N/A for all subjects');
        // No ratings yet - show subjects with N/A
        const grades = selectedSubjects.map(subjectId => {
          const dbSubject = subjectMapping[subjectId] || subjectId;
          const board = subjectBoards[subjectId];
          return {
            subject: dbSubject,
            board: board,
            avgConfidence: 0,
            grade: 'N/A',
            progress: { current: 'N/A', next: 'E', percentage: 0 },
            topicsRated: 0
          };
        });
        setSubjectGrades(grades);
        setLoadingSubjectGrades(false);
        return;
      }

      // Create a map of topic_id -> rating for quick lookup
      const ratingMap = new Map();
      allRatings.forEach(r => {
        ratingMap.set(r.topic_id, r.rating);
      });

      const grades = [];

      // For each subject, get topics and calculate average confidence
      for (const subjectId of selectedSubjects) {
        const dbSubject = subjectMapping[subjectId] || subjectId;
        const board = subjectBoards[subjectId];
        if (!board) continue;

        // Fetch topics for this subject/board combination
        try {
          const response = await fetch('/api/topics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              subjects: [dbSubject],
              boards: [board]
            })
          });

          if (!response.ok) {
            console.error(`Failed to load topics for ${dbSubject}`);
            grades.push({
              subject: dbSubject,
              board: board,
              avgConfidence: 0,
              grade: 'N/A',
              progress: { current: 'N/A', next: 'E', percentage: 0 },
              topicsRated: 0
            });
            continue;
          }

          const data = await response.json();
          const topics = data.topics || [];

          // Get ratings for topics in this subject
          const topicRatings = [];
          topics.forEach(topic => {
            const rating = ratingMap.get(topic.id);
            if (rating && rating >= 1 && rating <= 5) {
              topicRatings.push(rating);
            }
          });

          if (topicRatings.length > 0) {
            const avgConfidence = topicRatings.reduce((sum, r) => sum + r, 0) / topicRatings.length;
            const gradeInfo = confidenceToGrade(avgConfidence);
            const progress = calculateGradeProgress(avgConfidence);

            grades.push({
              subject: dbSubject,
              board: board,
              avgConfidence: avgConfidence,
              grade: gradeInfo.grade,
              progress: progress,
              topicsRated: topicRatings.length
            });
          } else {
            // No ratings for this subject yet
            grades.push({
              subject: dbSubject,
              board: board,
              avgConfidence: 0,
              grade: 'N/A',
              progress: { current: 'N/A', next: 'E', percentage: 0 },
              topicsRated: 0
            });
          }
        } catch (error) {
          console.error(`Error loading topics for ${dbSubject}:`, error);
          grades.push({
            subject: dbSubject,
            board: board,
            avgConfidence: 0,
            grade: 'N/A',
            progress: { current: 'N/A', next: 'E', percentage: 0 },
            topicsRated: 0
          });
        }
      }

      setSubjectGrades(grades);
    } catch (error) {
      console.error('Error loading subject grades:', error);
    } finally {
      setLoadingSubjectGrades(false);
    }
  };

  useEffect(() => {
    // First official A-Level exams begin on Monday 11 May 2026
    const examStartDate = new Date('2026-05-11T00:00:00').getTime();
    
    const updateCountdown = () => {
      const now = Date.now();
      const diff = examStartDate - now;
      
      if (diff <= 0) {
        setExamCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true });
        return;
      }

      const totalSeconds = Math.floor(diff / 1000);
      const days = Math.floor(totalSeconds / (60 * 60 * 24));
      const hours = Math.floor((totalSeconds % (60 * 60 * 24)) / (60 * 60));
      const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
      const seconds = totalSeconds % 60;

      setExamCountdown(prev => {
        // Only update if values actually changed to prevent unnecessary re-renders
        if (prev && prev.days === days && prev.hours === hours && prev.minutes === minutes && prev.seconds === seconds) {
          return prev;
        }
        return { days, hours, minutes, seconds, expired: false };
      });
    };

    // Update immediately
    updateCountdown();
    
    // Use precise interval - update every second
    const intervalId = setInterval(updateCountdown, 1000);
    
    // Cleanup interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, []);

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
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Study Stats</h1>
                <p className="text-base-content/70">
                  Track your revision progress and performance
                </p>
              </div>
              <button
                onClick={() => {
                  loadStats();
                  toast.success('Stats refreshed');
                }}
                className="btn btn-sm btn-outline gap-2"
                title="Refresh stats"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
          </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 -mt-[100px] pb-8">
        {/* Exam Countdown */}
        {examCountdown && (
          <div className="mb-6">
            <div className={`card ${examCountdown.expired ? 'bg-error/10 border-error' : 'bg-primary/10 border-primary'} border-2 shadow-lg`}>
              <div className="card-body !py-1 !px-4">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="text-center md:text-left">
                    <h2 className="text-2xl font-bold mb-2">
                      {examCountdown.expired ? 'Exams Started!' : 'Countdown to A-Level Exams'}
                    </h2>
                    <p className="text-base-content/70">
                      First exams begin: Monday, 11 May 2026
                    </p>
                  </div>
                  {!examCountdown.expired && (
                    <div className="flex gap-3 md:gap-4">
                      <div className="stat bg-base-100 rounded-lg shadow min-w-[70px] md:min-w-[80px]">
                        <div className="stat-value text-2xl md:text-3xl lg:text-4xl">{examCountdown.days}</div>
                        <div className="stat-desc text-xs">Days</div>
                      </div>
                      <div className="stat bg-base-100 rounded-lg shadow min-w-[70px] md:min-w-[80px]">
                        <div className="stat-value text-2xl md:text-3xl lg:text-4xl">{examCountdown.hours}</div>
                        <div className="stat-desc text-xs">Hours</div>
                      </div>
                      <div className="stat bg-base-100 rounded-lg shadow min-w-[70px] md:min-w-[80px]">
                        <div className="stat-value text-2xl md:text-3xl lg:text-4xl">{examCountdown.minutes}</div>
                        <div className="stat-desc text-xs">Minutes</div>
                      </div>
                      <div className="stat bg-base-100 rounded-lg shadow min-w-[70px] md:min-w-[80px]">
                        <div className="stat-value text-2xl md:text-3xl lg:text-4xl text-primary animate-pulse">{examCountdown.seconds}</div>
                        <div className="stat-desc text-xs">Seconds</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

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
            <div className="stat-value text-primary">
              {hoursRevised.hours > 0 || hoursRevised.minutes > 0 ? (
                <>
                  {hoursRevised.hours > 0 && <span>{hoursRevised.hours}h</span>}
                  {hoursRevised.minutes > 0 && <span className="ml-1">{hoursRevised.minutes}m</span>}
                </>
              ) : (
                '0h'
              )}
            </div>
            <div className="stat-desc">Total study time</div>
          </div>

          <div 
            className="stat bg-base-100 shadow-sm rounded-lg cursor-pointer hover:bg-base-200 transition"
            onClick={() => {
              loadSubjectGrades();
              setGradeModalOpen(true);
            }}
            title="Click to view grades by subject"
          >
            <div className="stat-figure text-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"></path>
              </svg>
            </div>
            <div className="stat-title">Estimated Grade</div>
            {subjectGrades.length > 0 ? (
              <div className="stat-value text-secondary text-3xl font-bold">
                {subjectGrades
                  .map(sg => sg.grade !== 'N/A' ? sg.grade : '?')
                  .join(' ')}
              </div>
            ) : (
              <div className="stat-value text-secondary text-4xl">{estimatedGrade || 'N/A'}</div>
            )}
            <div className="stat-desc">Click to view by subject</div>
          </div>

          <div 
            className="stat bg-base-100 shadow-sm rounded-lg cursor-pointer hover:bg-base-200 transition"
            onClick={() => setCompletionModalOpen(true)}
            title="Click to view completion overview"
          >
            <div className="stat-figure text-accent">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
              </svg>
            </div>
            <div className="stat-title">Completion %</div>
            <div className="stat-value text-accent">{completionPercentage.toFixed(0)}%</div>
            <div className="stat-desc">Click to view details</div>
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
            <div className="stat-title">Blocks Left This Week</div>
            <div className="stat-value text-warning">{blocksScheduled}</div>
            <div className="stat-desc">Scheduled blocks remaining</div>
          </div>
        </div>



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
                  href="/settings/rerate-topics"
                  className={`block px-4 py-3 rounded-lg transition ${
                    pathname === '/settings/rerate-topics' 
                      ? 'bg-primary text-primary-content' 
                      : 'hover:bg-base-300'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">⭐</span>
                    <span className="font-medium">Rerate Topics</span>
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

      {/* Subject Grades Modal */}
      {gradeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setGradeModalOpen(false)}>
          <div className="bg-base-100 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Estimated Grades by Subject</h2>
                <button
                  onClick={() => setGradeModalOpen(false)}
                  className="btn btn-sm btn-circle btn-ghost"
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>

              {loadingSubjectGrades ? (
                <div className="text-center py-8">
                  <span className="loading loading-spinner loading-lg"></span>
                  <p className="mt-4 text-base-content/70">Loading subject grades...</p>
                </div>
              ) : subjectGrades.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-base-content/70">No subjects found. Please complete onboarding first.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {subjectGrades.map((subjectGrade, index) => {
                    const subjectColor = getSubjectColor(subjectGrade.subject);
                    const percentage = subjectGrade.grade !== 'N/A' ? subjectGrade.progress.percentage : 0;
                    const circumference = 2 * Math.PI * 45; // radius = 45
                    const offset = circumference - (percentage / 100) * circumference;
                    
                    return (
                      <div 
                        key={index} 
                        className="card bg-base-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => subjectGrade.grade !== 'N/A' && setSelectedSubjectDetails(subjectGrade)}
                      >
                        <div className="card-body p-4">
                          <div className="flex items-center gap-6">
                            {/* Left side: Subject name and board */}
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold mb-1">
                                {subjectGrade.subject} {subjectGrade.board && `(${subjectGrade.board.toUpperCase()})`}
                              </h3>
                              {subjectGrade.grade === 'N/A' && (
                                <p className="text-sm text-base-content/70 mt-2">
                                  Rate topics to see your estimated grade
                                </p>
                              )}
                            </div>

                            {/* Right side: Circular progress with grade */}
                            {subjectGrade.grade !== 'N/A' ? (
                              <div className="flex items-center gap-4">
                                {/* Circular Progress Indicator */}
                                <div className="relative flex-shrink-0">
                                  <svg className="transform -rotate-90" width="120" height="120">
                                    {/* Background circle */}
                                    <circle
                                      cx="60"
                                      cy="60"
                                      r="45"
                                      stroke="currentColor"
                                      strokeWidth="8"
                                      fill="none"
                                      className="text-base-300"
                                    />
                                    {/* Progress circle */}
                                    <circle
                                      cx="60"
                                      cy="60"
                                      r="45"
                                      stroke={subjectColor}
                                      strokeWidth="8"
                                      fill="none"
                                      strokeDasharray={circumference}
                                      strokeDashoffset={offset}
                                      strokeLinecap="round"
                                      className="transition-all duration-500 ease-out"
                                    />
                                  </svg>
                                  {/* Percentage in center */}
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="text-center">
                                      <div className="text-2xl font-bold" style={{ color: subjectColor }}>
                                        {percentage.toFixed(0)}%
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Grade display with arrow */}
                                <div className="text-right">
                                  <div className="flex items-center gap-2 justify-end">
                                    <span className="text-3xl font-bold" style={{ color: subjectColor }}>
                                      {subjectGrade.progress.current}
                                    </span>
                                    <svg 
                                      width="24" 
                                      height="24" 
                                      viewBox="0 0 24 24" 
                                      fill="none" 
                                      stroke={subjectColor} 
                                      strokeWidth="2" 
                                      strokeLinecap="round" 
                                      strokeLinejoin="round"
                                      className="flex-shrink-0"
                                    >
                                      <line x1="5" y1="12" x2="19" y2="12"></line>
                                      <polyline points="12 5 19 12 12 19"></polyline>
                                    </svg>
                                    <span className="text-3xl font-bold text-base-content/70">
                                      {subjectGrade.progress.next}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex-shrink-0">
                                <div className="text-2xl font-bold text-base-content/30">
                                  N/A
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Completion Overview Modal */}
      {completionModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setCompletionModalOpen(false)}
        >
          <div 
            className="bg-base-100 rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Completion Overview</h2>
              <button
                onClick={() => setCompletionModalOpen(false)}
                className="btn btn-sm btn-circle btn-ghost"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold">First Attempt Completion</p>
                  <p className="text-sm text-base-content/70">
                    {completedOnFirstAttempt} of {totalBlocksOffered} blocks
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-accent">{firstAttemptCompletionRate.toFixed(0)}%</p>
                </div>
              </div>
              
              <div className="w-full">
                <progress 
                  className={`progress w-full h-6 ${
                    firstAttemptCompletionRate >= 80 ? 'progress-success' :
                    firstAttemptCompletionRate >= 60 ? 'progress-info' :
                    firstAttemptCompletionRate >= 40 ? 'progress-warning' :
                    'progress-error'
                  }`}
                  value={firstAttemptCompletionRate} 
                  max="100"
                ></progress>
              </div>
              
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-success">{completedOnFirstAttempt}</p>
                  <p className="text-sm text-base-content/70">First Attempt</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-warning">{blocksDone - completedOnFirstAttempt}</p>
                  <p className="text-sm text-base-content/70">After Reschedule</p>
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

      {/* Subject Details Popup */}
      {selectedSubjectDetails && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={() => setSelectedSubjectDetails(null)}
        >
          <div 
            className="bg-base-100 rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">
                {selectedSubjectDetails.subject} {selectedSubjectDetails.board && `(${selectedSubjectDetails.board.toUpperCase()})`}
              </h3>
              <button
                onClick={() => setSelectedSubjectDetails(null)}
                className="btn btn-sm btn-circle btn-ghost"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              {selectedSubjectDetails.topicsRated > 0 && (
                <div>
                  <div className="text-sm text-base-content/70 mb-1">Topics Rated</div>
                  <div className="text-lg font-semibold">{selectedSubjectDetails.topicsRated}</div>
                </div>
              )}
              
              {selectedSubjectDetails.grade !== 'N/A' && (
                <div>
                  <div className="text-sm text-base-content/70 mb-1">Grade Progress</div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">Current: {selectedSubjectDetails.progress.current}</span>
                    <span className="text-base-content/50">→</span>
                    <span className="text-lg font-semibold">Target: {selectedSubjectDetails.progress.next}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
