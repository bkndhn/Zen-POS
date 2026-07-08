import React, { useEffect, useMemo, useState } from 'react';
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
import { ArrowRightLeft, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { formatStoredQuantity, getShortUnit } from '@/utils/timeUtils';

interface ItemRow { id: string; name: string; branch_id: string; stock_quantity: number | null; unit: string | null; inventory_unit?: string | null; }
interface Line { from_item_id: string; to_item_id: string; item_name: string; quantity: number; }

const StockTransfers: React.FC = () => {
  const { profile } = useAuth();
  const { branches } = useBranch();
  const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;

  const [items, setItems] = useState<ItemRow[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [fromBranch, setFromBranch] = useState('');
  const [toBranch, setToBranch] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!adminId) return;
    setLoading(true);
    const [it, tr] = await Promise.all([
      (supabase as any).from('items').select('id,name,branch_id,stock_quantity,unit,inventory_unit').eq('admin_id', adminId).eq('is_active', true).order('name'),
      (supabase as any).from('stock_transfers').select('id,transfer_no,transfer_date,from_branch_id,to_branch_id,notes,created_at,stock_transfer_items(item_name,quantity)').eq('admin_id', adminId).order('created_at', { ascending: false }).limit(100)
    ]);
    setItems(it.data || []);
    setTransfers(tr.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [adminId]);

  const branchName = (id: string) => branches.find(b => b.id === id)?.name || '—';
  const fromItems = useMemo(() => items.filter(i => i.branch_id === fromBranch), [items, fromBranch]);

  const addLine = () => {
    if (!fromBranch || !toBranch) return toast({ title: 'Select branches first', variant: 'destructive' });
    setLines([...lines, { from_item_id: '', to_item_id: '', item_name: '', quantity: 1 }]);
  };
  const updateLine = (idx: number, patch: Partial<Line>) => setLines(lines.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));

  const pickItem = (idx: number, fromItemId: string) => {
    const src = items.find(i => i.id === fromItemId);
    if (!src) return;
    // try to find item with same name in destination branch
    const dest = items.find(i => i.branch_id === toBranch && i.name.toLowerCase() === src.name.toLowerCase());
    updateLine(idx, { from_item_id: fromItemId, to_item_id: dest?.id || '', item_name: src.name });
  };

  const reset = () => { setFromBranch(''); setToBranch(''); setNotes(''); setLines([]); setDate(format(new Date(), 'yyyy-MM-dd')); };

  const submit = async () => {
    if (!fromBranch || !toBranch || fromBranch === toBranch) return toast({ title: 'Pick different source and destination', variant: 'destructive' });
    const valid = lines.filter(l => l.from_item_id && l.to_item_id && l.quantity > 0);
    if (valid.length === 0) return toast({ title: 'Add at least one item', variant: 'destructive' });
    setSaving(true);
    const { error } = await (supabase as any).rpc('create_stock_transfer', {
      p_from_branch_id: fromBranch, p_to_branch_id: toBranch, p_transfer_date: date, p_notes: notes || null, p_lines: valid
    });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Transfer recorded' });
    setOpen(false); reset(); load();
    window.dispatchEvent(new CustomEvent('items-updated'));
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-24">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><ArrowRightLeft className="w-5 h-5 text-primary" /><h1 className="text-xl sm:text-2xl font-bold">Stock Transfers</h1></div>
          <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> New transfer</Button>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent transfers ({transfers.length})</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>No</TableHead><TableHead>Date</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Items</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
                {!loading && transfers.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No transfers yet</TableCell></TableRow>}
                {transfers.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.transfer_no}</TableCell>
                    <TableCell className="text-xs">{t.transfer_date}</TableCell>
                    <TableCell><Badge variant="outline">{branchName(t.from_branch_id)}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{branchName(t.to_branch_id)}</Badge></TableCell>
                    <TableCell className="text-xs">{(t.stock_transfer_items || []).map((i: any) => `${i.item_name}×${i.quantity}`).join(', ')}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New stock transfer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <Label>From branch</Label>
                <Select value={fromBranch} onValueChange={setFromBranch}>
                  <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>To branch</Label>
                <Select value={toBranch} onValueChange={setToBranch}>
                  <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                  <SelectContent>{branches.filter(b => b.id !== fromBranch).map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label>Items</Label><Button size="sm" variant="outline" onClick={addLine}><Plus className="w-3 h-3 mr-1" /> Add</Button></div>
              {lines.map((l, idx) => {
                const src = items.find(i => i.id === l.from_item_id);
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end border rounded-lg p-2">
                    <div className="col-span-5">
                      <Label className="text-xs">Source item</Label>
                      <Select value={l.from_item_id} onValueChange={v => pickItem(idx, v)}>
                        <SelectTrigger><SelectValue placeholder="Pick item" /></SelectTrigger>
                        <SelectContent>{fromItems.map(i => <SelectItem key={i.id} value={i.id}>{i.name} ({formatStoredQuantity(i.stock_quantity ?? 0, i.inventory_unit || i.unit || '')})</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-4">
                      <Label className="text-xs">Destination item</Label>
                      <Select value={l.to_item_id} onValueChange={v => updateLine(idx, { to_item_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                        <SelectContent>{items.filter(i => i.branch_id === toBranch).map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Qty {src?.inventory_unit || src?.unit ? `(${getShortUnit(src.inventory_unit || src.unit || '')})` : ''}</Label>
                      <Input type="number" value={l.quantity || ''} onChange={e => updateLine(idx, { quantity: +e.target.value })} />
                    </div>
                    <div className="col-span-1"><Button size="icon" variant="ghost" onClick={() => removeLine(idx)}><Trash2 className="w-4 h-4 text-destructive" /></Button></div>
                  </div>
                );
              })}
              {lines.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No items yet</p>}
            </div>

            <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save transfer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StockTransfers;
