"use client";

import { useState, useRef, useEffect } from "react";
import config from "@/config";

/**
 * TimeBlockCalendar Component
 * 
 * Displays a weekly calendar with 30-minute time blocks
 * Time range: 4am - 12am (midnight)
 * 40 blocks per day (4:00, 4:30, 5:00, ... 23:00, 23:30)
 * 
 * @param {Object} props
 * @param {Date} props.weekStart - Start date of the week (Monday)
 * @param {Array} props.blockedTimes - Array of blocked time ranges [{start, end}, ...]
 * @param {Array} props.scheduledBlocks - Array of scheduled study blocks [{start, topic}, ...]
 * @param {Function} props.onBlockToggle - Callback when block is toggled (day, timeSlot, isBlocked)
 * @param {Boolean} props.readOnly - If true, blocks cannot be clicked
 * @param {Object} props.timePreferences - Time preferences {weekdayEarliest, weekdayLatest, weekendEarliest, weekendLatest, useSameWeekendTimes}
 * @param {Boolean} props.isWeekScheduled - If true, all times remain visible but cannot be changed (non-interactive)
 * @param {Function} props.onReset - Optional callback to reset all blocked times
 * @param {Boolean} props.confirmReset - Optional confirmation state for reset button
 */
export default function TimeBlockCalendar({
  weekStart = new Date(),
  blockedTimes = [],
  scheduledBlocks = [],
  onBlockToggle,
  readOnly = false,
  timePreferences = null,
  isWeekScheduled = false,
  onReset = null,
  confirmReset = false
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const dragEndRef = useRef(null); // Use ref to track latest drag end position
  const calendarRef = useRef(null);
  const cleanupRef = useRef(null); // Track cleanup function
  const isDraggingRef = useRef(false); // Track dragging state with ref for event handlers
  const savedScrollYRef = useRef(0); // Store scroll position

  // Generate time slots based on time preferences (and existing blocked times so they're visible)
  // If timePreferences is provided, show study window; extend range to include any blocked times for this week
  const generateTimeSlots = () => {
    const parseTime = (timeStr) => {
      const [hour, minute] = (timeStr || '').split(':').map(Number);
      return (hour || 0) * 60 + (minute || 0);
    };

    if (!timePreferences) {
      // Default: 4am to 12am (40 blocks)
      const slots = [];
      for (let hour = 4; hour < 24; hour++) {
        slots.push(`${hour.toString().padStart(2, '0')}:00`);
        if (hour < 23) {
          slots.push(`${hour.toString().padStart(2, '0')}:30`);
        }
      }
      return slots;
    }

    // Start from time preferences
    const weekdayEarliest = timePreferences.weekdayEarliest || '4:30';
    const weekdayLatest = timePreferences.weekdayLatest || '23:30';
    const weekendEarliest = timePreferences.weekendEarliest || '8:00';
    const weekendLatest = timePreferences.weekendLatest || '23:30';
    const useSameWeekendTimes = timePreferences.useSameWeekendTimes !== false;

    const times = [
      parseTime(weekdayEarliest),
      parseTime(weekdayLatest),
    ];
    if (!useSameWeekendTimes) {
      times.push(parseTime(weekendEarliest));
      times.push(parseTime(weekendLatest));
    }

    let earliestMinutes = Math.min(...times);
    let latestMinutes = Math.max(...times);

    // Extend range to include any existing blocked times so they're visible and editable
    if (Array.isArray(blockedTimes) && blockedTimes.length > 0) {
      blockedTimes.forEach((bt) => {
        if (!bt || !bt.start || !bt.end) return;
        const startDate = new Date(bt.start);
        const endDate = new Date(bt.end);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return;
        const startMin = startDate.getHours() * 60 + startDate.getMinutes();
        const endMin = endDate.getHours() * 60 + endDate.getMinutes();
        const slotStart = Math.floor(startMin / 30) * 30;
        const slotEnd = Math.ceil(endMin / 30) * 30;
        earliestMinutes = Math.min(earliestMinutes, slotStart);
        latestMinutes = Math.max(latestMinutes, slotEnd);
      });
    }

    // Generate slots from earliest to latest
    const slots = [];
    for (let minutes = earliestMinutes; minutes < latestMinutes; minutes += 30) {
      const hour = Math.floor(minutes / 60);
      const min = minutes % 60;
      slots.push(`${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
    }

    return slots;
  };

  const timeSlots = generateTimeSlots();

  // Days of the week
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Get dates for the week (starting from Monday)
  const getWeekDates = () => {
    const dates = [];
    const start = new Date(weekStart);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    start.setDate(diff);
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const weekDates = getWeekDates();

  // Check if a time block is blocked
  const isBlocked = (dayIndex, timeSlot) => {
    if (!blockedTimes || blockedTimes.length === 0) {
      return false;
    }
    
    const date = weekDates[dayIndex];
    const [hour, minute] = timeSlot.split(':').map(Number);
    const blockDateTime = new Date(date);
    blockDateTime.setHours(hour, minute, 0, 0);
    // Normalize to UTC for comparison
    const blockDateTimeUTC = new Date(blockDateTime.toISOString());

    const result = blockedTimes.some(blocked => {
      if (!blocked || !blocked.start || !blocked.end) {
        return false;
      }
      
      const start = new Date(blocked.start);
      const end = new Date(blocked.end);
      
      // Compare using UTC to avoid timezone issues
      const startUTC = new Date(start.toISOString());
      const endUTC = new Date(end.toISOString());
      
      // Check if blockDateTime falls within the blocked time range
      // Using <= for start and < for end to match 30-minute slot boundaries
      const isMatch = blockDateTimeUTC >= startUTC && blockDateTimeUTC < endUTC;
      
      return isMatch;
    });
    
    return result;
  };

  // Check if a time block has a scheduled study session
  const hasScheduledBlock = (dayIndex, timeSlot) => {
    const date = weekDates[dayIndex];
    const [hour, minute] = timeSlot.split(':').map(Number);
    const blockDateTime = new Date(date);
    blockDateTime.setHours(hour, minute, 0, 0);

    return scheduledBlocks.some(block => {
      const blockStart = new Date(block.start);
      return blockStart.getTime() === blockDateTime.getTime();
    });
  };

  // Get block state
  const getBlockState = (dayIndex, timeSlot) => {
    // All time slots shown are within the study window, so no need to check outside range
    if (hasScheduledBlock(dayIndex, timeSlot)) {
      return 'scheduled';
    }
    if (isBlocked(dayIndex, timeSlot)) {
      return 'blocked';
    }
    return 'available';
  };

  // Check if a time slot is within the study window for a specific day
  const isWithinStudyWindow = (dayIndex, timeSlot) => {
    if (!timePreferences) {
      return true; // If no preferences, all times are valid
    }

    const parseTime = (timeStr) => {
      const [hour, minute] = timeStr.split(':').map(Number);
      return hour * 60 + minute; // Convert to minutes
    };

    const timeSlotMinutes = parseTime(timeSlot);
    
    // Check if it's a weekend (Saturday = 5, Sunday = 6)
    const isWeekend = dayIndex >= 5;
    
    let earliestMinutes, latestMinutes;
    
    if (isWeekend && !timePreferences.useSameWeekendTimes) {
      // Weekend with different times
      earliestMinutes = parseTime(timePreferences.weekendEarliest || '8:00');
      latestMinutes = parseTime(timePreferences.weekendLatest || '23:30');
    } else {
      // Weekday or weekend with same times as weekday
      earliestMinutes = parseTime(timePreferences.weekdayEarliest || '4:30');
      latestMinutes = parseTime(timePreferences.weekdayLatest || '23:30');
    }
    
    // Check if time slot is within the window
    // timeSlotMinutes is the start of the 30-minute slot
    // We check if the slot starts at or after earliest and before latest
    return timeSlotMinutes >= earliestMinutes && timeSlotMinutes < latestMinutes;
  };

  // Handle mouse down (start drag or single click)
  const handleMouseDown = (e, dayIndex, timeSlot) => {
    if (readOnly || isWeekScheduled) return;
    
    // Prevent text selection and scrolling
    e.preventDefault();
    e.stopPropagation();
    
    const startPos = { dayIndex, timeSlot };
    isDraggingRef.current = true; // Set ref immediately for event handlers
    savedScrollYRef.current = window.scrollY; // Save current scroll position
    setIsDragging(true);
    setDragStart(startPos);
    setDragEnd(startPos);
    dragEndRef.current = startPos; // Initialize ref
  };

  // Handle mouse move (during drag) - using elementFromPoint for better accuracy
  const handleMouseMove = (e) => {
    // Check ref instead of state for immediate updates
    if (!isDraggingRef.current || !dragStart || readOnly || !calendarRef.current) {
      return;
    }

    // Prevent text selection during drag
    if (e.cancelable) {
      e.preventDefault();
    }

    // Use elementFromPoint to find which cell we're over
    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (!element) return;

    // Find the cell element (look for data attributes or traverse up)
    let cellElement = element;
    let maxDepth = 10; // Prevent infinite loop
    while (cellElement && cellElement !== calendarRef.current && maxDepth > 0) {
      const dayIndex = cellElement.getAttribute('data-day-index');
      const timeSlot = cellElement.getAttribute('data-time-slot');
      if (dayIndex !== null && timeSlot !== null) {
        const newDragEnd = { 
          dayIndex: parseInt(dayIndex), 
          timeSlot: timeSlot 
        };
        // Always update dragEnd to ensure it's current
        setDragEnd(newDragEnd);
        dragEndRef.current = newDragEnd; // Update ref immediately
        return;
      }
      cellElement = cellElement.parentElement;
      maxDepth--;
    }
  };

  // Handle mouse up (end drag or click)
  const handleMouseUp = () => {
    // Always clean up first, regardless of state
    if (cleanupRef.current) {
      const cleanupFn = cleanupRef.current;
      cleanupRef.current = null;
      cleanupFn(); // Call cleanup immediately
    }
    
    // Set ref to false immediately
    isDraggingRef.current = false;
    
    if (!isDragging || readOnly) {
      // Make sure we're not dragging even if state is inconsistent
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      dragEndRef.current = null;
      return;
    }

    // Capture values before resetting state
    const currentDragStart = dragStart;
    const currentDragEnd = dragEndRef.current || dragStart;
    
    // Reset drag state IMMEDIATELY to prevent further drag events
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    dragEndRef.current = null;
    
    // Now process the toggle
    if (currentDragStart && currentDragEnd && onBlockToggle) {
      // If same block, single click
      if (currentDragStart.dayIndex === currentDragEnd.dayIndex && currentDragStart.timeSlot === currentDragEnd.timeSlot) {
        const wasBlocked = isBlocked(currentDragStart.dayIndex, currentDragStart.timeSlot);
        
        // Don't allow toggling any times when week is scheduled (safety check - should be prevented earlier)
        if (isWeekScheduled) {
          return;
        }
        
        const dayName = days[currentDragStart.dayIndex];
        const timeSlotValue = currentDragStart.timeSlot;
        
        // Validate before calling
        if (dayName && timeSlotValue) {
          onBlockToggle(dayName, timeSlotValue, !wasBlocked);
        }
      } else {
        // Drag selection - toggle all blocks in range
        const startDay = Math.min(currentDragStart.dayIndex, currentDragEnd.dayIndex);
        const endDay = Math.max(currentDragStart.dayIndex, currentDragEnd.dayIndex);
        const startTimeIndex = Math.min(
          timeSlots.indexOf(currentDragStart.timeSlot),
          timeSlots.indexOf(currentDragEnd.timeSlot)
        );
        const endTimeIndex = Math.max(
          timeSlots.indexOf(currentDragStart.timeSlot),
          timeSlots.indexOf(currentDragEnd.timeSlot)
        );

        // Toggle all cells in the range - collect them first, then toggle
        const cellsToToggle = [];
        
        // Don't allow toggling any times when week is scheduled (safety check - should be prevented earlier)
        if (isWeekScheduled) {
          return;
        }
        
        for (let day = startDay; day <= endDay; day++) {
          for (let timeIndex = startTimeIndex; timeIndex <= endTimeIndex; timeIndex++) {
            const timeSlotToToggle = timeSlots[timeIndex];
            const wasBlocked = isBlocked(day, timeSlotToToggle);
            
            cellsToToggle.push({ 
              day: days[day], 
              timeSlot: timeSlotToToggle, 
              isBlocked: !wasBlocked 
            });
          }
        }
        
        // Batch toggle all cells at once
        if (cellsToToggle.length > 0) {
          // Validate all cells before toggling
          const validCells = cellsToToggle.filter(cell => 
            cell.day && cell.timeSlot && typeof cell.isBlocked === 'boolean'
          );
          
          if (validCells.length > 0) {
            // Pass array to onBlockToggle - it will detect array and use batch handler
            onBlockToggle(validCells);
          }
        }
      }
    }
  };

  // Get blocks in drag range
  const isInDragRange = (dayIndex, timeSlot) => {
    if (!isDragging || !dragStart || !dragEnd) return false;

    const startDay = Math.min(dragStart.dayIndex, dragEnd.dayIndex);
    const endDay = Math.max(dragStart.dayIndex, dragEnd.dayIndex);
    const startTimeIndex = Math.min(
      timeSlots.indexOf(dragStart.timeSlot),
      timeSlots.indexOf(dragEnd.timeSlot)
    );
    const endTimeIndex = Math.max(
      timeSlots.indexOf(dragStart.timeSlot),
      timeSlots.indexOf(dragEnd.timeSlot)
    );

    const timeIndex = timeSlots.indexOf(timeSlot);
    return (
      dayIndex >= startDay &&
      dayIndex <= endDay &&
      timeIndex >= startTimeIndex &&
      timeIndex <= endTimeIndex
    );
  };

  // Format time for display - original full format for desktop
  const formatTime = (timeSlot) => {
    const [hour, minute] = timeSlot.split(':').map(Number);
    const period = hour >= 12 ? 'pm' : 'am';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    // Original format: always show full format "1:00pm"
    return `${displayHour}:${minute.toString().padStart(2, '0')}${period}`;
  };

  // Convert hex color to rgba for opacity control
  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Get brand blue colors for highlight
  const brandBlue = config.colors.brand.primary; // #0066FF
  const brandBlueBg = hexToRgba(brandBlue, 0.2); // 20% opacity
  const brandBlueBorder = hexToRgba(brandBlue, 0.4); // 40% opacity
  const brandBlueRing = hexToRgba(brandBlue, 0.4);
  const brandBlueRingOffset = hexToRgba(brandBlue, 0.2);

  useEffect(() => {
    // Clean up any previous drag state first
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    
    if (isDragging) {
      const handleMouseMoveWrapper = (e) => {
        // Check ref instead of state for immediate updates
        if (!isDraggingRef.current) {
          return;
        }
        if (e.cancelable) {
          e.preventDefault();
        }
        handleMouseMove(e);
      };
      const handleMouseUpWrapper = (e) => {
        if (e.cancelable) {
          e.preventDefault();
        }
        handleMouseUp();
      };
      
      const handleTouchMove = (e) => {
        // Check ref instead of state for immediate updates
        if (!isDraggingRef.current) {
          return;
        }
        // Only prevent default if we can
        if (e.cancelable) {
          e.preventDefault();
        }
        e.stopPropagation();
        const touch = e.touches[0];
        if (touch && calendarRef.current) {
          const element = document.elementFromPoint(touch.clientX, touch.clientY);
          if (element) {
            let cellElement = element;
            let maxDepth = 10;
            while (cellElement && cellElement !== calendarRef.current && maxDepth > 0) {
              const dayIndex = cellElement.getAttribute('data-day-index');
              const timeSlot = cellElement.getAttribute('data-time-slot');
              if (dayIndex !== null && timeSlot !== null) {
                const newDragEnd = { 
                  dayIndex: parseInt(dayIndex), 
                  timeSlot: timeSlot 
                };
                setDragEnd(newDragEnd);
                dragEndRef.current = newDragEnd;
                return;
              }
              cellElement = cellElement.parentElement;
              maxDepth--;
            }
          }
        }
      };
      
      const handleTouchEnd = (e) => {
        // Check ref instead of state for immediate updates
        if (!isDraggingRef.current) {
          return;
        }
        // Only prevent default if we can
        if (e.cancelable) {
          e.preventDefault();
        }
        handleMouseUp();
      };
      
      // Prevent scrolling during drag - use capture phase and check cancelable
      const preventScroll = (e) => {
        // Check ref instead of state for immediate updates
        if (isDraggingRef.current && e.cancelable) {
          e.preventDefault();
        }
      };
      
      // Prevent wheel scrolling during drag
      const preventWheel = (e) => {
        // Check ref instead of state for immediate updates
        if (isDraggingRef.current && e.cancelable) {
          e.preventDefault();
        }
      };
      
      // Use capture phase for better control
      const options = { passive: false, capture: true };
      
      document.addEventListener('mousemove', handleMouseMoveWrapper, options);
      document.addEventListener('mouseup', handleMouseUpWrapper, options);
      document.addEventListener('touchmove', handleTouchMove, options);
      document.addEventListener('touchend', handleTouchEnd, options);
      document.addEventListener('scroll', preventScroll, options);
      document.addEventListener('wheel', preventWheel, options);
      
      // Use CSS to prevent scrolling instead of just JS
      // Save scroll position before fixing body
      const scrollY = savedScrollYRef.current || window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.touchAction = 'none';
      
      // Also prevent scrolling on the calendar container
      if (calendarRef.current) {
        calendarRef.current.style.touchAction = 'none';
      }
      
      const cleanup = () => {
        document.removeEventListener('mousemove', handleMouseMoveWrapper, options);
        document.removeEventListener('mouseup', handleMouseUpWrapper, options);
        document.removeEventListener('touchmove', handleTouchMove, options);
        document.removeEventListener('touchend', handleTouchEnd, options);
        document.removeEventListener('scroll', preventScroll, options);
        document.removeEventListener('wheel', preventWheel, options);
        
        // Restore body styles first
        const savedScroll = savedScrollYRef.current || 0;
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.touchAction = '';
        
        // Restore scroll position after styles are cleared (works for both mobile and desktop)
        if (savedScroll > 0) {
          // Use setTimeout to ensure styles are cleared first
          setTimeout(() => {
            window.scrollTo(0, savedScroll);
          }, 0);
        }
        
        if (calendarRef.current) {
          calendarRef.current.style.touchAction = '';
        }
        
        // Reset refs
        savedScrollYRef.current = 0;
      };
      
      cleanupRef.current = cleanup;
      
      return cleanup;
    } else {
      // Clean up if not dragging
      isDraggingRef.current = false;
      setDragStart(null);
      setDragEnd(null);
      dragEndRef.current = null;
      savedScrollYRef.current = 0;
    }
    
    // Safety cleanup on unmount or when dragging state changes
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      // Force restore body styles as safety net (works for both mobile and desktop)
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.touchAction = '';
      if (calendarRef.current) {
        calendarRef.current.style.touchAction = '';
      }
    };
  }, [isDragging]);

  return (
    <div 
      className="w-full overflow-x-auto select-none"
      style={{ 
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'thin',
        msOverflowStyle: '-ms-autohiding-scrollbar'
      }}
    >
      <div
        ref={calendarRef}
        className="inline-block min-w-full bg-white border-2 border-gray-200 rounded-xl overflow-hidden select-none"
        style={{ 
          userSelect: 'none', 
          WebkitUserSelect: 'none'
        }}
      >
        {/* Header */}
        <div className="grid grid-cols-8 border-b-2 border-gray-300 bg-brand-light select-none gap-0.5 sm:gap-2 px-1 sm:px-2 py-2 sm:py-3">
          <div className="font-semibold text-brand-medium select-none text-center flex items-center justify-center text-xs sm:text-sm">
            Time
          </div>
          {days.map((day, index) => {
            const date = weekDates[index];
            return (
              <div
                key={day}
                className="text-center select-none"
              >
                <p className="font-semibold text-brand-dark select-none text-xs sm:text-sm">{dayLabels[index]}</p>
                <p className="text-[10px] sm:text-xs text-brand-medium select-none">
                  {date.getDate()}/{date.getMonth() + 1}
                </p>
              </div>
            );
          })}
        </div>

        {/* Time Blocks */}
        <div className="p-0.5 sm:p-2 space-y-0.5 sm:space-y-2">
          {timeSlots.map((timeSlot, timeIndex) => (
            <div
              key={timeSlot}
              className="grid grid-cols-8 gap-0.5 sm:gap-2"
            >
              {/* Time Label */}
              <div className="text-xs sm:text-sm text-brand-medium bg-brand-light select-none text-center flex items-center justify-center rounded-md py-1.5 sm:py-2 px-0.5 sm:px-1 w-full min-w-0">
                {/* Mobile: compact format, Desktop: full format */}
                <span className="sm:hidden">
                  {(() => {
                    const [hour, minute] = timeSlot.split(':').map(Number);
                    const period = hour >= 12 ? 'pm' : 'am';
                    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
                    if (minute === 0) {
                      return `${displayHour}${period}`;
                    }
                    return `${displayHour}:${minute.toString().padStart(2, '0')}${period}`;
                  })()}
                </span>
                <span className="hidden sm:inline">{formatTime(timeSlot)}</span>
              </div>

              {/* Day Blocks */}
              {days.map((day, dayIndex) => {
                const state = getBlockState(dayIndex, timeSlot);
                const inDragRange = isInDragRange(dayIndex, timeSlot);
                const withinWindow = isWithinStudyWindow(dayIndex, timeSlot);
                
                let bgColor = 'bg-white';
                let borderColor = 'border-gray-300';
                let textColor = 'text-gray-400';
                let opacity = '';
                let cursor = !readOnly && !isWeekScheduled ? 'cursor-pointer' : 'cursor-default';
                let inlineStyle = { userSelect: 'none', WebkitUserSelect: 'none' };
                const isBlockedAndScheduled = state === 'blocked' && isWeekScheduled;
                
                // Grey out if outside study window (but still show drag range if dragging)
                if (!withinWindow && !inDragRange) {
                  bgColor = 'bg-gray-200';
                  borderColor = 'border-gray-300';
                  textColor = 'text-gray-400';
                  opacity = 'opacity-60';
                  cursor = 'cursor-default';
                }
                // Highlight drag range (even if outside window) - but not if week is scheduled
                else if (inDragRange && !isWeekScheduled) {
                  // Use brand blue color explicitly
                  inlineStyle = {
                    ...inlineStyle,
                    backgroundColor: brandBlueBg,
                    borderColor: brandBlueBorder,
                    color: brandBlue,
                    boxShadow: `0 0 0 2px ${brandBlueRing}, 0 0 0 4px ${brandBlueRingOffset}` // Ring effect with brand blue
                  };
                  bgColor = ''; // Empty to use inline style
                  borderColor = ''; // Empty to use inline style
                  textColor = ''; // Empty to use inline style
                } else if (state === 'scheduled') {
                  bgColor = 'bg-primary/10';
                  borderColor = 'border-primary/30';
                  textColor = 'text-primary';
                } else if (state === 'blocked') {
                  // Keep red styling for blocked times even when week is scheduled (just disable interaction)
                  bgColor = 'bg-red-100';
                  borderColor = 'border-red-300';
                  textColor = 'text-red-700';
                  // Remove hover effect if week is scheduled, add subtle opacity overlay
                  if (isWeekScheduled) {
                    bgColor = 'bg-red-100';
                    opacity = 'opacity-80';
                  }
                } else {
                  // Available block - keep white styling even when week is scheduled (just disable interaction)
                  bgColor = 'bg-white';
                  // Remove hover effect if week is scheduled, add subtle opacity overlay
                  if (isWeekScheduled) {
                    opacity = 'opacity-80';
                  } else {
                    bgColor = 'bg-white hover:bg-brand-light';
                  }
                }

                return (
                  <div
                    key={`${day}-${timeSlot}`}
                    data-day-index={dayIndex}
                    data-time-slot={timeSlot}
                    onMouseDown={(e) => {
                      // Prevent clicking if outside study window, readOnly, or if week is scheduled
                      if (!withinWindow || readOnly || isWeekScheduled) {
                        e.preventDefault();
                        return;
                      }
                      handleMouseDown(e, dayIndex, timeSlot);
                    }}
                    onTouchStart={(e) => {
                      if (!withinWindow || readOnly || isWeekScheduled) {
                        return;
                      }
                      // For touch devices - start drag immediately like mouse
                      // The drag prevention logic will handle scrolling during drag
                      handleMouseDown(e, dayIndex, timeSlot);
                    }}
                    onMouseEnter={() => {
                      if (isDragging && dragStart && !isWeekScheduled) {
                        const newDragEnd = { dayIndex, timeSlot };
                        setDragEnd(newDragEnd);
                        dragEndRef.current = newDragEnd;
                      }
                    }}
                    className={`
                      rounded-md ${inDragRange && !isWeekScheduled ? '' : `border ${borderColor}`} ${inDragRange && !isWeekScheduled ? '' : bgColor} ${inDragRange && !isWeekScheduled ? '' : textColor} ${opacity} select-none
                      transition-all duration-200 flex items-center justify-center
                      ${cursor}
                      min-h-[40px] sm:min-h-[32px]
                      touch-manipulation
                    `}
                    style={inlineStyle}
                    title={!withinWindow ? '' : `${day} ${formatTime(timeSlot)} - ${
                      state === 'blocked' ? 'Blocked' : 
                      state === 'scheduled' ? 'Scheduled' : 
                      'Available'
                    }`}
                  >
                    {state === 'scheduled' && !inDragRange && (
                      <span className="text-[10px] sm:text-xs select-none">●</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 sm:mt-4 flex flex-wrap justify-center items-center gap-2 sm:gap-4 text-xs sm:text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 sm:w-4 sm:h-4 bg-white border border-gray-300 rounded"></div>
          <span className="text-brand-medium text-xs sm:text-sm">Available</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 sm:w-4 sm:h-4 bg-red-100 border border-red-300 rounded"></div>
          <span className="text-brand-medium text-xs sm:text-sm">Blocked</span>
        </div>
        {onReset && blockedTimes.length > 0 ? (
          <button
            onClick={onReset}
            className={`px-2 sm:px-3 py-1 sm:py-0.5 rounded-lg text-[10px] sm:text-xs font-medium transition-colors ${
              confirmReset 
                ? 'bg-[#0066FF] border border-[#0066FF] text-white hover:bg-[#0052CC] hover:border-[#0052CC]'
                : 'bg-[#E5F0FF] border border-[#0066FF]/20 text-[#003D99] hover:bg-[#0066FF]/10 hover:border-[#0066FF]/40'
            }`}
          >
            {confirmReset ? 'Confirm Reset?' : 'Reset all blocked times'}
          </button>
        ) : (
          <div className="text-brand-medium text-[10px] sm:text-xs">
            Click or drag to block/unblock times
          </div>
        )}
      </div>
    </div>
  );
}

