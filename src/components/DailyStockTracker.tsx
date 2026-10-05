import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { toStoredQuantity2 } from '@/utils/timeUtils';

export interface TrackerItem {
  id: string;
  name: string;
  category: string | null;
  branch_id: string;
  stock_quantity: number | null;
  minimum_stock_alert: number | null;
  unlimited_stock: boolean | null;
}

interface Props {
  items: TrackerItem[];
  adminId: string | null;
  branchId: string | null; // null = all branches (read only)
  onUpdated: () => void;
}

/** Opening (morning) stock = current on-hand + sold today. Pure, exported for tests. */
export const openingStock = (current: number, soldToday: number) => toStoredQuantity2(current + soldToday);

const DailyStockTracker: React.FC<Props> = ({ items, adminId, branchId, onUpdated }) => {
  const [sold, setSold] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');

  const loadSold = useCallback(async () => {
    if (!adminId) return;
    setLoading(true);
    try {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      let bq = supabase.from('bills').select('id').eq('admin_id', adminId).eq('is_deleted', false)
        .gte('created_at', start.toISOString()).limit(5000);
      if (branchId) bq = bq.eq('branch_id', branchId);
      const { data: bills, error } = await bq;
      if (error) throw error;
      const ids = (bills || []).map(b => b.id);
      const map: Record<string, number> = {};
      for (let i = 0; i < ids.length; i += 300) {
        const { data, error: e2 } = await supabase.from('bill_items').select('item_id, quantity').in('bill_id', ids.slice(i, i + 300));
        if (e2) throw e2;
        (data || []).forEach((r: any) => { if (r.item_id) map[r.item_id] = (map[r.item_id] || 0) + Number(r.quantity || 0); });
      }
      setSold(map);
    } catch (e: any) {
      toast({ title: 'Could not load today’s sales', description: e?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [adminId, branchId]);

  useEffect(() => { void loadSold(); }, [loadSold]);

  useEffect(() => {
    if (!adminId) return;
    const ch = supabase.channel(`stock-tracker-${adminId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bills', filter: `admin_id=eq.${adminId}` }, () => { void loadSold(); onUpdated(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [adminId, loadSold, onUpdated]);

  const rows = useMemo(() => items
    .filter(i => !i.unlimited_stock && (!branchId || i.branch_id === branchId))
    .filter(i => !q || i.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [items, branchId, q]);

  const dirty = Object.keys(drafts).filter(id => drafts[id] !== '' && Number.isFinite(Number(drafts[id])));

  // Setting opening stock → on-hand = opening − sold today
  const saveOpening = async () => {
    setSaving(true);
    try {
      for (const id of dirty) {
        const opening = Number(drafts[id]);
        if (opening < 0) throw new Error('Opening stock cannot be negative');
        const onHand = toStoredQuantity2(Math.max(0, opening - (sold[id] || 0)));
        const { error } = await supabase.from('items').update({ stock_quantity: onHand }).eq('id', id);
        if (error) throw error;
      }
      toast({ title: `${dirty.length} opening stock saved` });
      setDrafts({});
      onUpdated();
    } catch (e: any) {
      toast({ title: 'Could not save stock', description: e?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const readOnly = !branchId;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-9 w-56" placeholder="Search item" value={q} onChange={e => setQ(e.target.value)} />
        <Button size="sm" variant="outline" onClick={() => void loadSold()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />} Refresh
        </Button>
        <div className="flex-1" />
        {!readOnly && (
          <Button size="sm" disabled={!dirty.length || saving} onClick={() => void saveOpening()}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save opening stock ({dirty.length})
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {readOnly ? 'Pick a single branch above to set opening stock.' : 'Type the morning opening stock — on-hand is worked out as opening minus today’s sales. Updates live with each sale.'}
      </p>
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Opening</TableHead>
              <TableHead className="text-right">Sold today</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No stock-tracked items</TableCell></TableRow>
            )}
            {rows.map(it => {
              const cur = Number(it.stock_quantity || 0);
              const s = sold[it.id] || 0;
              const low = it.minimum_stock_alert != null && cur <= Number(it.minimum_stock_alert);
              return (
                <TableRow key={it.id}>
                  <TableCell>
                    <div className="font-medium">{it.name}</div>
                    <div className="text-xs text-muted-foreground">{it.category || 'Other'}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    {readOnly ? openingStock(cur, s) : (
                      <Input type="number" inputMode="decimal" className="h-8 w-24 ml-auto text-right"
                        value={drafts[it.id] ?? String(openingStock(cur, s))}
                        onChange={e => setDrafts(d => ({ ...d, [it.id]: e.target.value }))} />
                    )}
                  </TableCell>
                  <TableCell className="text-right">{toStoredQuantity2(s)}</TableCell>
                  <TableCell className="text-right font-semibold">{toStoredQuantity2(cur)}</TableCell>
                  <TableCell>
                    {cur <= 0 ? <Badge variant="destructive">Out</Badge> : low ? <Badge variant="destructive">Low</Badge> : <Badge variant="secondary">OK</Badge>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default DailyStockTracker;
