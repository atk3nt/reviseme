"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import TimeBlockCalendar from "@/components/TimeBlockCalendar";

export default function AvailabilitySettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Time preferences - will be loaded from database
  const [timePreferences, setTimePreferences] = useState({
    weekdayEarliest: '6:00', // Default, will be replaced when loaded
    weekdayLatest: '23:30', // Default, will be replaced when loaded
    useSameWeekendTimes: true, // Default, will be replaced when loaded
    weekendEarliest: '8:00', // Default, will be replaced when loaded
    weekendLatest: '23:30', // Default, will be replaced when loaded
  });
  const [timePreferencesLoaded, setTimePreferencesLoaded] = useState(false);

  // Blocked times - stored per week (week offset as key)
  const [blockedTimesByWeek, setBlockedTimesByWeek] = useState({});
  
  // Scheduled blocks (from plan)
  const [scheduledBlocks, setScheduledBlocks] = useState([]);

  // Repeatable events
  const [repeatableEvents, setRepeatableEvents] = useState([]);
  const [showAddEventForm, setShowAddEventForm] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [eventToDelete, setEventToDelete] = useState(null);
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
          weekdayEarliest: onboardingTimePrefs.weekdayEarliest || '6:00',
          weekdayLatest: onboardingTimePrefs.weekdayLatest || '23:30',
          useSameWeekendTimes: onboardingTimePrefs.useSameWeekendTimes !== false,
          weekendEarliest: onboardingTimePrefs.weekendEarliest || '8:00',
          weekendLatest: onboardingTimePrefs.weekendLatest || '23:30',
        });
      }
      
      // Then try to load from API (this will override localStorage if available)
      // Load blocked times for current week and next 3 weeks (weeks 0-3)
      const week0Start = getWeekStart(0);
      const week3End = new Date(getWeekStart(3));
      week3End.setDate(week3End.getDate() + 7); // End of week 3
      
      const response = await fetch(`/api/availability/save?startDate=${week0Start.toISOString()}&endDate=${week3End.toISOString()}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.timePreferences) {
          // Update time preferences with saved values from database (overrides localStorage)
          setTimePreferences({
            weekdayEarliest: data.timePreferences.weekdayEarliest || onboardingTimePrefs.weekdayEarliest || '6:00',
            weekdayLatest: data.timePreferences.weekdayLatest || onboardingTimePrefs.weekdayLatest || '23:30',
            useSameWeekendTimes: data.timePreferences.useSameWeekendTimes !== false,
            weekendEarliest: data.timePreferences.weekendEarliest || onboardingTimePrefs.weekendEarliest || '8:00',
            weekendLatest: data.timePreferences.weekendLatest || onboardingTimePrefs.weekendLatest || '23:30',
          });
          setTimePreferencesLoaded(true);
          
          // Map loaded blocked times to their respective weeks (0-3)
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
                
                console.log('📅 Blocked time mapping:', {
                  blockedStart: blocked.start,
                  blockedDate: blockedDate.toISOString(),
                  currentWeekStart: currentWeekStart.toISOString(),
                  daysDiff,
                  weekOffset,
                  blocked
                });
                
                // Only include weeks 0-3 (current week and next 3 weeks)
                if (weekOffset >= 0 && weekOffset <= 3) {
                  if (!blockedByWeek[weekOffset]) {
                    blockedByWeek[weekOffset] = [];
                  }
                  blockedByWeek[weekOffset].push(blocked);
                } else {
                  console.warn('⚠️ Blocked time outside week range 0-3:', { weekOffset, blockedStart: blocked.start });
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
    setTimePreferences(prev => ({
      ...prev,
      useSameWeekendTimes: !prev.useSameWeekendTimes
    }));
  };

  // Handle block toggle in calendar
  const handleBlockToggle = (day, timeSlot, isBlocked) => {
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

    // Get current blocked times for this week (manual only)
    const currentWeekBlockedTimes = blockedTimesByWeek[selectedWeek] || [];

    if (isBlocked) {
      // Check if this time is already blocked
      const exists = currentWeekBlockedTimes.some(blocked => {
        const blockedStart = new Date(blocked.start);
        return blockedStart.getTime() === date.getTime();
      });
      
      if (!exists) {
        // Add to blocked times for this week
        setBlockedTimesByWeek(prev => ({
          ...prev,
          [selectedWeek]: [...currentWeekBlockedTimes, {
            start: date.toISOString(),
            end: endTime.toISOString(),
            source: 'manual' // Mark as manually blocked
          }]
        }));
      }
    } else {
      // Remove from blocked times for this week
      setBlockedTimesByWeek(prev => ({
        ...prev,
        [selectedWeek]: currentWeekBlockedTimes.filter(blocked => {
          const blockedStart = new Date(blocked.start);
          return blockedStart.getTime() !== date.getTime();
        })
      }));
    }
  };

  // Save availability
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Collect all blocked times from all weeks, filtering out repeatable events
      const allBlockedTimes = Object.values(blockedTimesByWeek)
        .flat()
        .filter(blocked => blocked.source !== 'repeatable_event');
      
      const response = await fetch('/api/availability/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timePreferences,
          blockedTimes: allBlockedTimes
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save');
      }

      setSuccessMessage('Availability settings saved successfully!');
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 3000);
      
      // Reload preferences to ensure calendar updates with saved values
      await loadAvailability();
    } catch (error) {
      console.error('Error saving availability:', error);
      setErrorMessage('Failed to save availability settings. Please try again.');
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
    for (let hour = 6; hour < 24; hour++) {
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
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            {/* Menu Icon */}
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 hover:bg-gray-200 transition"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                className="w-6 h-6 text-gray-700"
              >
                <rect x="1" y="11" width="22" height="2" fill="currentColor" strokeWidth="0"></rect>
                <rect x="1" y="4" width="22" height="2" strokeWidth="0" fill="currentColor"></rect>
                <rect x="1" y="18" width="22" height="2" strokeWidth="0" fill="currentColor"></rect>
              </svg>
            </button>
            
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Availability Settings</h1>
              <p className="text-xl text-gray-600 mt-2">
                Manage your study time preferences and block unavailable times
              </p>
            </div>
          </div>
        </div>

        {/* Repeatable Events Section */}
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Repeatable Events
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Add recurring commitments (e.g., football practice every Tuesday 5-7pm) that will automatically block those times in your schedule.
          </p>

          {/* Existing Events List */}
          {repeatableEvents.length > 0 && (
            <div className="mb-6 space-y-4">
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
                          onClick={() => handleDeleteClick(event.id)}
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

          {/* Add Event Button */}
          {!showAddEventForm && (
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Time *
                  </label>
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 border border-gray-200 rounded-lg bg-gray-50">
                    {timeOptions.map(time => (
                      <button
                        key={time}
                        type="button"
                        onClick={() => setNewEvent(prev => ({ ...prev, start_time: time }))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          newEvent.start_time === time
                            ? 'bg-blue-500 text-white'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Time *
                  </label>
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 border border-gray-200 rounded-lg bg-gray-50">
                    {timeOptions.map(time => (
                      <button
                        key={time}
                        type="button"
                        onClick={() => setNewEvent(prev => ({ ...prev, end_time: time }))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          newEvent.end_time === time
                            ? 'bg-blue-500 text-white'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Days of Week * (select at least one)
                </label>
                <div className="flex flex-wrap gap-2">
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => handleDayToggle(index)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                        newEvent.days_of_week.includes(index)
                          ? 'bg-blue-500 text-white'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {day.substring(0, 3)}
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

        {/* Time Preferences */}
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">
            Study Window Times
          </h2>
          
          <div className="space-y-6">
            {/* Weekday Times */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Weekday Study Times (Monday - Friday)
              </label>
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Earliest</label>
                  <select
                    value={timePreferences.weekdayEarliest}
                    onChange={(e) => handleTimePreferenceChange('weekdayEarliest', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {timeOptions.map(time => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
                <span className="text-gray-500 mt-6">to</span>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Latest</label>
                  <select
                    value={timePreferences.weekdayLatest}
                    onChange={(e) => handleTimePreferenceChange('weekdayLatest', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {timeOptions.map(time => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Weekend Times */}
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <input
                  type="checkbox"
                  id="weekendToggle"
                  checked={timePreferences.useSameWeekendTimes}
                  onChange={handleWeekendToggle}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="weekendToggle" className="text-sm font-medium text-gray-700">
                  Use same times for weekends
                </label>
              </div>
              
              {!timePreferences.useSameWeekendTimes && (
                <div className="mt-3 ml-7">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Weekend Study Times (Saturday - Sunday)
                  </label>
                  <div className="flex items-center space-x-4">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Earliest</label>
                      <select
                        value={timePreferences.weekendEarliest}
                        onChange={(e) => handleTimePreferenceChange('weekendEarliest', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {timeOptions.map(time => (
                          <option key={time} value={time}>{time}</option>
                        ))}
                      </select>
                    </div>
                    <span className="text-gray-500 mt-6">to</span>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Latest</label>
                      <select
                        value={timePreferences.weekendLatest}
                        onChange={(e) => handleTimePreferenceChange('weekendLatest', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {timeOptions.map(time => (
                          <option key={time} value={time}>{time}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Calendar Section */}
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Block Unavailable Times
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Click or drag to block times when you can't study. These will be excluded from your schedule.
          </p>

          {/* Week Tabs */}
          <div className="flex space-x-2 mb-6 border-b border-gray-200">
            {[0, 1, 2, 3].map(weekOffset => {
              const weekStart = getWeekStart(weekOffset);
              const weekLabel = weekOffset === 0 
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

          {/* Calendar */}
          <TimeBlockCalendar
            weekStart={getWeekStart(selectedWeek)}
            blockedTimes={getAllBlockedTimesForWeek()}
            scheduledBlocks={getScheduledBlocksForWeek()}
            onBlockToggle={handleBlockToggle}
            readOnly={false}
            timePreferences={timePreferences}
          />
        </div>

        {/* Save Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-blue-500 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
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
                        <Link
                          href="/settings?section=contact"
                          className={`block px-4 py-2 rounded-lg transition text-sm hover:bg-base-300 ${
                            pathname === '/settings' && searchParams?.get('section') === 'contact' ? 'bg-primary/20' : ''
                          }`}
                          onClick={() => setSidebarOpen(false)}
                        >
                          Contact
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/settings?section=feedback"
                          className={`block px-4 py-2 rounded-lg transition text-sm hover:bg-base-300 ${
                            pathname === '/settings' && searchParams?.get('section') === 'feedback' ? 'bg-primary/20' : ''
                          }`}
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
    </div>
  );
}


