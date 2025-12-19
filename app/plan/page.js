"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "react-hot-toast";
import config from "@/config";
import BlockDetailModal from "@/components/BlockDetailModal";
import SupportModal from "@/components/SupportModal";
import ConfirmAvailabilityModal from "@/components/ConfirmAvailabilityBanner";

function PlanPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('today'); // Default to today, will be updated after blocks load
  const [blocks, setBlocks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  // Timer state storage: { [blockKey]: { running: boolean, phase: 'study'|'rest', endTime: number|null, pausedAt: number|null, remainingMs: number|null } }
  const [timerStates, setTimerStates] = useState({});
  const [weekStartDate, setWeekStartDate] = useState(() => {
    // Calculate current week's Monday (not next week)
    const today = new Date();
    const day = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday of current week
    const monday = new Date(today);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  });
  const [blockedTimeRanges, setBlockedTimeRanges] = useState([]);
  const [showRescheduledModal, setShowRescheduledModal] = useState(false);
  const [rescheduledBlockInfo, setRescheduledBlockInfo] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [timePreferences, setTimePreferences] = useState(null); // Load from database
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [nextWeekStart, setNextWeekStart] = useState(null);
  const hasSetInitialView = useRef(false); // Track if we've set the initial view based on blocks

  // Clean topic names by removing leading apostrophes/quotes
  // Optionally include parent topic name (for TodayView and BlockDetailModal)
  const cleanTopicName = useCallback((name, parentName = null, includeParent = false) => {
    if (!name) return 'Topic';
    const cleaned = name.replace(/^['"]+/, '').trim() || 'Topic';
    
    // Add parent topic if available and requested
    if (includeParent && parentName) {
      const cleanedParent = parentName.replace(/^['"]+/, '').trim();
      return `${cleaned} - ${cleanedParent}`;
    }
    
    return cleaned;
  }, []);

  // Get current week start (Monday) - Define early to avoid initialization issues
  const getCurrentWeekStart = useCallback(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }, []);

  // Check if we're viewing next week - Define early to avoid initialization issues
  const isViewingNextWeek = useMemo(() => {
    const currentWeekStart = getCurrentWeekStart();
    const viewingWeekStart = new Date(weekStartDate);
    viewingWeekStart.setHours(0, 0, 0, 0);
    currentWeekStart.setHours(0, 0, 0, 0);
    return viewingWeekStart.getTime() > currentWeekStart.getTime();
  }, [weekStartDate, getCurrentWeekStart]);

  // Check if we're viewing previous week
  const isViewingPreviousWeek = useMemo(() => {
    const currentWeekStart = getCurrentWeekStart();
    const viewingWeekStart = new Date(weekStartDate);
    viewingWeekStart.setHours(0, 0, 0, 0);
    currentWeekStart.setHours(0, 0, 0, 0);
    return viewingWeekStart.getTime() < currentWeekStart.getTime();
  }, [weekStartDate, getCurrentWeekStart]);

  // Format week label for display
  const getWeekLabel = useCallback(() => {
    const currentWeekStart = getCurrentWeekStart();
    const viewingWeekStart = new Date(weekStartDate);
    viewingWeekStart.setHours(0, 0, 0, 0);
    currentWeekStart.setHours(0, 0, 0, 0);
    
    if (viewingWeekStart.getTime() === currentWeekStart.getTime()) {
      return "This Week";
    } else if (viewingWeekStart.getTime() > currentWeekStart.getTime()) {
      return "Next Week";
    } else {
      return "Previous Week";
    }
  }, [weekStartDate, getCurrentWeekStart]);

  // Format week date range for display
  const getWeekDateRange = useCallback(() => {
    const weekStart = new Date(weekStartDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Sunday
    
    const startMonth = weekStart.toLocaleDateString('en-US', { month: 'short' });
    const startDay = weekStart.getDate();
    const endMonth = weekEnd.toLocaleDateString('en-US', { month: 'short' });
    const endDay = weekEnd.getDate();
    
    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}`;
    } else {
      return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
    }
  }, [weekStartDate]);

  // Check if we can navigate to previous week (only if viewing next week or later)
  const canGoToPreviousWeek = useMemo(() => {
    const currentWeekStart = getCurrentWeekStart();
    const viewingWeekStart = new Date(weekStartDate);
    viewingWeekStart.setHours(0, 0, 0, 0);
    currentWeekStart.setHours(0, 0, 0, 0);
    // Can go to previous week if we're viewing next week or later (not current week)
    return viewingWeekStart.getTime() > currentWeekStart.getTime();
  }, [weekStartDate, getCurrentWeekStart]);

  // Check if we can navigate to next week (only allow going 1 week ahead max)
  const canGoToNextWeek = useMemo(() => {
    const currentWeekStart = getCurrentWeekStart();
    const viewingWeekStart = new Date(weekStartDate);
    viewingWeekStart.setHours(0, 0, 0, 0);
    currentWeekStart.setHours(0, 0, 0, 0);
    // Can only go to next week if we're viewing current week (not already viewing next week)
    return viewingWeekStart.getTime() === currentWeekStart.getTime();
  }, [weekStartDate, getCurrentWeekStart]);


  // Load blocks for a specific week
  const loadBlocksForWeek = useCallback(async (targetWeekStart = null) => {
    try {
      setIsLoading(true);
      
      // Use provided weekStart, or fall back to weekStartDate state
      const weekStart = targetWeekStart || weekStartDate;
      const weekStartStr = weekStart.toISOString().split('T')[0];
      
      const currentWeekStart = getCurrentWeekStart();
      console.log('🔍 Loading blocks for week:', {
        requestedWeek: weekStartStr,
        currentWeekStart: currentWeekStart.toISOString().split('T')[0],
        weekStartDateState: weekStartDate.toISOString().split('T')[0],
        targetWeekStart: targetWeekStart ? targetWeekStart.toISOString().split('T')[0] : null,
        today: new Date().toISOString().split('T')[0],
        todayDay: new Date().getDay() // 0=Sunday, 1=Monday, etc.
      });
      
      // Step 1: First try to GET existing blocks from the database
      try {
        const getResponse = await fetch(`/api/plan/generate?weekStart=${weekStartStr}`, {
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
          
          // Log Sunday blocks specifically for debugging
          if (getData.blocks && getData.blocks.length > 0) {
            const sundayBlocks = getData.blocks.filter(block => {
              if (!block.scheduled_at) return false;
              const blockDate = new Date(block.scheduled_at);
              return blockDate.getDay() === 0; // Sunday
            });
            console.log('📅 Sunday blocks found in GET response:', sundayBlocks.length, sundayBlocks.map(b => ({
              id: b.id,
              scheduled_at: b.scheduled_at,
              topic_name: b.topic_name || b.topics?.name
            })));
          }

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
                console.warn('Block missing scheduled_at or week_start/start_time, using current time:', block.id);
                // Don't filter out - use current time as fallback
                scheduled_at = new Date().toISOString();
              }
              
              return {
                id: block.id,
                scheduled_at,
                duration_minutes: block.duration_minutes || (block.duration ? block.duration * 60 : 30),
                status: block.status || 'scheduled',
                ai_rationale: block.ai_rationale || `Priority: ${block.priority_score || 'N/A'} - ${block.topic_description || 'Focus on this topic to improve your understanding.'}`,
                hierarchy: block.hierarchy || block.topics?.hierarchy || null,
                topics: {
                  name: cleanTopicName(block.topic_name || block.topics?.name || 'Topic'),
                  parent_topic_name: block.parent_topic_name || block.topics?.parent_topic_name || null,
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
              
              // Load time preferences from database
              try {
                const timePrefResponse = await fetch('/api/debug/time-preferences');
                if (timePrefResponse.ok) {
                  const timePrefData = await timePrefResponse.json();
                  if (timePrefData.success && timePrefData.timePreferences) {
                    const prefs = timePrefData.timePreferences;
                    setTimePreferences({
                      weekdayEarliest: prefs.weekdayEarliest !== 'NOT SET' ? prefs.weekdayEarliest : null,
                      weekdayLatest: prefs.weekdayLatest !== 'NOT SET' ? prefs.weekdayLatest : null,
                      weekendEarliest: prefs.weekendEarliest !== 'NOT SET' ? prefs.weekendEarliest : null,
                      weekendLatest: prefs.weekendLatest !== 'NOT SET' ? prefs.weekendLatest : null,
                      useSameWeekendTimes: prefs.useSameWeekendTimes
                    });
                  }
                }
              } catch (error) {
                console.error('Failed to load time preferences:', error);
              }

              // Load blocked times - use from GET response if available (already aligned to target week)
              // Otherwise fall back to loading from availability API
              if (getData.blockedTimes && Array.isArray(getData.blockedTimes) && getData.blockedTimes.length > 0) {
                // Use blocked times from API response (already aligned to target week)
                const blockedTimes = getData.blockedTimes.map(bt => ({
                  start_time: bt.start || bt.start_datetime,
                  end_time: bt.end || bt.end_datetime
                }));
                setBlockedTimeRanges(blockedTimes);
                if (process.env.NODE_ENV === 'development') {
                  console.log('🚫 Loaded blocked times from GET response (aligned to target week):', {
                    count: blockedTimes.length,
                    sample: blockedTimes.slice(0, 3)
                  });
                }
              } else {
                // Fall back to loading from availability API (for current week)
                try {
                  const blockedResponse = await fetch('/api/availability/save');
                  if (blockedResponse.ok) {
                    const blockedData = await blockedResponse.json();
                    const blockedTimes = (blockedData.blockedTimes || []).map(bt => ({
                      start_time: bt.start,
                      end_time: bt.end
                    }));
                    setBlockedTimeRanges(blockedTimes);
                    if (process.env.NODE_ENV === 'development') {
                      console.log('🚫 Loaded blocked times from availability API:', {
                        count: blockedTimes.length,
                        sample: blockedTimes.slice(0, 3)
                      });
                    }
                  }
                } catch (error) {
                  console.error('Error loading blocked times:', error);
                }
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
      // IMPORTANT: Don't regenerate current week - only regenerate future weeks
      // This prevents deleting existing blocks when returning to current week
      const viewingWeekStart = new Date(weekStart);
      viewingWeekStart.setHours(0, 0, 0, 0);
      const currentWeekStartDate = getCurrentWeekStart();
      currentWeekStartDate.setHours(0, 0, 0, 0);
      const isViewingCurrentWeek = viewingWeekStart.getTime() === currentWeekStartDate.getTime();
      
      if (isViewingCurrentWeek) {
        console.log('⚠️ Viewing current week with no blocks found - NOT regenerating to preserve existing blocks');
        setBlocks([]);
        setIsLoading(false);
        return;
      }
      
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

      // Generate study plan using scheduler - include targetWeek for next week generation
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
          studyBlockDuration: 0.5,
          targetWeek: weekStartStr // Pass the target week so it generates for the correct week
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
          duration_minutes: block.duration_minutes || (block.duration ? block.duration * 60 : 30),
          status: block.status || 'scheduled',
          ai_rationale: block.ai_rationale || `Priority: ${block.priority_score || 'N/A'} - ${block.topic_description || 'Focus on this topic to improve your understanding.'}`,
          hierarchy: block.hierarchy || block.topics?.hierarchy || null,
          topics: {
            name: cleanTopicName(block.topic_name || block.topics?.name || 'Topic'),
            parent_topic_name: block.parent_topic_name || block.topics?.parent_topic_name || null,
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
      
      // Load blocked times - use from POST response if available (already aligned to target week)
      // Otherwise fall back to loading from availability API
      if (postData.blockedTimes && Array.isArray(postData.blockedTimes) && postData.blockedTimes.length > 0) {
        // Use blocked times from API response (already aligned to target week)
        const blockedTimes = postData.blockedTimes.map(bt => ({
          start_time: bt.start || bt.start_datetime,
          end_time: bt.end || bt.end_datetime
        }));
        setBlockedTimeRanges(blockedTimes);
        if (process.env.NODE_ENV === 'development') {
          console.log('🚫 Loaded blocked times from POST response (aligned to target week):', {
            count: blockedTimes.length,
            sample: blockedTimes.slice(0, 3)
          });
        }
      } else {
        // Fall back to loading from availability API (for current week)
        try {
          const blockedResponse = await fetch('/api/availability/save');
          if (blockedResponse.ok) {
            const blockedData = await blockedResponse.json();
            const blockedTimes = (blockedData.blockedTimes || []).map(bt => ({
              start_time: bt.start,
              end_time: bt.end
            }));
            setBlockedTimeRanges(blockedTimes);
            if (process.env.NODE_ENV === 'development') {
              console.log('🚫 Loaded blocked times from availability API:', {
                count: blockedTimes.length,
                sample: blockedTimes.slice(0, 3)
              });
            }
          }
        } catch (error) {
          console.error('Error loading blocked times:', error);
        }
      }
    } catch (error) {
      console.error('❌ Error loading blocks:', error);
      // Fallback to empty array if everything fails
      setBlocks([]);
    } finally {
      setIsLoading(false);
    }
  }, [weekStartDate, getCurrentWeekStart, cleanTopicName]);

  // Wrapper function that uses current weekStartDate
  const loadBlocks = useCallback(() => {
    return loadBlocksForWeek();
  }, [loadBlocksForWeek]);

  // Listen for availability updates to refresh blocks
  useEffect(() => {
    const handleAvailabilityUpdate = (event) => {
      console.log('🔄 Availability updated, refreshing blocks...', event.detail);
      loadBlocksForWeek();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('availabilityUpdated', handleAvailabilityUpdate);
      
      return () => {
        window.removeEventListener('availabilityUpdated', handleAvailabilityUpdate);
      };
    }
  }, [loadBlocksForWeek]);

  // Load time preferences on component mount
  useEffect(() => {
    const loadTimePreferences = async () => {
      try {
        const timePrefResponse = await fetch('/api/debug/time-preferences');
        if (timePrefResponse.ok) {
          const timePrefData = await timePrefResponse.json();
          if (timePrefData.success && timePrefData.timePreferences) {
            const prefs = timePrefData.timePreferences;
            setTimePreferences({
              weekdayEarliest: prefs.weekdayEarliest !== 'NOT SET' ? prefs.weekdayEarliest : null,
              weekdayLatest: prefs.weekdayLatest !== 'NOT SET' ? prefs.weekdayLatest : null,
              weekendEarliest: prefs.weekendEarliest !== 'NOT SET' ? prefs.weekendEarliest : null,
              weekendLatest: prefs.weekendLatest !== 'NOT SET' ? prefs.weekendLatest : null,
              useSameWeekendTimes: prefs.useSameWeekendTimes
            });
          }
        }
      } catch (error) {
        console.error('Failed to load time preferences:', error);
      }
    };
    loadTimePreferences();
  }, []);

  // Navigation functions
  const navigateToPreviousWeek = useCallback(() => {
    if (!canGoToPreviousWeek) return;
    const newWeekStart = new Date(weekStartDate);
    newWeekStart.setDate(weekStartDate.getDate() - 7);
    setWeekStartDate(newWeekStart);
  }, [weekStartDate, canGoToPreviousWeek]);

  const navigateToNextWeek = useCallback(async () => {
    // Only allow navigating one week ahead
    if (!canGoToNextWeek) return;
    
    const newWeekStart = new Date(weekStartDate);
    newWeekStart.setDate(weekStartDate.getDate() + 7);
    
    // Check if user has confirmed availability for next week
    try {
      const response = await fetch('/api/availability/confirm?weekOffset=1');
      if (response.ok) {
        const data = await response.json();
        if (!data.isConfirmed) {
          // Block navigation - show modal requiring them to set availability
          setNextWeekStart(data.weekStart);
          setShowAvailabilityModal(true);
          return; // Don't navigate - they must go to settings first
        }
      }
    } catch (error) {
      console.error('Error checking availability confirmation:', error);
      // On error, block navigation to be safe
      setShowAvailabilityModal(true);
      return;
    }
    
    setWeekStartDate(newWeekStart);
  }, [weekStartDate, canGoToNextWeek]);

  useEffect(() => {
    // Check if we're in dev mode
    const devMode = typeof window !== 'undefined' && (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.includes('localhost')
    );
    
    if (!devMode && status === 'unauthenticated') {
      console.log('⚠️ Not authenticated, redirecting to sign in');
      router.push('/api/auth/signin');
    } else {
      // In dev mode or if authenticated, load blocks
      if (devMode) {
        console.log('🔧 Dev mode: Loading blocks without authentication');
      }
      loadBlocks();
    }
  }, [status, router, loadBlocks]);

  // Ensure weekStartDate is synced to current week on mount
  useEffect(() => {
    const currentWeekStart = getCurrentWeekStart();
    const currentWeekStr = currentWeekStart.toISOString().split('T')[0];
    const stateWeekStr = weekStartDate.toISOString().split('T')[0];
    
    // If weekStartDate doesn't match current week, reset it
    if (currentWeekStr !== stateWeekStr) {
      console.log('🔄 Syncing weekStartDate to current week:', currentWeekStr, 'was:', stateWeekStr);
      setWeekStartDate(currentWeekStart);
    }
  }, []); // Only run on mount

  // Reload blocks when weekStartDate changes
  useEffect(() => {
    loadBlocksForWeek();
  }, [weekStartDate, loadBlocksForWeek]);

  // Auto-switch to week view when viewing next week
  useEffect(() => {
    if (isViewingNextWeek && activeTab === 'today') {
      setActiveTab('week');
    }
  }, [isViewingNextWeek, activeTab]);

  // Set initial view based on whether there are blocks today (only on first load)
  useEffect(() => {
    // Only run once after initial blocks load
    if (hasSetInitialView.current || isLoading) return;
    
    // Check if we came from onboarding (view=week param)
    const viewParam = searchParams?.get('view');
    
    // Check if there are any blocks scheduled for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayBlocks = blocks.filter(block => {
      if (!block.scheduled_at) return false;
      const blockDate = new Date(block.scheduled_at);
      return blockDate >= today && blockDate < tomorrow;
    });
    
    const hasTodayBlocks = todayBlocks.length > 0;
    
    // If coming from onboarding (view=week) or no blocks today, show week view
    // Otherwise show today view
    if (viewParam === 'week' && !hasTodayBlocks) {
      setActiveTab('week');
    } else if (hasTodayBlocks) {
      setActiveTab('today');
    } else {
      setActiveTab('week');
    }
    
    hasSetInitialView.current = true;
  }, [blocks, isLoading, searchParams]);

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
      } else if (newStatus === 'scheduled') {
        endpoint = '/api/plan/mark-scheduled';
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
            topicName: cleanTopicName(
              block.topics?.name || 'Topic',
              block.topics?.parent_topic_name || null,
              true // Include parent in rescheduled modal
            ),
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

  // Get subtle background color for blocks (with low opacity)
  const getSubjectBgColor = (subject) => {
    const key = getSubjectKey(subject);
    const color = config.subjects[key]?.color || '#6b7280';
    // Convert hex to rgba with 10% opacity for subtle background
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.08)`;
  };

  // Get subtle border color for blocks (with low opacity)
  const getSubjectBorderColor = (subject) => {
    const key = getSubjectKey(subject);
    const color = config.subjects[key]?.color || '#6b7280';
    // Convert hex to rgba with 20% opacity for subtle border
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.15)`;
  };

  const getSubjectIcon = (subject) => {
    const key = getSubjectKey(subject);
    return config.subjects[key]?.icon || '📚';
  };

  // Build time labels for the schedule grid
  const buildTimeLabels = useCallback(() => {
    if (typeof window === 'undefined') return [];
    
    const labels = [];
    // Use time preferences from state (loaded from database) or fallback to localStorage
    const prefs = timePreferences || JSON.parse(localStorage.getItem('timePreferences') || '{}');
    
    // Get earliest and latest times across all days - use database values, no defaults
    const weekdayStart = prefs.weekdayEarliest;
    const weekdayEnd = prefs.weekdayLatest;
    const weekendStart = prefs.weekendEarliest || prefs.weekdayEarliest;
    const weekendEnd = prefs.weekendLatest || prefs.weekdayLatest;
    
    // If no preferences available, return empty array (shouldn't happen if user completed onboarding)
    if (!weekdayStart || !weekdayEnd) {
      console.warn('⚠️ No time preferences available');
      return [];
    }
    
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
    
    // Use time preferences from state (loaded from database) or fallback to localStorage
    const prefs = timePreferences || JSON.parse(localStorage.getItem('timePreferences') || '{}');
    const weekdayStart = prefs.weekdayEarliest;
    const weekdayEnd = prefs.weekdayLatest;
    const weekendStart = prefs.weekendEarliest || weekdayStart;
    const weekendEnd = prefs.weekendLatest || weekdayEnd;
    
    // If no preferences available, return empty (shouldn't happen if user completed onboarding)
    if (!weekdayStart || !weekdayEnd) {
      console.warn('⚠️ No time preferences available for time slot filtering');
      return false; // Don't filter if no preferences
    }
    
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

  // Note: blockedSlotMap is now created inside WeekView to match its timeIndex format
  // This ensures the key format matches exactly

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
              <h1 className="text-3xl font-bold">Your Revision Plan</h1>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-base-content/70">
                  {activeTab === 'today' && !isViewingNextWeek && !isViewingPreviousWeek 
                    ? 'Today\'s schedule' 
                    : `${getWeekLabel()} - ${getWeekDateRange()}`}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Navigation Arrows - Always show */}
              <div className="flex items-center gap-1 bg-base-100 rounded-lg p-1">
                {/* Previous Week Arrow */}
                <button
                  onClick={navigateToPreviousWeek}
                  disabled={!canGoToPreviousWeek}
                  className={`btn btn-ghost btn-circle btn-sm ${!canGoToPreviousWeek ? 'opacity-50 cursor-not-allowed' : ''}`}
                  aria-label="Previous week"
                  title={canGoToPreviousWeek ? "Go to previous week" : "Already at current week"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="20px" height="20px" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M16.0001 1.58576L5.58588 12L16.0001 22.4142L17.4143 21L8.41431 12L17.4143 2.99997L16.0001 1.58576Z" fill="currentColor"></path>
                  </svg>
                </button>
                
                {/* Week Label */}
                <div className="px-3 py-1 text-sm font-medium min-w-[120px] text-center">
                  {getWeekLabel()}
                </div>
                
                {/* Next Week Arrow */}
                <button
                  onClick={navigateToNextWeek}
                  disabled={!canGoToNextWeek}
                  className={`btn btn-ghost btn-circle btn-sm ${!canGoToNextWeek ? 'opacity-50 cursor-not-allowed' : ''}`}
                  aria-label="Next week"
                  title={canGoToNextWeek ? "Go to next week" : "Already viewing next week"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="20px" height="20px" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M7.99991 1.58576L18.4141 12L7.99991 22.4142L6.58569 21L15.5857 12L6.58569 2.99997L7.99991 1.58576Z" fill="currentColor"></path>
                  </svg>
                </button>
              </div>
              
              {/* Today/Week Tabs - Hide Today tab when viewing next week */}
              <div className="flex space-x-2">
                {!isViewingNextWeek && !isViewingPreviousWeek && (
                  <button
                    onClick={() => setActiveTab('today')}
                    className={`btn btn-sm ${activeTab === 'today' ? 'btn-primary' : 'btn-outline'}`}
                  >
                    Today
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('week')}
                  className={`btn btn-sm ${activeTab === 'week' ? 'btn-primary' : 'btn-outline'}`}
                >
                  Week
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

      {/* Content */}
      <div className="max-w-[95vw] mx-auto px-4 py-8">
        {activeTab === 'today' ? (
          <TodayView 
            blocks={getTodayBlocks()} 
            onSelectBlock={handleSelectSlot}
            getSubjectColor={getSubjectColor}
            getSubjectBgColor={getSubjectBgColor}
            getSubjectBorderColor={getSubjectBorderColor}
            getSubjectIcon={getSubjectIcon}
            getBlockKey={deriveBlockKey}
            cleanTopicName={cleanTopicName}
          />
        ) : (
          <WeekView 
            blocks={blocks}
            onSelectBlock={handleSelectSlot}
            getSubjectColor={getSubjectColor}
            getSubjectBgColor={getSubjectBgColor}
            getSubjectBorderColor={getSubjectBorderColor}
            getSubjectIcon={getSubjectIcon}
            getStatusColor={getStatusColor}
            getStatusIcon={getStatusIcon}
            getBlockKey={deriveBlockKey}
            timeLabels={timeLabels}
            weekTimeBounds={weekTimeBounds}
            blockedTimeRanges={blockedTimeRanges}
            weekStartDate={weekStartDate}
            isLoading={isLoading}
            cleanTopicName={cleanTopicName}
            timePreferences={timePreferences}
            planStartDate={blocks.length > 0 ? blocks.reduce((earliest, block) => {
              const blockDate = new Date(block.scheduled_at);
              return blockDate < earliest ? blockDate : earliest;
            }, new Date(blocks[0].scheduled_at)) : null}
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
      
      <SupportModal isOpen={supportModalOpen} onClose={() => setSupportModalOpen(false)} />

      {/* Availability confirmation modal - shown when navigating to next week without saved availability */}
      <ConfirmAvailabilityModal 
        isOpen={showAvailabilityModal}
        onClose={() => setShowAvailabilityModal(false)}
        weekStart={nextWeekStart}
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

function TodayView({ blocks, onSelectBlock, getSubjectColor, getSubjectBgColor, getSubjectBorderColor, getSubjectIcon, getBlockKey, cleanTopicName }) {
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
        const subject = block.topics?.specs?.subject || block.subject || 'Subject';
        
        // Get hierarchy from block data (preferred) or build from legacy fields
        const hierarchy = block.hierarchy || 
          (block.topics?.hierarchy) ||
          (block.level_1_parent && block.level_2_parent && block.level_3_topic
            ? [block.level_1_parent, block.level_2_parent, block.level_3_topic]
            : [block.topics?.name || block.topic_name || 'Topic']);

        // Main topic: Level 3 (subtopic) - the specific learning
        const mainTopicName = cleanTopicName(
          hierarchy[hierarchy.length - 1] || block.topics?.name || block.topic_name || 'Topic',
          null,
          false
        );

        // Context: Unit → Section (where to find it in textbook)
        const hierarchyContext = hierarchy.length > 1
          ? hierarchy.slice(0, -1).map(name => cleanTopicName(name, null, false)).join(' → ')
          : null;
        
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
            className={`card shadow-sm border cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-primary ${
              isCompleted 
                ? 'opacity-70 border-success/50 bg-success/5' 
                : 'hover:shadow-md'
            }`}
            style={{
              backgroundColor: isCompleted ? undefined : getSubjectBgColor(subject),
              borderColor: isCompleted ? undefined : getSubjectBorderColor(subject)
            }}
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
                    <h3 className="text-lg font-semibold leading-snug">{mainTopicName}</h3>
                    {hierarchyContext && (
                      <p className="text-xs text-base-content/60 mt-1">
                        📚 {hierarchyContext}
                      </p>
                    )}
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
  getSubjectBgColor,
  getSubjectBorderColor,
  getSubjectIcon, 
  getStatusColor, 
  getStatusIcon, 
  getBlockKey,
  timeLabels,
  weekTimeBounds,
  blockedTimeRanges,
  weekStartDate,
  isLoading,
  cleanTopicName,
  timePreferences,
  planStartDate // The date when the user's plan started (first scheduled block)
}) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  // Use weekStartDate prop if provided, otherwise calculate from current date
  const baseDate = useMemo(() => {
    if (weekStartDate) {
      const date = new Date(weekStartDate);
      date.setHours(0, 0, 0, 0);
      return date;
    }
    // Fallback: calculate current week's Monday
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }, [weekStartDate]);
  
  // Get time preferences for weekday/weekend
  // Use time preferences from state (loaded from database) or fallback to localStorage
  // NO DEFAULTS - if not available, it means user hasn't completed onboarding
  const effectiveTimePreferences = useMemo(() => {
    if (timePreferences) {
      return timePreferences;
    }
    if (typeof window !== 'undefined') {
      const localPrefs = JSON.parse(localStorage.getItem('timePreferences') || '{}');
      if (localPrefs.weekdayEarliest && localPrefs.weekdayLatest) {
        return localPrefs;
      }
    }
    // Return null if no preferences available (UI should handle this gracefully)
    return null;
  }, [timePreferences]);
  
  // Build time labels for each day type (weekday vs weekend)
  const getTimeLabelsForDay = useCallback((dayIndex) => {
    if (!effectiveTimePreferences) {
      return { startTime: null, endTime: null };
    }
    
    const isWeekend = dayIndex >= 5; // Saturday (5) or Sunday (6)
    const useSameTimes = effectiveTimePreferences.useSameWeekendTimes;
    
    let startTime, endTime;
    if (isWeekend && !useSameTimes) {
      startTime = effectiveTimePreferences.weekendEarliest || effectiveTimePreferences.weekdayEarliest;
      endTime = effectiveTimePreferences.weekendLatest || effectiveTimePreferences.weekdayLatest;
    } else {
      startTime = effectiveTimePreferences.weekdayEarliest;
      endTime = effectiveTimePreferences.weekdayLatest;
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
  
  // Create a map of blocked slots for quick lookup - using same key format as blocksBySlot
  const blockedSlotMap = useMemo(() => {
    const map = new Map();
    if (!blockedTimeRanges || blockedTimeRanges.length === 0) {
      return map;
    }
    
    blockedTimeRanges.forEach(range => {
      // Normalize dates to local timezone for proper comparison
      const start = new Date(range.start_time || range.start);
      const end = new Date(range.end_time || range.end);
      
      // Normalize to local date (strip timezone info for day comparison)
      const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const dayKey = startDate.toDateString();
      
      // Use local hours/minutes for time matching
      const startMin = start.getHours() * 60 + start.getMinutes();
      const endMin = end.getHours() * 60 + end.getMinutes();
      
      // Find matching timeIndex in allTimeLabels for each 30-minute slot
      for (let min = startMin; min < endMin; min += 30) {
        // Find the closest timeIndex in allTimeLabels
        let closestIndex = -1;
        let minDiff = Infinity;
        allTimeLabels.forEach((label, idx) => {
          const diff = Math.abs(label.minutes - min);
          if (diff < minDiff && diff <= 15) { // Within 15 minutes (half slot)
            minDiff = diff;
            closestIndex = idx;
          }
        });
        
        if (closestIndex >= 0) {
          const key = `${dayKey}-${closestIndex}`;
          map.set(key, true);
        }
      }
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🚫 Blocked slots map created:', {
        totalBlockedSlots: map.size,
        sampleKeys: Array.from(map.keys()).slice(0, 5),
        blockedTimeRangesCount: blockedTimeRanges.length,
        allTimeLabelsCount: allTimeLabels.length,
        sampleBlockedTimes: blockedTimeRanges.slice(0, 3).map(bt => ({
          start: bt.start_time || bt.start,
          end: bt.end_time || bt.end,
          parsedStart: new Date(bt.start_time || bt.start).toDateString(),
          parsedEnd: new Date(bt.end_time || bt.end).toDateString()
        }))
      });
    }
    
    return map;
  }, [blockedTimeRanges, allTimeLabels]);
  
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
    if (!effectiveTimePreferences) {
      return false; // No preferences available
    }
    
    const useSameTimes = effectiveTimePreferences.useSameWeekendTimes;
    
    let startTime, endTime;
    if (isWeekend && !useSameTimes) {
      startTime = effectiveTimePreferences.weekendEarliest || effectiveTimePreferences.weekdayEarliest;
      endTime = effectiveTimePreferences.weekendLatest || effectiveTimePreferences.weekdayLatest;
    } else {
      startTime = effectiveTimePreferences.weekdayEarliest;
      endTime = effectiveTimePreferences.weekdayLatest;
    }
    
    if (!startTime || !endTime) {
      return false; // No valid time preferences
    }
    
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    return timeMinutes >= startMinutes && timeMinutes < endMinutes;
  }, [effectiveTimePreferences]);
  
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
      <div className="w-full rounded-xl overflow-hidden border border-base-300">
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
                
                // Check if this day is before the plan started
                const isBeforePlanStart = planStartDate && (() => {
                  const planStart = new Date(planStartDate);
                  planStart.setHours(0, 0, 0, 0);
                  const currentDay = new Date(dayDate);
                  currentDay.setHours(0, 0, 0, 0);
                  return currentDay < planStart;
                })();
                
                return (
                  <th 
                    key={day} 
                    className={`border border-base-300 px-2 py-3 text-sm font-semibold text-center ${
                      isBeforePlanStart 
                        ? 'bg-base-300/50 text-base-content/50' // Greyed out - before plan started
                        : isToday 
                          ? 'bg-primary/10' 
                          : 'bg-base-200'
                    }`}
                  >
                    <div className="truncate">{day.substring(0, 3)}</div>
                    <div className={`text-xs font-normal truncate ${isBeforePlanStart ? 'text-base-content/40' : 'text-base-content/70'}`}>
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
                  
                  // Check if this day is before the plan started (user signed up mid-week)
                  const isBeforePlanStart = planStartDate && (() => {
                    const planStart = new Date(planStartDate);
                    planStart.setHours(0, 0, 0, 0);
                    const currentDay = new Date(dayDate);
                    currentDay.setHours(0, 0, 0, 0);
                    return currentDay < planStart;
                  })();
                  
                  return (
                    <td
                      key={`${day}-${timeIndex}`}
                      className={`border px-1 py-1 h-[70px] w-[calc((100%-70px)/7)] ${
                        isBeforePlanStart
                          ? 'bg-base-300/50 border-base-300' // Day before plan started - greyed out
                          : !isAvailable
                            ? 'bg-base-300/30 border-base-300' // Outside available window
                            : isBlocked 
                              ? 'bg-error/20 border-error/40 border-2' // Blocked by user - clearly visible with red tint
                              : isToday 
                                ? 'bg-primary/5 border-base-300' 
                                : 'bg-base-100 border-base-300'
                      }`}
                    >
                      {slotBlocks.length > 0 ? (
                        (() => {
                          // Only show the first block if multiple blocks exist in the same slot
                          const block = slotBlocks[0];
                          const blockKey = getBlockKey(block) || `${block.id || 'block'}-0`;
                          const subject = block.topics?.specs?.subject || block.subject || 'Subject';
                          
                          // Get hierarchy from block data (preferred) or build from legacy fields
                          const hierarchy = block.hierarchy || 
                            (block.topics?.hierarchy) ||
                            (block.level_1_parent && block.level_2_parent && block.level_3_topic
                              ? [block.level_1_parent, block.level_2_parent, block.level_3_topic]
                              : [block.topics?.name || block.topic_name || 'Topic']);

                          // WeekView: Only show subtopic (Level 3) on the card front
                          const topicName = cleanTopicName(
                            hierarchy[hierarchy.length - 1] || block.topics?.name || block.topic_name || 'Topic',
                            null,
                            false
                          );
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
                              className={`p-2 rounded-lg text-xs cursor-pointer transition h-full w-full ${
                                isDone 
                                  ? 'opacity-60 border border-success/50 bg-success/10' 
                                  : isMissed
                                    ? 'border border-error/50 bg-error/10'
                                    : 'hover:opacity-80'
                              }`}
                              style={!isDone && !isMissed ? {
                                backgroundColor: getSubjectBgColor(subject),
                                borderColor: getSubjectBorderColor(subject),
                                borderWidth: '1px',
                                borderStyle: 'solid'
                              } : undefined}
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
                        // Empty cell - clickable rounded box
                        <div 
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            // Show message based on slot status
                            if (!isAvailable) {
                              toast('This time slot is outside your available study window.', {
                                icon: '⏰',
                                duration: 3000,
                              });
                            } else if (isBlocked) {
                              toast('Unavailable - You are busy during this time.', {
                                icon: '🚫',
                                duration: 3000,
                              });
                            } else {
                              toast('Free buffer slot - Available for rescheduling if needed.', {
                                icon: '✨',
                                duration: 3000,
                              });
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              if (!isAvailable) {
                                toast('This time slot is outside your available study window.', {
                                  icon: '⏰',
                                  duration: 3000,
                                });
                              } else if (isBlocked) {
                                toast('Unavailable - You are busy during this time.', {
                                  icon: '🚫',
                                  duration: 3000,
                                });
                              } else {
                                toast('Free buffer slot - Available for rescheduling if needed.', {
                                  icon: '✨',
                                  duration: 3000,
                                });
                              }
                            }
                          }}
                          className={`h-full w-full rounded-md border border-dashed transition-all cursor-pointer ${
                            !isAvailable
                              ? 'border-base-300/70 bg-base-300/5 hover:bg-base-300/25 hover:border-base-300/90 hover:shadow-sm'
                              : isBlocked
                                ? 'border-base-300/70 bg-base-300/8 hover:bg-base-300/30 hover:border-base-300/90 hover:shadow-sm'
                                : 'border-base-300/70 bg-base-200/10 hover:bg-base-200/35 hover:border-base-300/90 hover:shadow-sm'
                          }`}
                        />
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

export default function PlanPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg"></span>
          <p className="mt-4">Loading...</p>
        </div>
      </div>
    }>
      <PlanPageContent />
    </Suspense>
  );
}
