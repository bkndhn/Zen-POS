import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Download } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { formatStoredQuantity } from '@/utils/timeUtils';

const toCsv = (rows: any[], cols: { key: string; label: string }[]) => {
  const head = cols.map(c => c.label).join(',');
  const body = rows.map(r => cols.map(c => {
    const v = r[c.key] ?? '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  }).join(',')).join('\n');
  return head + '\n' + body;
};
const downloadCsv = (name: string, csv: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
};

const StockReports: React.FC = () => {
  const { profile , adminProfileId } = useAuth();
  const { branches } = useBranch();
  const adminId = adminProfileId;

  const [from, setFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [branchFilter, setBranchFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');

  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [purchaseLines, setPurchaseLines] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!adminId) return;
    setLoading(true);
    const [sup, pur, lines, itm, adj] = await Promise.all([
      (supabase as any).from('suppliers').select('id,name').eq('admin_id', adminId).order('name'),
      (supabase as any).from('purchases').select('id,purchase_no,purchase_date,total_amount,supplier_id,invoice_no,suppliers(name)').eq('admin_id', adminId).gte('purchase_date', from).lte('purchase_date', to).order('purchase_date', { ascending: false }),
      (supabase as any).from('purchase_items').select('id,purchase_id,item_name,unit,quantity,rate,total,batch_no,expiry_date,purchase_distributions(branch_id,quantity)').eq('admin_id', adminId),
      (supabase as any).from('items').select('id,name,branch_id,stock_quantity,minimum_stock_alert,unlimited_stock,purchase_rate,price,unit,inventory_unit').eq('admin_id', adminId).eq('is_active', true),
      (supabase as any).from('stock_adjustments').select('id,branch_id,item_id,change_qty,reason,notes,created_at').eq('admin_id', adminId).gte('created_at', from).lte('created_at', `${to}T23:59:59`).order('created_at', { ascending: false }),
    ]);
    setSuppliers((sup.data || []));
    setPurchases((pur.data || []));
    setPurchaseLines((lines.data || []));
    setItems((itm.data || []));
    setAdjustments((adj.data || []));
    setLoading(false);
  };
  useEffect(() => { load(); }, [adminId, from, to]);

  const branchName = (id: string) => branches.find(b => b.id === id)?.name || '—';
  const itemNameById = (id: string) => items.find(i => i.id === id)?.name || '—';
  const itemUnitById = (id: string) => {
    const it = items.find(i => i.id === id);
    return it ? (it.inventory_unit || it.unit || '') : '';
  };

  // Purchase Report
  const purchaseFiltered = purchases.filter(p => supplierFilter === 'all' || p.supplier_id === supplierFilter);
  const purchaseTotal = purchaseFiltered.reduce((s, p) => s + Number(p.total_amount || 0), 0);

  // Stock report
  const stockFiltered = items.filter(i => branchFilter === 'all' || i.branch_id === branchFilter);
  const lowStock = stockFiltered.filter(i => !i.unlimited_stock && i.minimum_stock_alert != null && Number(i.stock_quantity) <= Number(i.minimum_stock_alert));
  const stockValue = stockFiltered.reduce((s, i) => s + (Number(i.stock_quantity || 0) * Number(i.purchase_rate || 0)), 0);

  // Expiring soon (next 30 days) from purchase lines
  const today = new Date();
  const in30 = new Date(); in30.setDate(today.getDate() + 30);
  const expiring = purchaseLines.filter(l => l.expiry_date && new Date(l.expiry_date) <= in30);

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-24">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" /><h1 className="text-xl sm:text-2xl font-bold">Stock & Purchase Reports</h1></div>

        <Card>
          <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
            <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
            <div>
              <Label className="text-xs">Branch</Label>
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Supplier</Label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All suppliers</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="purchase">
          <TabsList>
            <TabsTrigger value="purchase">Purchases</TabsTrigger>
            <TabsTrigger value="stock">Stock</TabsTrigger>
            <TabsTrigger value="low">Low / Expiring</TabsTrigger>
            <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
          </TabsList>

          <TabsContent value="purchase" className="space-y-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Purchases · ₹{purchaseTotal.toFixed(2)} ({purchaseFiltered.length})</CardTitle>
                <Button size="sm" variant="outline" onClick={() => downloadCsv('purchases.csv', toCsv(purchaseFiltered.map(p => ({
                  purchase_no: p.purchase_no, date: p.purchase_date, supplier: p.suppliers?.name || '', invoice: p.invoice_no || '', total: p.total_amount
                })), [{ key: 'purchase_no', label: 'Purchase No' }, { key: 'date', label: 'Date' }, { key: 'supplier', label: 'Supplier' }, { key: 'invoice', label: 'Invoice' }, { key: 'total', label: 'Total' }]))}>
                  <Download className="w-3 h-3 mr-1" /> CSV
                </Button>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>No</TableHead><TableHead>Date</TableHead><TableHead>Supplier</TableHead><TableHead>Invoice</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {purchaseFiltered.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.purchase_no}</TableCell>
                        <TableCell className="text-xs">{p.purchase_date}</TableCell>
                        <TableCell>{p.suppliers?.name || '—'}</TableCell>
                        <TableCell className="text-xs">{p.invoice_no || '—'}</TableCell>
                        <TableCell className="text-right">₹{Number(p.total_amount).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stock" className="space-y-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Stock valuation · ₹{stockValue.toFixed(2)}</CardTitle>
                <Button size="sm" variant="outline" onClick={() => downloadCsv('stock.csv', toCsv(stockFiltered.map(i => ({
                  item: i.name, branch: branchName(i.branch_id), stock: formatStoredQuantity(i.stock_quantity || 0, i.inventory_unit || i.unit || ''), unit: i.inventory_unit || i.unit || '', cost: i.purchase_rate || 0, value: Number(i.stock_quantity || 0) * Number(i.purchase_rate || 0)
                })), [{ key: 'item', label: 'Item' }, { key: 'branch', label: 'Branch' }, { key: 'stock', label: 'Stock' }, { key: 'unit', label: 'Unit' }, { key: 'cost', label: 'Cost' }, { key: 'value', label: 'Value' }]))}>
                  <Download className="w-3 h-3 mr-1" /> CSV
                </Button>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Branch</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {stockFiltered.map(i => (
                      <TableRow key={i.id}>
                        <TableCell className="font-medium">{i.name}</TableCell>
                        <TableCell className="text-xs">{branchName(i.branch_id)}</TableCell>
                        <TableCell className="text-right">{i.unlimited_stock ? '∞' : formatStoredQuantity(i.stock_quantity ?? 0, i.inventory_unit || i.unit || '')}</TableCell>
                        <TableCell className="text-right">₹{Number(i.purchase_rate || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">₹{(Number(i.stock_quantity || 0) * Number(i.purchase_rate || 0)).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="low" className="space-y-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Low stock ({lowStock.length})</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Branch</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Min</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {lowStock.map(i => (
                      <TableRow key={i.id}>
                        <TableCell className="font-medium">{i.name}</TableCell>
                        <TableCell className="text-xs">{branchName(i.branch_id)}</TableCell>
                        <TableCell className="text-right text-destructive font-semibold">{formatStoredQuantity(i.stock_quantity, i.inventory_unit || i.unit || '')}</TableCell>
                        <TableCell className="text-right">{formatStoredQuantity(i.minimum_stock_alert, i.inventory_unit || i.unit || '')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Expiring within 30 days ({expiring.length})</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Batch</TableHead><TableHead>Qty</TableHead><TableHead>Expiry</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {expiring.map(l => {
                      const exp = new Date(l.expiry_date);
                      const past = exp < today;
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">{l.item_name}</TableCell>
                          <TableCell className="text-xs">{l.batch_no || '—'}</TableCell>
                          <TableCell>{formatStoredQuantity(l.quantity, l.unit || '')}</TableCell>
                          <TableCell><Badge variant={past ? 'destructive' : 'secondary'}>{l.expiry_date}</Badge></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="adjustments" className="space-y-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Stock adjustments ({adjustments.length})</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Branch</TableHead><TableHead>Change</TableHead><TableHead>Reason</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {adjustments.map(a => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs">{new Date(a.created_at).toLocaleString()}</TableCell>
                        <TableCell className="font-medium">{itemNameById(a.item_id)}</TableCell>
                        <TableCell className="text-xs">{branchName(a.branch_id)}</TableCell>
                        <TableCell className={Number(a.change_qty) < 0 ? 'text-destructive' : 'text-success'}>{Number(a.change_qty) > 0 ? '+' : Number(a.change_qty) < 0 ? '-' : ''}{formatStoredQuantity(Math.abs(Number(a.change_qty) || 0), itemUnitById(a.item_id))}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{a.reason}</Badge></TableCell>
                        <TableCell className="text-xs">{a.notes || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {loading && <p className="text-xs text-center text-muted-foreground">Loading…</p>}
      </div>
    </div>
  );
};

export default StockReports;
