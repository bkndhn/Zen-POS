import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Printer } from 'lucide-react';

interface Row { id: string; name: string; qty: number; sales: number; unitCost: number; cost: number; profit: number; hasRecipe: boolean; }

const csvCell = (v: unknown) => {
  const raw = String(v ?? '');
  const s = (/^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
};

const RecipeCostReport: React.FC = () => {
  const { adminProfileId } = useAuth() as any;
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!adminProfileId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [rec, itm, bi] = await Promise.all([
          (supabase as any).from('recipes').select('item_id,quantity,ingredients(cost_per_unit)').eq('admin_id', adminProfileId),
          (supabase as any).from('items').select('id,name,purchase_rate').eq('admin_id', adminProfileId),
          (supabase as any).from('bill_items')
            .select('item_id,quantity,total,price,bills!inner(admin_id,date,is_deleted)')
            .eq('bills.admin_id', adminProfileId).eq('bills.date', date).limit(10000),
        ]);
        const recipeCost: Record<string, number> = {};
        (rec.data || []).forEach((r: any) => {
          recipeCost[r.item_id] = (recipeCost[r.item_id] || 0) + Number(r.quantity || 0) * Number(r.ingredients?.cost_per_unit || 0);
        });
        const itemMap: Record<string, any> = {};
        (itm.data || []).forEach((i: any) => { itemMap[i.id] = i; });
        const agg: Record<string, Row> = {};
        (bi.data || []).forEach((b: any) => {
          if (b.bills?.is_deleted || !b.item_id) return;
          const it = itemMap[b.item_id];
          const hasRecipe = recipeCost[b.item_id] != null;
          const unitCost = hasRecipe ? recipeCost[b.item_id] : Number(it?.purchase_rate || 0);
          const qty = Number(b.quantity || 0);
          const sale = Number(b.total ?? Number(b.price || 0) * qty);
          const r = agg[b.item_id] ||= { id: b.item_id, name: it?.name || 'Item', qty: 0, sales: 0, unitCost, cost: 0, profit: 0, hasRecipe };
          r.qty += qty; r.sales += sale; r.cost += qty * unitCost; r.profit = r.sales - r.cost;
        });
        if (!cancelled) setRows(Object.values(agg).sort((a, b) => b.profit - a.profit));
      } catch (e) {
        console.warn('Recipe cost report failed', e);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [adminProfileId, date]);

  const totals = useMemo(() => {
    const sales = rows.reduce((s, r) => s + r.sales, 0);
    const cost = rows.reduce((s, r) => s + r.cost, 0);
    return { sales, cost, profit: sales - cost, pct: sales > 0 ? (cost / sales) * 100 : 0 };
  }, [rows]);

  const exportCsv = () => {
    const head = 'Item,Qty sold,Sales,Cost per unit,Food cost,Gross profit,Margin %,Cost source';
    const body = rows.map(r => [r.name, r.qty, r.sales.toFixed(2), r.unitCost.toFixed(2), r.cost.toFixed(2), r.profit.toFixed(2),
      r.sales > 0 ? ((r.profit / r.sales) * 100).toFixed(1) : '0', r.hasRecipe ? 'Recipe' : 'Purchase rate'].map(csvCell).join(','));
    body.push(['TOTAL', '', totals.sales.toFixed(2), '', totals.cost.toFixed(2), totals.profit.toFixed(2), '', ''].map(csvCell).join(','));
    const blob = new Blob([head + '\n' + body.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `food-cost-${date}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-auto" />
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="w-3 h-3 mr-1" /> CSV</Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="w-3 h-3 mr-1" /> Print</Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total sales</p><p className="text-lg font-bold">₹{totals.sales.toFixed(0)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total food cost</p><p className="text-lg font-bold text-destructive">₹{totals.cost.toFixed(0)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Gross profit</p><p className="text-lg font-bold text-success">₹{totals.profit.toFixed(0)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Food cost %</p><p className="text-lg font-bold">{totals.pct.toFixed(1)}%</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Dish-wise food cost · {format(new Date(date), 'dd MMM yyyy')}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? <p className="p-4 text-sm text-muted-foreground">Loading…</p> : !rows.length ? (
            <p className="p-4 text-sm text-muted-foreground">No sales on this day.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Dish</TableHead><TableHead className="text-right">Sold</TableHead><TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Food cost</TableHead><TableHead className="text-right">Profit</TableHead><TableHead className="text-right">Margin</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}{!r.hasRecipe && <span className="block text-[10px] text-muted-foreground">no recipe – purchase rate used</span>}</TableCell>
                    <TableCell className="text-right">{r.qty}</TableCell>
                    <TableCell className="text-right">₹{r.sales.toFixed(2)}</TableCell>
                    <TableCell className="text-right">₹{r.cost.toFixed(2)}</TableCell>
                    <TableCell className="text-right">₹{r.profit.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{r.sales > 0 ? ((r.profit / r.sales) * 100).toFixed(0) : 0}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RecipeCostReport;
