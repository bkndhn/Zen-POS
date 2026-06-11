import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { History, Download } from 'lucide-react';
import { format, subDays } from 'date-fns';

const SOURCE_LABEL: Record<string, { label: string; variant: any }> = {
  purchase: { label: 'Purchase', variant: 'default' },
  sale: { label: 'Sale', variant: 'secondary' },
  adjustment: { label: 'Adjustment', variant: 'outline' },
  transfer_in: { label: 'Transfer in', variant: 'default' },
  transfer_out: { label: 'Transfer out', variant: 'secondary' },
  purchase_return: { label: 'Return', variant: 'destructive' },
};

const toCsv = (rows: any[]) => {
  const cols = ['Date', 'Item', 'Branch', 'Type', 'Change', 'Balance', 'Reason', 'Notes', 'User'];
  const body = rows.map(r => [r.date, r.item, r.branch, r.type, r.change, r.balance, r.reason, r.notes, r.user]
    .map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
  return cols.join(',') + '\n' + body;
};

const StockLedger: React.FC = () => {
  const { profile } = useAuth();
  const { branches } = useBranch();
  const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;

  const [rows, setRows] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [from, setFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [branchFilter, setBranchFilter] = useState('all');
  const [itemFilter, setItemFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  const load = async () => {
    if (!adminId) return;
    setLoading(true);
    const [ledger, it, prof] = await Promise.all([
      (supabase as any).from('stock_ledger').select('*').eq('admin_id', adminId)
        .gte('created_at', from).lte('created_at', `${to}T23:59:59`).order('created_at', { ascending: false }).limit(1000),
      (supabase as any).from('items').select('id,name,branch_id').eq('admin_id', adminId),
      (supabase as any).from('profiles').select('user_id,name').or(`id.eq.${adminId},admin_id.eq.${adminId}`)
    ]);
    setRows(ledger.data || []); setItems(it.data || []); setUsers(prof.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [adminId, from, to]);

  const itemName = (id: string) => items.find(i => i.id === id)?.name || '—';
  const branchName = (id: string) => branches.find(b => b.id === id)?.name || '—';
  const userName = (id: string) => users.find(u => u.user_id === id)?.name || '—';

  const filtered = useMemo(() => rows.filter(r =>
    (branchFilter === 'all' || r.branch_id === branchFilter) &&
    (itemFilter === 'all' || r.item_id === itemFilter) &&
    (sourceFilter === 'all' || r.source_type === sourceFilter)
  ), [rows, branchFilter, itemFilter, sourceFilter]);

  const itemOptions = useMemo(() => {
    const filtered = branchFilter === 'all' ? items : items.filter(i => i.branch_id === branchFilter);
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [items, branchFilter]);

  const download = () => {
    const csv = toCsv(filtered.map(r => ({
      date: new Date(r.created_at).toLocaleString(),
      item: itemName(r.item_id), branch: branchName(r.branch_id),
      type: SOURCE_LABEL[r.source_type]?.label || r.source_type,
      change: r.change_qty, balance: r.balance_after ?? '',
      reason: r.reason || '', notes: r.notes || '', user: userName(r.created_by)
    })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `stock-ledger-${from}-to-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-24">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2"><History className="w-5 h-5 text-primary" /><h1 className="text-xl sm:text-2xl font-bold">Stock Audit Trail</h1></div>
          <Button variant="outline" size="sm" onClick={download}><Download className="w-3 h-3 mr-1" /> CSV</Button>
        </div>

        <Card>
          <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
            <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
            <div>
              <Label className="text-xs">Branch</Label>
              <Select value={branchFilter} onValueChange={v => { setBranchFilter(v); setItemFilter('all'); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Item</Label>
              <Select value={itemFilter} onValueChange={setItemFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All items</SelectItem>
                  {itemOptions.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {Object.entries(SOURCE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Movements ({filtered.length})</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Branch</TableHead>
                <TableHead>Type</TableHead><TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Balance</TableHead><TableHead>Reason</TableHead><TableHead>User</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
                {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No movements</TableCell></TableRow>}
                {filtered.map(r => {
                  const meta = SOURCE_LABEL[r.source_type] || { label: r.source_type, variant: 'outline' };
                  const negative = Number(r.change_qty) < 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell className="font-medium">{itemName(r.item_id)}</TableCell>
                      <TableCell className="text-xs">{branchName(r.branch_id)}</TableCell>
                      <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                      <TableCell className={`text-right font-semibold ${negative ? 'text-destructive' : 'text-success'}`}>{negative ? '' : '+'}{r.change_qty}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.balance_after ?? '—'}</TableCell>
                      <TableCell className="text-xs">{r.reason || '—'}{r.notes ? ` · ${r.notes}` : ''}</TableCell>
                      <TableCell className="text-xs">{userName(r.created_by)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StockLedger;
