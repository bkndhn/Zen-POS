import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface BillLite { id: string; created_by?: string | null; created_at?: string; total_amount?: number; is_deleted?: boolean; table_no?: string | null }
interface OrderRow { bill_id: string | null; created_at: string | null; prep_started_at: string | null; status: string }

const mins = (a?: string | null, b?: string | null) => {
  if (!a || !b) return null;
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 60000;
  return d >= 0 && d < 24 * 60 ? d : null;
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const fmt = (m: number | null) => (m == null ? '—' : `${Math.round(m)} min`);

export type RushKey = 'all' | 'morning' | 'lunch' | 'evening' | 'other';
const RUSHES: { key: RushKey; label: string }[] = [
  { key: 'all', label: 'All day' },
  { key: 'morning', label: 'Morning 6–11' },
  { key: 'lunch', label: 'Lunch 11–16' },
  { key: 'evening', label: 'Evening 18–23' },
];
/** Which rush a timestamp falls in, using India time. */
export const rushOf = (iso: string): RushKey => {
  const h = Number(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false })) % 24;
  if (h >= 6 && h < 11) return 'morning';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 18 && h < 23) return 'evening';
  return 'other';
};

/** Waiter-wise speed: orders taken, time from order to serve-start and to bill. */
export default function WaiterPerformance({ bills }: { bills: BillLite[] }) {
  const active = useMemo(() => bills.filter(b => !b.is_deleted), [bills]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const ids = active.map(b => b.id);
    if (!ids.length) { setOrders([]); return; }
    let cancelled = false;
    (async () => {
      const out: OrderRow[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase.from('table_orders')
          .select('bill_id,created_at,prep_started_at,status').in('bill_id', ids.slice(i, i + 200));
        if (data) out.push(...(data as OrderRow[]));
      }
      if (!cancelled) setOrders(out);
    })();
    return () => { cancelled = true; };
  }, [active]);

  useEffect(() => {
    const uids = [...new Set(active.map(b => b.created_by).filter(Boolean))] as string[];
    if (!uids.length) return;
    supabase.from('profiles').select('user_id,name').in('user_id', uids).then(({ data }) => {
      const m: Record<string, string> = {};
      (data || []).forEach((p: any) => { m[p.user_id] = p.name; });
      setNames(m);
    });
  }, [active]);

  const [rush, setRush] = useState<RushKey>('all');

  const rows = useMemo(() => {
    const byBill = new Map<string, OrderRow[]>();
    orders.forEach(o => { if (o.bill_id) byBill.set(o.bill_id, [...(byBill.get(o.bill_id) || []), o]); });
    const map = new Map<string, { date: string; staff: string; bills: number; tableBills: number; orders: number; toPrep: number[]; toBill: number[] }>();
    active.forEach(b => {
      if (!b.created_at) return;
      const slot = rushOf(b.created_at);
      if (rush !== 'all' && slot !== rush) return;
      const staff = b.created_by || 'unknown';
      const date = new Date(b.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const k = `${date}|${staff}`;
      const r = map.get(k) || { date, staff, bills: 0, tableBills: 0, orders: 0, toPrep: [], toBill: [] };
      r.bills++;
      const os = byBill.get(b.id) || [];
      if (os.length) {
        r.tableBills++;
        r.orders += os.length;
        const first = os.map(o => o.created_at).filter(Boolean).sort()[0];
        const t = mins(first, b.created_at); if (t != null) r.toBill.push(t);
        os.forEach(o => { const p = mins(o.created_at, o.prep_started_at); if (p != null) r.toPrep.push(p); });
      }
      map.set(k, r);
    });
    return [...map.entries()].map(([id, r]) => ({ id, ...r, avgPrep: avg(r.toPrep), avgBill: avg(r.toBill) }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.orders - a.orders || b.bills - a.bills);
  }, [active, orders, rush]);

  if (!active.length) return null;
  return (
    <div className="space-y-2 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">⏱️ Waiter speed (orders taken → served → billed)</h3>
        <div className="flex gap-1">
          {RUSHES.map(o => (
            <button key={o.key} type="button" onClick={() => setRush(o.key)}
              className={`px-2.5 py-1 rounded-full text-xs border ${rush === o.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground'}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {!rows.length && <p className="text-xs text-muted-foreground">No bills in this rush for the chosen dates.</p>}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="bg-muted/50 border-b">
            <th className="text-left px-3 py-2 text-xs font-medium">Shift date</th>
            <th className="text-left px-3 py-2 text-xs font-medium">Staff</th>
            <th className="text-right px-3 py-2 text-xs font-medium">Bills</th>
            <th className="text-right px-3 py-2 text-xs font-medium">Table orders</th>
            <th className="text-right px-3 py-2 text-xs font-medium">Order → kitchen start</th>
            <th className="text-right px-3 py-2 text-xs font-medium">Order → bill</th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                <td className="px-3 py-2">{r.staff === 'unknown' ? 'Unknown' : names[r.staff] || r.staff.slice(0, 8)}</td>
                <td className="px-3 py-2 text-right">{r.bills}</td>
                <td className="px-3 py-2 text-right">{r.orders}</td>
                <td className="px-3 py-2 text-right">{fmt(r.avgPrep)}</td>
                <td className={`px-3 py-2 text-right font-semibold ${r.avgBill != null && r.avgBill > 60 ? 'text-destructive' : 'text-primary'}`}>{fmt(r.avgBill)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">Times are averages for table orders linked to each person's bills. Over 60 min is shown in red.</p>
    </div>
  );
}
