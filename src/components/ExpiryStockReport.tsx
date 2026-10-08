import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, RefreshCw, Printer, Trash2, Tag, AlertTriangle } from 'lucide-react';
import { suggestedClearancePct } from '@/utils/expiryPricing';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

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

  const [discardRow, setDiscardRow] = useState<any>(null);
  const [discardQty, setDiscardQty] = useState<string>('');
  const [discardReason, setDiscardReason] = useState<string>('Expired');
  const [discardNotes, setDiscardNotes] = useState<string>('');
  
  const [clearanceRow, setClearanceRow] = useState<any>(null);
  const [clearanceDiscount, setClearanceDiscount] = useState<number>(10);

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
      (b.data || []).forEach((r: any) => out.push({ key: 'b' + r.id, dbId: r.id, source: 'Batch', name: r.items?.name || 'Item', batch: r.batch_number, branch_id: r.branch_id, item_id: r.item_id, qty: Number(r.stock_quantity || 0), unit: r.items?.inventory_unit || r.items?.unit || '', rate: Number(r.items?.purchase_rate || 0), mfg: r.mfg_date, expiry: r.expiry_date, supplier: '' }));
      (p.data || []).forEach((r: any) => out.push({ key: 'p' + r.id, dbId: r.id, source: 'Purchase', name: r.item_name, batch: r.batch_no || '', branch_id: null, item_id: null, qty: Number(r.quantity || 0), unit: r.unit || '', rate: Number(r.rate || 0), mfg: r.purchases?.purchase_date, expiry: r.expiry_date, supplier: r.purchases?.suppliers?.name || '' }));
      (i.data || []).forEach((r: any) => out.push({ key: 'i' + r.id, dbId: r.id, source: 'Item', name: r.name, batch: '', branch_id: r.branch_id, item_id: r.id, qty: Number(r.stock_quantity || 0), unit: r.inventory_unit || r.unit || '', rate: Number(r.purchase_rate || 0), mfg: null, expiry: r.expiry_date, supplier: '' }));
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

  const handleDiscard = async () => {
    if (!discardRow || !adminId) return;
    const qty = Number(discardQty);
    if (isNaN(qty) || qty <= 0) return;
    try {
      await (supabase as any).from('stock_adjustments').insert({
        admin_id: adminId,
        branch_id: discardRow.branch_id,
        item_id: discardRow.item_id,
        change_qty: -qty,
        reason: discardReason.toLowerCase(),
        notes: discardNotes,
      });
      toast.success('Item discarded successfully');
      void load();
    } catch (e) {
      console.error(e);
      toast.error('Failed to discard item');
    } finally {
      setDiscardRow(null);
    }
  };

  const handleClearance = async () => {
    if (!clearanceRow || !adminId) return;
    try {
      if (clearanceRow.item_id) {
        const { data: itm } = await (supabase as any).from('items').select('price').eq('id', clearanceRow.item_id).single();
        if (itm) {
          const newPrice = itm.price * (1 - clearanceDiscount / 100);
          await (supabase as any).from('items').update({ price: newPrice }).eq('id', clearanceRow.item_id);
          toast.success('Clearance discount applied — cashier screens will show this item first');
        }
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to apply clearance');
    } finally {
      setClearanceRow(null);
    }
  };

  const printAuditSheet = () => {
    const printContent = `
      <html>
        <head>
          <title>Expiry Audit Sheet</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
            .checkbox { width: 16px; height: 16px; border: 1px solid #000; display: inline-block; }
          </style>
        </head>
        <body>
          <h2>Expiry Audit Sheet</h2>
          <table>
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Batch #</th>
                <th>Expiry Date</th>
                <th>Qty On Hand</th>
                <th>Verified</th>
                <th>Discard</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(r => `
                <tr>
                  <td>${r.name}</td>
                  <td>${r.batch || '-'}</td>
                  <td>${r.expiry || '-'}</td>
                  <td>${r.qty} ${r.unit}</td>
                  <td style="text-align:center;"><div class="checkbox"></div></td>
                  <td style="text-align:center;"><div class="checkbox"></div></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(printContent);
      w.document.close();
      w.print();
    }
  };

  const expiredRows = filtered.filter(r => r.status === 'expired');
  const expiredCount = expiredRows.length;
  const expiredQty = expiredRows.reduce((a, r) => a + r.qty, 0);

  const todayTomorrowRows = filtered.filter(r => r.days != null && (r.days === 0 || r.days === 1));
  const todayTomorrowCount = todayTomorrowRows.length;

  const weekRows = filtered.filter(r => r.days != null && r.days >= 0 && r.days <= 7);
  const weekCount = weekRows.length;
  const capitalAtRisk = weekRows.reduce((a, r) => a + r.value, 0);

  const sellFirst = filtered.filter(r => r.qty > 0 && r.discount > 0).slice(0, 8);
  const branchName = (id: string | null) => (id ? branches.find(b => b.id === id)?.name || '—' : '—');

  return (
    <div className="space-y-4">
      {/* 4 FEFO Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-destructive/40">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-destructive" /> Expired Items</p>
            <p className="text-xl font-bold text-destructive">{expiredCount} <span className="text-sm font-normal">({expiredQty} qty)</span></p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/40">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-orange-500" /> Expiring Today/Tomorrow</p>
            <p className="text-xl font-bold text-orange-500">{todayTomorrowCount}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/40">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-500" /> Expiring This Week</p>
            <p className="text-xl font-bold text-amber-500">{weekCount}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/40">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-orange-500" /> Capital At-Risk</p>
            <p className="text-xl font-bold text-orange-500">₹{capitalAtRisk.toFixed(2)}</p>
          </CardContent>
        </Card>
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
          <CardTitle className="text-base">Expiry-wise stock <span className="text-sm font-normal text-muted-foreground">· Value at risk ₹{capitalAtRisk.toFixed(2)}</span></CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={printAuditSheet}><Printer className="h-4 w-4 mr-1" /> Print Audit Sheet</Button>
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
              <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Source</TableHead><TableHead>Batch</TableHead><TableHead>Branch</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Value</TableHead><TableHead>Expiry</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No stock matches these filters.</TableCell></TableRow>
                ) : filtered.map(r => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">{r.name}{r.supplier && <span className="block text-xs text-muted-foreground">{r.supplier}</span>}</TableCell>
                    <TableCell>{r.source}</TableCell>
                    <TableCell>{r.batch || '—'}</TableCell>
                    <TableCell>{branchName(r.branch_id)}</TableCell>
                    <TableCell className="text-right">{r.qty} {r.unit}</TableCell>
                    <TableCell className="text-right">₹{r.value.toFixed(2)}</TableCell>
                    <TableCell>{r.expiry || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === 'expired' || r.status === 'today' ? 'destructive' : r.status === 'week' ? 'default' : 'secondary'}>
                        {r.status === 'expired' ? `Expired ${-r.days}d ago` : r.days != null && r.days > 0 ? `In ${r.days}d` : LABEL[r.status as Status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {r.item_id && r.qty > 0 && (
                          <Button size="sm" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10 h-7 text-xs px-2" onClick={() => { setDiscardRow(r); setDiscardQty(String(r.qty)); setDiscardReason('Expired'); }}>
                            <Trash2 className="w-3 h-3 mr-1" /> Discard
                          </Button>
                        )}
                        {r.item_id && r.qty > 0 && r.days !== null && r.days >= 0 && (
                          <Button size="sm" variant="outline" className="border-amber-500 text-amber-600 hover:bg-amber-50 h-7 text-xs px-2" onClick={() => { setClearanceRow(r); setClearanceDiscount(10); }}>
                            <Tag className="w-3 h-3 mr-1" /> Clearance
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Discard Dialog */}
      <AlertDialog open={!!discardRow} onOpenChange={(o) => !o && setDiscardRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard Stock</AlertDialogTitle>
            <AlertDialogDescription>Discarding {discardRow?.name} ({discardRow?.batch})</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Qty to Discard (Max {discardRow?.qty})</label>
              <Input type="number" max={discardRow?.qty} value={discardQty} onChange={e => setDiscardQty(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason</label>
              <Select value={discardReason} onValueChange={setDiscardReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Expired">Expired</SelectItem>
                  <SelectItem value="Spoiled">Spoiled</SelectItem>
                  <SelectItem value="Damaged">Damaged</SelectItem>
                  <SelectItem value="Quality Reject">Quality Reject</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes (Optional)</label>
              <Input value={discardNotes} onChange={e => setDiscardNotes(e.target.value)} />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Confirm Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clearance Dialog */}
      <AlertDialog open={!!clearanceRow} onOpenChange={(o) => !o && setClearanceRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply Clearance Discount</AlertDialogTitle>
            <AlertDialogDescription>Apply discount for {clearanceRow?.name}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <label className="text-sm font-medium">Select Discount</label>
            <div className="flex gap-2">
              {[10, 20, 30, 50].map(pct => (
                <Button key={pct} type="button" variant={clearanceDiscount === pct ? 'default' : 'outline'} onClick={() => setClearanceDiscount(pct)}>
                  {pct}% Off
                </Button>
              ))}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearance}>Apply Discount</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ExpiryStockReport;
