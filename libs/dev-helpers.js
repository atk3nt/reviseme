/**
 * Development helper utilities for testing time-based features
 * These functions allow overriding the current date/time in development mode only
 */

/**
 * Get the effective date for the application.
 * In development mode, this can be overridden via localStorage for testing.
 * In production, always returns the real current date.
 * 
 * @returns {Date} The effective date (real or overridden)
 */
export function getEffectiveDate() {
  // Server-side rendering: always use real time
  if (typeof window === 'undefined') {
    return new Date();
  }
  
  // Check if we're in development mode
  const isDev = 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.includes('localhost') ||
    process.env.NODE_ENV === 'development';
  
  // Only allow override in development
  if (!isDev) {
    return new Date();
  }
  
  // Check for time override in localStorage
  const override = localStorage.getItem('devTimeOverride');
  
  if (override) {
    try {
      const overriddenDate = new Date(override);
      // Validate it's a valid date
      if (!isNaN(overriddenDate.getTime())) {
        return overriddenDate;
      }
    } catch (e) {
      console.error('Invalid devTimeOverride value:', override);
    }
  }
  
  // Default: return real time
  return new Date();
}

/**
 * Check if time is currently overridden
 * @returns {boolean}
 */
export function isTimeOverridden() {
  if (typeof window === 'undefined') return false;
  
  const isDev = 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.includes('localhost') ||
    process.env.NODE_ENV === 'development';
  
  return isDev && !!localStorage.getItem('devTimeOverride');
}

/**
 * Clear time override
 */
export function clearTimeOverride() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('devTimeOverride');
  }
}

/**
 * Set time override
 * @param {string} isoString - ISO 8601 date string (e.g., "2024-01-07T22:30:00")
 */
export function setTimeOverride(isoString) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('devTimeOverride', isoString);
  }
}

/**
 * Format a date for display in the dev tools
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string (e.g., "Sunday, January 7, 2024 at 10:30 PM")
 */
export function formatDevDate(date) {
  const options = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  };
  return date.toLocaleString('en-US', options);
}

/**
 * Check if we're in development mode
 * @returns {boolean}
 */
export function isDevelopmentMode() {
  if (typeof window === 'undefined') {
    return process.env.NODE_ENV === 'development';
  }
  
  const hostname = window.location.hostname;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.includes('localhost') ||
    process.env.NODE_ENV === 'development'
  );
}

/**
 * Enable dev mode - allows using mock data instead of real database
 * This is useful for testing without affecting real data
 */
export function enableDevMode() {
  if (typeof window !== 'undefined' && isDevelopmentMode()) {
    localStorage.setItem('devModeEnabled', 'true');
  }
}

/**
 * Disable dev mode - use real database data
 */
export function disableDevMode() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('devModeEnabled');
  }
}

/**
 * Check if dev mode is enabled
 * @returns {boolean}
 */
export function isDevModeEnabled() {
  if (typeof window === 'undefined') return false;
  return isDevelopmentMode() && localStorage.getItem('devModeEnabled') === 'true';
}

/**
 * Parse "HH:MM" to minutes from midnight.
 * @param {string} timeStr
 * @returns {number}
 */
export function parseTimeToMinutes(timeStr = '00:00') {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':').map((p) => Number(p) || 0);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

/**
 * Returns true if there is at least one valid slot left today after the current time.
 * Uses time preferences: first slot must be at next :00 or :30; if that is before latest, we have slots.
 * Used by slide-22 and plan page so we never send startToday=true when there are no slots today.
 * @param {Date} now - Effective "now" (e.g. getEffectiveDate())
 * @param {Object} timePreferences - { weekdayEarliest, weekdayLatest, weekendEarliest?, weekendLatest?, useSameWeekendTimes? }
 * @returns {boolean}
 */
export function hasSlotsToday(now, timePreferences) {
  if (!timePreferences || typeof timePreferences !== 'object') return false;
  const dayIndex = (now.getDay() + 6) % 7; // Monday=0, Sunday=6
  const isWeekend = dayIndex >= 5;
  let earliestStr, latestStr;
  if (isWeekend && timePreferences.useSameWeekendTimes === false) {
    earliestStr = timePreferences.weekendEarliest || timePreferences.weekdayEarliest;
    latestStr = timePreferences.weekendLatest || timePreferences.weekdayLatest;
  } else {
    earliestStr = timePreferences.weekdayEarliest;
    latestStr = timePreferences.weekdayLatest;
  }
  if (!earliestStr || !latestStr) return false;
  const latestMinutes = parseTimeToMinutes(latestStr);
  const minutesFromMidnight = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const roundedCutoff = Math.ceil(minutesFromMidnight / 30) * 30; // next :00 or :30
  return roundedCutoff < latestMinutes;
}
