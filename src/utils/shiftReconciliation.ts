// Pure cash-drawer math for shift close (blind count + Z-Report).

export const DENOMINATIONS = [
  { key: 'n500', label: '₹500', value: 500 },
  { key: 'n200', label: '₹200', value: 200 },
  { key: 'n100', label: '₹100', value: 100 },
  { key: 'n50', label: '₹50', value: 50 },
  { key: 'n20', label: '₹20', value: 20 },
  { key: 'n10', label: '₹10', value: 10 },
  { key: 'coins', label: 'Coins (₹ total)', value: 1 },
] as const;

export type DenominationCounts = Partial<Record<(typeof DENOMINATIONS)[number]['key'], number>>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Total cash from note counts; coins are entered as a rupee total. */
export function denominationTotal(counts: DenominationCounts): number {
  return round2(
    DENOMINATIONS.reduce((sum, d) => sum + Math.max(0, Number(counts[d.key]) || 0) * d.value, 0),
  );
}

/** Expected drawer cash = opening float + cash sales + paid-in − cash paid out (expenses). */
export function expectedDrawerCash(p: { openingCash: number; cashSales: number; paidIn?: number; cashPaidOut?: number }): number {
  return round2((p.openingCash || 0) + (p.cashSales || 0) + (p.paidIn || 0) - (p.cashPaidOut || 0));
}

export function cashVariance(actual: number, expected: number): number {
  return round2(actual - expected);
}

/** A reason is required whenever the drawer is over or short by more than the tolerance. */
export function varianceNeedsReason(variance: number, tolerance = 0): boolean {
  return Math.abs(variance) > tolerance;
}

export function varianceLabel(variance: number): 'Exact' | 'Over' | 'Short' {
  if (variance === 0) return 'Exact';
  return variance > 0 ? 'Over' : 'Short';
}

/** Net profit after food cost and the day's expenses. */
export function netProfit(p: { sales: number; foodCost: number; expenses: number }) {
  const gross = round2(p.sales - p.foodCost);
  const net = round2(gross - p.expenses);
  return { gross, net, netMarginPct: p.sales > 0 ? round2((net / p.sales) * 100) : 0 };
}
