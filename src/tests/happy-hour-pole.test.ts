import { describe, it, expect } from 'vitest';
import { getEffectiveItemPrice, isRuleActive, type HappyHourRule } from '@/utils/happyHourUtils';
import { isValidPoleToken, getPolePairingToken } from '@/utils/polePairing';
import { isPreRushNow } from '@/components/PrinterHealthBanner';

const rule: HappyHourRule = { id: '1', name: 'Tea Time', start_time: '15:00', end_time: '18:00', discount_percent: 20, days_of_week: [0, 1, 2, 3, 4, 5, 6] };
const at = (h: number, m = 0, day = 3) => { const d = new Date(2026, 9, 25 + day, h, m); return d; }; // Oct 25 2026 is a Sunday

describe('happy hour pricing', () => {
  it('drops a ₹100 item to ₹80 during a 20% happy hour', () => {
    const r = getEffectiveItemPrice(100, [rule], at(16));
    expect(r.price).toBe(80);
    expect(r.originalPrice).toBe(100);
    expect(r.isHappyHour).toBe(true);
  });
  it('charges full price outside the window', () => {
    expect(getEffectiveItemPrice(100, [rule], at(18, 0)).price).toBe(100);
  });
  it('respects selected days (Saturday-only rule is off on Wednesday)', () => {
    expect(isRuleActive({ ...rule, days_of_week: [6] }, at(16, 0, 3))).toBe(false);
  });
  it('ignores switched-off rules', () => {
    expect(isRuleActive({ ...rule, is_active: false }, at(16))).toBe(false);
  });
});

describe('customer display pairing', () => {
  it('uses a 32-char random code, never a shop id', () => {
    const t = getPolePairingToken();
    expect(isValidPoleToken(t)).toBe(true);
    expect(isValidPoleToken('3fa85f64-5717-4562-b3fc-2c963f66afa6')).toBe(false);
  });
});

describe('pre-rush printer window', () => {
  it('is on at 11:45 and 19:00, off at 15:00', () => {
    expect(isPreRushNow(at(11, 45))).toBe(true);
    expect(isPreRushNow(at(19, 0))).toBe(true);
    expect(isPreRushNow(at(15, 0))).toBe(false);
  });
});
