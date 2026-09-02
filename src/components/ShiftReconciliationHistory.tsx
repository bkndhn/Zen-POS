import React, { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { format } from 'date-fns';
import { RefreshCw, History } from 'lucide-react';
import { checkSupabaseResult } from '@/utils/monitoring';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ReconRow {
  id: string;
  opened_at: string | null;
  closed_at: string;
  opening_cash: number;
  cash_sales: number;
  adjustments: number;
  expected_cash: number;
  actual_cash: number;
  variance: number;
  total_sales: number;
  total_bills: number;
  payment_breakdown: Record<string, number> | null;
  notes: string | null;
}

const money = (n: number | null | undefined) => `₹${Number(n || 0).toFixed(2)}`;

export const ShiftReconciliationHistory: React.FC<Props> = ({ open, onOpenChange }) => {
  const { profile, adminProfileId } = useAuth();
  const { operatingBranchId } = useBranch();
  const [rows, setRows] = useState<ReconRow[]>([]);
  const [loading, setLoading] = useState(false);

  const adminId = adminProfileId;
  const branchId = operatingBranchId || profile?.id;

  const load = useCallback(async () => {
    if (!adminId) return;
    setLoading(true);
    let query = supabase
      .from('shift_reconciliations')
      .select('*')
      .eq('admin_id', adminId)
      .order('closed_at', { ascending: false })
      .limit(60);
    if (branchId) query = query.eq('branch_id', branchId);

    const result = await query;
    const data = checkSupabaseResult('shift_reconciliations.select', result as any);
    setRows(((data as any) || []) as ReconRow[]);
    setLoading(false);
  }, [adminId, branchId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4" /> Shift Reconciliation History
          </DialogTitle>
        </DialogHeader>

        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {loading && rows.length === 0 ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No closed shifts yet. Reconciliation records appear here after a shift is closed from the Z-Report.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const short = r.variance < 0;
              const balanced = Math.abs(r.variance) < 0.01;
              return (
                <div key={r.id} className="rounded-lg border p-3 text-sm space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-medium">
                      {r.opened_at ? format(new Date(r.opened_at), 'dd MMM, hh:mm a') : '—'}
                      {' → '}
                      {format(new Date(r.closed_at), 'hh:mm a')}
                    </div>
                    <Badge variant={balanced ? 'secondary' : 'destructive'}>
                      {balanced ? 'Balanced' : `${short ? 'Short' : 'Excess'} ${money(Math.abs(r.variance))}`}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>Opening</span><span className="text-foreground">{money(r.opening_cash)}</span></div>
                    <div className="flex justify-between"><span>Cash sales</span><span className="text-foreground">{money(r.cash_sales)}</span></div>
                    <div className="flex justify-between"><span>Adjustments</span><span className="text-foreground">{money(r.adjustments)}</span></div>
                    <div className="flex justify-between"><span>Expected</span><span className="text-foreground">{money(r.expected_cash)}</span></div>
                    <div className="flex justify-between"><span>Counted</span><span className="text-foreground">{money(r.actual_cash)}</span></div>
                    <div className="flex justify-between"><span>Bills</span><span className="text-foreground">{r.total_bills}</span></div>
                    <div className="flex justify-between col-span-2 sm:col-span-3 pt-1 border-t">
                      <span>Total sales</span><span className="text-foreground font-semibold">{money(r.total_sales)}</span>
                    </div>
                  </div>

                  {r.payment_breakdown && Object.keys(r.payment_breakdown).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {Object.entries(r.payment_breakdown).map(([mode, amt]) => (
                        <Badge key={mode} variant="outline" className="text-[10px] uppercase">
                          {mode}: {money(Number(amt))}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {r.notes && <p className="text-xs italic text-muted-foreground">{r.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ShiftReconciliationHistory;
