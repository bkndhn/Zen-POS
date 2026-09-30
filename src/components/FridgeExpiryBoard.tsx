import React, { useCallback, useEffect, useState } from 'react';
import { Refrigerator, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ManualBatchDialog from '@/components/ManualBatchDialog';

interface Row { key: string; id: string; name: string; source: string; expiry: string; days: number; qty?: number; isBatch: boolean }

const daysUntil = (d: string) => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const e = new Date(d + (d.length === 10 ? 'T00:00:00' : '')); e.setHours(0, 0, 0, 0);
  return Math.round((e.getTime() - t.getTime()) / 86400000);
};

interface BoardProps {
  adminId: string | null | undefined;
  branchId: string | null;
  operatingBranchId?: string | null;
  readOnly?: boolean;
  onChanged?: () => void;
}

const FridgeExpiryBoard: React.FC<BoardProps> = ({ adminId, branchId, operatingBranchId = null, readOnly = false, onChanged }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);


  const load = useCallback(async () => {
    if (!adminId) return;
    setLoading(true);
    try {
      const horizon = new Date(); horizon.setDate(horizon.getDate() + 3);
      const h = horizon.toISOString().slice(0, 10);
      let iq = (supabase.from('items') as any).select('id, name, expiry_date').eq('admin_id', adminId).not('expiry_date', 'is', null).lte('expiry_date', h).limit(500);
      if (branchId) iq = iq.eq('branch_id', branchId);
      let bq = supabase.from('item_batches').select('id, batch_number, expiry_date, stock_quantity, items(name)').eq('admin_id', adminId).gt('stock_quantity', 0).lte('expiry_date', h).limit(500);
      if (branchId) bq = bq.eq('branch_id', branchId);
      const [iRes, bRes] = await Promise.all([iq, bq]);
      const out: Row[] = [];
      (iRes.data || []).forEach((i: any) => out.push({ key: 'i' + i.id, id: i.id, isBatch: false, name: i.name, source: 'Item', expiry: i.expiry_date, days: daysUntil(i.expiry_date) }));
      (bRes.data || []).forEach((b: any) => out.push({ key: 'b' + b.id, id: b.id, isBatch: true, name: b.items?.name || 'Item', source: `Batch ${b.batch_number}`, expiry: b.expiry_date, days: daysUntil(b.expiry_date), qty: Number(b.stock_quantity) }));
      out.sort((a, b) => a.days - b.days);
      setRows(out);
    } finally {
      setLoading(false);
    }
  }, [adminId, branchId]);

  useEffect(() => { void load(); }, [load]);

  const discard = async (row: Row) => {
    try {
      const { error } = await supabase.from('item_batches').update({ stock_quantity: 0 }).eq('id', row.id);
      if (error) throw error;
      toast.success('Batch cleared from stock', { description: row.name });
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error('Could not clear the batch', { description: e?.message });
    }
  };

  const expired = rows.filter(r => r.days < 0).length;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Refrigerator className="h-4 w-4 text-primary" /> Fridge expiry board
          {expired > 0 && <Badge variant="destructive">{expired} past shelf life</Badge>}
        </CardTitle>
        <div className="flex items-center gap-2">
          <ManualBatchDialog
            adminId={adminId}
            branchId={branchId ?? operatingBranchId ?? null}
            disabled={readOnly || (!branchId && !operatingBranchId)}
            onCreated={() => { void load(); onChanged?.(); }}
          />
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="text-sm">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground">Nothing expired or expiring in the next 3 days. Add use-by dates on items or stock batches to track them here.</p>
        ) : (
          <div className="space-y-1">
            {rows.map(r => (
              <div key={r.key} className="flex items-center justify-between gap-2 border-b border-border py-1 last:border-0">
                <div className="min-w-0">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-muted-foreground"> · {r.source}{r.qty != null ? ` · ${r.qty} left` : ''}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.days < 0 ? (
                    <Badge variant="destructive">Expired {-r.days}d ago</Badge>
                  ) : r.days === 0 ? (
                    <Badge variant="destructive">Expires today</Badge>
                  ) : (
                    <Badge variant="secondary">In {r.days}d</Badge>
                  )}
                  {r.isBatch && r.days <= 0 && !readOnly && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => void discard(r)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

    </Card>
  );
};

export default FridgeExpiryBoard;
