"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import TimeBlockCalendar from "@/components/TimeBlockCalendar";
import SupportModal from "@/components/SupportModal";
import FeedbackModal from "@/components/FeedbackModal";
import SidebarDevToolsLink from "@/components/SidebarDevToolsLink";
import config from "@/config";

function AvailabilitySettingsPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Time preferences - will be loaded from database
  const [timePreferences, setTimePreferences] = useState({
    weekdayEarliest: '4:30', // Default, will be replaced when loaded
    weekdayLatest: '23:30', // Default, will be replaced when loaded
    useSameWeekendTimes: true, // Default, will be replaced when loaded
    weekendEarliest: '8:00', // Default, will be replaced when loaded
    weekendLatest: '23:30', // Default, will be replaced when loaded
  });
  const [timePreferencesLoaded, setTimePreferencesLoaded] = useState(false);
  const [isWeekScheduled, setIsWeekScheduled] = useState(false); // Track if current week has scheduled blocks

  // Blocked times - stored per week (week offset as key)
  const [blockedTimesByWeek, setBlockedTimesByWeek] = useState({});
  
  // Scheduled blocks (from plan)
  const [scheduledBlocks, setScheduledBlocks] = useState([]);

  // Repeatable events
  const [repeatableEvents, setRepeatableEvents] = useState([]);
  const [showAddEventForm, setShowAddEventForm] = useState(false);
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleDetails, setRescheduleDetails] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [eventToDelete, setEventToDelete] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [newEvent, setNewEvent] = useState({
    label: '',
    start_time: '',
    end_time: '',
    days_of_week: [],
  });

  // Current week (for tabs)
  const [selectedWeek, setSelectedWeek] = useState(0); // 0 = current week, 1-3 = future weeks

  // Handle week change - copy from previous week if current week has no data
  const handleWeekChange = (weekOffset) => {
    // Each week starts blank - don't copy blocked times from previous weeks
    // Repeatable events are handled separately and appear in all weeks automatically
    setSelectedWeek(weekOffset);
    // Reload time preferences for the new week
    loadTimePreferencesForWeek(weekOffset);
  };

  // Reset blocked times for the selected week (keep repeatable events)
  const handleResetWeek = () => {
    // Clear all blocked times for this week (repeatable events are handled separately)
    setBlockedTimesByWeek(prev => ({
      ...prev,
      [selectedWeek]: []
    }));
    
    setShowResetConfirm(false);
    setSuccessMessage('Week reset successfully. All blocked times cleared (repeatable events remain).');
    setShowSuccessModal(true);
    setTimeout(() => setShowSuccessModal(false), 3000);
  };

  // Copy blocked times from previous week (e.g. Last week → This week, or This week → Week 2)
  const handleCopyFromPreviousWeek = () => {
    const previousWeek = selectedWeek - 1;
    const previousWeekBlockedTimes = blockedTimesByWeek[previousWeek] || [];
    
    // Only copy manual blocked times (not repeatable events)
    const manualBlockedTimes = previousWeekBlockedTimes.filter(
      blocked => blocked.source !== 'repeatable_event'
    );
    
    if (manualBlockedTimes.length === 0) {
      // Show a message that there's nothing to copy
      setErrorMessage('No blocked times in the previous week to copy.');
      setShowErrorModal(true);
      setTimeout(() => setShowErrorModal(false), 3000);
      return;
    }
    
    // Get the target week start (Monday of the current week)
    const targetWeekStart = getWeekStart(selectedWeek);
    // Ensure it's set to start of day
    targetWeekStart.setHours(0, 0, 0, 0);
    
    // Align blocked times to the target week by preserving day of week
    const adjustedBlockedTimes = manualBlockedTimes.map(blocked => {
      const originalStart = new Date(blocked.start);
      const originalEnd = new Date(blocked.end);
      
      // Get day of week index (Monday = 0, Tuesday = 1, ..., Sunday = 6)
      // getDay() returns 0=Sunday, 1=Monday, ..., 6=Saturday
      // We convert to Monday=0 format: (day + 6) % 7
      const dayIndex = (originalStart.getDay() + 6) % 7;
      
      // Create new start date: target Monday + dayIndex, preserving time
      const newStart = new Date(targetWeekStart);
      newStart.setDate(targetWeekStart.getDate() + dayIndex);
      newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), originalStart.getSeconds(), originalStart.getMilliseconds());
      
      // Create new end date: same day, preserving end time
      const newEnd = new Date(targetWeekStart);
      newEnd.setDate(targetWeekStart.getDate() + dayIndex);
      newEnd.setHours(originalEnd.getHours(), originalEnd.getMinutes(), originalEnd.getSeconds(), originalEnd.getMilliseconds());
      
      // Handle edge case where end time is before start time (spans midnight)
      if (newEnd <= newStart) {
        newEnd.setDate(newEnd.getDate() + 1);
      }
      
      return {
        ...blocked,
        start: newStart.toISOString(),
        end: newEnd.toISOString()
      };
    });
    
    // Merge with existing blocked times for this week (avoid duplicates)
    const currentWeekBlockedTimes = blockedTimesByWeek[selectedWeek] || [];
    const existingStartTimes = new Set(
      currentWeekBlockedTimes.map(bt => new Date(bt.start).toISOString())
    );
    
    const newBlockedTimes = adjustedBlockedTimes.filter(
      bt => !existingStartTimes.has(new Date(bt.start).toISOString())
    );
    
    if (newBlockedTimes.length > 0) {
      setBlockedTimesByWeek(prev => ({
        ...prev,
        [selectedWeek]: [...currentWeekBlockedTimes, ...newBlockedTimes]
      }));
      
      setSuccessMessage(`Copied ${newBlockedTimes.length} blocked time(s) from the previous week.`);
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 3000);
    } else {
      setErrorMessage('All blocked times from the previous week already exist in this week.');
      setShowErrorModal(true);
      setTimeout(() => setShowErrorModal(false), 3000);
    }
  };

  useEffect(() => {
    const isDev = typeof window !== 'undefined' && (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.includes('localhost')
    );

    if (!isDev && status === 'unauthenticated') {
      router.push('/api/auth/signin?callbackUrl=/settings/availability');
      return;
    }

    if ((isDev || status === 'authenticated') && status !== 'loading') {
      loadAvailability();
      loadScheduledBlocks();
      loadRepeatableEvents();
      // Load time preferences for the initially selected week
      loadTimePreferencesForWeek(selectedWeek);
    }
  }, [status, router]);

  // Get week start date for selected week
  const getWeekStart = (weekOffset = 0) => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // This Monday
    const thisMonday = new Date(today.setDate(diff));
    const weekStart = new Date(thisMonday);
    weekStart.setDate(thisMonday.getDate() + (weekOffset * 7));
    return weekStart;
  };

  // Load time preferences for a specific week
  const loadTimePreferencesForWeek = async (weekOffset) => {
    try {
      const weekStart = getWeekStart(weekOffset);
      const weekStartDateStr = weekStart.toISOString().split('T')[0];
      
      const response = await fetch(`/api/availability/save?weekStartDate=${weekStartDateStr}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.timePreferences) {
          setTimePreferences({
            weekdayEarliest: data.timePreferences.weekdayEarliest || '4:30',
            weekdayLatest: data.timePreferences.weekdayLatest || '23:30',
            useSameWeekendTimes: data.timePreferences.useSameWeekendTimes !== false,
            weekendEarliest: data.timePreferences.weekendEarliest || '8:00',
            weekendLatest: data.timePreferences.weekendLatest || '23:30',
          });
          setIsWeekScheduled(data.isScheduled || false);
        }
      }
    } catch (error) {
      console.error('Error loading time preferences for week:', error);
    }
  };

  // Load availability preferences
  const loadAvailability = async () => {
    setIsLoading(true);
    try {
      // First, try to load from localStorage (from onboarding) as a fallback
      const storedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
      const onboardingTimePrefs = storedAnswers.timePreferences || {};
      
      // Set initial values from onboarding if available
      if (onboardingTimePrefs.weekdayEarliest || onboardingTimePrefs.weekdayLatest) {
        setTimePreferences({
          weekdayEarliest: onboardingTimePrefs.weekdayEarliest || '4:30',
          weekdayLatest: onboardingTimePrefs.weekdayLatest || '23:30',
          useSameWeekendTimes: onboardingTimePrefs.useSameWeekendTimes !== false,
          weekendEarliest: onboardingTimePrefs.weekendEarliest || '8:00',
          weekendLatest: onboardingTimePrefs.weekendLatest || '23:30',
        });
      }
      
      // Load time preferences for the currently selected week
      await loadTimePreferencesForWeek(selectedWeek);
      
      // Then try to load from API (this will override localStorage if available)
      // Only request blocked times for the weeks we display: last week (-1) through week +3
      const rangeStart = getWeekStart(-1);
      const week3End = getWeekStart(3);
      week3End.setDate(week3End.getDate() + 6); // Sunday of week 3
      const startDate = rangeStart.toISOString().split('T')[0];
      const endDate = week3End.toISOString().split('T')[0];
      const response = await fetch(`/api/availability/save?startDate=${startDate}&endDate=${endDate}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Do NOT overwrite time preferences here: we already have the correct ones for the
          // selected week from loadTimePreferencesForWeek(selectedWeek). This fetch is for
          // blocked times only; overwriting would revert the user's study window to global prefs.
          setTimePreferencesLoaded(true);

          // Map loaded blocked times to their respective weeks (-1 to 3)
          // Filter out repeatable events - they're handled separately
          if (data.blockedTimes && data.blockedTimes.length > 0) {
            console.log('📅 Loaded blocked times from database:', data.blockedTimes.length, data.blockedTimes);
            
            const manualBlocked = data.blockedTimes.filter(
              blocked => !blocked.source || blocked.source !== 'repeatable_event'
            );
            
            console.log('📅 Manual blocked times (after filter):', manualBlocked.length, manualBlocked);
            
            if (manualBlocked.length > 0) {
              // Group blocked times by week offset (0 = current week, 1 = next week, etc.)
              const blockedByWeek = {};
              
              manualBlocked.forEach(blocked => {
                if (!blocked || !blocked.start) {
                  console.warn('⚠️ Invalid blocked time entry:', blocked);
                  return;
                }
                
                const blockedDate = new Date(blocked.start);
                const currentWeekStart = getWeekStart(0);
                // Normalize both to start of day for accurate comparison
                blockedDate.setHours(0, 0, 0, 0);
                currentWeekStart.setHours(0, 0, 0, 0);
                
                const daysDiff = Math.floor((blockedDate - currentWeekStart) / (1000 * 60 * 60 * 24));
                const weekOffset = Math.floor(daysDiff / 7);

                // Include last week (-1) through next 3 weeks (0-3) so blocked times from last week show up
                if (weekOffset >= -1 && weekOffset <= 3) {
                  if (!blockedByWeek[weekOffset]) {
                    blockedByWeek[weekOffset] = [];
                  }
                  blockedByWeek[weekOffset].push(blocked);
                } else {
                  console.warn('⚠️ Blocked time outside week range -1 to 3:', { weekOffset, blockedStart: blocked.start });
                }
              });
              
              console.log('📅 Blocked times by week:', blockedByWeek);
              
              if (Object.keys(blockedByWeek).length > 0) {
                setBlockedTimesByWeek(blockedByWeek);
              } else {
                console.warn('⚠️ No blocked times mapped to weeks 0-3');
              }
            } else {
              console.warn('⚠️ No manual blocked times after filtering');
            }
          } else {
            console.log('📅 No blocked times in database response');
          }
        } else {
          // If no saved preferences in DB, keep onboarding values or defaults
          setTimePreferencesLoaded(true);
        }
      } else {
        // If API fails, keep onboarding values or defaults
        setTimePreferencesLoaded(true);
      }
    } catch (error) {
      console.error('Error loading availability:', error);
      // On error, keep onboarding values or defaults
      setTimePreferencesLoaded(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Load scheduled blocks from plan
  const loadScheduledBlocks = async () => {
    try {
      const response = await fetch('/api/plan/generate');
      if (response.ok) {
        const data = await response.json();
        if (data.blocks) {
          setScheduledBlocks(data.blocks.map(block => ({
            start: block.start_time,
            topic: block.topic_name
          })));
        }
      }
    } catch (error) {
      console.error('Error loading scheduled blocks:', error);
    }
  };

  // Load repeatable events
  const loadRepeatableEvents = async () => {
    try {
      const response = await fetch('/api/availability/repeatable');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setRepeatableEvents(data.events || []);
        }
      }
    } catch (error) {
      console.error('Error loading repeatable events:', error);
    }
  };

  // Handle time preference change
  const handleTimePreferenceChange = (field, value) => {
    setTimePreferences(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle weekend toggle
  const handleWeekendToggle = () => {
    setTimePreferences(prev => {
      const newUseSameWeekendTimes = !prev.useSameWeekendTimes;
      
      // If toggling back to "use same times", revert weekend times to weekday times
      if (newUseSameWeekendTimes) {
        return {
          ...prev,
          useSameWeekendTimes: newUseSameWeekendTimes,
          weekendEarliest: prev.weekdayEarliest,
          weekendLatest: prev.weekdayLatest,
        };
      }
      
      // If unticking, keep current weekend times (or initialize to weekday times if not set)
      return {
        ...prev,
        useSameWeekendTimes: newUseSameWeekendTimes,
        weekendEarliest: prev.weekendEarliest || prev.weekdayEarliest,
        weekendLatest: prev.weekendLatest || prev.weekdayLatest,
      };
    });
  };

  // Handle block toggle in calendar
  // Batch toggle handler - accepts array of toggles
  const handleBatchBlockToggle = (toggles) => {
    if (!toggles || toggles.length === 0) return;
    
    setBlockedTimesByWeek(prev => {
      const currentWeekBlockedTimes = prev[selectedWeek] || [];
      const repeatableBlocked = getRepeatableEventsAsBlockedTimes(selectedWeek);
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const weekStart = getWeekStart(selectedWeek);
      
      let newBlockedTimes = [...currentWeekBlockedTimes];
      
      toggles.forEach(({ day, timeSlot, isBlocked }) => {
        const [hour, minute] = timeSlot.split(':').map(Number);
        const dayIndex = days.indexOf(day);
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + dayIndex);
        date.setHours(hour, minute, 0, 0);
        
        // Check if this time slot is a repeatable event (cannot be toggled)
        const isRepeatableEvent = repeatableBlocked.some(blocked => {
          const blockedStart = new Date(blocked.start);
          return blockedStart.getTime() === date.getTime();
        });
        
        if (isRepeatableEvent) {
          return; // Skip repeatable events
        }
        
        const endTime = new Date(date);
        endTime.setMinutes(endTime.getMinutes() + 30);
        
        if (isBlocked) {
          // Check if this time is already blocked
          const exists = newBlockedTimes.some(blocked => {
            const blockedStart = new Date(blocked.start);
            return blockedStart.getTime() === date.getTime();
          });
          
          if (!exists) {
            newBlockedTimes.push({
              start: date.toISOString(),
              end: endTime.toISOString(),
              source: 'manual'
            });
          }
        } else {
          // Remove from blocked times
          newBlockedTimes = newBlockedTimes.filter(blocked => {
            const blockedStart = new Date(blocked.start);
            return blockedStart.getTime() !== date.getTime();
          });
        }
      });
      
      return {
        ...prev,
        [selectedWeek]: newBlockedTimes
      };
    });
  };

  // Copy selected week's study window and blocked times to this week (week 0)
  const handleCopyToThisWeek = () => {
    const sourceWeekStart = getWeekStart(selectedWeek);
    const thisWeekStart = getWeekStart(0);
    const sourceBlocks = blockedTimesByWeek[selectedWeek] || [];
    const shifted = sourceBlocks
      .filter(b => b && b.start && b.end && (!b.source || b.source !== 'repeatable_event'))
      .map(blocked => {
        const start = new Date(blocked.start);
        const end = new Date(blocked.end);
        const dayOffset = Math.round((start - new Date(sourceWeekStart)) / (1000 * 60 * 60 * 24));
        const newStart = new Date(thisWeekStart);
        newStart.setDate(thisWeekStart.getDate() + dayOffset);
        newStart.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);
        const newEnd = new Date(thisWeekStart);
        newEnd.setDate(thisWeekStart.getDate() + dayOffset);
        newEnd.setHours(end.getHours(), end.getMinutes(), end.getSeconds(), 0);
        return { start: newStart.toISOString(), end: newEnd.toISOString(), source: blocked.source || 'manual' };
      });
    setBlockedTimesByWeek(prev => ({ ...prev, 0: shifted }));
    setSelectedWeek(0);
  };

  const handleBlockToggle = (dayOrToggles, timeSlotOrUndefined, isBlockedOrUndefined) => {
    // Check if first argument is an array (batch toggle)
    if (Array.isArray(dayOrToggles)) {
      handleBatchBlockToggle(dayOrToggles);
      return;
    }
    
    // Single toggle - validate parameters first
    const day = dayOrToggles;
    const timeSlot = timeSlotOrUndefined;
    const isBlocked = isBlockedOrUndefined;
    
    // Validate required parameters
    if (!day || !timeSlot || typeof isBlocked !== 'boolean') {
      console.error('handleBlockToggle: Invalid parameters', { day, timeSlot, isBlocked });
      return;
    }
    
    const [hour, minute] = timeSlot.split(':').map(Number);
    
    // Find the day index
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayIndex = days.indexOf(day);
    
    // Calculate the date for this day in selected week
    const weekStart = getWeekStart(selectedWeek);
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + dayIndex);
    date.setHours(hour, minute, 0, 0);
    
    // Check if this time slot is a repeatable event (cannot be toggled)
    const repeatableBlocked = getRepeatableEventsAsBlockedTimes(selectedWeek);
    const isRepeatableEvent = repeatableBlocked.some(blocked => {
      const blockedStart = new Date(blocked.start);
      return blockedStart.getTime() === date.getTime();
    });
    
    if (isRepeatableEvent) {
      // Don't allow toggling repeatable events - they must be deleted from the repeatable events section
      return;
    }
    
    const endTime = new Date(date);
    endTime.setMinutes(endTime.getMinutes() + 30); // 30-minute block

    // Use functional update to ensure we always have the latest state
    setBlockedTimesByWeek(prev => {
      const currentWeekBlockedTimes = prev[selectedWeek] || [];
      
      if (isBlocked) {
        // Check if this time is already blocked
        const exists = currentWeekBlockedTimes.some(blocked => {
          const blockedStart = new Date(blocked.start);
          return blockedStart.getTime() === date.getTime();
        });
        
        if (!exists) {
          // Add to blocked times for this week
          return {
            ...prev,
            [selectedWeek]: [...currentWeekBlockedTimes, {
              start: date.toISOString(),
              end: endTime.toISOString(),
              source: 'manual' // Mark as manually blocked
            }]
          };
        }
      } else {
        // Remove from blocked times for this week
        const newBlockedTimes = currentWeekBlockedTimes.filter(blocked => {
          const blockedStart = new Date(blocked.start);
          return blockedStart.getTime() !== date.getTime();
        });
        
        return {
          ...prev,
          [selectedWeek]: newBlockedTimes
        };
      }
      
      return prev; // No change needed
    });
  };

  // Save availability
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Collect all blocked times from all weeks, filtering out repeatable events
      const allBlockedTimes = Object.values(blockedTimesByWeek)
        .flat()
        .filter(blocked => blocked.source !== 'repeatable_event');
      
      // Get week start date for the currently selected week
      const weekStart = getWeekStart(selectedWeek);
      const weekStartDateStr = weekStart.toISOString().split('T')[0];
      
      const response = await fetch('/api/availability/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timePreferences,
          blockedTimes: allBlockedTimes,
          weekStartDate: weekStartDateStr // Include week start date for per-week preferences
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to save' }));
        throw new Error(errorData.error || 'Failed to save');
      }

      const result = await response.json();
      
      // Check if the response indicates success
      if (result.success !== false) {
        // Check if blocks were rescheduled
        if (result.rescheduledDetails && result.rescheduledDetails.length > 0) {
          // Show reschedule modal with details
          setRescheduleDetails(result.rescheduledDetails);
          setShowRescheduleModal(true);
        } else {
          // No reschedules, show regular success message
          setSuccessMessage('Availability settings saved successfully!');
          setShowSuccessModal(true);
          setTimeout(() => setShowSuccessModal(false), 3000);
        }
        
        // Reload preferences to ensure calendar updates with saved values
        // Don't fail the whole operation if reload fails
        try {
          await loadTimePreferencesForWeek(selectedWeek);
          await loadAvailability();
        } catch (reloadError) {
          console.warn('Failed to reload availability after save (non-critical):', reloadError);
          // Don't show error - the save succeeded
        }
        
        // Dispatch event to notify plan page to refresh
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('availabilityUpdated', {
            detail: { 
              rescheduled: result.rescheduled || 0,
              conflicts: result.conflicts || 0
            }
          }));
          console.log('📢 Dispatched availabilityUpdated event to refresh plan page');
        }
      } else {
        throw new Error(result.error || 'Failed to save');
      }
    } catch (error) {
      console.error('Error saving availability:', error);
      setErrorMessage(error.message || 'Failed to save availability settings. Please try again.');
      setShowErrorModal(true);
      setTimeout(() => setShowErrorModal(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle repeatable event form
  const handleDayToggle = (dayIndex) => {
    setNewEvent(prev => {
      const days = prev.days_of_week || [];
      const newDays = days.includes(dayIndex)
        ? days.filter(d => d !== dayIndex)
        : [...days, dayIndex];
      return { ...prev, days_of_week: newDays };
    });
  };

  // Add repeatable event
  const handleAddEvent = async () => {
    if (!newEvent.label || !newEvent.start_time || !newEvent.end_time || newEvent.days_of_week.length === 0) {
      setErrorMessage('Please fill in all required fields and select at least one day.');
      setShowErrorModal(true);
      setTimeout(() => setShowErrorModal(false), 4000);
      return;
    }

    try {
      const response = await fetch('/api/availability/repeatable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          label: newEvent.label,
          start_time: newEvent.start_time,
          end_time: newEvent.end_time,
          days_of_week: newEvent.days_of_week,
        }),
      });

      if (!response.ok) {
        let errorData;
        const contentType = response.headers.get('content-type');
        
        try {
          if (contentType && contentType.includes('application/json')) {
            errorData = await response.json();
          } else {
            const text = await response.text();
            errorData = { error: text || `HTTP ${response.status} ${response.statusText}` };
          }
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
          errorData = { error: `HTTP ${response.status} ${response.statusText}` };
        }
        
        console.error('API Error Response:', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          url: response.url
        });
        
        throw new Error(errorData.error || errorData.message || `Failed to add event (${response.status})`);
      }

      // Reset form and reload events
      setNewEvent({
        label: '',
        start_time: '',
        end_time: '',
        days_of_week: [],
      });
      setShowAddEventForm(false);
      loadRepeatableEvents();
      setSuccessMessage('Repeatable event added successfully!');
      setShowSuccessModal(true);
      // Auto-hide after 3 seconds
      setTimeout(() => setShowSuccessModal(false), 3000);
    } catch (error) {
      console.error('Error adding repeatable event:', error);
      setErrorMessage(`Failed to add repeatable event: ${error.message || 'Unknown error'}. Check the console for details.`);
      setShowErrorModal(true);
      setTimeout(() => setShowErrorModal(false), 3000);
    }
  };

  // Delete repeatable event
  const handleDeleteClick = (eventId) => {
    setEventToDelete(eventId);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!eventToDelete) return;

    try {
      const response = await fetch(`/api/availability/repeatable?id=${eventToDelete}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete event');
      }

      loadRepeatableEvents();
      setShowDeleteConfirm(false);
      setEventToDelete(null);
      setSuccessMessage('Repeatable event deleted successfully!');
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 3000);
    } catch (error) {
      console.error('Error deleting repeatable event:', error);
      setShowDeleteConfirm(false);
      setEventToDelete(null);
      setErrorMessage('Failed to delete repeatable event. Please try again.');
      setShowErrorModal(true);
      setTimeout(() => setShowErrorModal(false), 3000);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setEventToDelete(null);
  };

  // Format days of week for display
  const formatDaysOfWeek = (days) => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days.sort((a, b) => a - b).map(d => dayNames[d]).join(', ');
  };

  // Format time to 12-hour format with AM/PM
  const formatTime = (time24) => {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  // Group events by day and sort
  const getEventsByDay = () => {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const eventsByDay = {};

    // Group events by day
    repeatableEvents.forEach(event => {
      event.days_of_week.forEach(dayIndex => {
        if (!eventsByDay[dayIndex]) {
          eventsByDay[dayIndex] = [];
        }
        eventsByDay[dayIndex].push(event);
      });
    });

    // Sort events within each day by start_time
    Object.keys(eventsByDay).forEach(dayIndex => {
      eventsByDay[dayIndex].sort((a, b) => {
        const [aHour, aMin] = a.start_time.split(':').map(Number);
        const [bHour, bMin] = b.start_time.split(':').map(Number);
        return (aHour * 60 + aMin) - (bHour * 60 + bMin);
      });
    });

    // Convert to array of [dayIndex, events] pairs, sorted Monday-Sunday
    // Monday=1, Tuesday=2, ..., Sunday=0, so we need custom sort
    const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // Monday to Sunday
    return dayOrder
      .filter(dayIndex => eventsByDay[dayIndex] && eventsByDay[dayIndex].length > 0)
      .map(dayIndex => [dayIndex, eventsByDay[dayIndex]]);
  };

  // Generate time options for dropdowns
  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 4; hour < 24; hour++) {
      options.push(`${hour.toString().padStart(2, '0')}:00`);
      if (hour < 23) {
        options.push(`${hour.toString().padStart(2, '0')}:30`);
      }
    }
    return options;
  };

  const timeOptions = generateTimeOptions();

  // Convert repeatable events to blocked times for a specific week
  const getRepeatableEventsAsBlockedTimes = (weekOffset) => {
    if (!repeatableEvents || repeatableEvents.length === 0) {
      return [];
    }

    const weekStart = getWeekStart(weekOffset);
    const blockedTimes = [];

    repeatableEvents.forEach(event => {
      const eventStartDate = event.start_date ? new Date(event.start_date) : new Date(0);
      const eventEndDate = event.end_date ? new Date(event.end_date) : new Date(8640000000000000);

      for (let i = 0; i < 7; i++) {
        const currentDay = new Date(weekStart);
        currentDay.setDate(weekStart.getDate() + i);

        // Check if this day is one of the selected days of the week (0=Sun, 1=Mon, ...)
        const dayOfWeek = currentDay.getDay();
        if (event.days_of_week.includes(dayOfWeek) && currentDay >= eventStartDate && currentDay <= eventEndDate) {
          const [startHour, startMinute] = event.start_time.split(':').map(Number);
          const [endHour, endMinute] = event.end_time.split(':').map(Number);

          const startDateTime = new Date(currentDay);
          startDateTime.setHours(startHour, startMinute, 0, 0);
          const endDateTime = new Date(currentDay);
          endDateTime.setHours(endHour, endMinute, 0, 0);

          blockedTimes.push({
            start: startDateTime.toISOString(),
            end: endDateTime.toISOString(),
            label: event.label,
            source: 'repeatable_event',
            event_id: event.id,
          });
        }
      }
    });

    return blockedTimes;
  };

  // Get filtered blocked times for selected week (manually blocked only)
  const getBlockedTimesForWeek = () => {
    const manualBlocked = blockedTimesByWeek[selectedWeek] || [];
    // Filter out any repeatable events that might have been saved as blocked times
    return manualBlocked.filter(blocked => blocked.source !== 'repeatable_event');
  };

  // Get all blocked times for calendar (manual + repeatable events)
  const getAllBlockedTimesForWeek = () => {
    const manualBlocked = getBlockedTimesForWeek();
    const repeatableBlocked = getRepeatableEventsAsBlockedTimes(selectedWeek);
    const allBlocked = [...manualBlocked, ...repeatableBlocked];
    
    console.log('📅 getAllBlockedTimesForWeek for week', selectedWeek, ':', {
      manualBlocked: manualBlocked.length,
      repeatableBlocked: repeatableBlocked.length,
      total: allBlocked.length,
      manualBlockedData: manualBlocked,
      allBlockedData: allBlocked
    });
    
    return allBlocked;
  };

  // Get filtered scheduled blocks for selected week
  const getScheduledBlocksForWeek = () => {
    const weekStart = getWeekStart(selectedWeek);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    return scheduledBlocks.filter(block => {
      const blockDate = new Date(block.start);
      return blockDate >= weekStart && blockDate < weekEnd;
    });
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-100">
      {/* Fixed Menu Button - Top Left */}
      <button
        type="button"
        className="fixed top-6 left-6 z-50 inline-flex items-center justify-center rounded-md p-4 bg-base-200 hover:bg-base-300 transition shadow-lg"
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

      {/* Header */}
      <div className="bg-base-200">
        <div className="max-w-7xl mx-auto px-4 py-6 pl-28">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold">Availability Settings</h1>
              <p className="text-base-content/70">
                Manage your study time preferences and block unavailable times
              </p>
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-blue-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Repeatable Events and Study Window Times - Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Repeatable Events Section - Left Side */}
          <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Repeatable Events
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              Add recurring commitments (e.g., football practice every Tuesday 5-7pm) that will automatically block those times in your schedule.
            </p>

            {/* Buttons */}
            {!showAddEventForm && (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setNewEvent({
                      label: '',
                      start_time: '',
                      end_time: '',
                      days_of_week: [],
                    });
                    setShowAddEventForm(true);
                  }}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  + Add Repeatable Event
                </button>
                <button
                  onClick={() => setShowEventsModal(true)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  View Events
                </button>
              </div>
            )}
          </div>

        {/* Add Event Modal */}
        {showAddEventForm && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-md"
            onClick={() => {
              setShowAddEventForm(false);
              setNewEvent({
                label: '',
                start_time: '',
                end_time: '',
                days_of_week: [],
              });
            }}
          >
            <div 
              className="bg-white rounded-xl shadow-2xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto transform transition-all animate-popup"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Add Repeatable Event</h2>
                <button
                  onClick={() => {
                    setShowAddEventForm(false);
                    setNewEvent({
                      label: '',
                      start_time: '',
                      end_time: '',
                      days_of_week: [],
                    });
                  }}
                  className="btn btn-sm btn-ghost"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Event Name *
                </label>
                <input
                  type="text"
                  value={newEvent.label}
                  onChange={(e) => setNewEvent(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="e.g., Football Practice"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Time Range *
                  </label>
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs text-gray-500">Start Time</label>
                        <span className="text-xs font-medium text-gray-700">{newEvent.start_time || 'Not selected'}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={timeOptions.length - 1}
                        value={newEvent.start_time && timeOptions.indexOf(newEvent.start_time) >= 0 
                          ? timeOptions.indexOf(newEvent.start_time) 
                          : 0}
                        onChange={(e) => {
                          const index = parseInt(e.target.value);
                          const selectedTime = timeOptions[index];
                          if (selectedTime) {
                            const endIndex = newEvent.end_time ? timeOptions.indexOf(newEvent.end_time) : -1;
                            // Ensure start time is before end time
                            if (endIndex < 0 || endIndex >= index) {
                              setNewEvent(prev => ({ ...prev, start_time: selectedTime }));
                            }
                          }
                        }}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs text-gray-500">End Time</label>
                        <span className="text-xs font-medium text-gray-700">{newEvent.end_time || 'Not selected'}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={timeOptions.length - 1}
                        value={newEvent.end_time && timeOptions.indexOf(newEvent.end_time) >= 0
                          ? timeOptions.indexOf(newEvent.end_time)
                          : timeOptions.length - 1}
                        onChange={(e) => {
                          const index = parseInt(e.target.value);
                          const selectedTime = timeOptions[index];
                          if (selectedTime) {
                            const startIndex = newEvent.start_time ? timeOptions.indexOf(newEvent.start_time) : -1;
                            // Ensure end time is after start time
                            if (startIndex < 0 || startIndex <= index) {
                              setNewEvent(prev => ({ ...prev, end_time: selectedTime }));
                            }
                          }
                        }}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Days of Week * (select at least one)
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { name: 'Monday', index: 1 },
                    { name: 'Tuesday', index: 2 },
                    { name: 'Wednesday', index: 3 },
                    { name: 'Thursday', index: 4 },
                    { name: 'Friday', index: 5 },
                    { name: 'Saturday', index: 6 },
                    { name: 'Sunday', index: 0 }
                  ].map(({ name, index }) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => handleDayToggle(index)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                        newEvent.days_of_week.includes(index)
                          ? 'bg-blue-500 text-white'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {name.substring(0, 3)}
                    </button>
                  ))}
                </div>
              </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleAddEvent}
                    className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
                  >
                    Add Event
                  </button>
                  <button
                    onClick={() => {
                      setShowAddEventForm(false);
                      setNewEvent({
                        label: '',
                        start_time: '',
                        end_time: '',
                        days_of_week: [],
                      });
                    }}
                    className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Study Window Times - Right Side */}
          <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">
              Study Window Times
            </h2>
            
            {isWeekScheduled && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ This week is already scheduled. Study window times cannot be changed.
                </p>
              </div>
            )}
            
            <div className="space-y-6">
              {/* Weekday Times */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Weekday Study Times (Monday - Friday)
                </label>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                      <span>Earliest: {timePreferences.weekdayEarliest}</span>
                      <span>Latest: {timePreferences.weekdayLatest}</span>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Earliest</label>
                        <input
                          type="range"
                          min="0"
                          max={timeOptions.length - 1}
                          value={timeOptions.indexOf(timePreferences.weekdayEarliest)}
                          onChange={(e) => {
                            const index = parseInt(e.target.value);
                            const selectedTime = timeOptions[index];
                            if (selectedTime && timeOptions.indexOf(timePreferences.weekdayLatest) >= index) {
                              handleTimePreferenceChange('weekdayEarliest', selectedTime);
                            }
                          }}
                          disabled={isWeekScheduled}
                          className={`w-full h-2 bg-gray-200 rounded-lg appearance-none accent-blue-500 ${
                            isWeekScheduled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Latest</label>
                        <input
                          type="range"
                          min="0"
                          max={timeOptions.length - 1}
                          value={timeOptions.indexOf(timePreferences.weekdayLatest)}
                          onChange={(e) => {
                            const index = parseInt(e.target.value);
                            const selectedTime = timeOptions[index];
                            if (selectedTime && timeOptions.indexOf(timePreferences.weekdayEarliest) <= index) {
                              handleTimePreferenceChange('weekdayLatest', selectedTime);
                            }
                          }}
                          disabled={isWeekScheduled}
                          className={`w-full h-2 bg-gray-200 rounded-lg appearance-none accent-blue-500 ${
                            isWeekScheduled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Weekend Times */}
              <div>
                <div className="flex items-center space-x-3 mb-3">
                  <input
                    type="checkbox"
                    id="weekendToggle"
                    checked={timePreferences.useSameWeekendTimes}
                    onChange={handleWeekendToggle}
                    disabled={isWeekScheduled}
                    className={`w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 ${
                      isWeekScheduled ? 'cursor-not-allowed opacity-50' : ''
                    }`}
                  />
                  <label htmlFor="weekendToggle" className="text-sm font-medium text-gray-700">
                    Use same times for weekends
                  </label>
                </div>
                
                {!timePreferences.useSameWeekendTimes && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Weekend Study Times (Saturday - Sunday)
                    </label>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-2">
                          <span>Earliest: {timePreferences.weekendEarliest}</span>
                          <span>Latest: {timePreferences.weekendLatest}</span>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Earliest</label>
                            <input
                              type="range"
                              min="0"
                              max={timeOptions.length - 1}
                              value={timeOptions.indexOf(timePreferences.weekendEarliest)}
                              onChange={(e) => {
                                const index = parseInt(e.target.value);
                                const selectedTime = timeOptions[index];
                                if (selectedTime && timeOptions.indexOf(timePreferences.weekendLatest) >= index) {
                                  handleTimePreferenceChange('weekendEarliest', selectedTime);
                                }
                              }}
                              disabled={isWeekScheduled}
                              className={`w-full h-2 bg-gray-200 rounded-lg appearance-none accent-blue-500 ${
                                isWeekScheduled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                              }`}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Latest</label>
                            <input
                              type="range"
                              min="0"
                              max={timeOptions.length - 1}
                              value={timeOptions.indexOf(timePreferences.weekendLatest)}
                              onChange={(e) => {
                                const index = parseInt(e.target.value);
                                const selectedTime = timeOptions[index];
                                if (selectedTime && timeOptions.indexOf(timePreferences.weekendEarliest) <= index) {
                                  handleTimePreferenceChange('weekendLatest', selectedTime);
                                }
                              }}
                              disabled={isWeekScheduled}
                              className={`w-full h-2 bg-gray-200 rounded-lg appearance-none accent-blue-500 ${
                                isWeekScheduled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                              }`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* View Events Modal */}
        {showEventsModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-md"
            onClick={() => setShowEventsModal(false)}
          >
            <div 
              className="bg-white rounded-xl shadow-2xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto transform transition-all animate-popup"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Repeatable Events</h2>
                <button
                  onClick={() => setShowEventsModal(false)}
                  className="btn btn-sm btn-ghost"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {repeatableEvents.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Repeatable Events</h3>
                  <p className="text-gray-600 mb-4">
                    You haven't added any repeatable events yet.
                  </p>
                  <p className="text-sm text-gray-500">
                    Click "Add Repeatable Event" to create recurring commitments that will automatically block those times in your schedule.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {getEventsByDay().map(([dayIndex, events]) => {
                    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const dayName = dayNames[dayIndex];
                    
                    return (
                      <div key={dayIndex} className="space-y-2">
                        <h3 className="text-lg font-semibold text-gray-900">{dayName}</h3>
                        {events.map((event) => (
                          <div
                            key={`${event.id}-${dayIndex}`}
                            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                          >
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">{event.label}</div>
                              <div className="text-sm text-gray-600 mt-1">
                                {formatTime(event.start_time)} - {formatTime(event.end_time)}
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                setShowEventsModal(false);
                                handleDeleteClick(event.id);
                              }}
                              className="ml-4 px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Calendar Section */}
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">
                Block Unavailable Times
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Click or drag to block times when you can't study. These will be excluded from your schedule.
              </p>
            </div>
            {selectedWeek >= 0 && (
              <div className="flex gap-3">
                <button
                  onClick={handleCopyFromPreviousWeek}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                  title="Copy blocked times from the previous week"
                >
                  Copy from Previous Week
                </button>
                <button
                  onClick={() => setShowResetConfirm(true)}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
                  title="Clear all blocked times for this week"
                >
                  Reset Week
                </button>
              </div>
            )}
          </div>

          {isWeekScheduled && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⚠️ This week is already scheduled. Unavailable times cannot be changed.
              </p>
            </div>
          )}

          {/* Week Tabs */}
          <div className="flex flex-wrap items-center gap-3 mb-6 border-b border-gray-200 pb-4">
            <div className="flex space-x-2">
              {[-1, 0, 1, 2, 3].map(weekOffset => {
                const weekStart = getWeekStart(weekOffset);
                const weekLabel = weekOffset === -1 
                  ? 'Last week' 
                  : weekOffset === 0 
                  ? 'This Week' 
                  : `Week ${weekOffset + 1}`;
                
                return (
                  <button
                    key={weekOffset}
                    onClick={() => handleWeekChange(weekOffset)}
                    className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                      selectedWeek === weekOffset
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {weekLabel}
                    <span className="ml-2 text-xs text-gray-400">
                      ({weekStart.getDate()}/{weekStart.getMonth() + 1})
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedWeek !== 0 && (
              <button
                type="button"
                onClick={handleCopyToThisWeek}
                className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 border border-blue-200"
              >
                Copy to this week
              </button>
            )}
          </div>

          {/* Calendar */}
          <TimeBlockCalendar
            weekStart={getWeekStart(selectedWeek)}
            blockedTimes={getAllBlockedTimesForWeek()}
            scheduledBlocks={getScheduledBlocksForWeek()}
            onBlockToggle={handleBlockToggle}
            readOnly={false}
            timePreferences={timePreferences}
            isWeekScheduled={isWeekScheduled}
          />
        </div>

      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-md">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 transform transition-all animate-popup">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900">Delete Event?</h3>
              <p className="text-gray-600">Are you sure you want to delete this repeatable event? This action cannot be undone.</p>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleDeleteCancel}
                  className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="flex-1 px-6 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Week Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-md">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 transform transition-all animate-popup">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900">Reset Week?</h3>
              <p className="text-gray-600">
                Are you sure you want to reset this week? This will clear all manually blocked times for this week.
              </p>
              <p className="text-sm text-gray-500">
                Note: Repeatable events will remain unchanged.
              </p>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetWeek}
                  className="flex-1 px-6 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
                >
                  Reset Week
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-md">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 transform transition-all animate-popup">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900">Error</h3>
              <p className="text-gray-600">{errorMessage}</p>
              <button
                onClick={() => setShowErrorModal(false)}
                className="mt-4 w-full bg-red-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-600 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-md">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 transform transition-all animate-popup">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900">Success!</h3>
              <p className="text-gray-600">{successMessage}</p>
              <button
                onClick={() => setShowSuccessModal(false)}
                className="mt-4 w-full bg-blue-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Details Modal */}
      {showRescheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-md">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto transform transition-all animate-popup">
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">Blocks Rescheduled</h3>
                  <p className="text-gray-600 mt-1">
                    {rescheduleDetails.length} block{rescheduleDetails.length !== 1 ? 's' : ''} {rescheduleDetails.some(d => d.markedAsMissed) ? 'were affected' : 'were rescheduled'} due to unavailable times
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowRescheduleModal(false);
                    setSuccessMessage('Availability settings saved successfully!');
                    setShowSuccessModal(true);
                    setTimeout(() => setShowSuccessModal(false), 3000);
                  }}
                  className="btn btn-sm btn-circle btn-ghost"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-3">
                {rescheduleDetails.map((detail, index) => {
                  const oldDate = new Date(detail.oldTime);
                  const newDate = detail.newTime ? new Date(detail.newTime) : null;
                  
                  const formatDateTime = (date) => {
                    if (!date) return 'N/A';
                    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const dayName = dayNames[date.getDay()];
                    const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                    return `${dayName}, ${time}`;
                  };

                  return (
                    <div key={detail.blockId || index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 mb-1">
                            {detail.topicName}
                          </h4>
                          <p className="text-sm text-gray-600 mb-2">{detail.subject}</p>
                          
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500">From:</span>
                              <span className="font-medium text-gray-900">{formatDateTime(oldDate)}</span>
                            </div>
                            {detail.markedAsMissed ? (
                              <div className="flex items-center gap-2">
                                <span className="text-red-600 font-medium">⚠️ Marked as missed (no available slot found)</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500">To:</span>
                                <span className="font-medium text-green-600">{formatDateTime(newDate)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {!detail.markedAsMissed && (
                          <div className="ml-4">
                            <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowRescheduleModal(false);
                    setSuccessMessage('Availability settings saved successfully!');
                    setShowSuccessModal(true);
                    setTimeout(() => setShowSuccessModal(false), 3000);
                  }}
                  className="flex-1 bg-blue-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-base-200 shadow-xl transform transition-transform duration-300 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-5 border-b border-base-300">
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
              <SidebarDevToolsLink pathname={pathname} onNavigate={() => setSidebarOpen(false)} />
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
      
      <SupportModal isOpen={supportModalOpen} onClose={() => setSupportModalOpen(false)} />
      <FeedbackModal isOpen={feedbackModalOpen} onClose={() => setFeedbackModalOpen(false)} />
    </div>
  );
}

export default function AvailabilitySettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg"></span>
          <p className="mt-4">Loading...</p>
        </div>
      </div>
    }>
      <AvailabilitySettingsPageContent />
    </Suspense>
  );
}
