/**
 * Happy Hour price resolver for ZenPOS.
 * Matches active happy_hour rules by current time and applies automatic discounts.
 *
 * happy_hours table schema:
 *   id, admin_id, name, start_time (HH:MM), end_time (HH:MM), discount_percent (number)
 */

export interface HappyHourRule {
  id: string;
  name: string;
  start_time: string; // "HH:MM" or "HH:MM:SS"
  end_time: string;   // "HH:MM" or "HH:MM:SS"
  discount_percent: number;
}

export interface EffectivePrice {
  price: number;
  originalPrice: number;
  isHappyHour: boolean;
  ruleName: string;
  discountPercent: number;
}

/** Returns "HH:MM" from a Date */
const toHHMM = (d: Date): string => {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

/** Normalises "HH:MM:SS" → "HH:MM" */
const normalize = (t: string): string => (t ?? '').slice(0, 5);

/**
 * Returns true if the rule is active at the given time.
 * Handles overnight ranges e.g. 22:00–02:00.
 */
export const isRuleActive = (rule: HappyHourRule, now: Date = new Date()): boolean => {
  const current = toHHMM(now);
  const start   = normalize(rule.start_time);
  const end     = normalize(rule.end_time);
  if (!start || !end) return false;
  if (start <= end) {
    return current >= start && current < end;
  }
  // Overnight span
  return current >= start || current < end;
};

/**
 * Given an item's base price and the list of active happy_hour rules,
 * returns the effective price (discounted if a rule is active now).
 * Rules apply to ALL items (no per-item / per-category filter in current schema).
 */
export const getEffectiveItemPrice = (
  itemPrice: number,
  happyHourRules: HappyHourRule[],
  now: Date = new Date(),
): EffectivePrice => {
  for (const rule of happyHourRules) {
    if (isRuleActive(rule, now)) {
      const discounted = Math.round(itemPrice * (1 - rule.discount_percent / 100) * 100) / 100;
      return {
        price: discounted,
        originalPrice: itemPrice,
        isHappyHour: true,
        ruleName: rule.name,
        discountPercent: rule.discount_percent,
      };
    }
  }
  return {
    price: itemPrice,
    originalPrice: itemPrice,
    isHappyHour: false,
    ruleName: '',
    discountPercent: 0,
  };
};

/** Returns the first currently-active rule, or null. */
export const getActiveHappyHourRule = (
  rules: HappyHourRule[],
  now: Date = new Date(),
): HappyHourRule | null => rules.find(r => isRuleActive(r, now)) ?? null;
