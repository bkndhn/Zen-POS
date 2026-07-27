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
