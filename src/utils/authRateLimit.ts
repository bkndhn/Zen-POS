/**
 * Server-backed rate limiting for sensitive auth actions.
 *
 * Every sensitive action (sign in, sign up, password reset, staff creation)
 * calls a SECURITY DEFINER database function that counts attempts per
 * identifier inside a rolling window. A small in-memory limiter runs first so
 * obvious bursts never even reach the network, and acts as the fallback when
 * the device is offline.
 */

export type AuthRateLimitAction =
  | 'sign_in'
  | 'sign_up'
  | 'password_reset'
  | 'user_create'
  | 'pin_unlock';

export interface RateLimitPolicy {
  maxAttempts: number;
  windowSeconds: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
  source: 'local' | 'server' | 'fallback';
}

export const AUTH_RATE_LIMITS: Record<AuthRateLimitAction, RateLimitPolicy> = {
  sign_in: { maxAttempts: 8, windowSeconds: 300 },
  sign_up: { maxAttempts: 5, windowSeconds: 900 },
  password_reset: { maxAttempts: 4, windowSeconds: 900 },
  user_create: { maxAttempts: 20, windowSeconds: 900 },
  pin_unlock: { maxAttempts: 10, windowSeconds: 300 },
};

/** Pure, dependency-free sliding-window counter used locally and in tests. */
export class LocalRateLimiter {
  private buckets = new Map<string, { hits: number; windowStart: number }>();

  check(key: string, policy: RateLimitPolicy, now: number = Date.now()): RateLimitDecision {
    const windowMs = policy.windowSeconds * 1000;
    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart >= windowMs) {
      this.buckets.set(key, { hits: 1, windowStart: now });
      return {
        allowed: true,
        retryAfterSeconds: 0,
        remaining: policy.maxAttempts - 1,
        source: 'local',
      };
    }

    bucket.hits += 1;

    if (bucket.hits > policy.maxAttempts) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket.windowStart + windowMs - now) / 1000),
      );
      return { allowed: false, retryAfterSeconds, remaining: 0, source: 'local' };
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: policy.maxAttempts - bucket.hits,
      source: 'local',
    };
  }

  clear(key: string): void {
    this.buckets.delete(key);
  }

  reset(): void {
    this.buckets.clear();
  }
}

const localLimiter = new LocalRateLimiter();

export const normalizeIdentifier = (identifier?: string | null): string =>
  (identifier ?? '').toString().trim().toLowerCase().slice(0, 160) || 'anonymous';

const bucketKey = (action: AuthRateLimitAction, identifier: string) =>
  `${action}:${identifier}`;

/** Human readable wait time, e.g. "45 seconds" or "3 minutes". */
export const formatRetryAfter = (seconds: number): string => {
  const safe = Math.max(1, Math.ceil(seconds || 0));
  if (safe < 90) return `${safe} second${safe === 1 ? '' : 's'}`;
  const minutes = Math.ceil(safe / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
};

const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * Returns a decision for a sensitive auth action. The local limiter is
 * consulted first (instant), then the shared server counter.
 */
export const enforceAuthRateLimit = async (
  action: AuthRateLimitAction,
  identifier?: string | null,
  override?: Partial<RateLimitPolicy>,
): Promise<RateLimitDecision> => {
  const policy: RateLimitPolicy = { ...AUTH_RATE_LIMITS[action], ...(override || {}) };
  const id = normalizeIdentifier(identifier);

  const local = localLimiter.check(bucketKey(action, id), policy);
  if (!local.allowed) return local;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ...local, source: 'fallback' };
  }

  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const result = await withTimeout(
      (supabase as any).rpc('check_auth_rate_limit', {
        p_action: action,
        p_identifier: id,
        p_max_attempts: policy.maxAttempts,
        p_window_seconds: policy.windowSeconds,
      }),
      4000,
    );

    if (!result || result.error || !result.data) {
      return { ...local, source: 'fallback' };
    }

    const data = result.data as {
      allowed?: boolean;
      remaining?: number;
      retry_after_seconds?: number;
    };

    return {
      allowed: data.allowed !== false,
      retryAfterSeconds: Number(data.retry_after_seconds ?? 0),
      remaining: Number(data.remaining ?? 0),
      source: 'server',
    };
  } catch {
    return { ...local, source: 'fallback' };
  }
};

/** Call after a successful action so a user is not punished for past typos. */
export const clearAuthRateLimit = async (
  action: AuthRateLimitAction,
  identifier?: string | null,
): Promise<void> => {
  const id = normalizeIdentifier(identifier);
  localLimiter.clear(bucketKey(action, id));
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    await withTimeout(
      (supabase as any).rpc('clear_auth_rate_limit', { p_action: action, p_identifier: id }),
      3000,
    );
  } catch {
    /* non-fatal */
  }
};

export const __resetLocalRateLimiter = () => localLimiter.reset();
