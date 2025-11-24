"use client";

import { useState, useRef, useEffect } from "react";

/**
 * TimeBlockCalendar Component
 * 
 * Displays a weekly calendar with 30-minute time blocks
 * Time range: 6am - 12am (midnight)
 * 36 blocks per day (6:00, 6:30, 7:00, ... 23:00, 23:30)
 * 
 * @param {Object} props
 * @param {Date} props.weekStart - Start date of the week (Monday)
 * @param {Array} props.blockedTimes - Array of blocked time ranges [{start, end}, ...]
 * @param {Array} props.scheduledBlocks - Array of scheduled study blocks [{start, topic}, ...]
 * @param {Function} props.onBlockToggle - Callback when block is toggled (day, timeSlot, isBlocked)
 * @param {Boolean} props.readOnly - If true, blocks cannot be clicked
 * @param {Object} props.timePreferences - Time preferences {weekdayEarliest, weekdayLatest, weekendEarliest, weekendLatest, useSameWeekendTimes}
 */
export default function TimeBlockCalendar({
  weekStart = new Date(),
  blockedTimes = [],
  scheduledBlocks = [],
  onBlockToggle,
  readOnly = false,
  timePreferences = null
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const calendarRef = useRef(null);

  // Generate time slots based on time preferences
  // If timePreferences is provided, only show times within the study window
  // Otherwise, show all times from 6am to 12am
  const generateTimeSlots = () => {
    if (!timePreferences) {
      // Default: 6am to 12am (36 blocks)
      const slots = [];
      for (let hour = 6; hour < 24; hour++) {
        slots.push(`${hour.toString().padStart(2, '0')}:00`);
        if (hour < 23) {
          slots.push(`${hour.toString().padStart(2, '0')}:30`);
        }
      }
      return slots;
    }

    // Generate slots based on time preferences
    // We need to find the earliest and latest times across all days
    const weekdayEarliest = timePreferences.weekdayEarliest || '6:00';
    const weekdayLatest = timePreferences.weekdayLatest || '23:30';
    const weekendEarliest = timePreferences.weekendEarliest || '8:00';
    const weekendLatest = timePreferences.weekendLatest || '23:30';
    const useSameWeekendTimes = timePreferences.useSameWeekendTimes !== false;

    // Find the overall earliest and latest times
    const parseTime = (timeStr) => {
      const [hour, minute] = timeStr.split(':').map(Number);
      return hour * 60 + minute;
    };

    const times = [
      parseTime(weekdayEarliest),
      parseTime(weekdayLatest),
    ];

    if (!useSameWeekendTimes) {
      times.push(parseTime(weekendEarliest));
      times.push(parseTime(weekendLatest));
    }

    const earliestMinutes = Math.min(...times);
    const latestMinutes = Math.max(...times);

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

  // Handle mouse down (start drag or single click)
  const handleMouseDown = (e, dayIndex, timeSlot) => {
    if (readOnly) return;
    
    // Prevent text selection
    e.preventDefault();
    
    setIsDragging(true);
    setDragStart({ dayIndex, timeSlot });
    setDragEnd({ dayIndex, timeSlot });
  };

  // Handle mouse move (during drag)
  const handleMouseMove = (e) => {
    if (!isDragging || readOnly || !calendarRef.current) return;

    // Prevent text selection during drag
    e.preventDefault();

    const rect = calendarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate which block we're hovering over
    // Time column is first column, then 7 day columns
    const cellWidth = rect.width / 8; // 7 days + time column
    const headerHeight = 60; // Approximate header height
    const cellHeight = (rect.height - headerHeight) / timeSlots.length;

    const dayIndex = Math.floor((x - cellWidth) / cellWidth);
    const timeIndex = Math.floor((y - headerHeight) / cellHeight);

    if (dayIndex >= 0 && dayIndex < 7 && timeIndex >= 0 && timeIndex < timeSlots.length) {
      setDragEnd({ dayIndex, timeSlot: timeSlots[timeIndex] });
    }
  };

  // Handle mouse up (end drag or click)
  const handleMouseUp = () => {
    if (!isDragging || readOnly) return;

    if (dragStart && dragEnd && onBlockToggle) {
      // If same block, single click
      if (dragStart.dayIndex === dragEnd.dayIndex && dragStart.timeSlot === dragEnd.timeSlot) {
        const wasBlocked = isBlocked(dragStart.dayIndex, dragStart.timeSlot);
        onBlockToggle(
          days[dragStart.dayIndex],
          dragStart.timeSlot,
          !wasBlocked
        );
      } else {
        // Drag selection - toggle all blocks in range
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

        for (let day = startDay; day <= endDay; day++) {
          for (let timeIndex = startTimeIndex; timeIndex <= endTimeIndex; timeIndex++) {
            const timeSlot = timeSlots[timeIndex];
            const wasBlocked = isBlocked(day, timeSlot);
            onBlockToggle(days[day], timeSlot, !wasBlocked);
          }
        }
      }
    }

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
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

  // Format time for display
  const formatTime = (timeSlot) => {
    const [hour, minute] = timeSlot.split(':').map(Number);
    const period = hour >= 12 ? 'pm' : 'am';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minute.toString().padStart(2, '0')}${period}`;
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart, dragEnd]);

  return (
    <div className="w-full overflow-x-auto select-none">
      <div
        ref={calendarRef}
        className="inline-block min-w-full bg-white border-2 border-gray-200 rounded-xl overflow-hidden select-none"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        {/* Header */}
        <div className="grid grid-cols-8 border-b-2 border-gray-300 bg-gray-50 select-none">
          <div className="p-3 font-semibold text-gray-700 border-r border-gray-200 select-none">
            Time
          </div>
          {days.map((day, index) => {
            const date = weekDates[index];
            return (
              <div
                key={day}
                className="p-3 text-center border-r border-gray-200 last:border-r-0 select-none"
              >
                <p className="font-semibold text-gray-900 select-none">{dayLabels[index]}</p>
                <p className="text-xs text-gray-500 select-none">
                  {date.getDate()}/{date.getMonth() + 1}
                </p>
              </div>
            );
          })}
        </div>

        {/* Time Blocks */}
        <div className="divide-y divide-gray-200">
          {timeSlots.map((timeSlot, timeIndex) => (
            <div
              key={timeSlot}
              className="grid grid-cols-8 hover:bg-gray-50"
            >
              {/* Time Label */}
              <div className="p-2 text-sm text-gray-600 border-r border-gray-200 bg-gray-50 select-none">
                {formatTime(timeSlot)}
              </div>

              {/* Day Blocks */}
              {days.map((day, dayIndex) => {
                const state = getBlockState(dayIndex, timeSlot);
                const inDragRange = isInDragRange(dayIndex, timeSlot);
                
                let bgColor = 'bg-white';
                let borderColor = 'border-gray-200';
                let textColor = 'text-gray-400';
                
                if (state === 'scheduled') {
                  bgColor = 'bg-blue-100';
                  borderColor = 'border-blue-300';
                  textColor = 'text-blue-700';
                } else if (state === 'blocked') {
                  bgColor = 'bg-red-100';
                  borderColor = 'border-red-300';
                  textColor = 'text-red-700';
                } else if (inDragRange) {
                  bgColor = 'bg-yellow-100';
                  borderColor = 'border-yellow-300';
                } else {
                  bgColor = 'bg-white hover:bg-gray-50';
                }

                return (
                  <div
                    key={`${day}-${timeSlot}`}
                    onMouseDown={(e) => handleMouseDown(e, dayIndex, timeSlot)}
                    className={`
                      p-1 border-r border-gray-200 last:border-r-0
                      transition-colors ${bgColor} ${borderColor} ${textColor} select-none
                      ${!readOnly ? 'cursor-pointer' : 'cursor-default'}
                    `}
                    style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                    title={`${day} ${formatTime(timeSlot)} - ${state === 'blocked' ? 'Blocked' : state === 'scheduled' ? 'Scheduled' : 'Available'}`}
                  >
                    <div className="w-full h-6 rounded border border-gray-300 flex items-center justify-center select-none">
                      {state === 'blocked' && (
                        <span className="text-xs select-none">✗</span>
                      )}
                      {state === 'scheduled' && (
                        <span className="text-xs select-none">●</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap justify-center items-center gap-4 text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-white border border-gray-300 rounded"></div>
          <span className="text-gray-600">Available</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-red-100 border border-red-300 rounded"></div>
          <span className="text-gray-600">Blocked</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded"></div>
          <span className="text-gray-600">Scheduled</span>
        </div>
        <div className="text-gray-500 text-xs">
          Click or drag to block/unblock times
        </div>
      </div>
    </div>
  );
}

