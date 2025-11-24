"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import config from "@/config";
import BlockDetailModal from "@/components/BlockDetailModal";

export default function PlanPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('today');
  const [blocks, setBlocks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  // Timer state storage: { [blockKey]: { running: boolean, phase: 'study'|'rest', endTime: number|null, pausedAt: number|null, remainingMs: number|null } }
  const [timerStates, setTimerStates] = useState({});
  const [weekStartDate, setWeekStartDate] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });
  const [blockedTimeRanges, setBlockedTimeRanges] = useState([]);
  const [showRescheduledModal, setShowRescheduledModal] = useState(false);
  const [rescheduledBlockInfo, setRescheduledBlockInfo] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);

  useEffect(() => {
    // Check if we're in dev mode
    const isDev = typeof window !== 'undefined' && (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.includes('localhost')
    );
    
    if (!isDev && status === 'unauthenticated') {
      console.log('⚠️ Not authenticated, redirecting to sign in');
      router.push('/api/auth/signin');
    } else {
      // In dev mode or if authenticated, load blocks
      if (isDev) {
        console.log('🔧 Dev mode: Loading blocks without authentication');
      }
      loadBlocks();
    }
  }, [status, router]);

  const loadBlocks = async () => {
    try {
      setIsLoading(true);
      
      // Step 1: First try to GET existing blocks from the database
      console.log('🔍 Attempting to load existing blocks from database...');
      try {
        const getResponse = await fetch('/api/plan/generate', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (getResponse.ok) {
          const getData = await getResponse.json();
          console.log('📊 GET response:', {
            success: getData.success,
            blocksCount: getData.blocks?.length || 0,
            hasBlocks: !!getData.blocks && getData.blocks.length > 0,
            responseStatus: getResponse.status
          });

          // If we have existing blocks, format and display them
          if (getData.blocks && getData.blocks.length > 0) {
            console.log('✅ Found existing blocks, formatting and displaying...');
            
            // Convert blocks to the format expected by the UI
            const formattedBlocks = getData.blocks.map(block => {
              // Handle both formats: scheduler format (week_start + start_time) and database format (scheduled_at)
              let scheduled_at;
              if (block.scheduled_at) {
                scheduled_at = block.scheduled_at;
              } else if (block.week_start && block.start_time) {
                scheduled_at = new Date(`${block.week_start}T${block.start_time}:00`).toISOString();
              } else {
                console.error('Block missing scheduled_at or week_start/start_time:', block);
                return null;
              }
              
              return {
                id: block.id,
                scheduled_at,
                duration_minutes: block.duration_minutes || (block.duration ? block.duration * 60 : 90),
                status: block.status || 'scheduled',
                ai_rationale: block.ai_rationale || `Priority: ${block.priority_score || 'N/A'} - ${block.topic_description || 'Focus on this topic to improve your understanding.'}`,
                topics: {
                  name: block.topic_name || block.topics?.name || 'Topic',
                  level: block.confidence_rating || block.topics?.level,
                  specs: {
                    subject: block.subject || block.topics?.specs?.subject || 'Subject',
                    board: block.exam_board || block.topics?.specs?.board || 'Board'
                  }
                },
                topic_id: block.topic_id,
                day: block.day,
                priority_score: block.priority_score
              };
            }).filter(block => block !== null);

            console.log('✅ Formatted existing blocks:', formattedBlocks.length);
            if (formattedBlocks.length > 0) {
              setBlocks(formattedBlocks);
              
              // Load blocked times
              try {
                const blockedResponse = await fetch('/api/availability/save');
                if (blockedResponse.ok) {
                  const blockedData = await blockedResponse.json();
                  setBlockedTimeRanges((blockedData.blockedTimes || []).map(bt => ({
                    start_time: bt.start,
                    end_time: bt.end
                  })));
                }
              } catch (error) {
                console.error('Error loading blocked times:', error);
              }
              
              return; // Exit early - we have blocks to display
            } else {
              console.warn('⚠️ All blocks were filtered out during formatting');
            }
          } else {
            console.log('📭 No existing blocks found in database response');
          }
        } else {
          const errorData = await getResponse.json().catch(() => ({ error: 'Unknown error' }));
          console.log('⚠️ GET request failed:', {
            status: getResponse.status,
            error: errorData
          });
        }
      } catch (getError) {
        console.error('❌ Error during GET request:', getError);
        // Continue to try generating new blocks
      }

      // Step 2: No existing blocks found, so generate new ones using POST
      console.log('📝 No existing blocks found, generating new plan...');
      
      // Load data from localStorage (from onboarding)
      const selectedSubjects = JSON.parse(localStorage.getItem('selectedSubjects') || '{}');
      const topicRatings = JSON.parse(localStorage.getItem('topicRatings') || '{}');
      const topicStatus = JSON.parse(localStorage.getItem('topicStatus') || '{}');
      const availability = JSON.parse(localStorage.getItem('availability') || '{}');
      const examDates = JSON.parse(localStorage.getItem('examDates') || '{}');

      console.log('📋 Loading from localStorage:', {
        selectedSubjects: Object.keys(selectedSubjects).length,
        topicRatings: Object.keys(topicRatings).length,
        topicStatus: Object.keys(topicStatus).length,
        availability: Object.keys(availability).length,
        examDates: Object.keys(examDates).length
      });

      // Convert selectedSubjects to array format expected by scheduler
      const subjects = Object.keys(selectedSubjects).filter(subject => selectedSubjects[subject]);

      console.log('📚 Subjects found:', subjects);

      if (subjects.length === 0) {
        console.log('⚠️ No subjects selected, redirecting to onboarding');
        router.push('/onboarding/slide-1');
        return;
      }

      // Generate study plan using scheduler
      const postResponse = await fetch('/api/plan/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subjects,
          ratings: topicRatings,
          topicStatus,
          availability,
          examDates,
          studyBlockDuration: 1.5
        })
      });

      if (!postResponse.ok) {
        const errorData = await postResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Plan generation failed:', {
          status: postResponse.status,
          error: errorData
        });
        throw new Error(errorData.error || 'Failed to generate study plan');
      }

      const postData = await postResponse.json();
      console.log('📝 Plan generation response:', {
        blocksCount: postData.blocks?.length || 0,
        firstBlock: postData.blocks?.[0],
        hasBlocks: !!postData.blocks
      });
      
      if (!postData.blocks || postData.blocks.length === 0) {
        console.warn('⚠️ No blocks returned from generation');
        setBlocks([]);
        return;
      }
      
      // Convert scheduler blocks to the format expected by the UI
      const formattedBlocks = postData.blocks.map(block => {
        // Handle both formats: scheduler format (week_start + start_time) and database format (scheduled_at)
        let scheduled_at;
        if (block.scheduled_at) {
          scheduled_at = block.scheduled_at;
        } else if (block.week_start && block.start_time) {
          scheduled_at = new Date(`${block.week_start}T${block.start_time}:00`).toISOString();
        } else {
          console.error('Block missing scheduled_at or week_start/start_time:', block);
          return null;
        }
        
        return {
          id: block.id,
          scheduled_at,
          duration_minutes: block.duration_minutes || (block.duration ? block.duration * 60 : 90),
          status: block.status || 'scheduled',
          ai_rationale: block.ai_rationale || `Priority: ${block.priority_score || 'N/A'} - ${block.topic_description || 'Focus on this topic to improve your understanding.'}`,
          topics: {
            name: block.topic_name || block.topics?.name || 'Topic',
            level: block.confidence_rating || block.topics?.level,
            specs: {
              subject: block.subject || block.topics?.specs?.subject || 'Subject',
              board: block.exam_board || block.topics?.specs?.board || 'Board'
            }
          },
          topic_id: block.topic_id,
          day: block.day,
          priority_score: block.priority_score
        };
      }).filter(block => block !== null);

      console.log('✅ Formatted generated blocks:', formattedBlocks.length);
      setBlocks(formattedBlocks);
      
      // Load blocked times
      try {
        const blockedResponse = await fetch('/api/availability/save');
        if (blockedResponse.ok) {
          const blockedData = await blockedResponse.json();
          setBlockedTimeRanges((blockedData.blockedTimes || []).map(bt => ({
            start_time: bt.start,
            end_time: bt.end
          })));
        }
      } catch (error) {
        console.error('Error loading blocked times:', error);
      }
    } catch (error) {
      console.error('❌ Error loading blocks:', error);
      // Fallback to empty array if everything fails
      setBlocks([]);
    } finally {
      setIsLoading(false);
    }
  };

  const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const handleBlockAction = async (blockKey, action, options = {}) => {
    setIsUpdating(true);
    const { forceStatus = null } = options;
    
    // Find the block to get its database ID
    const block = blocks.find(b => deriveBlockKey(b) === blockKey);
    if (!block || !block.id) {
      console.error('Block not found or missing ID');
      setIsUpdating(false);
      return;
    }
    
    // Calculate the new status
    const currentStatus = block.status || 'scheduled';
    const newStatus = forceStatus ?? (currentStatus === action ? 'scheduled' : action);
    
    // Optimistic update
    const previousBlocks = [...blocks];
    setBlocks(prev => prev.map(b => 
      deriveBlockKey(b) === blockKey 
        ? { ...b, status: newStatus }
        : b
    ));
    
    try {
      // Determine which API endpoint to call
      let endpoint;
      if (newStatus === 'done') {
        endpoint = '/api/plan/mark-done';
      } else if (newStatus === 'missed') {
        endpoint = '/api/plan/mark-missed';
      } else {
        setIsUpdating(false);
        return;
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId: block.id })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update block status (${response.status})`);
      }
      
      // If block was missed and rescheduled, show modal
      if (newStatus === 'missed') {
        const responseData = await response.json();
        if (responseData.rescheduled && responseData.newTime) {
          setRescheduledBlockInfo({
            topicName: block.topics?.name || 'Topic',
            newTime: responseData.newTime
          });
          setShowRescheduledModal(true);
          
          // Reload blocks to get the updated schedule
          await loadBlocks();
        }
      }
    } catch (error) {
      // Rollback on error
      setBlocks(previousBlocks);
      console.error(`Error updating block status:`, error);
      alert(`Failed to update block: ${error.message}. Please try again.`);
    } finally {
      setIsUpdating(false);
    }
  };

  const getTodayBlocks = () => {
    const today = new Date().toDateString();
    return blocks.filter(block => 
      new Date(block.scheduled_at).toDateString() === today
    );
  };

  const getWeekBlocks = () => {
    const weekBlocks = {};
    blocks.forEach(block => {
      const date = new Date(block.scheduled_at).toDateString();
      if (!weekBlocks[date]) {
        weekBlocks[date] = [];
      }
      weekBlocks[date].push(block);
    });
    return weekBlocks;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'done': return 'text-success';
      case 'missed': return 'text-error';
      case 'skipped': return 'text-warning';
      default: return 'text-base-content';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'done': return '✅';
      case 'missed': return '❌';
      case 'skipped': return '⏭️';
      default: return '⏰';
    }
  };

  // Helper to convert full subject names (from database) to config keys
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

  const getSubjectColor = (subject) => {
    const key = getSubjectKey(subject);
    return config.subjects[key]?.color || '#6b7280';
  };

  const getSubjectIcon = (subject) => {
    const key = getSubjectKey(subject);
    return config.subjects[key]?.icon || '📚';
  };

  // Build time labels for the schedule grid
  const buildTimeLabels = useCallback(() => {
    if (typeof window === 'undefined') return [];
    
    const labels = [];
    const timePreferences = JSON.parse(localStorage.getItem('timePreferences') || '{}');
    
    // Get earliest and latest times across all days
    const weekdayStart = timePreferences.weekdayEarliest || '09:00';
    const weekdayEnd = timePreferences.weekdayLatest || '20:00';
    const weekendStart = timePreferences.weekendEarliest || timePreferences.weekdayEarliest || '09:00';
    const weekendEnd = timePreferences.weekendLatest || timePreferences.weekdayLatest || '20:00';
    
    // Use the earliest start and latest end
    const [startHour, startMin] = weekdayStart.split(':').map(Number);
    const [endHour, endMin] = weekdayEnd.split(':').map(Number);
    
    let currentMin = startHour * 60 + startMin;
    const endMinTotal = endHour * 60 + endMin;
    
    while (currentMin < endMinTotal) {
      const hours = Math.floor(currentMin / 60);
      const minutes = currentMin % 60;
      labels.push({
        time: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
        minutes: currentMin
      });
      currentMin += 30; // 30-minute slots
    }
    
    return labels;
  }, []);

  // Calculate week time bounds
  const weekTimeBounds = useMemo(() => {
    if (typeof window === 'undefined') return { start: 9 * 60, end: 20 * 60 };
    
    const timePreferences = JSON.parse(localStorage.getItem('timePreferences') || '{}');
    const weekdayStart = timePreferences.weekdayEarliest || '09:00';
    const weekdayEnd = timePreferences.weekdayLatest || '20:00';
    const weekendStart = timePreferences.weekendEarliest || weekdayStart;
    const weekendEnd = timePreferences.weekendLatest || weekdayEnd;
    
    const parseTime = (timeStr) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };
    
    const starts = [parseTime(weekdayStart), parseTime(weekendStart)];
    const ends = [parseTime(weekdayEnd), parseTime(weekendEnd)];
    
    return {
      start: Math.min(...starts),
      end: Math.max(...ends)
    };
  }, []);

  const timeLabels = useMemo(() => buildTimeLabels(), [buildTimeLabels]);

  // Create a map of blocked slots for quick lookup
  const blockedSlotMap = useMemo(() => {
    const map = new Map();
    blockedTimeRanges.forEach(range => {
      const start = new Date(range.start_time);
      const end = new Date(range.end_time);
      const dayKey = start.toDateString();
      
      const startMin = start.getHours() * 60 + start.getMinutes();
      const endMin = end.getHours() * 60 + end.getMinutes();
      
      for (let min = startMin; min < endMin; min += 30) {
        const key = `${dayKey}-${Math.floor((min - weekTimeBounds.start) / 30)}`;
        map.set(key, true);
      }
    });
    return map;
  }, [blockedTimeRanges, weekTimeBounds]);

  // Timer state helpers
  const getTimerState = useCallback((blockKey) => {
    return timerStates[blockKey] || null;
  }, [timerStates]);

  const updateTimerState = useCallback((blockKey, state) => {
    setTimerStates(prev => {
      if (state === null) {
        const { [blockKey]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [blockKey]: state };
    });
  }, []);

  // Background timer that continues running even when modal is closed
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes
      
      setTimerStates(prev => {
        const updated = { ...prev };
        let hasChanges = false;

        Object.keys(updated).forEach(blockKey => {
          const timer = updated[blockKey];
          
          // Check for inactivity timeout (10 minutes of being paused)
          if (!timer.running && timer.pausedAt) {
            const inactiveTime = now - timer.pausedAt;
            if (inactiveTime >= INACTIVITY_TIMEOUT) {
              // Timer has been paused for 10+ minutes - reset it
              updated[blockKey] = {
                running: false,
                phase: 'study',
                endTime: null,
                pausedAt: null,
                remainingMs: null
              };
              hasChanges = true;
              return; // Skip to next timer
            }
          }
          
          if (timer.endTime && now >= timer.endTime) {
            // Timer has reached its endTime
            if (timer.running) {
              // Timer was running - transition phases normally
              if (timer.phase === 'study') {
                // Study phase complete - switch to rest phase
                updated[blockKey] = {
                  running: false, // Pause rest phase (user needs to start it)
                  phase: 'rest',
                  endTime: null, // Will be set when user starts rest phase
                  pausedAt: now, // Track when rest phase was paused
                  remainingMs: null
                };
                hasChanges = true;
              } else if (timer.phase === 'rest') {
                // Rest phase complete - reset to study phase
                updated[blockKey] = {
                  running: false,
                  phase: 'study',
                  endTime: null,
                  pausedAt: null,
                  remainingMs: null
                };
                hasChanges = true;
              }
            } else {
              // Timer was paused and expired - auto-reset to 25 minutes (study phase)
              updated[blockKey] = {
                running: false,
                phase: 'study',
                endTime: null,
                pausedAt: null,
                remainingMs: null
              };
              hasChanges = true;
            }
          }
        });

        return hasChanges ? updated : prev;
      });
    }, 100); // Check every 100ms for better accuracy

    return () => clearInterval(interval);
  }, []);

  const deriveBlockKey = useCallback((block) => block?.id || block?.scheduled_at, []);

  const handleSelectSlot = useCallback((slot) => {
    setSelectedSlot(slot);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedSlot(null);
  }, []);

  const activeBlock = useMemo(() => {
    if (!selectedSlot || selectedSlot.kind !== 'study') return null;
    return blocks.find((block) => deriveBlockKey(block) === selectedSlot.key) || null;
  }, [blocks, deriveBlockKey, selectedSlot]);

  // Memoized timer state change handler
  const activeBlockTimerStateChange = useMemo(() => {
    if (!activeBlock) return null;
    const blockKey = deriveBlockKey(activeBlock);
    return (state) => updateTimerState(blockKey, state);
  }, [activeBlock, deriveBlockKey, updateTimerState]);

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg"></span>
          <p className="mt-4">Loading your plan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-100">
      {/* Header */}
      <div className="bg-base-200">
        <div className="max-w-[95vw] mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Menu Icon */}
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md p-2 hover:bg-base-300 transition"
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
              
              <div>
                <h1 className="text-3xl font-bold">Your Revision Plan</h1>
                <p className="text-base-content/70">
                  {activeTab === 'today' ? 'Today\'s schedule' : 'This week\'s overview'}
                </p>
              </div>
            </div>
            
            <div className="flex space-x-2">
              <button
                onClick={() => setActiveTab('today')}
                className={`btn ${activeTab === 'today' ? 'btn-primary' : 'btn-outline'}`}
              >
                Today
              </button>
              <button
                onClick={() => setActiveTab('week')}
                className={`btn ${activeTab === 'week' ? 'btn-primary' : 'btn-outline'}`}
              >
                Week
              </button>
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
                          className="block px-4 py-2 rounded-lg transition text-sm hover:bg-base-300"
                          onClick={() => setSidebarOpen(false)}
                        >
                          Study Preferences
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/settings?section=account"
                          className="block px-4 py-2 rounded-lg transition text-sm hover:bg-base-300"
                          onClick={() => setSidebarOpen(false)}
                        >
                          Account Information
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/settings?section=contact"
                          className="block px-4 py-2 rounded-lg transition text-sm hover:bg-base-300"
                          onClick={() => setSidebarOpen(false)}
                        >
                          Contact
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/settings?section=feedback"
                          className="block px-4 py-2 rounded-lg transition text-sm hover:bg-base-300"
                          onClick={() => setSidebarOpen(false)}
                        >
                          Feedback
                        </Link>
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

      {/* Content */}
      <div className="max-w-[95vw] mx-auto px-4 py-8">
        {activeTab === 'today' ? (
          <TodayView 
            blocks={getTodayBlocks()} 
            onSelectBlock={handleSelectSlot}
            getSubjectColor={getSubjectColor}
            getSubjectIcon={getSubjectIcon}
            getBlockKey={deriveBlockKey}
          />
        ) : (
          <WeekView 
            blocks={blocks}
            onSelectBlock={handleSelectSlot}
            getSubjectColor={getSubjectColor}
            getSubjectIcon={getSubjectIcon}
            getStatusColor={getStatusColor}
            getStatusIcon={getStatusIcon}
            getBlockKey={deriveBlockKey}
            timeLabels={timeLabels}
            weekTimeBounds={weekTimeBounds}
            blockedSlotMap={blockedSlotMap}
            weekStartDate={weekStartDate}
            isLoading={isLoading}
          />
        )}
      </div>

      <BlockDetailModal
        selection={selectedSlot}
        block={activeBlock}
        onClose={handleCloseDetail}
        onBlockAction={handleBlockAction}
        getStatusColor={getStatusColor}
        getStatusIcon={getStatusIcon}
        getSubjectColor={getSubjectColor}
        getSubjectIcon={getSubjectIcon}
        getBlockKey={deriveBlockKey}
        timerState={activeBlock ? getTimerState(deriveBlockKey(activeBlock)) : null}
        onTimerStateChange={activeBlockTimerStateChange}
      />

      {showRescheduledModal && rescheduledBlockInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="fixed inset-0 bg-black/50"
            onClick={() => setShowRescheduledModal(false)}
          />
          <div className="relative bg-base-100 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-2xl font-bold mb-4">Block Rescheduled</h2>
            <p className="mb-4">
              The missed block has been rescheduled to:
            </p>
            <div className="bg-base-200 rounded-lg p-4 mb-4">
              <p className="font-semibold">{rescheduledBlockInfo.topicName}</p>
              <p className="text-sm text-base-content/70">
                {new Date(rescheduledBlockInfo.newTime).toLocaleDateString([], {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
              <p className="text-sm text-base-content/70">
                {new Date(rescheduledBlockInfo.newTime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
            <button
              onClick={() => setShowRescheduledModal(false)}
              className="btn btn-primary w-full"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TodayView({ blocks, onSelectBlock, getSubjectColor, getSubjectIcon, getBlockKey }) {
  if (blocks.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🎉</div>
        <h3 className="text-2xl font-bold mb-2">No blocks scheduled for today</h3>
        <p className="text-base-content/70">Enjoy your free time or check the week view for upcoming sessions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        const blockKey = getBlockKey(block) || `${block.id || 'block'}-${index}`;
        const subject = block.topics?.specs?.subject || 'Subject';
        const topicName = block.topics?.name || 'Topic';
        const formattedTime = new Date(block.scheduled_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });
        const isCompleted = block.status === 'done';
        
        return (
          <div
            key={blockKey}
            role="button"
            tabIndex={0}
            onClick={() => onSelectBlock({ kind: 'study', key: blockKey })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectBlock({ kind: 'study', key: blockKey });
              }
            }}
            className={`card bg-base-100 shadow-sm border cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-primary ${
              isCompleted 
                ? 'opacity-70 border-success/50 bg-success/5' 
                : 'hover:shadow-md border-base-300'
            }`}
          >
            <div className="card-body">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className="w-3 h-3 rounded-full mt-2"
                    style={{ backgroundColor: getSubjectColor(subject) }}
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-base-content/70 flex items-center gap-2">
                      <span>{getSubjectIcon(subject)}</span>
                      <span>{subject}</span>
                    </p>
                    <h3 className="text-lg font-semibold leading-snug">{topicName}</h3>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formattedTime}</p>
                  <p className="text-xs text-base-content/70">{block.duration_minutes} minutes</p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekView({ 
  blocks, 
  onSelectBlock, 
  getSubjectColor, 
  getSubjectIcon, 
  getStatusColor, 
  getStatusIcon, 
  getBlockKey,
  timeLabels,
  weekTimeBounds,
  blockedSlotMap,
  weekStartDate,
  isLoading
}) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };
  
  const baseDate = getStartOfWeek(new Date());
  
  // Get time preferences for weekday/weekend
  const timePreferences = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        weekdayEarliest: '09:00',
        weekdayLatest: '20:00',
        weekendEarliest: '09:00',
        weekendLatest: '20:00',
        useSameWeekendTimes: true
      };
    }
    return JSON.parse(localStorage.getItem('timePreferences') || JSON.stringify({
      weekdayEarliest: '09:00',
      weekdayLatest: '20:00',
      weekendEarliest: '09:00',
      weekendLatest: '20:00',
      useSameWeekendTimes: true
    }));
  }, []);
  
  // Build time labels for each day type (weekday vs weekend)
  const getTimeLabelsForDay = useCallback((dayIndex) => {
    const isWeekend = dayIndex >= 5; // Saturday (5) or Sunday (6)
    const useSameTimes = timePreferences.useSameWeekendTimes;
    
    let startTime, endTime;
    if (isWeekend && !useSameTimes) {
      startTime = timePreferences.weekendEarliest || '09:00';
      endTime = timePreferences.weekendLatest || '20:00';
    } else {
      startTime = timePreferences.weekdayEarliest || '09:00';
      endTime = timePreferences.weekdayLatest || '20:00';
    }
    
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    const labels = [];
    let currentMin = startHour * 60 + startMin;
    const endMinTotal = endHour * 60 + endMin;
    
    while (currentMin < endMinTotal) {
      const hours = Math.floor(currentMin / 60);
      const minutes = currentMin % 60;
      labels.push({
        time: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
        minutes: currentMin
      });
      currentMin += 30; // 30-minute slots
    }
    
    return labels;
  }, [timePreferences]);
  
  // Get all unique time labels (union of weekday and weekend times)
  const allTimeLabels = useMemo(() => {
    const weekdayLabels = getTimeLabelsForDay(0); // Monday
    const weekendLabels = getTimeLabelsForDay(5); // Saturday
    const allMinutes = new Set();
    
    [...weekdayLabels, ...weekendLabels].forEach(label => {
      allMinutes.add(label.minutes);
    });
    
    return Array.from(allMinutes)
      .sort((a, b) => a - b)
      .map(minutes => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return {
          time: `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`,
          minutes
        };
      });
  }, [getTimeLabelsForDay]);
  
  // Group blocks by day and time slot
  const blocksBySlot = useMemo(() => {
    const map = new Map();
    blocks.forEach(block => {
      const blockDate = new Date(block.scheduled_at);
      const dayKey = blockDate.toDateString();
      const hour = blockDate.getHours();
      const minute = blockDate.getMinutes();
      const slotMin = hour * 60 + minute;
      
      // Find the closest time slot index
      let slotIndex = -1;
      let minDiff = Infinity;
      allTimeLabels.forEach((label, idx) => {
        const diff = Math.abs(label.minutes - slotMin);
        if (diff < minDiff && diff <= 30) { // Within 30 minutes
          minDiff = diff;
          slotIndex = idx;
        }
      });
      
      if (slotIndex >= 0) {
        const key = `${dayKey}-${slotIndex}`;
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key).push(block);
      }
    });
    return map;
  }, [blocks, allTimeLabels]);
  
  // Check if a time slot is within the day's available window
  const isTimeSlotAvailable = useCallback((dayIndex, timeMinutes) => {
    const isWeekend = dayIndex >= 5;
    const useSameTimes = timePreferences.useSameWeekendTimes;
    
    let startTime, endTime;
    if (isWeekend && !useSameTimes) {
      startTime = timePreferences.weekendEarliest || '09:00';
      endTime = timePreferences.weekendLatest || '20:00';
    } else {
      startTime = timePreferences.weekdayEarliest || '09:00';
      endTime = timePreferences.weekdayLatest || '20:00';
    }
    
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    return timeMinutes >= startMinutes && timeMinutes < endMinutes;
  }, [timePreferences]);
  
  if (isLoading) {
    return (
      <div className="text-center py-12">
        <span className="loading loading-spinner loading-lg"></span>
        <p className="mt-4">Loading schedule...</p>
      </div>
    );
  }
  
  if (blocks.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📅</div>
        <h3 className="text-2xl font-bold mb-2">No blocks scheduled this week</h3>
        <p className="text-base-content/70">Your revision plan will appear here once generated.</p>
      </div>
    );
  }
  
  return (
    <div className="w-full overflow-hidden">
      <div className="w-full">
        <table className="table-fixed w-full border-collapse">
          <colgroup>
            <col className="w-[70px]" />
            {days.map(() => (
              <col key={Math.random()} className="w-[calc((100%-70px)/7)]" />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-base-200 border border-base-300 px-2 py-3 text-sm font-semibold text-center w-[70px]">
                Time
              </th>
              {days.map((day, dayIndex) => {
                const dayDate = new Date(baseDate);
                dayDate.setDate(baseDate.getDate() + dayIndex);
                const isToday = dayDate.toDateString() === new Date().toDateString();
                return (
                  <th 
                    key={day} 
                    className={`border border-base-300 px-2 py-3 text-sm font-semibold text-center ${
                      isToday ? 'bg-primary/10' : 'bg-base-200'
                    }`}
                  >
                    <div className="truncate">{day.substring(0, 3)}</div>
                    <div className="text-xs font-normal text-base-content/70 truncate">
                      {dayDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {allTimeLabels.map((label, timeIndex) => (
              <tr key={label.time} className="h-[70px]">
                <td className="sticky left-0 z-10 bg-base-200 border border-base-300 px-2 py-2 text-sm text-center font-mono h-[70px]">
                  {label.time}
                </td>
                {days.map((day, dayIndex) => {
                  const dayDate = new Date(baseDate);
                  dayDate.setDate(baseDate.getDate() + dayIndex);
                  const dayKey = dayDate.toDateString();
                  const slotKey = `${dayKey}-${timeIndex}`;
                  const slotBlocks = blocksBySlot.get(slotKey) || [];
                  const isBlocked = blockedSlotMap.has(slotKey);
                  const isToday = dayDate.toDateString() === new Date().toDateString();
                  const isAvailable = isTimeSlotAvailable(dayIndex, label.minutes);
                  
                  return (
                    <td
                      key={`${day}-${timeIndex}`}
                      className={`border border-base-300 px-1 py-1 h-[70px] w-[calc((100%-70px)/7)] ${
                        !isAvailable
                          ? 'bg-base-300/30' // Outside available window
                          : isBlocked 
                            ? 'bg-base-300/50' // Blocked by user
                            : isToday 
                              ? 'bg-primary/5' 
                              : 'bg-base-100'
                      }`}
                    >
                      {slotBlocks.length > 0 ? (
                        (() => {
                          // Only show the first block if multiple blocks exist in the same slot
                          const block = slotBlocks[0];
                          const blockKey = getBlockKey(block) || `${block.id || 'block'}-0`;
                          const subject = block.topics?.specs?.subject || 'Subject';
                          const topicName = block.topics?.name || 'Topic';
                          const isDone = block.status === 'done';
                          const isMissed = block.status === 'missed';
                          
                          return (
                            <div
                              key={blockKey}
                              role="button"
                              tabIndex={0}
                              onClick={() => onSelectBlock({ kind: 'study', key: blockKey })}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  onSelectBlock({ kind: 'study', key: blockKey });
                                }
                              }}
                              className={`p-2 rounded text-xs cursor-pointer transition h-full w-full ${
                                isDone 
                                  ? 'opacity-60 border border-success/50 bg-success/10' 
                                  : isMissed
                                    ? 'border border-error/50 bg-error/10'
                                    : 'bg-base-200 hover:bg-base-300'
                              } ${isDone ? 'pointer-events-none' : ''}`}
                            >
                              <div className="flex items-center gap-1 mb-1">
                                <div
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: getSubjectColor(subject) }}
                                />
                                <span className="text-xs">{getSubjectIcon(subject)}</span>
                                <span className={`text-xs ${getStatusColor(block.status)}`}>
                                  {getStatusIcon(block.status)}
                                </span>
                              </div>
                              <p className="font-medium truncate text-xs leading-tight mb-1">{topicName}</p>
                              <p className="text-xs text-base-content/70">
                                {new Date(block.scheduled_at).toLocaleTimeString([], { 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                              </p>
                            </div>
                          );
                        })()
                      ) : (
                        // Empty cell - still visible as a block space
                        <div className="h-full w-full" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
