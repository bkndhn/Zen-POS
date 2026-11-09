// Pure totals for the live Cash Register view.
export interface RegisterBill {
  total_amount: number | null;
  payment_mode: string | null;
  payment_details: unknown;
}
export interface RegisterTotals { cash: number; upi: number; credit: number; other: number; total: number; count: number }

const bucket = (key: string): keyof Omit<RegisterTotals, 'total' | 'count'> => {
  const k = key.toLowerCase();
  if (k.includes('cash')) return 'cash';
  if (k.includes('upi') || k.includes('gpay') || k.includes('phonepe') || k.includes('paytm')) return 'upi';
  if (k.includes('credit') || k.includes('khata') || k.includes('due')) return 'credit';
  return 'other';
};

export function computeRegisterTotals(bills: RegisterBill[]): RegisterTotals {
  const t: RegisterTotals = { cash: 0, upi: 0, credit: 0, other: 0, total: 0, count: 0 };
  for (const b of bills) {
    const amt = Number(b.total_amount) || 0;
    t.total += amt;
    t.count += 1;
    const d = b.payment_details as Record<string, unknown> | null;
    if (d && typeof d === 'object' && !Array.isArray(d) && Object.keys(d).length > 0) {
      for (const [k, v] of Object.entries(d)) t[bucket(k)] += Number(v) || 0;
    } else {
      t[bucket(b.payment_mode || 'other')] += amt;
    }
  }
  return t;
}
