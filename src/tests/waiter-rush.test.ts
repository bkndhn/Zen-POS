import { describe, it, expect } from 'vitest';
import { rushOf } from '@/components/reports/WaiterPerformance';

describe('rushOf (India time)', () => {
  it('9:00 IST is morning', () => expect(rushOf('2026-11-03T03:30:00Z')).toBe('morning'));
  it('13:00 IST is lunch', () => expect(rushOf('2026-11-03T07:30:00Z')).toBe('lunch'));
  it('20:00 IST is evening', () => expect(rushOf('2026-11-03T14:30:00Z')).toBe('evening'));
  it('17:00 IST is outside rushes', () => expect(rushOf('2026-11-03T11:30:00Z')).toBe('other'));
});
