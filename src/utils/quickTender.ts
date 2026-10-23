/** One-tap cart discount presets. */
export const DISCOUNT_PRESETS = [
  { label: '5%', type: 'percentage' as const, value: 5 },
  { label: '10%', type: 'percentage' as const, value: 10 },
  { label: '₹50', type: 'flat' as const, value: 50 },
];

/** Discount in rupees, never more than the subtotal. */
export function discountAmountFor(subtotal: number, type: 'flat' | 'percentage', value: number): number {
  const raw = type === 'percentage' ? (subtotal * Math.min(100, Math.max(0, value))) / 100 : Math.max(0, value);
  return Math.round(Math.min(subtotal, raw) * 100) / 100;
}

/** Exact amount plus the next ₹50/₹100/₹500/₹2000 note values above it (unique, ascending). */
export function tenderSuggestions(due: number): number[] {
  if (!(due > 0)) return [];
  const exact = Math.ceil(due);
  const ups = [50, 100, 500, 2000].map(n => Math.ceil(exact / n) * n);
  return Array.from(new Set([exact, ...ups])).sort((a, b) => a - b);
}
