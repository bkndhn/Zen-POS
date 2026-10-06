import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChefHat, Loader2, RefreshCw, TrendingDown, TrendingUp, Printer, PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { toast } from 'sonner';
import FridgeExpiryBoard from '@/components/FridgeExpiryBoard';

type Slot = 'breakfast' | 'lunch' | 'snacks' | 'dinner';

const SLOTS: { key: Slot; label: string; from: number; to: number }[] = [
  { key: 'breakfast', label: 'Breakfast (7–11 AM)', from: 7, to: 11 },
  { key: 'lunch', label: 'Lunch (12–3:30 PM)', from: 11, to: 16 },
  { key: 'snacks', label: 'Snacks (4–6:30 PM)', from: 16, to: 19 },
  { key: 'dinner', label: 'Dinner (7–11 PM)', from: 19, to: 24 },
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const slotOf = (hour: number): Slot => {
  for (const s of SLOTS) if (hour >= s.from && hour < s.to) return s.key;
  return hour < 7 ? 'breakfast' : 'dinner';
};

interface Forecast {
  name: string;
  itemId: string | null;
  unit: string;
  lastWeek: number;
  avg4: number;
  projected: number;
  slots: Record<Slot, number>;
  trend: number;
}

const KitchenPrep: React.FC = () => {
  const { adminProfileId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Forecast[]>([]);
  const [batchStock, setBatchStock] = useState<Record<string, number>>({});
  const [soldToday, setSoldToday] = useState<Record<string, number>>({});
  const [multiplier, setMultiplier] = useState<number[]>([100]);
  const [shelfDays, setShelfDays] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [shopStock, setShopStock] = useState<Record<string, number | null>>({});
  const [wasteToday, setWasteToday] = useState<Record<string, number>>({});

  const { branchFilterId, operatingBranchId, readOnly } = useBranchScopedQuery(() => load());
  const [targetDow, setTargetDow] = useState<number>(new Date().getDay());

  const load = useCallback(async () => {
    if (!adminProfileId) return;
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 42);

      let billQuery = supabase
        .from('bills')
        .select('id, created_at')
        .eq('admin_id', adminProfileId)
        .eq('is_deleted', false)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(5000);

      if (branchFilterId) billQuery = billQuery.eq('branch_id', branchFilterId);
      const { data: bills, error: billErr } = await billQuery;
      if (billErr) throw billErr;
      if (!bills?.length) {
        setRows([]);
        return;
      }

      const billMeta = new Map<string, Date>();
      bills.forEach(b => billMeta.set(b.id, new Date(b.created_at)));

      const ids = bills.map(b => b.id);
      const items: { bill_id: string; item_id: string | null; quantity: number; unit: string | null; item_name_override: string | null; items: { name: string } | null }[] = [];
      for (let i = 0; i < ids.length; i += 300) {
        const { data, error } = await supabase
          .from('bill_items')
          .select('bill_id, item_id, quantity, unit, item_name_override, items(name)')
          .in('bill_id', ids.slice(i, i + 300));
        if (error) throw error;
        if (data) items.push(...(data as any));
      }

      // Group by item name, weekday bucket and slot
      const acc = new Map<string, { itemId: string | null; unit: string; weeks: number[]; slots: Record<Slot, number>; slotDays: number }>();
      const now = new Date();
      const todayKey = now.toDateString();
      const sold: Record<string, number> = {};
      const soldMeta: Record<string, { itemId: string | null; unit: string }> = {};

      for (const it of items) {
        const when = billMeta.get(it.bill_id);
        if (!when) continue;
        const name = it.item_name_override || it.items?.name || 'Unknown item';
        if (when.toDateString() === todayKey) {
          sold[name] = (sold[name] || 0) + (Number(it.quantity) || 0);
          soldMeta[name] = { itemId: it.item_id, unit: it.unit || 'pc' };
        }
        if (when.getDay() !== targetDow) continue;
        const weeksAgo = Math.floor((now.getTime() - when.getTime()) / (7 * 86400000));
        if (weeksAgo > 3) continue;
        let entry = acc.get(name);
        if (!entry) {
          entry = { itemId: it.item_id, unit: it.unit || 'pc', weeks: [0, 0, 0, 0], slots: { breakfast: 0, lunch: 0, snacks: 0, dinner: 0 }, slotDays: 0 };
          acc.set(name, entry);
        }
        entry.weeks[weeksAgo] += Number(it.quantity) || 0;
        entry.slots[slotOf(when.getHours())] += Number(it.quantity) || 0;
      }
      setSoldToday(sold);

      // Usable batch stock already in the fridge (not expired)
      const todayYmd = new Date().toISOString().slice(0, 10);
      let stockQ = supabase
        .from('item_batches')
        .select('item_id, stock_quantity')
        .eq('admin_id', adminProfileId)
        .gt('stock_quantity', 0)
        .gte('expiry_date', todayYmd)
        .limit(2000);
      if (branchFilterId) stockQ = stockQ.eq('branch_id', branchFilterId);
      const { data: batchRows } = await stockQ;
      const stockMap: Record<string, number> = {};
      (batchRows || []).forEach((b: any) => { stockMap[b.item_id] = (stockMap[b.item_id] || 0) + Number(b.stock_quantity || 0); });
      setBatchStock(stockMap);

      // Shop inventory on hand + today's wastage (from stock table)
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      let invQ = supabase.from('items').select('id, stock_quantity, unlimited_stock').eq('admin_id', adminProfileId).limit(5000);
      if (branchFilterId) invQ = invQ.eq('branch_id', branchFilterId);
      let wQ = (supabase as any).from('stock_adjustments').select('item_id, change_qty, reason').eq('admin_id', adminProfileId)
        .eq('reason', 'wastage').gte('created_at', dayStart.toISOString()).limit(5000);
      if (branchFilterId) wQ = wQ.eq('branch_id', branchFilterId);
      const [{ data: invRows }, { data: wRows }] = await Promise.all([invQ, wQ]);
      const inv: Record<string, number | null> = {};
      (invRows || []).forEach((r: any) => { inv[r.id] = r.unlimited_stock ? null : Number(r.stock_quantity || 0); });
      setShopStock(inv);
      const wm: Record<string, number> = {};
      (wRows || []).forEach((r: any) => { if (r.item_id) wm[r.item_id] = (wm[r.item_id] || 0) + Math.abs(Number(r.change_qty || 0)); });
      setWasteToday(wm);


      const mult = multiplier[0] / 100;
      const out: Forecast[] = [];
      acc.forEach((v, name) => {
        const lastWeek = v.weeks[0];
        const observed = v.weeks.filter(w => w > 0);
        const avg4 = observed.length ? observed.reduce((a, b) => a + b, 0) / observed.length : 0;
        const projected = (0.6 * lastWeek + 0.4 * avg4) * mult;
        const total = Object.values(v.slots).reduce((a, b) => a + b, 0) || 1;
        out.push({
          name,
          itemId: v.itemId,
          unit: v.unit,
          lastWeek,
          avg4: Math.round(avg4 * 10) / 10,
          projected: Math.round(projected * 10) / 10,
          slots: {
            breakfast: Math.round((v.slots.breakfast / total) * 100),
            lunch: Math.round((v.slots.lunch / total) * 100),
            snacks: Math.round((v.slots.snacks / total) * 100),
            dinner: Math.round((v.slots.dinner / total) * 100),
          },
          trend: avg4 ? Math.round(((lastWeek - avg4) / avg4) * 100) : 0,
        });
      });

      // Every item sold today gets a prep line, even without past history
      if (targetDow === now.getDay()) {
        Object.entries(sold).forEach(([name, qty]) => {
          const existing = out.find(o => o.name === name);
          if (existing) { existing.projected = Math.max(existing.projected, qty); return; }
          out.push({
            name, itemId: soldMeta[name]?.itemId ?? null, unit: soldMeta[name]?.unit || 'pc',
            lastWeek: 0, avg4: 0, projected: Math.round(qty * mult * 10) / 10,
            slots: { breakfast: 0, lunch: 0, snacks: 0, dinner: 0 }, trend: 0,
          });
        });
      }

      // Today's rate from Items (Daily Rates board)
      const itemIds = Array.from(new Set(out.map(o => o.itemId).filter(Boolean))) as string[];
      if (itemIds.length) {
        const { data: priceRows } = await supabase.from('items').select('id, price').in('id', itemIds);
        const pm: Record<string, number> = {};
        (priceRows || []).forEach((p: any) => { pm[p.id] = Number(p.price) || 0; });
        setRates(pm);
      }

      out.sort((a, b) => b.projected - a.projected);
      setRows(out);
    } catch (e: any) {
      toast.error('Could not load prep forecast', { description: e?.message });
    } finally {
      setLoading(false);
    }
  }, [adminProfileId, targetDow, multiplier, branchFilterId]);

  useEffect(() => { void load(); }, [load]);

  // Live: every new sale or price change refreshes the prep sheet
  useEffect(() => {
    if (!adminProfileId) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const bump = () => { if (t) clearTimeout(t); t = setTimeout(() => void load(), 1500); };
    const ch = supabase
      .channel(`kitchen-prep-${adminProfileId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bills', filter: `admin_id=eq.${adminProfileId}` }, bump)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'items', filter: `admin_id=eq.${adminProfileId}` }, bump)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_adjustments', filter: `admin_id=eq.${adminProfileId}` }, bump)
      .subscribe();
    return () => { if (t) clearTimeout(t); void supabase.removeChannel(ch); };
  }, [adminProfileId, load]);

  const inStock = (r: Forecast) => (r.itemId ? Math.round((batchStock[r.itemId] || 0) * 10) / 10 : 0);
  const toMake = (r: Forecast) => Math.max(0, Math.round((r.projected - inStock(r)) * 10) / 10);

  const createBatches = async () => {
    if (!adminProfileId) return;
    const todo = rows.filter(r => r.itemId && toMake(r) > 0);
    if (!todo.length) { toast.error('Nothing left to make — stock already covers the forecast'); return; }
    setSaving(true);
    try {
      const today = new Date();
      const exp = new Date(); exp.setDate(exp.getDate() + shelfDays);
      const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const tag = ymd(today).replace(/-/g, '') + '-' + String(Date.now()).slice(-4);
      const payload = todo.map((r, i) => ({
        admin_id: adminProfileId,
        branch_id: operatingBranchId ?? null,
        item_id: r.itemId as string,
        batch_number: `PREP-${tag}-${String(i + 1).padStart(3, '0')}`,
        stock_quantity: toMake(r),
        mfg_date: ymd(today),
        expiry_date: ymd(exp),
      }));
      const { error } = await supabase.from('item_batches').insert(payload as any);
      if (error) throw error;
      toast.success(`Created ${payload.length} prep batches`, { description: `Use by ${ymd(exp)}` });
      void load();
    } catch (e: any) {
      toast.error('Could not create batches', { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const fastMovers = useMemo(() => rows.slice(0, 5), [rows]);
  const slowMovers = useMemo(() => rows.filter(r => r.projected > 0).slice(-5).reverse(), [rows]);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ChefHat className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Kitchen Prep Forecaster</h1>
            <p className="text-sm text-muted-foreground">How much to prepare, based on the last 4 same weekdays</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" /> Print prep sheet
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Plan for</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {DAY_NAMES.map((d, i) => (
              <Button key={d} size="sm" variant={targetDow === i ? 'default' : 'outline'} onClick={() => setTargetDow(i)}>
                {d.slice(0, 3)}
              </Button>
            ))}
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Busy-day adjustment</span>
              <span className="font-semibold">{multiplier[0]}%</span>
            </div>
            <Slider value={multiplier} onValueChange={setMultiplier} min={60} max={140} step={5} />
            <p className="text-xs text-muted-foreground mt-1">Lower it on rainy or dull days, raise it for festivals and holidays.</p>
          </div>
        </CardContent>
      </Card>

      <FridgeExpiryBoard adminId={adminProfileId} branchId={branchFilterId} operatingBranchId={operatingBranchId} readOnly={readOnly} onChanged={() => void load()} />

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          No sales yet for {DAY_NAMES[targetDow]}. Keep billing — suggestions appear after a few weeks.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-success" /> Fast movers</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {fastMovers.map(r => (
                  <div key={r.name} className="flex justify-between"><span>{r.name}</span><span className="font-semibold">{r.projected} {r.unit}</span></div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-4 w-4 text-destructive" /> Slow movers — prepare small</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {slowMovers.map(r => (
                  <div key={r.name} className="flex justify-between"><span>{r.name}</span><span className="font-semibold">{r.projected} {r.unit}</span></div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">{DAY_NAMES[targetDow]} prep sheet</CardTitle>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Keeps for</span>
                <select className="h-8 rounded-md border border-input bg-background px-2" value={shelfDays} onChange={e => setShelfDays(Number(e.target.value))}>
                  {[0, 1, 2, 3, 5, 7].map(d => <option key={d} value={d}>{d === 0 ? 'Today only' : `${d} day${d > 1 ? 's' : ''}`}</option>)}
                </select>
                <Button size="sm" onClick={() => void createBatches()} disabled={saving || readOnly}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PackagePlus className="h-4 w-4 mr-1" />} Make batches
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-2">Item</th>
                    <th className="p-2 text-right">Forecast</th>
                    <th className="p-2 text-right">In stock</th>
                    <th className="p-2 text-right">Still to make</th>
                    <th className="p-2 text-right">Shop stock</th>
                    <th className="p-2 text-right">Wasted today</th>
                    <th className="p-2 text-right">Sold today</th>
                    <th className="p-2 text-right">Today's rate</th>
                    <th className="p-2 text-right">Last {DAY_NAMES[targetDow].slice(0, 3)}</th>
                    <th className="p-2 text-right">4-week avg</th>
                    <th className="p-2">Busiest time</th>
                    <th className="p-2 text-right">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const busiest = (Object.entries(r.slots) as [Slot, number][]).sort((a, b) => b[1] - a[1])[0];
                    const slotLabel = SLOTS.find(s => s.key === busiest[0])?.label ?? '';
                    return (
                      <tr key={r.name} className="border-t border-border">
                        <td className="p-2">{r.name}</td>
                        <td className="p-2 text-right font-semibold">{r.projected} {r.unit}</td>
                        <td className="p-2 text-right text-muted-foreground">{inStock(r)}</td>
                        <td className="p-2 text-right font-semibold text-primary">{toMake(r)}</td>
                        <td className="p-2 text-right text-muted-foreground">{r.itemId && shopStock[r.itemId] != null ? Math.round((shopStock[r.itemId] as number) * 10) / 10 : '—'}</td>
                        <td className={`p-2 text-right ${r.itemId && wasteToday[r.itemId] ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>{r.itemId ? Math.round((wasteToday[r.itemId] || 0) * 10) / 10 : 0}</td>
                        <td className="p-2 text-right text-muted-foreground">{soldToday[r.name] || 0}</td>
                        <td className="p-2 text-right">{r.itemId && rates[r.itemId] != null ? `₹${rates[r.itemId]}` : '—'}</td>
                        <td className="p-2 text-right text-muted-foreground">{r.lastWeek}</td>
                        <td className="p-2 text-right text-muted-foreground">{r.avg4}</td>
                        <td className="p-2"><Badge variant="secondary">{slotLabel.split(' (')[0]} · {busiest[1]}%</Badge></td>
                        <td className={`p-2 text-right ${r.trend >= 0 ? 'text-success' : 'text-destructive'}`}>{r.trend > 0 ? '+' : ''}{r.trend}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default KitchenPrep;
