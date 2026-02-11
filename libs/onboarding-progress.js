"use client";

const STORAGE_KEY = 'onboardingProgress';

/**
 * Get the maximum slide number the user has unlocked
 * @returns {number} The highest slide number unlocked (default: 1)
 */
export function getMaxUnlockedSlide() {
  if (typeof window === 'undefined') return 1;
  
  try {
    const progress = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return progress.maxSlide || 1;
  } catch (error) {
    console.error('Error reading onboarding progress:', error);
    return 1;
  }
}

/**
 * Update the maximum unlocked slide if the new slide is higher
 * @param {number} slideNumber - The slide number to unlock
 */
export function unlockSlide(slideNumber) {
  if (typeof window === 'undefined') return;
  
  try {
    const currentMax = getMaxUnlockedSlide();
    if (slideNumber > currentMax) {
      const progress = { maxSlide: slideNumber };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
      // Persist to DB so paid users can resume on another device (fire-and-forget)
      fetch('/api/onboarding/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ maxUnlockedSlide: slideNumber }),
      }).catch(() => {});
    }
  } catch (error) {
    console.error('Error updating onboarding progress:', error);
  }
}

/**
 * Check if a slide number is accessible
 * @param {number} slideNumber - The slide number to check
 * @returns {boolean} True if the slide is accessible
 */
export function canAccessSlide(slideNumber) {
  return slideNumber <= getMaxUnlockedSlide();
}

/**
 * Get the slide number from a path (e.g., "/onboarding/slide-5" -> 5)
 * @param {string} pathname - The pathname to parse
 * @returns {number|null} The slide number or null if not a valid slide path
 */
export function getSlideNumberFromPath(pathname) {
  const match = pathname.match(/\/onboarding\/slide-(\d+(?:-\d+)?)$/);
  if (!match) return null;
  
  // Handle slide-16-5 case
  if (match[1] === '16-5') {
    return 16.5; // Special case for slide-16-5
  }
  
  return parseInt(match[1], 10);
}

/**
 * Get the highest allowed slide path
 * @returns {string} The path to redirect to
 */
export function getHighestAllowedSlidePath() {
  const maxSlide = getMaxUnlockedSlide();
  
  // Handle special case for slide-16-5
  if (maxSlide === 16.5) {
    return '/onboarding/slide-16-5';
  }
  
  return `/onboarding/slide-${maxSlide}`;
}
