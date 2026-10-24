import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { pacing } from '@/utils/salesPacing';

/** Today's sales so far vs. yesterday up to the same clock time (owner's own shop only). */
export const SalesPacingCard: React.FC<{ adminId: string }> = ({ adminId }) => {
  const [data, setData] = useState<ReturnType<typeof pacing> | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const now = new Date();
      const today = format(now, 'yyyy-MM-dd');
      const yest = format(subDays(now, 1), 'yyyy-MM-dd');
      const { data: rows } = await supabase.from('bills')
        .select('date, total_amount, created_at, is_deleted')
        .eq('admin_id', adminId).in('date', [today, yest])
        .or('is_deleted.is.null,is_deleted.eq.false')
        .limit(5000);
      if (!alive) return;
      let merged: any[] = rows || [];
      try {
        const { offlineManager } = await import('@/utils/offlineManager');
        if (offlineManager?.mergeOfflineBills) {
          const result = await offlineManager.mergeOfflineBills(merged, adminId, null);
          merged = Array.isArray(result) ? result : merged;
        }
      } catch { /* offline not available */ }
      // Filter to only today+yesterday, exclude deleted
      const validRows = merged.filter((r: any) => !r.is_deleted && (r.date === today || r.date === yest));
      setData(pacing(validRows as any, today, yest, now));
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [adminId]);

  if (!data) return <div className="h-24 rounded-xl bg-muted animate-pulse" />;
  const up = data.changePct >= 0;
  return (
    <Card className="animate-fade-in">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Activity className="h-4 w-4 text-primary" /> Live sales pace</div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-2xl font-bold text-foreground">₹{Math.round(data.todaySales).toLocaleString('en-IN')}</div>
            <div className="text-xs text-muted-foreground">{data.todayBills} bills · avg ₹{Math.round(data.avgTicket)} · ₹{Math.round(data.perHour)}/hr</div>
          </div>
          <div className={`flex items-center gap-1 text-sm font-semibold ${up ? 'text-success' : 'text-destructive'}`}>
            {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {data.hasYesterday ? `${up ? '+' : ''}${data.changePct.toFixed(0)}% vs yesterday` : 'No sales yesterday by now'}
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, data.progressPct)}%` }} />
        </div>
        <div className="mt-1 text-xs text-muted-foreground">Yesterday by this time: ₹{Math.round(data.yesterdaySoFar).toLocaleString('en-IN')} · full day ₹{Math.round(data.yesterdayTotal).toLocaleString('en-IN')}</div>
      </CardContent>
    </Card>
  );
};
