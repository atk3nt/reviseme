import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Initialize Redis client
// If credentials are missing, rate limiting will be disabled (dev mode)
let redis = null;
let isRateLimitEnabled = false;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  isRateLimitEnabled = true;
  console.log('[RATE LIMIT] ✅ Rate limiting enabled');
} else {
  console.warn('[RATE LIMIT] ⚠️  Rate limiting disabled - Upstash credentials not found');
}

// Rate limit configurations for different operations
// Using sliding window algorithm for smooth rate limiting

/**
 * Plan generation rate limit
 * Limit: 5 requests per hour per user
 * Use case: Expensive operation, should be limited to prevent abuse
 */
export const planGenerationLimit = isRateLimitEnabled
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      analytics: true,
      prefix: "ratelimit:plan-generate",
    })
  : null;

/**
 * Stats endpoint rate limit
 * Limit: 60 requests per hour per user
 * Use case: Can be slow with large datasets, moderate limiting
 */
export const statsLimit = isRateLimitEnabled
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 h"),
      analytics: true,
      prefix: "ratelimit:stats",
    })
  : null;

/**
 * General API rate limit
 * Limit: 100 requests per hour per user
 * Use case: For frequent operations like rating topics, re-rating blocks
 */
export const generalLimit = isRateLimitEnabled
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, "1 h"),
      analytics: true,
      prefix: "ratelimit:general",
    })
  : null;

/**
 * Strict rate limit for sensitive operations
 * Limit: 10 requests per hour per user
 * Use case: For operations that should be rarely used (e.g., support requests)
 */
export const strictLimit = isRateLimitEnabled
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      analytics: true,
      prefix: "ratelimit:strict",
    })
  : null;

/**
 * Daily rate limit for very sensitive operations
 * Limit: 5 requests per day per user
 * Use case: Refund requests, critical operations that should be very rare
 */
export const dailyLimit = isRateLimitEnabled
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 d"),
      analytics: true,
      prefix: "ratelimit:daily",
    })
  : null;

/**
 * Moderate rate limit for frequent operations
 * Limit: 30 requests per hour per user
 * Use case: Onboarding, availability updates
 */
export const moderateLimit = isRateLimitEnabled
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1 h"),
      analytics: true,
      prefix: "ratelimit:moderate",
    })
  : null;

/**
 * Relaxed rate limit for checkout operations
 * Limit: 20 requests per hour per user
 * Use case: Stripe checkout (users might retry during payment)
 */
export const checkoutLimit = isRateLimitEnabled
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "1 h"),
      analytics: true,
      prefix: "ratelimit:checkout",
    })
  : null;

/**
 * Medium rate limit for block operations
 * Limit: 50 requests per hour per user
 * Use case: Skipping blocks, less frequent than marking done/missed
 */
export const mediumLimit = isRateLimitEnabled
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(50, "1 h"),
      analytics: true,
      prefix: "ratelimit:medium",
    })
  : null;

/**
 * Helper function to check rate limit and return appropriate response
 * @param {Object} limiter - The rate limiter instance
 * @param {string} identifier - User ID or IP address
 * @returns {Object} { success: boolean, response: NextResponse | null }
 */
export async function checkRateLimit(limiter, identifier) {
  // If rate limiting is disabled (dev mode), always allow
  if (!limiter || !isRateLimitEnabled) {
    return { success: true, response: null };
  }

  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);

    if (!success) {
      const resetDate = new Date(reset);
      const waitMinutes = Math.ceil((resetDate - new Date()) / 1000 / 60);

      return {
        success: false,
        response: {
          error: `Too many requests. Please try again in ${waitMinutes} minute${waitMinutes !== 1 ? 's' : ''}.`,
          limit,
          remaining: 0,
          reset: resetDate.toISOString(),
          retryAfter: waitMinutes * 60, // seconds
        },
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': reset.toString(),
          'Retry-After': (waitMinutes * 60).toString(),
        },
      };
    }

    return {
      success: true,
      response: null,
      headers: {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': reset.toString(),
      },
    };
  } catch (error) {
    console.error('[RATE LIMIT] Error checking rate limit:', error);
    // On error, allow the request (fail open)
    return { success: true, response: null };
  }
}

/**
 * Get rate limit status without consuming a request
 * Useful for displaying remaining requests to users
 */
export async function getRateLimitStatus(limiter, identifier) {
  if (!limiter || !isRateLimitEnabled) {
    return { enabled: false };
  }

  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);
    return {
      enabled: true,
      limit,
      remaining: Math.max(0, remaining),
      reset: new Date(reset).toISOString(),
    };
  } catch (error) {
    console.error('[RATE LIMIT] Error getting rate limit status:', error);
    return { enabled: false };
  }
}

export { isRateLimitEnabled };
