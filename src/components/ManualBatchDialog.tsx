import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

const PRESETS = [
  { label: 'Today only', days: 0 },
  { label: '1 day', days: 1 },
  { label: '2 days', days: 2 },
  { label: '3 days', days: 3 },
  { label: '5 days', days: 5 },
  { label: '7 days', days: 7 },
];

interface Props {
  adminId: string | null | undefined;
  branchId: string | null;
  disabled?: boolean;
  onCreated?: () => void;
  triggerLabel?: string;
}

const ManualBatchDialog: React.FC<Props> = ({ adminId, branchId, disabled, onCreated, triggerLabel = 'New batch' }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ id: string; name: string; unit: string | null; inventory_unit: string | null }[]>([]);
  const [itemId, setItemId] = useState('');
  const [search, setSearch] = useState('');
  const [qty, setQty] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [cost, setCost] = useState('');
  const [mfg, setMfg] = useState(ymd(new Date()));
  const [expiry, setExpiry] = useState(plusDays(1));
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback(async () => {
    if (!adminId) return;
    let q = (supabase.from('items') as any)
      .select('id, name, unit, inventory_unit')
      .eq('admin_id', adminId)
      .eq('is_active', true)
      .order('name')
      .limit(1000);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data } = await q;
    setItems(data || []);
  }, [adminId, branchId]);

  useEffect(() => { if (open) void loadItems(); }, [open, loadItems]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? items.filter(i => i.name.toLowerCase().includes(s)).slice(0, 50) : items.slice(0, 50);
  }, [items, search]);

  const selected = items.find(i => i.id === itemId);
  const unit = selected ? (selected.inventory_unit || selected.unit || 'pc') : '';

  const reset = () => { setItemId(''); setQty(''); setBatchNo(''); setCost(''); setSearch(''); setMfg(ymd(new Date())); setExpiry(plusDays(1)); };

  const save = async () => {
    if (!adminId) return;
    if (!itemId) { toast.error('Pick an item first'); return; }
    const quantity = Number(qty);
    if (!quantity || quantity <= 0) { toast.error('Enter how much you made'); return; }
    if (!expiry) { toast.error('Pick a use-by date'); return; }
    if (mfg && expiry < mfg) { toast.error('Use-by date cannot be before the made-on date'); return; }
    setSaving(true);
    try {
      const auto = `BATCH-${ymd(new Date()).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`;
      const { error } = await supabase.from('item_batches').insert({
        admin_id: adminId,
        branch_id: branchId ?? null,
        item_id: itemId,
        batch_number: batchNo.trim() || auto,
        stock_quantity: quantity,
        cost_price: cost ? Number(cost) : null,
        mfg_date: mfg || null,
        expiry_date: expiry,
      } as any);
      if (error) throw error;
      toast.success('Batch added to stock', { description: `${selected?.name} · use by ${expiry}` });
      reset();
      setOpen(false);
      onCreated?.();
    } catch (e: any) {
      toast.error('Could not save the batch', { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <PackagePlus className="h-4 w-4 mr-1" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a batch</DialogTitle>
          <DialogDescription>Record what you just made, with the date it must be used by.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Find item</Label>
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Type to search" />
          </div>
          <div>
            <Label className="text-xs">Item</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger><SelectValue placeholder="Choose an item" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {filtered.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Quantity {unit && `(${unit})`}</Label>
              <Input type="number" inputMode="decimal" min="0" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label className="text-xs">Cost per unit (optional)</Label>
              <Input type="number" inputMode="decimal" min="0" value={cost} onChange={e => setCost(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Batch number (optional)</Label>
            <Input value={batchNo} onChange={e => setBatchNo(e.target.value)} placeholder="Auto-generated if left blank" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Made on</Label>
              <Input type="date" value={mfg} onChange={e => setMfg(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Use by</Label>
              <Input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map(p => (
              <Button key={p.days} type="button" size="sm" variant={expiry === plusDays(p.days) ? 'default' : 'outline'} onClick={() => setExpiry(plusDays(p.days))}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Save batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ManualBatchDialog;
