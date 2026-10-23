import { describe, it, expect } from 'vitest';
import { pacing } from '@/utils/salesPacing';

describe('sales pacing', () => {
  it('compares today with yesterday only up to the same time', () => {
    const now = new Date(2026, 9, 23, 12, 0);
    const r = pacing([
      { date: '2026-10-23', total_amount: 300, created_at: new Date(2026, 9, 23, 10).toISOString() },
      { date: '2026-10-22', total_amount: 200, created_at: new Date(2026, 9, 22, 11).toISOString() },
      { date: '2026-10-22', total_amount: 800, created_at: new Date(2026, 9, 22, 19).toISOString() },
    ], '2026-10-23', '2026-10-22', now);
    expect(r.yesterdaySoFar).toBe(200);
    expect(r.yesterdayTotal).toBe(1000);
    expect(r.changePct).toBe(50);
    expect(r.perHour).toBe(25);
  });
});
