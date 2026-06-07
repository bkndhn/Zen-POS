import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Boxes, Sliders } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

interface ItemRow {
  id: string; name: string; branch_id: string;
  stock_quantity: number | null; minimum_stock_alert: number | null;
  unlimited_stock: boolean | null; unit: string | null;
}

const StockManagement: React.FC = () => {
  const { profile } = useAuth();
  const { branches } = useBranch();
  const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;

  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ItemRow | null>(null);
  const [change, setChange] = useState<number>(0);
  const [reason, setReason] = useState<string>('damaged');
  const [adjNotes, setAdjNotes] = useState('');

  const load = async () => {
    if (!adminId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from('items')
      .select('id,name,branch_id,stock_quantity,minimum_stock_alert,unlimited_stock,unit')
      .eq('admin_id', adminId).eq('is_active', true).order('name');
    setItems((data || []) as ItemRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [adminId]);

  const filtered = useMemo(() => items.filter(i =>
    (branchFilter === 'all' || i.branch_id === branchFilter) &&
    (!q || i.name.toLowerCase().includes(q.toLowerCase()))
  ), [items, branchFilter, q]);

  const branchName = (id: string) => branches.find(b => b.id === id)?.name || '—';

  const openAdj = (it: ItemRow) => { setTarget(it); setChange(0); setReason('damaged'); setAdjNotes(''); setOpen(true); };

  const submit = async () => {
    if (!target || change === 0) return toast({ title: 'Enter quantity change', variant: 'destructive' });
    const { error } = await (supabase as any).rpc('apply_stock_adjustment', {
      p_item_id: target.id, p_branch_id: target.branch_id,
      p_change_qty: change, p_reason: reason, p_notes: adjNotes || null
    });
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Stock updated' });
    setOpen(false); load();
    window.dispatchEvent(new CustomEvent('items-updated'));
  };

  // Group by item name for overall view
  const overall = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach(i => {
      if (i.unlimited_stock) return;
      map.set(i.name, (map.get(i.name) || 0) + (Number(i.stock_quantity) || 0));
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-24">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center gap-2"><Boxes className="w-5 h-5 text-primary" /><h1 className="text-xl sm:text-2xl font-bold">Stock Management</h1></div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Input placeholder="Search items..." value={q} onChange={e => setQ(e.target.value)} className="max-w-sm" />
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="max-w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Per-branch stock</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Min Alert</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
                {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No items</TableCell></TableRow>}
                {filtered.map(i => {
                  const stock = Number(i.stock_quantity) || 0;
                  const low = !i.unlimited_stock && i.minimum_stock_alert != null && stock <= Number(i.minimum_stock_alert);
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell className="text-xs">{branchName(i.branch_id)}</TableCell>
                      <TableCell>
                        {i.unlimited_stock ? <Badge variant="secondary">∞</Badge> : (
                          <span className={low ? 'text-destructive font-semibold' : ''}>{stock} {i.unit || ''}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{i.minimum_stock_alert ?? 0}</TableCell>
                      <TableCell><Button size="sm" variant="outline" onClick={() => openAdj(i)}><Sliders className="w-3 h-3 mr-1" /> Adjust</Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Overall stock (across all branches)</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Total stock</TableHead></TableRow></TableHeader>
              <TableBody>
                {overall.map(([name, qty]) => (
                  <TableRow key={name}><TableCell className="font-medium">{name}</TableCell><TableCell>{qty}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Adjust stock: {target?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Branch: {target && branchName(target.branch_id)} · Current: {target?.stock_quantity ?? 0}</p>
            <div><Label>Change qty (use negative to remove)</Label><Input type="number" value={change || ''} onChange={e => setChange(+e.target.value)} /></div>
            <div>
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="damaged">Damaged</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="recount">Recount</SelectItem>
                  <SelectItem value="received">Received (manual)</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea value={adjNotes} onChange={e => setAdjNotes(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit}>Apply</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StockManagement;
