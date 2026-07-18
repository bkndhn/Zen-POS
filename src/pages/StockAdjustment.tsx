import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Sliders, Plus, Minus, Search, History } from 'lucide-react';
import { formatStoredQuantity, getShortUnit, trim2 } from '@/utils/timeUtils';

interface ItemRow {
  id: string;
  name: string;
  category: string | null;
  branch_id: string;
  stock_quantity: number | null;
  unit: string | null;
  inventory_unit?: string | null;
  selling_unit?: string | null;
  unlimited_stock: boolean | null;
}

interface AdjustmentRow {
  id: string;
  item_id: string;
  branch_id: string;
  change_qty: number;
  reason: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

const REASONS = [
  { value: 'stock_in', label: 'Stock In / Received' },
  { value: 'stock_out', label: 'Stock Out / Consumed' },
  { value: 'wastage', label: 'Wastage / Spoilage' },
  { value: 'damage', label: 'Damaged / Broken' },
  { value: 'recount', label: 'Physical Recount' },
  { value: 'correction', label: 'Correction' },
  { value: 'other', label: 'Other' },
];

const StockAdjustment: React.FC = () => {
  const { profile } = useAuth();
  const { branchFilterId, operatingBranchId, readOnly } = useBranchScopedQuery(() => fetchAll());
  const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;

  const [items, setItems] = useState<ItemRow[]>([]);
  const [history, setHistory] = useState<AdjustmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  // Form state
  const [itemId, setItemId] = useState<string>('');
  const [direction, setDirection] = useState<'increase' | 'decrease'>('increase');
  const [qty, setQty] = useState<string>('');
  const [entryUnit, setEntryUnit] = useState<string>(''); // unit user is typing in (may differ from item's stored unit)
  const [reason, setReason] = useState<string>('recount');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    if (!adminId) return;
    setLoading(true);
    try {
      let itemsQ: any = supabase.from('items')
        .select('id, name, category, branch_id, stock_quantity, unit, inventory_unit, selling_unit, unlimited_stock')
        .eq('admin_id', adminId)
        .eq('is_active', true);
      if (branchFilterId) itemsQ = itemsQ.eq('branch_id', branchFilterId);
      const { data: itemsData } = await itemsQ.order('name');

      let histQ: any = (supabase as any).from('stock_adjustments')
        .select('id, item_id, branch_id, change_qty, reason, notes, created_at, created_by')
        .eq('admin_id', adminId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (branchFilterId) histQ = histQ.eq('branch_id', branchFilterId);
      const { data: histData } = await histQ;

      setItems((itemsData || []) as ItemRow[]);
      setHistory((histData || []) as AdjustmentRow[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll();   }, [adminId]);

  const filteredItems = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(i => i.name.toLowerCase().includes(s) || (i.category || '').toLowerCase().includes(s));
  }, [items, q]);

  const selectedItem = items.find(i => i.id === itemId);
  const itemNameMap = useMemo(() => new Map(items.map(i => [i.id, i.name])), [items]);

  // Compute unit options for entry (kg ↔ g, L ↔ ml)
  const getInventoryUnit = (item?: ItemRow | null) => item?.inventory_unit || item?.unit || 'pc';
  const itemShortUnit = getShortUnit(getInventoryUnit(selectedItem));
  const entryUnitOptions = useMemo<string[]>(() => {
    if (!selectedItem) return [];
    if (itemShortUnit === 'kg' || itemShortUnit === 'g') return ['kg', 'g'];
    if (itemShortUnit === 'L' || itemShortUnit === 'ml') return ['L', 'ml'];
    return [itemShortUnit];
  }, [selectedItem, itemShortUnit]);

  // Reset entry unit whenever the selected item changes
  useEffect(() => {
    if (selectedItem) setEntryUnit(itemShortUnit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // Convert the number the user typed (in entryUnit) into the item's stored unit
  const convertQty = (n: number): number => {
    if (!selectedItem) return n;
    if (entryUnit === itemShortUnit) return n;
    if (entryUnit === 'g' && itemShortUnit === 'kg') return n / 1000;
    if (entryUnit === 'kg' && itemShortUnit === 'g') return n * 1000;
    if (entryUnit === 'ml' && itemShortUnit === 'L') return n / 1000;
    if (entryUnit === 'L' && itemShortUnit === 'ml') return n * 1000;
    return n;
  };


  const submit = async () => {
    if (readOnly) {
      toast({ title: 'All Branches view is read-only', description: 'Select a specific branch to make adjustments.', variant: 'destructive' });
      return;
    }
    if (!selectedItem) {
      toast({ title: 'Select an item', variant: 'destructive' }); return;
    }
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
      toast({ title: 'Enter a valid quantity', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      const inInvUnit = convertQty(n);
      const change = direction === 'increase' ? inInvUnit : -inInvUnit;
      const { data, error } = await (supabase as any).rpc('apply_stock_adjustment', {
        p_item_id: selectedItem.id,
        p_branch_id: selectedItem.branch_id,
        p_change_qty: change,
        p_reason: reason,
        p_notes: notes || null,
      });
      if (error) throw error;
      const newStock = (data as any)?.new_stock;
      toast({
        title: 'Stock adjusted',
        description: `${selectedItem.name}: ${direction === 'increase' ? '+' : '−'}${trim2(n)} ${entryUnit} → on-hand ${newStock != null ? formatStoredQuantity(Number(newStock), getInventoryUnit(selectedItem)) : ''}`,
      });
      setQty(''); setNotes('');
      fetchAll();
      window.dispatchEvent(new CustomEvent('items-updated'));
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message || 'Could not adjust stock', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-24">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <Sliders className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Stock Adjustment</h1>
            <p className="text-xs text-muted-foreground">Record increases/decreases and correct on-hand quantities.</p>
          </div>
        </div>

        {readOnly && (
          <div className="text-xs rounded-md bg-warning/10 text-warning border border-warning/20 px-3 py-2">
            You're viewing all branches. Switch to a specific branch to record adjustments.
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">New adjustment</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Search item</Label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search by name or category" value={q} onChange={e => setQ(e.target.value)} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Item</Label>
                <Select value={itemId} onValueChange={setItemId}>
                  <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {filteredItems.map(i => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name} {i.unlimited_stock ? '(∞)' : `· on-hand ${formatStoredQuantity(Number(i.stock_quantity ?? 0), getInventoryUnit(i))}`}
                      </SelectItem>
                    ))}
                    {filteredItems.length === 0 && <div className="p-3 text-xs text-muted-foreground">No items</div>}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Reason</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Direction</Label>
                <div className="flex gap-2 mt-1">
                  <Button type="button" variant={direction === 'increase' ? 'default' : 'outline'} className="flex-1" onClick={() => setDirection('increase')}>
                    <Plus className="w-4 h-4 mr-1" /> Increase
                  </Button>
                  <Button type="button" variant={direction === 'decrease' ? 'default' : 'outline'} className="flex-1" onClick={() => setDirection('decrease')}>
                    <Minus className="w-4 h-4 mr-1" /> Decrease
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-xs">Quantity {selectedItem ? `(stored as ${itemShortUnit})` : ''}</Label>
                <div className="flex gap-2">
                  <Input className="flex-1" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" />
                  {entryUnitOptions.length > 1 ? (
                    <Select value={entryUnit} onValueChange={setEntryUnit}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {entryUnitOptions.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center px-3 border rounded-md text-sm text-muted-foreground min-w-[64px] justify-center">
                      {entryUnit || itemShortUnit}
                    </div>
                  )}
                </div>
                {selectedItem && entryUnit && entryUnit !== itemShortUnit && qty && Number(qty) > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    = {trim2(convertQty(Number(qty)))} {itemShortUnit} in inventory
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Batch number, supplier, invoice ref, etc." />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">
                {selectedItem && !selectedItem.unlimited_stock && qty && Number(qty) > 0
                  ? <>New on-hand will be <strong>{formatStoredQuantity(Number(selectedItem.stock_quantity || 0) + (direction === 'increase' ? convertQty(Number(qty)) : -convertQty(Number(qty))), getInventoryUnit(selectedItem))}</strong></>
                  : 'Select an item and enter a quantity.'}
              </div>
              <Button onClick={submit} disabled={saving || readOnly}>{saving ? 'Saving…' : 'Save adjustment'}</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" /> Recent adjustments</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
                {!loading && history.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No adjustments yet</TableCell></TableRow>}
                {history.map(h => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(h.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{itemNameMap.get(h.item_id) || '—'}</TableCell>
                    <TableCell>
                      {(() => {
                        const it = items.find(x => x.id === h.item_id);
                        const u = getInventoryUnit(it);
                        return (
                          <Badge variant={h.change_qty >= 0 ? 'default' : 'destructive'} className="text-[11px]">
                            {h.change_qty >= 0 ? '+' : '-'}{formatStoredQuantity(Math.abs(h.change_qty), u)}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-xs capitalize">{(h.reason || '').replace('_', ' ')}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">{h.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StockAdjustment;
