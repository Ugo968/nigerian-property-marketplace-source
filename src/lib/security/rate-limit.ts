/**
 * In-memory rate-limit architecture.
 *
 * This is a foundation-phase stub. In production, swap with Upstash Redis
 * or Supabase rate-limit helper behind the same `RateLimiter` interface.
 *
 * The interface is what matters — code throughout the app should call
 * `rateLimiter.check(...)` and never care about the implementation.
 */

export interface RateLimitResult {
  ok: boolean;
  /** Number of remaining actions in the current window. */
  remaining: number;
  /** Epoch milliseconds until the window resets. */
  resetAt: number;
}

export interface RateLimiter {
  /**
   * Increment the counter for (key, action) and return whether the action
   * is still allowed.
   */
  check(input: {
    key: string;
    action: string;
    limit: number;
    windowMs: number;
  }): Promise<RateLimitResult>;
}

/**
 * Bucket = action+key → { count, expiresAt }.
 * Swept lazily on each check.
 */
type Bucket = { count: number; expiresAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Default in-memory limiter. Per-process; sufficient for a single-instance
 * Vercel serverless function. For multi-instance production, replace
 * with Redis-backed implementation.
 */
export const rateLimiter: RateLimiter = {
  async check({ key, action, limit, windowMs }) {
    const bucketKey = `${action}:${key}`;
    const now = Date.now();

    const existing = buckets.get(bucketKey);
    if (existing && existing.expiresAt > now) {
      if (existing.count >= limit) {
        return {
          ok: false,
          remaining: 0,
          resetAt: existing.expiresAt,
        };
      }
      existing.count += 1;
      return {
        ok: true,
        remaining: limit - existing.count,
        resetAt: existing.expiresAt,
      };
    }

    // New window
    const newBucket: Bucket = { count: 1, expiresAt: now + windowMs };
    buckets.set(bucketKey, newBucket);
    return { ok: true, remaining: limit - 1, resetAt: newBucket.expiresAt };
  },
};

/**
 * Standard rate-limit windows used across the app.
 * Tune by feature, not ad-hoc.
 */
export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 60 * 60 * 1000 }, // 10 / hour
  signup: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5 / hour
  passwordReset: { limit: 3, windowMs: 60 * 60 * 1000 }, // 3 / hour
  otp: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5 / hour
  application: { limit: 30, windowMs: 60 * 60 * 1000 }, // 30 / hour
  message: { limit: 60, windowMs: 60 * 60 * 1000 }, // 60 / hour
  report: { limit: 10, windowMs: 60 * 60 * 1000 }, // 10 / hour
  // Spec Section 13: rate-limit sensitive operations
  transaction_inquiry: { limit: 20, windowMs: 60 * 60 * 1000 }, // 20 / hour
  transaction_inspection: { limit: 30, windowMs: 60 * 60 * 1000 }, // 30 / hour
  transaction_offer: { limit: 30, windowMs: 60 * 60 * 1000 }, // 30 / hour
  payment_initiate: { limit: 20, windowMs: 60 * 60 * 1000 }, // 20 / hour
  payment_verify: { limit: 30, windowMs: 60 * 60 * 1000 }, // 30 / hour
  notification_mark_read: { limit: 60, windowMs: 60 * 60 * 1000 }, // 60 / hour
  admin_action: { limit: 60, windowMs: 60 * 60 * 1000 }, // 60 / hour
} as const;
