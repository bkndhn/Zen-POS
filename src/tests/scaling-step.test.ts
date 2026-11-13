import { describe, it, expect } from 'vitest';
import { runBounded, shouldRetryPush } from '../../supabase/functions/_shared/pushBatch';
import { counterConnectionState } from '../utils/counterConnection';

describe('push batch delivery', () => {
  it('processes every notification once without exceeding worker capacity', async () => {
    let active = 0;
    let peak = 0;
    const done: number[] = [];
    await runBounded(Array.from({ length: 50 }, (_, i) => i), 5, async item => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      done.push(item);
      active--;
    });
    expect(peak).toBe(5);
    expect(new Set(done).size).toBe(50);
    expect(done.length).toBe(50);
  });
  it('retries throttling and temporary provider failures', () => {
    expect(shouldRetryPush(429, {})).toBe(true);
    expect(shouldRetryPush(503, {})).toBe(true);
    expect(shouldRetryPush(200, { failureCount: 1, errors: [{ status: 503 }] })).toBe(true);
  });
  it('does not resend partial successes or invalid tokens', () => {
    expect(shouldRetryPush(200, { successCount: 1, failureCount: 1, errors: [{ status: 503 }] })).toBe(false);
    expect(shouldRetryPush(404, {})).toBe(false);
  });
});
describe('counter freshness', () => {
  it('does not label stale or invalid timestamps connected', () => {
    const now = Date.parse('2026-11-13T10:00:00Z');
    expect(counterConnectionState('2026-11-13T09:58:00Z', now)).toBe('connected');
    expect(counterConnectionState('2026-11-13T09:54:59Z', now)).toBe('not-seen');
    expect(counterConnectionState('invalid', now)).toBe('not-seen');
  });
});