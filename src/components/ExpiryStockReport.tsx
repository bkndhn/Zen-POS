import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, RefreshCw } from 'lucide-react';
import { suggestedClearancePct } from '@/utils/expiryPricing';

interface Props {
  adminId: string | null | undefined;
  branches: { id: string; name: string }[];
  onExport: (rows: any[]) => void;
}

const daysUntil = (d: string) => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const e = new Date(d.length === 10 ? d + 'T00:00:00' : d); e.setHours(0, 0, 0, 0);
  return Math.round((e.getTime() - t.getTime()) / 86400000);
};

type Status = 'expired' | 'today' | 'week' | 'month' | 'later' | 'none';
const statusOf = (days: number | null): Status =>
  days == null ? 'none' : days < 0 ? 'expired' : days === 0 ? 'today' : days <= 7 ? 'week' : days <= 30 ? 'month' : 'later';
const LABEL: Record<Status, string> = { expired: 'Expired', today: 'Expires today', week: 'Within 7 days', month: 'Within 30 days', later: 'Later', none: 'No date' };

const ExpiryStockReport: React.FC<Props> = ({ adminId, branches, onExport }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('all');
  const [status, setStatus] = useState<'all' | Status>('all');
  const [source, setSource] = useState<'all' | 'Batch' | 'Purchase' | 'Item'>('all');
  const [hideEmpty, setHideEmpty] = useState(true);
  const [sortBy, setSortBy] = useState<'expiry' | 'name' | 'value'>('expiry');

  const load = async () => {
    if (!adminId) return;
    setLoading(true);
    try {
      const [b, p, i] = await Promise.all([
        (supabase as any).from('item_batches').select('id,batch_number,expiry_date,mfg_date,stock_quantity,branch_id,item_id,items(name,unit,inventory_unit,purchase_rate)').eq('admin_id', adminId).limit(2000),
        (supabase as any).from('purchase_items').select('id,item_name,unit,quantity,rate,batch_no,expiry_date,purchases(purchase_date,suppliers(name))').eq('admin_id', adminId).not('expiry_date', 'is', null).limit(2000),
        (supabase as any).from('items').select('id,name,unit,inventory_unit,stock_quantity,purchase_rate,branch_id,expiry_date').eq('admin_id', adminId).eq('is_active', true).not('expiry_date', 'is', null).limit(2000),
      ]);
      const out: any[] = [];
      (b.data || []).forEach((r: any) => out.push({ key: 'b' + r.id, source: 'Batch', name: r.items?.name || 'Item', batch: r.batch_number, branch_id: r.branch_id, qty: Number(r.stock_quantity || 0), unit: r.items?.inventory_unit || r.items?.unit || '', rate: Number(r.items?.purchase_rate || 0), mfg: r.mfg_date, expiry: r.expiry_date, supplier: '' }));
      (p.data || []).forEach((r: any) => out.push({ key: 'p' + r.id, source: 'Purchase', name: r.item_name, batch: r.batch_no || '', branch_id: null, qty: Number(r.quantity || 0), unit: r.unit || '', rate: Number(r.rate || 0), mfg: r.purchases?.purchase_date, expiry: r.expiry_date, supplier: r.purchases?.suppliers?.name || '' }));
      (i.data || []).forEach((r: any) => out.push({ key: 'i' + r.id, source: 'Item', name: r.name, batch: '', branch_id: r.branch_id, qty: Number(r.stock_quantity || 0), unit: r.inventory_unit || r.unit || '', rate: Number(r.purchase_rate || 0), mfg: null, expiry: r.expiry_date, supplier: '' }));
      out.forEach(r => { r.days = r.expiry ? daysUntil(r.expiry) : null; r.status = statusOf(r.days); r.value = Math.round(r.qty * r.rate * 100) / 100; r.discount = suggestedClearancePct(r.days); r.action = r.status === 'expired' ? 'Remove / discard' : r.discount ? `Sell first · ${r.discount}% off` : r.status === 'none' ? '' : 'Normal price'; });
      setRows(out);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [adminId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const f = rows.filter(r =>
      (!q || r.name?.toLowerCase().includes(q) || r.batch?.toLowerCase().includes(q) || r.supplier?.toLowerCase().includes(q)) &&
      (branch === 'all' || r.branch_id === branch) &&
      (status === 'all' || r.status === status) &&
      (source === 'all' || r.source === source) &&
      (!hideEmpty || r.qty > 0));
    return f.sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name) : sortBy === 'value' ? b.value - a.value : (a.days ?? 99999) - (b.days ?? 99999));
  }, [rows, search, branch, status, source, hideEmpty, sortBy]);

  const sum = (s: Status) => filtered.filter(r => r.status === s);
  const sellFirst = filtered.filter(r => r.qty > 0 && r.discount > 0).slice(0, 8);
  const atRisk = filtered.filter(r => r.status === 'expired' || r.status === 'today').reduce((a, r) => a + r.value, 0);
  const branchName = (id: string | null) => (id ? branches.find(b => b.id === id)?.name || '—' : '—');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(['expired', 'today', 'week', 'month'] as Status[]).map(s => (
          <Card key={s} className="cursor-pointer" onClick={() => setStatus(status === s ? 'all' : s)}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{LABEL[s]}</p>
              <p className={`text-xl font-bold ${s === 'expired' || s === 'today' ? 'text-destructive' : ''}`}>{sum(s).length}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {sellFirst.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader className="pb-2"><CardTitle className="text-base">⚡ Sell these first</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {sellFirst.map(r => (
              <div key={r.key} className="rounded-lg border border-border px-2.5 py-1.5 text-xs">
                <span className="font-semibold">{r.name}</span> · {r.qty} {r.unit} · {r.days === 0 ? 'expires today' : `${r.days}d left`}
                <span className="ml-1 font-bold text-warning">{r.discount}% off</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Expiry-wise stock <span className="text-sm font-normal text-muted-foreground">· Value at risk ₹{atRisk.toFixed(2)}</span></CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
            <Button size="sm" variant="outline" onClick={() => onExport(filtered.map(r => ({ ...r, branch: branchName(r.branch_id), status: LABEL[r.status as Status] })))}><Download className="h-4 w-4 mr-1" /> CSV</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <Input className="col-span-2" placeholder="Search item, batch, supplier" value={search} onChange={e => setSearch(e.target.value)} />
            <Select value={branch} onValueChange={setBranch}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All branches</SelectItem>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select>
            <Select value={status} onValueChange={v => setStatus(v as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{(Object.keys(LABEL) as Status[]).map(s => <SelectItem key={s} value={s}>{LABEL[s]}</SelectItem>)}</SelectContent></Select>
            <Select value={source} onValueChange={v => setSource(v as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All sources</SelectItem><SelectItem value="Batch">Stock batches</SelectItem><SelectItem value="Purchase">Purchases</SelectItem><SelectItem value="Item">Item use-by</SelectItem></SelectContent></Select>
            <Select value={sortBy} onValueChange={v => setSortBy(v as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="expiry">Soonest expiry</SelectItem><SelectItem value="name">Name</SelectItem><SelectItem value="value">Highest value</SelectItem></SelectContent></Select>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hideEmpty} onChange={e => setHideEmpty(e.target.checked)} /> Hide zero stock</label>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Source</TableHead><TableHead>Batch</TableHead><TableHead>Branch</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Value</TableHead><TableHead>Made / bought</TableHead><TableHead>Expiry</TableHead><TableHead>Status</TableHead><TableHead>Sell-first action</TableHead></TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">No stock matches these filters.</TableCell></TableRow>
                ) : filtered.map(r => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">{r.name}{r.supplier && <span className="block text-xs text-muted-foreground">{r.supplier}</span>}</TableCell>
                    <TableCell>{r.source}</TableCell>
                    <TableCell>{r.batch || '—'}</TableCell>
                    <TableCell>{branchName(r.branch_id)}</TableCell>
                    <TableCell className="text-right">{r.qty} {r.unit}</TableCell>
                    <TableCell className="text-right">₹{r.value.toFixed(2)}</TableCell>
                    <TableCell>{r.mfg || '—'}</TableCell>
                    <TableCell>{r.expiry || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === 'expired' || r.status === 'today' ? 'destructive' : r.status === 'week' ? 'default' : 'secondary'}>
                        {r.status === 'expired' ? `Expired ${-r.days}d ago` : r.days != null && r.days > 0 ? `In ${r.days}d` : LABEL[r.status as Status]}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-xs font-semibold whitespace-nowrap ${r.status === 'expired' ? 'text-destructive' : r.discount ? 'text-warning' : 'text-muted-foreground'}`}>{r.action || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExpiryStockReport;
