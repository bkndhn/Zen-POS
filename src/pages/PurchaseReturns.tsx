import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Undo2, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { formatStoredQuantity, getShortUnit } from '@/utils/timeUtils';

interface Line { item_id: string; branch_id: string; item_name: string; unit: string; quantity: number; rate: number; }

const PurchaseReturns: React.FC = () => {
  const { profile } = useAuth();
  const { branches } = useBranch();
  const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [purchaseId, setPurchaseId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reason, setReason] = useState('damaged');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!adminId) return;
    setLoading(true);
    const [sup, pur, it, ret] = await Promise.all([
      (supabase as any).from('suppliers').select('id,name').eq('admin_id', adminId).order('name'),
      (supabase as any).from('purchases').select('id,purchase_no,purchase_date,supplier_id').eq('admin_id', adminId).order('purchase_date', { ascending: false }).limit(200),
      (supabase as any).from('items').select('id,name,branch_id,stock_quantity,unit,inventory_unit,purchase_rate').eq('admin_id', adminId).eq('is_active', true).order('name'),
      (supabase as any).from('purchase_returns').select('id,return_no,return_date,supplier_id,total_amount,reason,suppliers(name),purchase_return_items(item_name,quantity,branch_id)').eq('admin_id', adminId).order('created_at', { ascending: false }).limit(100)
    ]);
    setSuppliers(sup.data || []); setPurchases(pur.data || []); setItems(it.data || []); setReturns(ret.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [adminId]);

  const branchName = (id: string) => branches.find(b => b.id === id)?.name || '—';

  const addLine = () => setLines([...lines, { item_id: '', branch_id: branches[0]?.id || '', item_name: '', unit: '', quantity: 1, rate: 0 }]);
  const updateLine = (idx: number, patch: Partial<Line>) => setLines(lines.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));

  const pickItem = (idx: number, itemId: string) => {
    const it = items.find(i => i.id === itemId);
    if (!it) return;
    updateLine(idx, { item_id: itemId, branch_id: it.branch_id, item_name: it.name, unit: it.inventory_unit || it.unit || '', rate: Number(it.purchase_rate) || 0 });
  };

  const reset = () => { setSupplierId(''); setPurchaseId(''); setReason('damaged'); setNotes(''); setLines([]); setDate(format(new Date(), 'yyyy-MM-dd')); };

  const submit = async () => {
    const valid = lines.filter(l => l.item_id && l.quantity > 0);
    if (valid.length === 0) return toast({ title: 'Add at least one item', variant: 'destructive' });
    setSaving(true);
    const { error } = await (supabase as any).rpc('create_purchase_return', {
      p_purchase_id: purchaseId || null, p_supplier_id: supplierId || null,
      p_return_date: date, p_reason: reason, p_notes: notes || null, p_lines: valid
    });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Return recorded' });
    setOpen(false); reset(); load();
    window.dispatchEvent(new CustomEvent('items-updated'));
  };

  const filteredPurchases = supplierId ? purchases.filter(p => p.supplier_id === supplierId) : purchases;

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-24">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Undo2 className="w-5 h-5 text-primary" /><h1 className="text-xl sm:text-2xl font-bold">Purchase Returns</h1></div>
          <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> New return</Button>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent returns ({returns.length})</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>No</TableHead><TableHead>Date</TableHead><TableHead>Supplier</TableHead><TableHead>Items</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
                {!loading && returns.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No returns yet</TableCell></TableRow>}
                {returns.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.return_no}</TableCell>
                    <TableCell className="text-xs">{r.return_date}</TableCell>
                    <TableCell>{r.suppliers?.name || '—'}</TableCell>
                    <TableCell className="text-xs">{(r.purchase_return_items || []).map((i: any) => `${i.item_name}×${i.quantity}@${branchName(i.branch_id)}`).join(', ')}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{r.reason || '—'}</Badge></TableCell>
                    <TableCell className="text-right">₹{Number(r.total_amount || 0).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New purchase return</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <Label>Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Original purchase</Label>
                <Select value={purchaseId} onValueChange={setPurchaseId}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>{filteredPurchases.map(p => <SelectItem key={p.id} value={p.id}>{p.purchase_no} · {p.purchase_date}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label>Reason</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="damaged">Damaged</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="wrong_item">Wrong item</SelectItem>
                    <SelectItem value="excess">Excess</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Notes</Label><Input value={notes} onChange={e => setNotes(e.target.value)} /></div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label>Items being returned</Label><Button size="sm" variant="outline" onClick={addLine}><Plus className="w-3 h-3 mr-1" /> Add</Button></div>
              {lines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end border rounded-lg p-2">
                  <div className="col-span-5">
                    <Label className="text-xs">Item (branch)</Label>
                    <Select value={l.item_id} onValueChange={v => pickItem(idx, v)}>
                      <SelectTrigger><SelectValue placeholder="Pick item" /></SelectTrigger>
                      <SelectContent>{items.map(i => <SelectItem key={i.id} value={i.id}>{i.name} · {branchName(i.branch_id)} ({formatStoredQuantity(i.stock_quantity ?? 0, i.inventory_unit || i.unit || '')})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">Qty {l.unit ? `(${getShortUnit(l.unit)})` : ''}</Label>
                    <Input type="number" value={l.quantity || ''} onChange={e => updateLine(idx, { quantity: +e.target.value })} />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">Rate</Label>
                    <Input type="number" value={l.rate || ''} onChange={e => updateLine(idx, { rate: +e.target.value })} />
                  </div>
                  <div className="col-span-1"><Button size="icon" variant="ghost" onClick={() => removeLine(idx)}><Trash2 className="w-4 h-4 text-destructive" /></Button></div>
                </div>
              ))}
              {lines.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No items yet</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save return'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseReturns;
