import { describe, expect, it } from 'vitest';
import {
  AUTH_RATE_LIMITS,
  LocalRateLimiter,
  formatRetryAfter,
  normalizeIdentifier,
} from '@/utils/authRateLimit';

describe('auth rate limiting', () => {
  it('allows attempts up to the configured maximum', () => {
    const limiter = new LocalRateLimiter();
    const policy = { maxAttempts: 3, windowSeconds: 60 };
    const now = 1_000_000;

    expect(limiter.check('sign_in:a@b.com', policy, now).allowed).toBe(true);
    expect(limiter.check('sign_in:a@b.com', policy, now + 10).allowed).toBe(true);
    expect(limiter.check('sign_in:a@b.com', policy, now + 20).allowed).toBe(true);
  });

  it('blocks the attempt after the maximum and reports a wait time', () => {
    const limiter = new LocalRateLimiter();
    const policy = { maxAttempts: 2, windowSeconds: 60 };
    const now = 1_000_000;

    limiter.check('sign_in:a@b.com', policy, now);
    limiter.check('sign_in:a@b.com', policy, now + 5);
    const blocked = limiter.check('sign_in:a@b.com', policy, now + 10);

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('starts a fresh window once the old one expires', () => {
    const limiter = new LocalRateLimiter();
    const policy = { maxAttempts: 1, windowSeconds: 30 };
    const now = 1_000_000;

    expect(limiter.check('reset:a@b.com', policy, now).allowed).toBe(true);
    expect(limiter.check('reset:a@b.com', policy, now + 1_000).allowed).toBe(false);
    expect(limiter.check('reset:a@b.com', policy, now + 31_000).allowed).toBe(true);
  });

  it('keeps separate counters per identifier', () => {
    const limiter = new LocalRateLimiter();
    const policy = { maxAttempts: 1, windowSeconds: 60 };
    const now = 1_000_000;

    expect(limiter.check('sign_in:a@b.com', policy, now).allowed).toBe(true);
    expect(limiter.check('sign_in:c@d.com', policy, now).allowed).toBe(true);
    expect(limiter.check('sign_in:a@b.com', policy, now).allowed).toBe(false);
  });

  it('clears a counter after a successful action', () => {
    const limiter = new LocalRateLimiter();
    const policy = { maxAttempts: 1, windowSeconds: 60 };
    const now = 1_000_000;

    limiter.check('sign_in:a@b.com', policy, now);
    limiter.clear('sign_in:a@b.com');
    expect(limiter.check('sign_in:a@b.com', policy, now).allowed).toBe(true);
  });

  it('normalizes identifiers so casing and spacing cannot bypass the limit', () => {
    expect(normalizeIdentifier('  Owner@Shop.COM ')).toBe('owner@shop.com');
    expect(normalizeIdentifier(null)).toBe('anonymous');
    expect(normalizeIdentifier('x'.repeat(400)).length).toBe(160);
  });

  it('formats the wait time for humans', () => {
    expect(formatRetryAfter(1)).toBe('1 second');
    expect(formatRetryAfter(45)).toBe('45 seconds');
    expect(formatRetryAfter(300)).toBe('5 minutes');
  });

  it('protects every sensitive action with a sane policy', () => {
    for (const [action, policy] of Object.entries(AUTH_RATE_LIMITS)) {
      expect(policy.maxAttempts, action).toBeGreaterThan(0);
      expect(policy.maxAttempts, action).toBeLessThanOrEqual(50);
      expect(policy.windowSeconds, action).toBeGreaterThanOrEqual(60);
    }
    expect(Object.keys(AUTH_RATE_LIMITS)).toEqual(
      expect.arrayContaining(['sign_in', 'sign_up', 'password_reset']),
    );
  });
});
