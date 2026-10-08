import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Clock, TrendingUp, Users, Zap } from 'lucide-react';
import {
  DAY_NAMES, HOUR_LABELS, buildDayHourMatrix, getHistoricalBaseline,
  getTodayActual, findPeakWindows, getLiveBusynessLabel, computeDayparts, DAYPARTS
} from '@/utils/popularTimesUtils';

interface Props {
  adminId: string;
  branchFilterId: string | null;
}

const NUM_WEEKS = 8;
// Only display business hours 7 AM - 11 PM (indices 7-23)
const DISPLAY_HOURS = Array.from({ length: 17 }, (_, i) => i + 7);

export const PopularTimesWidget: React.FC<Props> = ({ adminId, branchFilterId }) => {
  const today = new Date().getDay();
  const [selectedDay, setSelectedDay] = useState(today);
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderTypeFilter, setOrderTypeFilter] = useState<'all' | 'dine_in' | 'parcel' | 'online'>('all');

  useEffect(() => {
    if (!adminId) return;
    const fetch = async () => {
      setLoading(true);
      const eightWeeksAgo = new Date();
      eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
      let q = supabase
        .from('bills')
        .select('created_at, total_amount, order_type, customer_id, customer_phone')
        .eq('admin_id', adminId)
        .eq('is_deleted', false)
        .gte('created_at', eightWeeksAgo.toISOString());
      if (branchFilterId) q = q.eq('branch_id', branchFilterId);
      const { data } = await q;
      let merged = data || [];
      try {
        const { offlineManager } = await import('@/utils/offlineManager');
        merged = offlineManager.mergeOfflineBills ? offlineManager.mergeOfflineBills(merged) : merged;
      } catch { /* offline not available */ }
      setBills(merged);
      setLoading(false);
    };
    fetch();
  }, [adminId, branchFilterId]);

  const filteredBills = useMemo(() => {
    if (orderTypeFilter === 'all') return bills;
    return bills.filter(b => {
      const ot = (b.order_type || '').toLowerCase();
      if (orderTypeFilter === 'dine_in') return ot === 'dine_in' || ot === 'dine-in' || ot === '';
      if (orderTypeFilter === 'parcel') return ot === 'parcel' || ot === 'takeaway';
      if (orderTypeFilter === 'online') return ot === 'delivery' || ot === 'online';
      return true;
    });
  }, [bills, orderTypeFilter]);

  const matrix = useMemo(() => buildDayHourMatrix(filteredBills), [filteredBills]);
  const baseline = useMemo(() => getHistoricalBaseline(matrix, selectedDay, NUM_WEEKS), [matrix, selectedDay]);
  const todayActual = useMemo(() => getTodayActual(filteredBills), [filteredBills]);
  const peakWindows = useMemo(() => findPeakWindows(baseline), [baseline]);
  const liveBusyness = useMemo(() => getLiveBusynessLabel(todayActual, baseline), [todayActual, baseline]);
  const dayparts = useMemo(() => computeDayparts(filteredBills), [filteredBills]);

  const chartData = useMemo(() => DISPLAY_HOURS.map(h => ({
    hour: HOUR_LABELS[h],
    historical: baseline[h].count,
    today: selectedDay === new Date().getDay() ? todayActual[h].count : 0,
  })), [baseline, todayActual, selectedDay]);

  const maxHistorical = Math.max(...chartData.map(d => d.historical), 1);

  const isLive = selectedDay === today;
  const liveColor = liveBusyness.includes('busy as it gets') ? 'bg-destructive' :
    liveBusyness.includes('Less busy') ? 'bg-muted-foreground' : 'bg-primary';

  if (loading) return (
    <Card><CardContent className="flex items-center justify-center h-48">
      <div className="text-muted-foreground text-sm animate-pulse">Loading popular times…</div>
    </CardContent></Card>
  );

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Popular Times
          </CardTitle>
          {isLive && (
            <Badge className={`${liveColor} text-primary-foreground text-xs gap-1 animate-pulse`}>
              <Zap className="w-3 h-3" /> {liveBusyness}
            </Badge>
          )}
        </div>

        {/* Day Selector */}
        <div className="flex gap-1 flex-wrap pt-1">
          {DAY_NAMES.map((name, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedDay(idx)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedDay === idx
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              } ${idx === today ? 'ring-1 ring-primary ring-offset-1' : ''}`}
            >
              {name}
            </button>
          ))}
        </div>

        {/* Order type filter */}
        <div className="flex gap-1 flex-wrap">
          {(['all', 'dine_in', 'parcel', 'online'] as const).map(f => (
            <button
              key={f}
              onClick={() => setOrderTypeFilter(f)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                orderTypeFilter === f ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'all' ? 'All Channels' : f === 'dine_in' ? 'Dine-In' : f === 'parcel' ? 'Takeaway' : 'Delivery'}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Bar Chart */}
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={chartData} barGap={1} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
            <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
            <YAxis tick={false} />
            <Tooltip
              formatter={(val: number, name: string) => [val + ' bills', name === 'historical' ? 'Typical' : 'Today']}
              contentStyle={{ fontSize: 11, border: 'none', borderRadius: 8 }}
            />
            {/* Historical baseline (muted background bars) */}
            <Bar dataKey="historical" radius={[2,2,0,0]} maxBarSize={18}>
              {chartData.map((_, i) => (
                <Cell key={i} fill="hsl(var(--muted-foreground) / 0.25)" />
              ))}
            </Bar>
            {/* Today's actual (primary vibrant) */}
            {isLive && (
              <Bar dataKey="today" radius={[3,3,0,0]} maxBarSize={18}>
                {chartData.map((entry, i) => {
                  const currentHour = new Date().getHours();
                  const hourIdx = DISPLAY_HOURS[i];
                  const isPast = hourIdx <= currentHour;
                  return <Cell key={i} fill={isPast ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.15)'} />;
                })}
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>

        {/* Peak Windows */}
        {peakWindows.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <span className="text-foreground font-medium">Peak Rush: </span>
            {peakWindows.map((w, i) => (
              <span key={i}>{i > 0 ? ' & ' : ''}{HOUR_LABELS[w.start]} – {HOUR_LABELS[Math.min(w.end + 1, 23)]}</span>
            ))}
          </div>
        )}

        {/* Daypart pills */}
        <div className="grid grid-cols-2 gap-2">
          {dayparts.filter(dp => dp.count > 0).map(dp => (
            <div key={dp.label} className="bg-muted/40 rounded-lg px-3 py-2 space-y-0.5">
              <div className="text-xs font-medium">{dp.emoji} {dp.label}</div>
              <div className="text-sm font-bold">₹{dp.revenue.toLocaleString('en-IN')}</div>
              <div className="text-[10px] text-muted-foreground">{dp.count} bills · AOV ₹{dp.aov}</div>
            </div>
          ))}
          {dayparts.every(dp => dp.count === 0) && (
            <div className="col-span-2 text-xs text-muted-foreground text-center py-2">No bills today yet</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PopularTimesWidget;
