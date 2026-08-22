import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { loadRazorpayScript } from '@/utils/paymentIntegration';
import { escapeHtml } from '@/utils/sanitization';
import {
  Shield, Loader2, PauseCircle, PlayCircle, XCircle, Receipt, Printer, RefreshCw, CalendarClock,
} from 'lucide-react';

interface Props {
  adminId?: string;
  monthlyAmount: number;
  shopName?: string;
}

const money = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (v?: string | null) => (v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export const SubscriptionBilling: React.FC<Props> = ({ adminId, monthlyAmount, shopName }) => {
  const [mandate, setMandate] = useState<any>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [cadence, setCadence] = useState<'monthly' | 'annual'>('monthly');
  const [startDate, setStartDate] = useState<string>('');

  const load = useCallback(async () => {
    if (!adminId) return setLoading(false);
    setLoading(true);
    const [{ data: m }, { data: t }] = await Promise.all([
      (supabase as any).from('payment_mandates').select('*').eq('admin_id', adminId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      (supabase as any).from('payment_transactions')
        .select('id, created_at, amount, status, provider, method, utr, invoice_no, environment, purpose, paid_at, provider_payment_id')
        .eq('admin_id', adminId).eq('purpose', 'subscription')
        .order('created_at', { ascending: false }).limit(30),
    ]);
    setMandate(m || null);
    if (m?.cadence) setCadence(m.cadence);
    setTxns(t || []);
    setLoading(false);
  }, [adminId]);

  useEffect(() => { load(); }, [load]);

  const enableAutoPay = async () => {
    try {
      setBusy('enable');
      const { data, error } = await supabase.functions.invoke('payments-create-mandate', {
        body: {
          amount: cadence === 'annual' ? monthlyAmount * 12 : monthlyAmount,
          cadence,
          interval_months: 1,
          total_count: cadence === 'annual' ? 5 : 12,
          start_at: startDate ? Math.floor(new Date(`${startDate}T10:00:00`).getTime() / 1000) : undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const url = (data as any)?.short_url;
      if ((data as any)?.already_active) { toast({ title: 'Auto-pay is already active' }); return load(); }
      if (!url) throw new Error('Auto-pay setup link could not be created.');
      window.location.href = url;
    } catch (e: any) {
      toast({ title: 'Auto-pay setup failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const control = async (action: 'pause' | 'resume' | 'cancel') => {
    if (!mandate) return;
    if (action === 'cancel' && !confirm('Cancel auto-pay? You will need to pay manually each cycle.')) return;
    try {
      setBusy(action);
      const { data, error } = await supabase.functions.invoke('payments-mandate-control', {
        body: { mandate_id: mandate.id, action },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: `Auto-pay ${action}d` });
      load();
    } catch (e: any) {
      toast({ title: 'Action failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const printReceipt = (t: any) => {
    const w = window.open('', '_blank', 'width=420,height=640');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${escapeHtml(t.invoice_no) || 'Receipt'}</title>
      <style>body{font-family:ui-sans-serif,system-ui,sans-serif;padding:24px;color:#111}
      h1{font-size:18px;margin:0 0 4px}small{color:#666}
      table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
      td{padding:6px 0;border-bottom:1px solid #eee}td:last-child{text-align:right;font-weight:600}
      .total{font-size:18px;font-weight:700;margin-top:16px;display:flex;justify-content:space-between}
      .tag{display:inline-block;padding:2px 8px;border-radius:999px;background:#ecfdf5;color:#047857;font-size:11px}
      </style></head><body>
      <h1>Subscription Receipt</h1>
      <small>${escapeHtml(shopName || '')}</small><br/><span class="tag">${escapeHtml((t.status || '').toUpperCase())}${t.environment === 'test' ? ' • TEST' : ''}</span>
      <table>
        <tr><td>Invoice No</td><td>${escapeHtml(t.invoice_no) || '—'}</td></tr>
        <tr><td>Date</td><td>${escapeHtml(dt(t.paid_at || t.created_at))}</td></tr>
        <tr><td>Gateway</td><td>${escapeHtml(t.provider) || '—'}</td></tr>
        <tr><td>Method</td><td>${escapeHtml(t.method) || '—'}</td></tr>
        <tr><td>Reference</td><td>${escapeHtml(t.utr || t.provider_payment_id || t.id)}</td></tr>
      </table>
      <div class="total"><span>Total Paid</span><span>${money(t.amount)}</span></div>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const statusVariant = (s: string) =>
    s === 'paid' ? 'secondary' : s === 'failed' || s === 'expired' ? 'destructive' : 'outline';

  return (
    <div className="space-y-4">
      {/* Auto-pay */}
      <Card className="rounded-2xl shadow-lg border-2 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-primary" />
            Auto-Pay (UPI Autopay)
            {mandate && <Badge variant={mandate.status === 'active' ? 'secondary' : 'outline'}>{mandate.status}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="h-20 rounded-xl bg-muted animate-pulse" />
          ) : mandate && ['active', 'pending', 'created', 'paused'].includes(mandate.status) ? (
            <>
              <div className="rounded-xl border p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Cadence</span><span className="font-medium capitalize">{mandate.cadence || 'monthly'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium">{money(mandate.amount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Next charge</span><span className="font-medium">{dt(mandate.next_charge_at)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Last charged</span><span className="font-medium">{dt(mandate.last_charged_at)}</span></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {mandate.status === 'paused' ? (
                  <Button variant="outline" className="gap-1.5" disabled={busy !== null} onClick={() => control('resume')}>
                    {busy === 'resume' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />} Resume
                  </Button>
                ) : (
                  <Button variant="outline" className="gap-1.5" disabled={busy !== null} onClick={() => control('pause')}>
                    {busy === 'pause' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />} Pause
                  </Button>
                )}
                <Button variant="outline" className="gap-1.5" disabled={busy !== null} onClick={() => control('cancel')}>
                  {busy === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Cancel
                </Button>
                <Button variant="ghost" className="gap-1.5" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>
              </div>
              {mandate.short_url && mandate.status !== 'active' && (
                <Button className="w-full h-11 rounded-xl" onClick={() => (window.location.href = mandate.short_url)}>
                  Complete auto-pay authorisation
                </Button>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Authorise once and your subscription renews automatically. You can pause or cancel any time.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Billing cadence</Label>
                  <Select value={cadence} onValueChange={(v) => setCadence(v as 'monthly' | 'annual')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly — {money(monthlyAmount)}</SelectItem>
                      <SelectItem value="annual">Annual — {money(monthlyAmount * 12)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> First billing date</Label>
                  <Input type="date" value={startDate} min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setStartDate(e.target.value)} />
                </div>
              </div>
              <Button className="w-full h-11 rounded-xl gap-2" disabled={busy !== null} onClick={enableAutoPay}>
                {busy === 'enable' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Enable Auto-Pay
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Receipts */}
      <Card className="rounded-2xl shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5 text-primary" /> Gateway Payments & Receipts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="h-24 rounded-xl bg-muted animate-pulse" />
          ) : txns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No online payments yet.</p>
          ) : (
            txns.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-xl border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm truncate">{t.invoice_no || 'Pending invoice'}</p>
                    <Badge variant={statusVariant(t.status) as any} className="text-[10px]">{t.status}</Badge>
                    {t.environment === 'test' && <Badge variant="outline" className="text-[10px]">TEST</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {dt(t.paid_at || t.created_at)} • {t.provider}{t.method ? ` • ${t.method}` : ''}
                  </p>
                  {t.utr && <p className="text-[11px] font-mono text-muted-foreground break-all">UTR {t.utr}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-sm">{money(t.amount)}</p>
                  {t.status === 'paid' && (
                    <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={() => printReceipt(t)}>
                      <Printer className="h-3.5 w-3.5" /> Receipt
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};
