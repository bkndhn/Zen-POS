import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { Loader2, TrendingUp } from 'lucide-react';
import { grossMarginPct, hourlyProfit, tenderMatrix, TENDERS, type SaleBill } from '@/utils/profitAnalytics';

interface Client { id: string; name: string }
const today = () => new Date().toISOString().slice(0, 10);
const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const OwnerProfitAnalytics: React.FC<{ adminId: string }> = ({ adminId }) => {
  const clientId = adminId;
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [loading, setLoading] = useState(false);
  const [bills, setBills] = useState<SaleBill[]>([]);
  const [expenses, setExpenses] = useState({ total: 0, cash: 0 });
  const [error, setError] = useState('');


  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    setLoading(true); setError('');
    (async () => {
      try {
        const { data: b, error: be } = await supabase
          .from('bills')
          .select('id,total_amount,payment_mode,due_amount,payment_details,created_at,bill_items(quantity,items(purchase_rate))')
          .eq('admin_id', clientId).gte('date', from).lte('date', to)
          .or('is_deleted.is.null,is_deleted.eq.false').limit(5000);
        if (be) throw be;
        const { data: e } = await supabase.from('expenses').select('amount,payment_mode')
          .eq('admin_id', clientId).gte('date', from).lte('date', to).limit(5000);
        if (!alive) return;
        setBills((b || []).map((r: any) => {
          const pd = r.payment_details && typeof r.payment_details === 'object' ? r.payment_details : null;
          const src = pd?.split && typeof pd.split === 'object' ? pd.split : pd; const split = src && Object.keys(src).some((k) => ['cash','upi','card','other'].includes(k)) ? src : null;
          return {
            total: Number(r.total_amount) || 0, paymentMode: r.payment_mode, due: Number(r.due_amount) || 0,
            createdAt: r.created_at, split,
            lines: (r.bill_items || []).map((l: any) => ({ quantity: l.quantity, purchaseRate: l.items?.purchase_rate || 0 })),
          };
        }));
        const ex = e || [];
        setExpenses({
          total: ex.reduce((s: number, x: any) => s + Number(x.amount || 0), 0),
          cash: ex.filter((x: any) => !x.payment_mode || x.payment_mode.toLowerCase() === 'cash').reduce((s: number, x: any) => s + Number(x.amount || 0), 0),
        });
      } catch (err: any) {
        if (alive) { setError(err?.message || 'Could not load sales'); setBills([]); }
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [clientId, from, to]);

  const hourly = useMemo(() => hourlyProfit(bills).filter((h) => h.bills > 0), [bills]);
  const sales = hourly.reduce((s, h) => s + h.sales, 0);
  const cost = hourly.reduce((s, h) => s + h.cost, 0);
  const tenders = useMemo(() => tenderMatrix(bills, expenses.cash), [bills, expenses.cash]);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="w-4 h-4 text-primary" /> Profit & Tender Reconciliation</CardTitle>
        <CardDescription className="text-xs">Hourly profit, gross margin and payment-type totals per client shop.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><Label className="text-xs">Client</Label>
          </div>
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" /></div>
        </div>

        {loading ? <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div> : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                ['Sales', inr(sales)], ['Food cost', inr(cost)], ['Gross margin', `${grossMarginPct(sales, cost)}%`],
                ['Expenses', inr(expenses.total)], ['Net profit', inr(sales - cost - expenses.total)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border bg-muted/30 p-3"><p className="text-[11px] text-muted-foreground">{k}</p><p className="font-bold">{v}</p></div>
              ))}
            </div>

            <div className="h-64">
              {hourly.length === 0 ? <p className="text-sm text-muted-foreground py-10 text-center">No sales in this period.</p> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourly}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} />
                    <Tooltip formatter={(v: number) => inr(v)} /><Legend />
                    <Bar dataKey="sales" name="Sales" fill="hsl(var(--primary))" />
                    <Bar dataKey="profit" name="Profit" fill="hsl(var(--success, 142 71% 45%))" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="py-2">Payment type</th><th>Payments</th><th className="text-right">Collected</th></tr></thead>
                <tbody>
                  {TENDERS.map((t) => (
                    <tr key={t} className="border-b"><td className="py-2 uppercase font-medium">{t}</td><td>{tenders.rows[t].count}</td><td className="text-right">{inr(tenders.rows[t].amount)}</td></tr>
                  ))}
                  <tr className="border-b"><td className="py-2 font-medium">Unpaid (Khata)</td><td /><td className="text-right">{inr(tenders.due)}</td></tr>
                  <tr className="font-bold"><td className="py-2">Total collected</td><td /><td className="text-right">{inr(tenders.collected)}</td></tr>
                  <tr className="text-muted-foreground"><td className="py-2">Cash after cash expenses</td><td /><td className="text-right">{inr(tenders.cashInDrawer)}</td></tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
