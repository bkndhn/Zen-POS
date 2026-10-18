import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Printer } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { buildMenuMatrix, type MenuSaleLine, type Quadrant, type MenuItemStat } from '@/utils/menuEngineering';
import { cn } from '@/lib/utils';

const Q: Record<Quadrant, { label: string; icon: string; tone: string; fill: string }> = {
  Star: { label: 'Stars', icon: '⭐', tone: 'border-success/40 bg-success/10', fill: 'hsl(var(--success))' },
  Plowhorse: { label: 'Plowhorses', icon: '🐎', tone: 'border-primary/40 bg-primary/10', fill: 'hsl(var(--primary))' },
  Puzzle: { label: 'Puzzles', icon: '🔮', tone: 'border-warning/40 bg-warning/10', fill: 'hsl(var(--warning))' },
  Dog: { label: 'Dogs', icon: '🐕', tone: 'border-destructive/40 bg-destructive/10', fill: 'hsl(var(--destructive))' },
};
const ORDER: Quadrant[] = ['Star', 'Plowhorse', 'Puzzle', 'Dog'];
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const csvCell = (v: string | number) => {
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};

export default function MenuEngineeringMatrix({ lines, periodLabel }: { lines: MenuSaleLine[]; periodLabel?: string }) {
  const data = useMemo(() => buildMenuMatrix(lines), [lines]);
  const [filter, setFilter] = useState<Quadrant | 'all'>('all');
  const shown = filter === 'all' ? data : data.filter((d) => d.quadrant === filter);
  const missingCost = data.filter((d) => !d.costKnown).length;
  const totals = data.reduce((a, d) => ({ rev: a.rev + d.revenue, m: a.m + d.margin }), { rev: 0, m: 0 });

  const exportCsv = () => {
    const head = ['Item', 'Category', 'Group', 'Qty', 'Mix %', 'Revenue', 'Cost', 'Margin', 'Margin/unit', 'Action'];
    const rows = data.map((d) => [d.name, d.category, Q[d.quadrant].label, d.qty, (d.mixPct * 100).toFixed(1), d.revenue.toFixed(2), d.cost.toFixed(2), d.margin.toFixed(2), d.unitMargin.toFixed(2), d.action]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `menu-engineering-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const rows = data.map((d) => `<tr><td>${esc(d.name)}</td><td>${Q[d.quadrant].label}</td><td>${d.qty}</td><td>${inr(d.revenue)}</td><td>${inr(d.margin)}</td><td>${esc(d.action)}</td></tr>`).join('');
    w.document.write(`<html><head><title>Menu Engineering</title><style>body{font-family:sans-serif;padding:16px}table{width:100%;border-collapse:collapse;font-size:12px}td,th{border:1px solid #ccc;padding:4px;text-align:left}</style></head><body><h2>Menu Engineering ${esc(periodLabel || '')}</h2><p>Revenue ${inr(totals.rev)} · Margin ${inr(totals.m)}</p><table><tr><th>Item</th><th>Group</th><th>Qty</th><th>Revenue</th><th>Margin</th><th>Action</th></tr>${rows}</table></body></html>`);
    w.document.close();
    w.print();
  };

  if (data.length === 0) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">No item sales in this period yet.</CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">📊 Menu Engineering</CardTitle>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-8" onClick={exportCsv}><Download className="w-4 h-4" /></Button>
            <Button size="sm" variant="outline" className="h-8" onClick={print}><Printer className="w-4 h-4" /></Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Each dish is grouped by how often it sells and how much profit it leaves per plate.</p>
          {missingCost > 0 && (
            <div className="text-xs rounded-md border border-warning/40 bg-warning/10 p-2">
              {missingCost} dish{missingCost > 1 ? 'es have' : ' has'} no purchase cost set — profit for them is shown as full price. Add purchase rate in Items for accurate results.
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ORDER.map((q) => {
              const g = data.filter((d) => d.quadrant === q);
              return (
                <button key={q} onClick={() => setFilter(filter === q ? 'all' : q)}
                  className={cn('rounded-xl border p-2 text-left transition', Q[q].tone, filter === q && 'ring-2 ring-ring')}>
                  <div className="text-sm font-semibold">{Q[q].icon} {Q[q].label}</div>
                  <div className="text-xs text-muted-foreground">{g.length} dishes · {inr(g.reduce((s, d) => s + d.margin, 0))}</div>
                </button>
              );
            })}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <XAxis type="number" dataKey="qty" name="Sold" tick={{ fontSize: 10 }} />
                <YAxis type="number" dataKey="unitMargin" name="Profit/plate" tick={{ fontSize: 10 }} width={40} />
                <ReferenceLine y={totals.m / Math.max(1, data.reduce((s, d) => s + d.qty, 0))} strokeDasharray="3 3" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                  const d = payload?.[0]?.payload as MenuItemStat | undefined;
                  return d ? <div className="rounded-md border bg-popover p-2 text-xs shadow"><b>{d.name}</b><br />{d.qty} sold · {inr(d.unitMargin)}/plate</div> : null;
                }} />
                <Scatter data={shown}>
                  {shown.map((d) => <Cell key={d.name} fill={Q[d.quadrant].fill} />)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 divide-y">
          {shown.map((d) => (
            <div key={d.name} className="p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate">{d.name}</span>
                <Badge variant="outline" className="shrink-0">{Q[d.quadrant].icon} {Q[d.quadrant].label}</Badge>
              </div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                <span>{d.qty} sold ({(d.mixPct * 100).toFixed(1)}%)</span>
                <span>Sales {inr(d.revenue)}</span>
                <span>Profit {inr(d.margin)}</span>
                <span>{inr(d.unitMargin)}/plate</span>
              </div>
              <div className="text-xs">💡 {d.action}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
