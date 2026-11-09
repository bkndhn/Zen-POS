import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Banknote, Smartphone, BookOpen, Wallet, Lock } from 'lucide-react';
import { computeRegisterTotals, type RegisterTotals } from '@/utils/cashRegister';

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function CashRegisterLive() {
  const [totals, setTotals] = useState<RegisterTotals | null>(null);
  const [closedShifts, setClosedShifts] = useState(0);
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    // RLS scopes both queries to the signed-in shop.
    const { data } = await supabase
      .from('bills')
      .select('total_amount, payment_mode, payment_details')
      .eq('date', today)
      .or('is_deleted.is.null,is_deleted.eq.false');
    setTotals(computeRegisterTotals(data || []));
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { count } = await (supabase as any)
      .from('shifts').select('id', { count: 'exact', head: true })
      .not('closed_at', 'is', null).gte('closed_at', start.toISOString());
    setClosedShifts(count || 0);
    setUpdated(new Date());
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel('cash-register-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => load())
      .subscribe();
    const poll = setInterval(load, 30000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [load]);

  const tiles = [
    { label: 'Cash', value: totals?.cash ?? 0, icon: Banknote, cls: 'text-success' },
    { label: 'UPI', value: totals?.upi ?? 0, icon: Smartphone, cls: 'text-primary' },
    { label: 'Credit (Khata)', value: totals?.credit ?? 0, icon: BookOpen, cls: 'text-warning' },
    { label: 'Total', value: totals?.total ?? 0, icon: Wallet, cls: 'text-foreground' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success animate-pulse" /> Live · today</span>
        <span>{updated ? `Updated ${format(updated, 'HH:mm:ss')}` : 'Loading…'}</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map(t => (
          <Card key={t.label}><CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><t.icon className="h-4 w-4" />{t.label}</div>
            {totals ? <p className={`mt-1 text-2xl font-bold ${t.cls}`}>{inr(t.value)}</p>
              : <div className="mt-2 h-7 w-24 rounded bg-muted animate-pulse" />}
          </CardContent></Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>{totals?.count ?? 0} bills today</span>
        {(totals?.other ?? 0) > 0 && <span>Card/other: {inr(totals!.other)}</span>}
        <span className="flex items-center gap-1"><Lock className="h-3.5 w-3.5" />{closedShifts} shifts closed today</span>
      </div>
    </div>
  );
}
