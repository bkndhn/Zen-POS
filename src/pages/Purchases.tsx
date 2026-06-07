import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ShoppingBag, Plus, Trash2, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Supplier { id: string; name: string; }
interface ItemRow { id: string; name: string; branch_id: string; expiry_mode: string; unit: string | null; }
interface Purchase {
  id: string; purchase_no: string; invoice_no: string | null; purchase_date: string;
  total_amount: number; notes: string | null; supplier_id: string | null;
  suppliers?: { name: string } | null;
}

interface LineDist { branch_id: string; item_id: string; quantity: number; }
interface Line {
  item_name: string; unit: string; quantity: number; rate: number;
  batch_no: string; expiry_date: string;
  expiry_mode: string;
  distributions: LineDist[];
}

const Purchases: React.FC = () => {
  const { profile } = useAuth();
  const { branches } = useBranch();
  const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [supplierId, setSupplierId] = useState<string>('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);

  const load = async () => {
    if (!adminId) return;
    setLoading(true);
    const [sup, pur, itm] = await Promise.all([
      (supabase as any).from('suppliers').select('id,name').eq('admin_id', adminId).eq('is_active', true).order('name'),
      (supabase as any).from('purchases').select('*, suppliers(name)').eq('admin_id', adminId).order('purchase_date', { ascending: false }).limit(100),
      (supabase as any).from('items').select('id,name,branch_id,expiry_mode,unit').eq('admin_id', adminId).eq('is_active', true).order('name'),
    ]);
    setSuppliers((sup.data || []) as Supplier[]);
    setPurchases((pur.data || []) as Purchase[]);
    setItems((itm.data || []) as ItemRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [adminId]);

  const resetForm = () => {
    setSupplierId(''); setInvoiceNo(''); setNotes('');
    setPurchaseDate(format(new Date(), 'yyyy-MM-dd'));
    setLines([blankLine()]);
  };
  const blankLine = (): Line => ({
    item_name: '', unit: '', quantity: 0, rate: 0,
    batch_no: '', expiry_date: '', expiry_mode: 'none',
    distributions: branches.length ? [{ branch_id: branches.find(b => b.is_main)?.id || branches[0].id, item_id: '', quantity: 0 }] : []
  });
  const openNew = () => { resetForm(); setLines([blankLine()]); setOpen(true); };

  const updateLine = (idx: number, patch: Partial<Line>) => setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const addLine = () => setLines(prev => [...prev, blankLine()]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const itemsForBranch = (branchId: string) => items.filter(i => i.branch_id === branchId);

  const onPickItem = (idx: number, branchId: string, itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    updateLine(idx, {
      item_name: item.name,
      unit: item.unit || '',
      expiry_mode: item.expiry_mode || 'none',
      distributions: lines[idx].distributions.map(d => d.branch_id === branchId ? { ...d, item_id: itemId } : d),
    });
  };

  const updateDist = (lineIdx: number, distIdx: number, patch: Partial<LineDist>) => {
    setLines(prev => prev.map((l, i) => i === lineIdx
      ? { ...l, distributions: l.distributions.map((d, j) => j === distIdx ? { ...d, ...patch } : d) }
      : l));
  };
  const addDist = (lineIdx: number) => {
    const used = new Set(lines[lineIdx].distributions.map(d => d.branch_id));
    const next = branches.find(b => !used.has(b.id));
    if (!next) { toast({ title: 'All branches added' }); return; }
    setLines(prev => prev.map((l, i) => i === lineIdx ? { ...l, distributions: [...l.distributions, { branch_id: next.id, item_id: '', quantity: 0 }] } : l));
  };
  const removeDist = (lineIdx: number, distIdx: number) => {
    setLines(prev => prev.map((l, i) => i === lineIdx ? { ...l, distributions: l.distributions.filter((_, j) => j !== distIdx) } : l));
  };

  const distributeToAllBranches = (lineIdx: number) => {
    const line = lines[lineIdx];
    const split = branches.length ? +(line.quantity / branches.length).toFixed(2) : 0;
    setLines(prev => prev.map((l, i) => i === lineIdx ? {
      ...l,
      distributions: branches.map(b => {
        const matched = items.find(it => it.branch_id === b.id && it.name.toLowerCase() === line.item_name.toLowerCase());
        return { branch_id: b.id, item_id: matched?.id || '', quantity: split };
      })
    } : l));
  };

  const totalAmount = lines.reduce((s, l) => s + (l.quantity * l.rate || 0), 0);
  const totalDistributed = (l: Line) => l.distributions.reduce((s, d) => s + (Number(d.quantity) || 0), 0);

  const submit = async () => {
    if (!lines.length) return toast({ title: 'Add at least one line', variant: 'destructive' });
    for (const [i, l] of lines.entries()) {
      if (!l.item_name.trim()) return toast({ title: `Line ${i + 1}: item name required`, variant: 'destructive' });
      if (l.quantity <= 0) return toast({ title: `Line ${i + 1}: quantity must be > 0`, variant: 'destructive' });
      if (l.expiry_mode === 'mandatory' && !l.expiry_date) return toast({ title: `Line ${i + 1}: expiry date required`, variant: 'destructive' });
      const distSum = totalDistributed(l);
      if (Math.abs(distSum - l.quantity) > 0.01) return toast({ title: `Line ${i + 1}: distributed (${distSum}) ≠ quantity (${l.quantity})`, variant: 'destructive' });
    }
    setSaving(true);
    const { error } = await (supabase as any).rpc('create_purchase_transaction', {
      p_supplier_id: supplierId || null,
      p_invoice_no: invoiceNo || null,
      p_purchase_date: purchaseDate,
      p_notes: notes || null,
      p_lines: lines.map(l => ({
        item_name: l.item_name, unit: l.unit, quantity: l.quantity, rate: l.rate,
        batch_no: l.batch_no, expiry_date: l.expiry_date || null,
        distributions: l.distributions.filter(d => d.quantity > 0).map(d => ({
          branch_id: d.branch_id, item_id: d.item_id || null, quantity: d.quantity
        }))
      }))
    });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Purchase saved' });
    setOpen(false); load();
    window.dispatchEvent(new CustomEvent('items-updated'));
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-24">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><ShoppingBag className="w-5 h-5 text-primary" /><h1 className="text-xl sm:text-2xl font-bold">Purchases</h1></div>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> New Purchase</Button>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent purchases</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {loading && <p className="text-muted-foreground">Loading…</p>}
            {!loading && purchases.length === 0 && <p className="text-muted-foreground text-center py-6">No purchases yet</p>}
            {purchases.map(p => (
              <div key={p.id} className="flex items-center justify-between border-b pb-2 last:border-b-0">
                <div>
                  <div className="font-medium">{p.purchase_no} · ₹{Number(p.total_amount).toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">{p.suppliers?.name || '—'} · {p.purchase_date}{p.invoice_no ? ` · Inv ${p.invoice_no}` : ''}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Purchase</DialogTitle></DialogHeader>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Invoice No</Label><Input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} /></div>
            <div><Label>Date</Label><Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} /></div>
          </div>

          <div className="space-y-3 mt-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Items</h4>
              <Button size="sm" variant="outline" onClick={addLine}><Plus className="w-3 h-3 mr-1" /> Add line</Button>
            </div>
            {lines.map((l, idx) => (
              <Card key={idx} className="p-3 space-y-2 bg-muted/30">
                <div className="flex justify-between gap-2">
                  <h5 className="text-sm font-medium">Line {idx + 1}</h5>
                  <Button size="sm" variant="ghost" onClick={() => removeLine(idx)}><X className="w-3 h-3" /></Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="col-span-2"><Label className="text-xs">Item name *</Label><Input value={l.item_name} onChange={e => updateLine(idx, { item_name: e.target.value })} /></div>
                  <div><Label className="text-xs">Unit</Label><Input value={l.unit} onChange={e => updateLine(idx, { unit: e.target.value })} /></div>
                  <div><Label className="text-xs">Qty *</Label><Input type="number" value={l.quantity || ''} onChange={e => updateLine(idx, { quantity: +e.target.value })} /></div>
                  <div><Label className="text-xs">Rate</Label><Input type="number" value={l.rate || ''} onChange={e => updateLine(idx, { rate: +e.target.value })} /></div>
                  <div><Label className="text-xs">Batch No</Label><Input value={l.batch_no} onChange={e => updateLine(idx, { batch_no: e.target.value })} /></div>
                  <div className="col-span-2">
                    <Label className="text-xs">Expiry {l.expiry_mode === 'mandatory' ? '*' : l.expiry_mode === 'none' ? '(disabled)' : '(optional)'}</Label>
                    <Input type="date" disabled={l.expiry_mode === 'none'} value={l.expiry_date} onChange={e => updateLine(idx, { expiry_date: e.target.value })} />
                  </div>
                </div>

                <div className="border-t pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">Branch distribution (sum must = {l.quantity || 0})</Label>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => distributeToAllBranches(idx)}>Split to all branches</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => addDist(idx)}><Plus className="w-3 h-3" /></Button>
                    </div>
                  </div>
                  {l.distributions.map((d, dIdx) => (
                    <div key={dIdx} className="grid grid-cols-12 gap-1 mb-1 items-end">
                      <div className="col-span-4">
                        <Select value={d.branch_id} onValueChange={v => updateDist(idx, dIdx, { branch_id: v, item_id: '' })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-5">
                        <Select value={d.item_id} onValueChange={v => onPickItem(idx, d.branch_id, v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Link to item (optional)" /></SelectTrigger>
                          <SelectContent>
                            {itemsForBranch(d.branch_id).map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2"><Input className="h-8 text-xs" type="number" placeholder="Qty" value={d.quantity || ''} onChange={e => updateDist(idx, dIdx, { quantity: +e.target.value })} /></div>
                      <div className="col-span-1"><Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => removeDist(idx, dIdx)}><X className="w-3 h-3" /></Button></div>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground mt-1">Tip: link each distribution to the per-branch item to auto-add stock. Unlinked qty is recorded but won't increment stock.</p>
                </div>
              </Card>
            ))}
          </div>

          <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>

          <DialogFooter className="flex-row justify-between items-center">
            <div className="font-bold">Total: ₹{totalAmount.toFixed(2)}</div>
            <div className="flex gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save Purchase'}</Button></div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Purchases;
