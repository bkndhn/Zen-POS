/**
 * World-Class Flexible Subscription Duration & Pricing Engine
 */

export interface SubscriptionPlanOption {
  id: string;
  name: string;
  months: number;
  discountPercentage: number;
  badge?: string;
  popular?: boolean;
}

export const PRESET_SUBSCRIPTION_PLANS: SubscriptionPlanOption[] = [
  { id: '1_month', name: '1 Month', months: 1, discountPercentage: 0 },
  { id: '3_months', name: '3 Months', months: 3, discountPercentage: 5, badge: 'Save 5%' },
  { id: '6_months', name: '6 Months (Half-Yearly)', months: 6, discountPercentage: 10, badge: 'Save 10%' },
  { id: '12_months', name: '1 Year (Annual)', months: 12, discountPercentage: 20, badge: 'Save 20%', popular: true },
  { id: '36_months', name: '3 Years (Triennial)', months: 36, discountPercentage: 35, badge: 'Best Value • Save 35%' },
];

export function calculatePlanPricing(monthlyBasePrice: number, months: number, customDiscountPercentage?: number): {
  monthlyRate: number;
  totalAmount: number;
  savingsAmount: number;
  discountPercentage: number;
} {
  const preset = PRESET_SUBSCRIPTION_PLANS.find(p => p.months === months);
  const discountPercentage = customDiscountPercentage !== undefined ? customDiscountPercentage : (preset?.discountPercentage || (months >= 36 ? 35 : months >= 12 ? 20 : months >= 6 ? 10 : months >= 3 ? 5 : 0));
  
  const rawTotal = monthlyBasePrice * months;
  const discountAmount = Math.round(rawTotal * (discountPercentage / 100));
  const totalAmount = rawTotal - discountAmount;
  const monthlyRate = Math.round(totalAmount / months);

  return {
    monthlyRate,
    totalAmount,
    savingsAmount: discountAmount,
    discountPercentage,
  };
}

export function calculateExtendedEndDate(currentEndDateStr?: string | null, addMonths: number = 1): Date {
  const now = new Date();
  const baseDate = currentEndDateStr && new Date(currentEndDateStr) > now ? new Date(currentEndDateStr) : now;
  const newDate = new Date(baseDate);
  newDate.setMonth(newDate.getMonth() + addMonths);
  return newDate;
}

/* ------------------------------------------------------------------ */
/*  Per-admin / per-branch pack pricing overrides                      */
/* ------------------------------------------------------------------ */

export interface PackPricingOverride {
  id?: string;
  admin_id?: string;
  branch_id: string | null;
  months: number;
  /** Custom monthly rate for this pack (before discount). Null = use base price */
  price_per_month: number | null;
  discount_percentage: number;
  is_active: boolean;
}

/**
 * Pick the most specific override for a pack:
 *   branch-specific row  →  admin-wide row (branch_id null)  →  none
 */
export function findPackOverride(
  overrides: PackPricingOverride[],
  months: number,
  branchId?: string | null
): PackPricingOverride | null {
  const active = overrides.filter((o) => o.is_active && o.months === months);
  if (branchId) {
    const branchRow = active.find((o) => o.branch_id === branchId);
    if (branchRow) return branchRow;
  }
  return active.find((o) => !o.branch_id) || null;
}

/**
 * Resolve pricing for a pack, honouring an admin/branch override when present.
 */
export function resolvePackPricing(
  baseMonthlyPrice: number,
  months: number,
  overrides: PackPricingOverride[] = [],
  branchId?: string | null
): ReturnType<typeof calculatePlanPricing> & { isCustom: boolean } {
  const override = findPackOverride(overrides, months, branchId);
  const monthly = override?.price_per_month ?? baseMonthlyPrice;
  const pricing = calculatePlanPricing(monthly, months, override?.discount_percentage);
  return { ...pricing, isCustom: !!override };
}

