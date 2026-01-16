"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "react-hot-toast";
import config from "@/config";
import BlockDetailModal from "@/components/BlockDetailModal";
import SupportModal from "@/components/SupportModal";
import FeedbackModal from "@/components/FeedbackModal";
import ConfirmAvailabilityModal from "@/components/ConfirmAvailabilityBanner";

function PlanPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('today'); // Default to today, will be updated after blocks load
  
  // Initialize blocks and loading state from pre-loaded data if available
  const [blocks, setBlocks] = useState(() => {
    if (typeof window === 'undefined') return [];
    const preloadedDataStr = sessionStorage.getItem('preloadedPlanData');
    if (preloadedDataStr) {
      try {
        const preloadedData = JSON.parse(preloadedDataStr);
        const today = new Date();
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(today);
        monday.setDate(diff);
        monday.setHours(0, 0, 0, 0);
        const weekStartStr = monday.toISOString().split('T')[0];
        
        if (preloadedData.weekStart === weekStartStr && preloadedData.blocks && preloadedData.blocks.length > 0) {
          // Format blocks immediately in initial state
          return preloadedData.blocks.map(block => {
            let scheduled_at;
            if (block.scheduled_at) {
              scheduled_at = block.scheduled_at;
            } else if (block.week_start && block.start_time) {
              scheduled_at = new Date(`${block.week_start}T${block.start_time}:00`).toISOString();
            } else {
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
                name: (block.topic_name || block.topics?.name || 'Topic').replace(/^['"]+/, '').trim() || 'Topic',
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
        }
      } catch (error) {
        console.error('Error parsing pre-loaded data in initial state:', error);
      }
    }
    return [];
  });
  
  // Check for pre-loaded data immediately to avoid showing loading screen
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window === 'undefined') return true;
    const preloadedDataStr = sessionStorage.getItem('preloadedPlanData');
    if (preloadedDataStr) {
      try {
        const preloadedData = JSON.parse(preloadedDataStr);
        const today = new Date();
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(today);
        monday.setDate(diff);
        monday.setHours(0, 0, 0, 0);
        const weekStartStr = monday.toISOString().split('T')[0];
        // Only return false (no loading) if we have matching pre-loaded data
        return !(preloadedData.weekStart === weekStartStr && preloadedData.blocks && preloadedData.blocks.length > 0);
      } catch (error) {
        return true;
      }
    }
    return true; // Show loading if no pre-loaded data
  });
  
  // Initialize blocked times from pre-loaded data if available
  const [blockedTimeRanges, setBlockedTimeRanges] = useState(() => {
    if (typeof window === 'undefined') return [];
    const preloadedDataStr = sessionStorage.getItem('preloadedPlanData');
    if (preloadedDataStr) {
      try {
        const preloadedData = JSON.parse(preloadedDataStr);
        if (preloadedData.blockedTimes && Array.isArray(preloadedData.blockedTimes) && preloadedData.blockedTimes.length > 0) {
          return preloadedData.blockedTimes.map(bt => ({
            start_time: bt.start || bt.start_datetime,
            end_time: bt.end || bt.end_datetime
          }));
        }
      } catch (error) {
        // Ignore errors
      }
    }
    return [];
  });
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
  const [showRescheduledModal, setShowRescheduledModal] = useState(false);
  const [rescheduledBlockInfo, setRescheduledBlockInfo] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
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

  // Helper function to check if a block is in a future week (compared to current week)
  const isBlockInFutureWeek = useCallback((block) => {
    if (!block || !block.scheduled_at) return false;
    const currentWeekStart = getCurrentWeekStart();
    const blockDate = new Date(block.scheduled_at);
    
    // Calculate the Monday of the week the block is in
    const blockDay = blockDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const diff = blockDate.getDate() - blockDay + (blockDay === 0 ? -6 : 1);
    const blockWeekStart = new Date(blockDate);
    blockWeekStart.setDate(diff);
    blockWeekStart.setHours(0, 0, 0, 0);
    
    currentWeekStart.setHours(0, 0, 0, 0);
    return blockWeekStart.getTime() > currentWeekStart.getTime();
  }, [getCurrentWeekStart]);

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
    if (viewingWeekStart.getTime() !== currentWeekStart.getTime()) {
      return false;
    }
    
    // DEV BYPASS: In development, always allow next week navigation
    if (process.env.NODE_ENV === 'development') {
      return true;
    }
    
    // Only allow from Saturday onwards (day 6 = Saturday, day 0 = Sunday)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
    const isSaturdayOrLater = dayOfWeek === 6 || dayOfWeek === 0; // Saturday or Sunday
    
    return isSaturdayOrLater;
  }, [weekStartDate, getCurrentWeekStart]);


  // Load blocks for a specific week
  const loadBlocksForWeek = useCallback(async (targetWeekStart = null) => {
    try {
      // Only set loading if we don't already have blocks (from pre-loaded data)
      if (blocks.length === 0) {
        setIsLoading(true);
      }
      
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
      
      // Check for pre-loaded data from the generating page (only use if it matches the requested week)
      const preloadedDataStr = sessionStorage.getItem('preloadedPlanData');
      if (preloadedDataStr) {
        try {
          const preloadedData = JSON.parse(preloadedDataStr);
          const preloadedWeekStart = preloadedData.weekStart;
          
          // Only use pre-loaded data if it matches the requested week
          if (preloadedWeekStart === weekStartStr) {
            console.log('✅ Using pre-loaded plan data:', {
              blocksCount: preloadedData.blocks?.length || 0,
              blockedTimesCount: preloadedData.blockedTimes?.length || 0
            });
            
            // Format blocks to match the expected format
            if (preloadedData.blocks && preloadedData.blocks.length > 0) {
              const formattedBlocks = preloadedData.blocks.map(block => {
                let scheduled_at;
                if (block.scheduled_at) {
                  scheduled_at = block.scheduled_at;
                } else if (block.week_start && block.start_time) {
                  scheduled_at = new Date(`${block.week_start}T${block.start_time}:00`).toISOString();
                } else {
                  console.warn('Block missing scheduled_at or week_start/start_time, using current time:', block.id);
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

              setBlocks(formattedBlocks);
              
              // Set blocked times if available
              if (preloadedData.blockedTimes && Array.isArray(preloadedData.blockedTimes) && preloadedData.blockedTimes.length > 0) {
                const blockedTimes = preloadedData.blockedTimes.map(bt => ({
                  start_time: bt.start || bt.start_datetime,
                  end_time: bt.end || bt.end_datetime
                }));
                setBlockedTimeRanges(blockedTimes);
              }
              
              // Clear pre-loaded data after using it (only use once)
              sessionStorage.removeItem('preloadedPlanData');
              
              setIsLoading(false);
              return; // Exit early - we have the data we need
            }
          } else {
            console.log('⚠️ Pre-loaded data is for a different week, fetching fresh data');
            sessionStorage.removeItem('preloadedPlanData');
          }
        } catch (error) {
          console.error('Error parsing pre-loaded data:', error);
          sessionStorage.removeItem('preloadedPlanData');
        }
      }
      
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
                const timePrefResponse = await fetch('/api/user/time-preferences');
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

  // Clear pre-loaded data on mount if we already used it (from initial state)
  useEffect(() => {
    const preloadedDataStr = sessionStorage.getItem('preloadedPlanData');
    if (preloadedDataStr && blocks.length > 0) {
      // We already have blocks from initial state, so clear the pre-loaded data
      sessionStorage.removeItem('preloadedPlanData');
      console.log('✅ Cleared pre-loaded data after using it in initial state');
    } else if (!preloadedDataStr && blocks.length === 0) {
      // No pre-loaded data and no blocks, so load normally
      loadBlocks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

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
        const timePrefResponse = await fetch('/api/user/time-preferences');
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
      return;
    }

    // Check if user has completed onboarding (skip in dev mode)
    // Only redirect if they're authenticated and haven't completed onboarding
    if (!devMode && status === 'authenticated' && session?.user && !session?.user?.hasCompletedOnboarding) {
      console.log('⚠️ Onboarding not completed, redirecting to onboarding');
      router.push('/onboarding/slide-19');
      return;
    }
    
    // Note: loadBlocks is now called in the pre-loaded data check useEffect above
    // Only call it here if we don't have pre-loaded data (which is handled above)
  }, [status, session, router]);

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
    
    // Optimistic update (skip for missed blocks as they might be rescheduled)
    const previousBlocks = [...blocks];
    if (newStatus !== 'missed') {
      setBlocks(prev => prev.map(b => 
        deriveBlockKey(b) === blockKey 
          ? { ...b, status: newStatus }
          : b
      ));
    }
    
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
      
      // If block was missed, handle rescheduling
      if (newStatus === 'missed') {
        const responseData = await response.json();
        
        console.log('🔄 Block marked as missed, response:', responseData);
        
        if (responseData.rescheduled && responseData.newTime) {
          // Real-time update: Mark old block as rescheduled and add new block
          console.log('✅ Block was rescheduled, updating in real-time...');
          console.log('📦 Reschedule info:', {
            oldBlockId: responseData.oldBlockId,
            newBlockId: responseData.newBlockId,
            newTime: responseData.newTime
          });
          
          // Fetch the new block from the database
          const newBlockResponse = await fetch(`/api/plan/generate?blockId=${responseData.newBlockId}`);
          if (newBlockResponse.ok) {
            const newBlockData = await newBlockResponse.json();
            if (newBlockData.success && newBlockData.blocks && newBlockData.blocks.length > 0) {
              const newBlock = newBlockData.blocks[0];
              
              console.log('📦 New block fetched:', {
                id: newBlock.id,
                scheduledAt: newBlock.scheduled_at,
                status: newBlock.status
              });
              
              // Update blocks state: mark old block as rescheduled and add new block
              setBlocks(prev => {
                console.log('🔄 Updating blocks state:', {
                  totalBlocks: prev.length,
                  oldBlockId: block.id,
                  newBlockId: newBlock.id
                });
                
                // Update old block status to 'rescheduled' and add new block
                const updated = prev.map(b => 
                  b.id === block.id 
                    ? { ...b, status: 'rescheduled', rescheduledTo: responseData.newTime }
                    : b
                );
                
                // Add the new block
                const withNewBlock = [...updated, newBlock].sort((a, b) => 
                  new Date(a.scheduled_at) - new Date(b.scheduled_at)
                );
                
                console.log('✅ After update:', {
                  totalBlocks: withNewBlock.length,
                  addedNewBlock: true
                });
                
                return withNewBlock;
              });
              
              console.log('✅ Blocks updated in real-time');
            }
          }
          
          // Show modal
          setRescheduledBlockInfo({
            topicName: cleanTopicName(
              block.topics?.name || 'Topic',
              block.topics?.parent_topic_name || null,
              true // Include parent in rescheduled modal
            ),
            newTime: responseData.newTime
          });
          setShowRescheduledModal(true);
        } else {
          // Block was not rescheduled - just update status to missed
          console.log('ℹ️ Block was not rescheduled, marking as missed');
          setBlocks(prev => prev.map(b => 
            b.id === block.id 
              ? { ...b, status: 'missed' }
              : b
          ));
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

  // Use only block.id for keys to ensure consistency when blocks are rescheduled
  // If a block doesn't have an id, use scheduled_at as fallback (should rarely happen)
  const deriveBlockKey = useCallback((block) => {
    if (!block) return null;
    return block.id || `fallback-${block.scheduled_at}`;
  }, []);

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
      {/* Fixed Menu Button and Logo - Top Left */}
      <div className="fixed top-6 left-6 z-50 flex items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md p-4 bg-base-200 hover:bg-base-300 transition shadow-[0_10px_15px_-3px_rgba(0,102,255,0.1),0_4px_6px_-2px_rgba(0,102,255,0.05)]"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            className="w-8 h-8 text-base-content"
          >
            <rect x="1" y="11" width="22" height="2" fill="currentColor" strokeWidth="0"></rect>
            <rect x="1" y="4" width="22" height="2" strokeWidth="0" fill="currentColor"></rect>
            <rect x="1" y="18" width="22" height="2" strokeWidth="0" fill="currentColor"></rect>
          </svg>
        </button>
        
        {/* Logo */}
        <div className="bg-base-200 rounded-md px-3 py-2 shadow-[0_10px_15px_-3px_rgba(0,102,255,0.1),0_4px_6px_-2px_rgba(0,102,255,0.05)]">
          <Image
            src="/reviseme_logo.png"
            alt="ReviseMe"
            width={200}
            height={46}
            priority
            className="h-9 w-auto"
          />
        </div>
      </div>

      {/* Header */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto px-4 py-6 pl-28">
          <div className="flex items-center justify-between">
            <div>
              {/* Header text removed */}
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
                  title={canGoToNextWeek ? "Go to next week" : isViewingNextWeek ? "Already viewing next week" : "Next week's plan is available from Saturday"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="20px" height="20px" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M7.99991 1.58576L18.4141 12L7.99991 22.4142L6.58569 21L15.5857 12L6.58569 2.99997L7.99991 1.58576Z" fill="currentColor"></path>
                  </svg>
                </button>
              </div>
              
              {/* Today/Week Tabs - Hide Today tab when viewing next week */}
              <div className="flex items-center gap-1 bg-base-100 rounded-lg p-1">
                {!isViewingNextWeek && !isViewingPreviousWeek && (
                  <button
                    onClick={() => setActiveTab('today')}
                    className={`h-8 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center ${
                      activeTab === 'today' 
                        ? 'bg-[#0066FF] text-white shadow-[0_1px_2px_0_rgba(0,102,255,0.15)]' 
                        : 'text-base-content hover:bg-base-200'
                    }`}
                  >
                    Today
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('week')}
                  className={`h-8 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center ${
                      activeTab === 'week' 
                        ? 'bg-[#0066FF] text-white shadow-[0_1px_2px_0_rgba(0,102,255,0.15)]' 
                        : 'text-base-content hover:bg-base-200'
                    }`}
                >
                  Week
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-base-200 shadow-xl transform transition-transform duration-300 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-5 border-b border-base-300">
            <h2 className="text-xl font-bold text-brand-dark">Menu</h2>
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
          <nav className="flex-1 p-5">
            <ul className="space-y-2">
              <li>
                <Link
                  href="/plan"
                  className={`block px-4 py-3 rounded-lg transition ${
                    pathname === '/plan' 
                      ? 'text-white' 
                      : 'hover:bg-base-300'
                  }`}
                  style={pathname === '/plan' ? {
                    backgroundColor: config.colors.brand.primary
                  } : {}}
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
                      ? 'text-white' 
                      : 'hover:bg-base-300'
                  }`}
                  style={pathname === '/settings/rerate-topics' ? {
                    backgroundColor: config.colors.brand.primary
                  } : {}}
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
                      ? 'text-white' 
                      : 'hover:bg-base-300'
                  }`}
                  style={pathname === '/insights' ? {
                    backgroundColor: config.colors.brand.primary
                  } : {}}
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
                      ? 'text-white' 
                      : 'hover:bg-base-300'
                  }`}
                  style={pathname === '/settings/availability' ? {
                    backgroundColor: config.colors.brand.primary
                  } : {}}
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
                    className="w-full block px-4 py-3 rounded-lg transition hover:bg-base-300"
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
                        <button
                          onClick={() => {
                            setFeedbackModalOpen(true);
                            setSidebarOpen(false);
                          }}
                          className="block w-full text-left px-4 py-2 rounded-lg transition text-sm hover:bg-base-300"
                        >
                          Feedback
                        </button>
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
            isViewingNextWeek={isViewingNextWeek}
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
        isFutureWeek={activeBlock ? isBlockInFutureWeek(activeBlock) : false}
      />
      
      <SupportModal isOpen={supportModalOpen} onClose={() => setSupportModalOpen(false)} />
      <FeedbackModal isOpen={feedbackModalOpen} onClose={() => setFeedbackModalOpen(false)} />

      {/* Availability confirmation modal - shown when navigating to next week without saved availability */}
      <ConfirmAvailabilityModal 
        isOpen={showAvailabilityModal}
        onClose={() => setShowAvailabilityModal(false)}
        weekStart={nextWeekStart}
      />

      {showRescheduledModal && rescheduledBlockInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowRescheduledModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header with gradient background */}
            <div className="bg-gradient-to-br from-[#0066FF] to-[#0052CC] px-6 py-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Block Rescheduled</h2>
              <p className="text-white/90 text-sm">
                Don't worry, we've found a new time for you
              </p>
            </div>

            {/* Content */}
            <div className="px-6 py-6">
              <p className="text-[#003D99] text-center mb-4">
                Your missed block has been rescheduled to:
              </p>
              
              {/* Rescheduled block info card */}
              <div className="bg-gradient-to-br from-[#E5F0FF] to-[#F0F7FF] rounded-xl p-5 mb-6 border-2 border-[#0066FF]/20 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-[#0066FF] rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-[#001433] text-lg mb-2">{rescheduledBlockInfo.topicName}</p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-[#003D99]">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-sm font-medium">
                          {new Date(rescheduledBlockInfo.newTime).toLocaleDateString([], {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-[#003D99]">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm font-medium">
                          {new Date(rescheduledBlockInfo.newTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action button */}
              <button
                onClick={() => setShowRescheduledModal(false)}
                className="w-full bg-gradient-to-r from-[#0066FF] to-[#0052CC] hover:from-[#0052CC] hover:to-[#0041A3] text-white font-semibold py-3.5 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]"
              >
                Got it, thanks!
              </button>
            </div>
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
        // Use block.id as the primary key for consistency
        const blockKey = block.id || `fallback-${block.scheduled_at || index}`;
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
        const isRescheduled = block.status === 'rescheduled';
        
        // Format rescheduled time if available
        const rescheduledTime = isRescheduled && block.rescheduledTo 
          ? new Date(block.rescheduledTo).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : null;
        const rescheduledDay = isRescheduled && block.rescheduledTo
          ? new Date(block.rescheduledTo).toLocaleDateString([], { weekday: 'short' })
          : null;
        
        return (
          <div
            key={blockKey}
            role={isRescheduled ? "presentation" : "button"}
            tabIndex={isRescheduled ? -1 : 0}
            onClick={() => !isRescheduled && onSelectBlock({ kind: 'study', key: blockKey })}
            onKeyDown={(event) => {
              if (!isRescheduled && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                onSelectBlock({ kind: 'study', key: blockKey });
              }
            }}
            className={`card shadow-sm border transition focus:outline-none focus:ring-2 focus:ring-primary ${
              isRescheduled
                ? 'opacity-50 bg-gray-100 cursor-default'
                : isCompleted 
                  ? 'opacity-70 border-success/50 bg-success/5 cursor-pointer' 
                  : 'hover:shadow-md cursor-pointer'
            }`}
            style={{
              backgroundColor: isRescheduled ? '#f3f4f6' : (isCompleted ? undefined : getSubjectBgColor(subject)),
              borderColor: isRescheduled ? '#d1d5db' : (isCompleted ? undefined : getSubjectBorderColor(subject))
            }}
          >
            <div className="card-body">
              <div className={`flex items-start justify-between gap-4 ${isRescheduled ? 'line-through' : ''}`}>
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
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center justify-end gap-1.5">
                    <p className="text-sm font-semibold">{formattedTime}</p>
                    {isRescheduled && (
                      <span className="badge badge-info badge-sm text-[10px] leading-none py-0.5 px-1.5" title={`Rescheduled to ${rescheduledDay} ${rescheduledTime}`}>
                        ↪️
                      </span>
                    )}
                  </div>
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
  planStartDate, // The date when the user's plan started (first scheduled block)
  isViewingNextWeek // Whether we're viewing a future week (blocks should not be interactive)
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
      return []; // Return empty array instead of object
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
    
    // If times are not available, return empty array
    if (!startTime || !endTime) {
      return [];
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
  }, [effectiveTimePreferences]);
  
  // Get all unique time labels (union of weekday and weekend times)
  const allTimeLabels = useMemo(() => {
    const weekdayLabels = getTimeLabelsForDay(0); // Monday
    const weekendLabels = getTimeLabelsForDay(5); // Saturday
    
    // Ensure both are arrays before spreading
    const weekdayArray = Array.isArray(weekdayLabels) ? weekdayLabels : [];
    const weekendArray = Array.isArray(weekendLabels) ? weekendLabels : [];
    
    const allMinutes = new Set();
    
    [...weekdayArray, ...weekendArray].forEach(label => {
      if (label && typeof label === 'object' && 'minutes' in label) {
        allMinutes.add(label.minutes);
      }
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
  // Values: true = user-blocked (red), 'outside-window' = outside study window (different color)
  const blockedSlotMap = useMemo(() => {
    const map = new Map();
    
    // First, add user-blocked times (red)
    if (blockedTimeRanges && blockedTimeRanges.length > 0) {
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
            map.set(key, true); // true = user-blocked (red)
          }
        }
      });
    }
    
    // Second, add slots outside study window (different color)
    if (effectiveTimePreferences && allTimeLabels.length > 0) {
      // Get week start date for calculating day indices
      const weekStart = new Date(weekStartDate);
      weekStart.setHours(0, 0, 0, 0);
      
      // Inline availability check logic to avoid dependency on isTimeSlotAvailable
      const useSameTimes = effectiveTimePreferences.useSameWeekendTimes;
      
      allTimeLabels.forEach((label, timeIndex) => {
        // Check each day of the week
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
          const dayDate = new Date(weekStart);
          dayDate.setDate(weekStart.getDate() + dayIndex);
          const dayKey = dayDate.toDateString();
          const slotKey = `${dayKey}-${timeIndex}`;
          
          // Skip if already marked as user-blocked
          if (map.has(slotKey)) continue;
          
          // Check if this slot is outside the study window (inline logic)
          const isWeekend = dayIndex >= 5;
          let startTime, endTime;
          if (isWeekend && !useSameTimes) {
            startTime = effectiveTimePreferences.weekendEarliest || effectiveTimePreferences.weekdayEarliest;
            endTime = effectiveTimePreferences.weekendLatest || effectiveTimePreferences.weekdayLatest;
          } else {
            startTime = effectiveTimePreferences.weekdayEarliest;
            endTime = effectiveTimePreferences.weekdayLatest;
          }
          
          if (startTime && endTime) {
            const [startHour, startMin] = startTime.split(':').map(Number);
            const [endHour, endMin] = endTime.split(':').map(Number);
            const startMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;
            
            // Check if slot is outside study window
            if (label.minutes < startMinutes || label.minutes >= endMinutes) {
              map.set(slotKey, 'outside-window'); // 'outside-window' = outside study window
            }
          }
        }
      });
    }
    
    if (process.env.NODE_ENV === 'development') {
      const userBlockedCount = Array.from(map.values()).filter(v => v === true).length;
      const outsideWindowCount = Array.from(map.values()).filter(v => v === 'outside-window').length;
      console.log('🚫 Blocked slots map created:', {
        totalBlockedSlots: map.size,
        userBlockedSlots: userBlockedCount,
        outsideWindowSlots: outsideWindowCount,
        sampleKeys: Array.from(map.keys()).slice(0, 5),
        blockedTimeRangesCount: blockedTimeRanges?.length || 0,
        allTimeLabelsCount: allTimeLabels.length
      });
    }
    
    return map;
  }, [blockedTimeRanges, allTimeLabels, effectiveTimePreferences, weekStartDate]);
  
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
      <div className="w-full">
        <table className="table-fixed w-full border-separate" style={{ borderSpacing: '2px 2px', tableLayout: 'fixed' }}>
          <colgroup>
            <col className="w-[70px]" />
            {days.map(() => (
              <col key={Math.random()} className="w-[calc((100%-70px)/7)]" />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-transparent border-t border-l border-b border-transparent px-2 py-1 text-base font-semibold text-center w-[70px] rounded-lg" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                {/* Time label removed for cleaner look */}
              </th>
              {days.map((day, dayIndex) => {
                const dayDate = new Date(baseDate);
                dayDate.setDate(baseDate.getDate() + dayIndex);
                const isToday = dayDate.toDateString() === new Date().toDateString();
                const isLastColumn = dayIndex === days.length - 1;
                
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
                    className={`border-b border-transparent px-2 py-1 text-sm font-semibold text-center rounded-lg border-t border-transparent ${
                      isToday ? '' : 'bg-transparent'
                    }`}
                    style={isToday ? { 
                      backgroundColor: `${config.colors.brand.backgroundLight}40`
                    } : {}}
                  >
                    <div className={`truncate ${isToday ? 'text-base font-semibold' : ''}`} style={isToday ? { color: config.colors.brand.primary } : { color: config.colors.brand.textMedium }}>
                      {day.substring(0, 3)}
                    </div>
                    <div className="flex items-center justify-center" style={{ marginTop: '2px' }}>
                      {isToday ? (
                        <span 
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-base font-semibold"
                          style={{ 
                            backgroundColor: config.colors.brand.primary,
                            boxShadow: '0 2px 4px rgba(0, 102, 255, 0.3)'
                          }}
                        >
                          {dayDate.getDate()}
                        </span>
                      ) : (
                        <span className="text-sm font-normal" style={{ color: config.colors.brand.textMedium }}>
                          {dayDate.getDate()}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {allTimeLabels.map((label, timeIndex) => {
              const isLastRow = timeIndex === allTimeLabels.length - 1;
              return (
                <tr key={label.time} className="h-[70px] relative">
                  <td className="sticky left-0 z-10 bg-white border-l border-r border-transparent px-2 py-2 h-[70px] rounded-lg relative" style={{ fontFamily: '"DM Sans", sans-serif', borderRight: '1px solid #e5e7eb' }}>
                    {/* Time label positioned at the top border (in the gap between blocks) */}
                    <div 
                      className="absolute -top-[10px] left-0 right-0 flex items-center justify-center z-20 bg-white px-1"
                      style={{ 
                        color: config.colors.brand.textMedium,
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        lineHeight: '1.25rem'
                      }}
                    >
                      {label.time}
                    </div>
                  </td>
                  {days.map((day, dayIndex) => {
                    const dayDate = new Date(baseDate);
                    dayDate.setDate(baseDate.getDate() + dayIndex);
                    const dayKey = dayDate.toDateString();
                    const slotKey = `${dayKey}-${timeIndex}`;
                    const slotBlocks = blocksBySlot.get(slotKey) || [];
                    const blockedStatus = blockedSlotMap.get(slotKey);
                    const isUserBlocked = blockedStatus === true; // User explicitly blocked (red)
                    const isOutsideWindow = blockedStatus === 'outside-window'; // Outside study window (different color)
                    const isBlocked = isUserBlocked || isOutsideWindow;
                    const isToday = dayDate.toDateString() === new Date().toDateString();
                    const isAvailable = isTimeSlotAvailable(dayIndex, label.minutes);
                    const isLastColumn = dayIndex === days.length - 1;
                    
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
                        className={`px-1 py-1 h-[70px] w-[calc((100%-70px)/7)] rounded-xl ${
                          isBeforePlanStart
                            ? 'bg-base-300/50' // Day before plan started - greyed out
                            : isUserBlocked
                              ? 'bg-white' // Blocked by user - white background, will show red rounded rectangle inside
                              : isOutsideWindow && !isToday
                                ? 'bg-warning/10' // Outside study window - yellow/orange tint (different from red), but not on today
                              : isToday 
                                ? '' // Today's column - will use inline style for background
                                : isOutsideWindow
                                  ? 'bg-warning/10'
                                  : 'bg-base-100'
                        }`}
                        style={{
                          ...(isToday ? {
                            borderBottom: isLastRow ? `2px solid ${config.colors.brand.primary}` : 'none',
                            backgroundColor: `${config.colors.brand.backgroundLight}20`,
                            position: 'relative'
                          } : {})
                        }}
                      >
                      {/* Smooth rounded border for highlighted day */}
                      {isToday && (
                        <div 
                          style={{
                            position: 'absolute',
                            left: '-2px',
                            right: '-2px',
                            top: timeIndex === 0 ? '-2px' : 0,
                            bottom: isLastRow ? '-2px' : 0,
                            borderLeft: `2px solid ${config.colors.brand.primary}`,
                            borderRight: `2px solid ${config.colors.brand.primary}`,
                            borderTop: timeIndex === 0 ? `2px solid ${config.colors.brand.primary}` : 'none',
                            borderBottom: isLastRow ? `2px solid ${config.colors.brand.primary}` : 'none',
                            borderRadius: timeIndex === 0 && isLastRow 
                              ? '0.75rem' 
                              : timeIndex === 0 
                                ? '0.75rem 0.75rem 0 0'
                                : isLastRow 
                                  ? '0 0 0.75rem 0.75rem'
                                  : '0',
                            pointerEvents: 'none',
                            zIndex: 1
                          }}
                        />
                      )}
                      {isUserBlocked && slotBlocks.length === 0 ? (
                        // Show red rounded rectangle for blocked slots - matching study block size
                        <div 
                          role={isBeforePlanStart ? "presentation" : "button"}
                          tabIndex={isBeforePlanStart ? -1 : 0}
                          onClick={() => {
                            if (isBeforePlanStart) return;
                            toast('This block is unavailable as you are busy', {
                              icon: '🚫',
                              duration: 3000,
                            });
                          }}
                          onKeyDown={(event) => {
                            if (isBeforePlanStart) return;
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              toast('This block is unavailable as you are busy', {
                                icon: '🚫',
                                duration: 3000,
                              });
                            }
                          }}
                          className={`p-1.5 rounded-lg border border-error/30 bg-error/10 h-full w-full transition ${
                            isBeforePlanStart ? 'cursor-default opacity-60' : 'cursor-pointer hover:opacity-80'
                          }`}
                        ></div>
                      ) : slotBlocks.length > 0 ? (
                        (() => {
                          // Only show the first block if multiple blocks exist in the same slot
                          const block = slotBlocks[0];
                          // Use block.id as the primary key for consistency
                          const blockKey = block.id || `fallback-${block.scheduled_at || 'unknown'}`;
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
                          const isRescheduled = block.status === 'rescheduled';
                          
                          const isFutureWeek = isViewingNextWeek;
                          
                          return (
                            <div
                              key={blockKey}
                              role={isBeforePlanStart || isRescheduled || isFutureWeek ? "presentation" : "button"}
                              tabIndex={isBeforePlanStart || isRescheduled || isFutureWeek ? -1 : 0}
                              onClick={() => {
                                if (isBeforePlanStart || isRescheduled || isFutureWeek) return;
                                onSelectBlock({ kind: 'study', key: blockKey });
                              }}
                              onKeyDown={(event) => {
                                if (isBeforePlanStart || isRescheduled || isFutureWeek) return;
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  onSelectBlock({ kind: 'study', key: blockKey });
                                }
                              }}
                              className={`p-1.5 rounded-lg text-xs transition h-full w-full ${
                                isRescheduled
                                  ? 'cursor-default opacity-50 border border-gray-300 bg-gray-100'
                                  : isBeforePlanStart
                                    ? 'cursor-default opacity-60'
                                    : isDone 
                                      ? 'opacity-60 border border-success/50 bg-success/10 cursor-pointer' 
                                      : isMissed
                                        ? 'border border-error/50 bg-error/10 cursor-pointer'
                                        : 'cursor-pointer hover:opacity-80'
                              }`}
                              style={!isDone && !isMissed && !isBeforePlanStart && !isRescheduled ? {
                                backgroundColor: getSubjectBgColor(subject),
                                borderColor: getSubjectBorderColor(subject),
                                borderWidth: '1px',
                                borderStyle: 'solid'
                              } : undefined}
                            >
                              <div className={`flex items-center gap-1 mb-1 ${isRescheduled ? 'line-through' : ''}`}>
                                <div
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: getSubjectColor(subject) }}
                                />
                                <span className="text-xs">{getSubjectIcon(subject)}</span>
                                <span className={`text-xs ${getStatusColor(block.status)}`}>
                                  {getStatusIcon(block.status)}
                                </span>
                              </div>
                              <p className={`font-medium truncate text-xs leading-tight mb-1 ${isRescheduled ? 'line-through' : ''}`}>{topicName}</p>
                              <div className={`flex items-center gap-1 ${isRescheduled ? 'line-through' : ''}`}>
                                <p className="text-xs text-base-content/70">
                                  {new Date(block.scheduled_at).toLocaleTimeString([], { 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                  })}
                                </p>
                                {isRescheduled && (
                                  <span className="badge badge-info badge-xs text-[9px] leading-none py-0 px-1" title={`Rescheduled to ${new Date(block.rescheduledTo).toLocaleDateString([], { weekday: 'short' })} ${new Date(block.rescheduledTo).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}>
                                    ↪️
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        // Empty cell - clickable rounded box
                        <div 
                          role={isBeforePlanStart ? "presentation" : "button"}
                          tabIndex={isBeforePlanStart ? -1 : 0}
                          onClick={() => {
                            if (isBeforePlanStart) return;
                            // Show message based on slot status
                            if (isOutsideWindow) {
                              toast('This time slot is outside your available study window.', {
                                icon: '⏰',
                                duration: 3000,
                              });
                            } else if (isUserBlocked) {
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
                            if (isBeforePlanStart) return;
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              if (isOutsideWindow) {
                                toast('This time slot is outside your available study window.', {
                                  icon: '⏰',
                                  duration: 3000,
                                });
                              } else if (isUserBlocked) {
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
                          className={`h-full w-full rounded-md border border-dashed transition-all ${
                            isBeforePlanStart
                              ? 'cursor-default opacity-60 border-base-300/70 bg-base-300/5'
                              : isToday && !isBlocked
                                ? 'cursor-pointer border-base-300/70 bg-transparent hover:bg-base-300/10 hover:border-base-300/90 hover:shadow-sm'
                                : !isAvailable
                                  ? 'cursor-pointer border-base-300/70 bg-base-300/5 hover:bg-base-300/25 hover:border-base-300/90 hover:shadow-sm'
                                  : isBlocked
                                    ? 'cursor-pointer border-base-300/70 bg-base-300/8 hover:bg-base-300/30 hover:border-base-300/90 hover:shadow-sm'
                                    : 'cursor-pointer border-base-300/70 bg-base-200/10 hover:bg-base-200/35 hover:border-base-300/90 hover:shadow-sm'
                          }`}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
              );
            })}
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
