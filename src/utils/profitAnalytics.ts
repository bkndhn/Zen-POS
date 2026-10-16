// Pure profit + tender math shared by Super Admin analytics and tests.

export interface SaleLine { quantity: number; purchaseRate: number }
export interface SaleBill {
  total: number;
  paymentMode: string;
  due?: number;
  createdAt: string;
  lines: SaleLine[];
  /** Split payments, e.g. { cash: 200, upi: 150 } */
  split?: Record<string, number> | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function billCost(b: SaleBill) {
  return r2(b.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.purchaseRate) || 0), 0));
}

export function grossMarginPct(sales: number, cost: number) {
  return sales > 0 ? r2(((sales - cost) / sales) * 100) : 0;
}

/** 24 hourly buckets in local time with sales, cost, profit. */
export function hourlyProfit(bills: SaleBill[]) {
  const rows = Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${hour}:00`, sales: 0, cost: 0, profit: 0, bills: 0 }));
  for (const b of bills) {
    const h = new Date(b.createdAt).getHours();
    const c = billCost(b);
    rows[h].sales = r2(rows[h].sales + b.total);
    rows[h].cost = r2(rows[h].cost + c);
    rows[h].profit = r2(rows[h].sales - rows[h].cost);
    rows[h].bills += 1;
  }
  return rows;
}

export const TENDERS = ['cash', 'upi', 'card', 'other'] as const;

/** Amount collected per tender; split bills are spread across their parts; dues listed separately. */
export function tenderMatrix(bills: SaleBill[], cashExpenses = 0) {
  const m: Record<string, { count: number; amount: number }> = {};
  TENDERS.forEach((t) => (m[t] = { count: 0, amount: 0 }));
  let due = 0;
  for (const b of bills) {
    const parts = b.split && Object.keys(b.split).length ? b.split : { [b.paymentMode]: b.total - (b.due || 0) };
    for (const [k, v] of Object.entries(parts)) {
      const key = (TENDERS as readonly string[]).includes(k) ? k : 'other';
      m[key].count += 1;
      m[key].amount = r2(m[key].amount + (Number(v) || 0));
    }
    due = r2(due + (b.due || 0));
  }
  const collected = r2(TENDERS.reduce((s, t) => s + m[t].amount, 0));
  return { rows: m, due, collected, cashInDrawer: r2(m.cash.amount - cashExpenses) };
}
