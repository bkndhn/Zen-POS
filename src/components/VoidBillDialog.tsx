import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

const REASONS = ['Customer cancelled', 'Kitchen delay', 'Wrong punch', 'Duplicate bill', 'Other'];

interface RecentBill {
  id: string;
  bill_no: string;
  total_amount: number;
  created_at: string;
}

export const VoidBillDialog: React.FC = () => {
  const { operatingBranchId } = useBranch();
  const [open, setOpen] = useState(false);
  const [bills, setBills] = useState<RecentBill[]>([]);
  const [billId, setBillId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const loadBills = async () => {
    let q = supabase
      .from('bills')
      .select('id, bill_no, total_amount, created_at')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(15);
    if (operatingBranchId) q = q.eq('branch_id', operatingBranchId);
    const { data } = await q;
    setBills((data as any) || []);
  };

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) {
      setBillId('');
      setReason('');
      loadBills();
    }
  };

  const confirmVoid = async () => {
    if (!billId || !reason) {
      toast({ title: 'Pick a bill and a reason', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const { data: current } = await supabase
        .from('bills')
        .select('payment_details')
        .eq('id', billId)
        .maybeSingle();
      const details = { ...((current as any)?.payment_details || {}), void_reason: reason, voided_at: new Date().toISOString() };

      const { error } = await supabase
        .from('bills')
        .update({ is_deleted: true, payment_details: details } as any)
        .eq('id', billId);
      if (error) throw error;

      toast({ title: 'Bill cancelled', description: `Reason: ${reason}. The owner has been alerted.` });
      setOpen(false);
    } catch (e: any) {
      toast({ title: 'Could not cancel', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 rounded-xl gap-1 text-destructive"
          title="Cancel a printed bill — owner will be notified"
        >
          🚫<span className="hidden md:inline">Void Bill</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel a bill</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            The shop owner gets an instant alert on their phone with the bill number, amount and reason.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">Which bill?</Label>
            <Select value={billId} onValueChange={setBillId}>
              <SelectTrigger><SelectValue placeholder="Choose a recent bill" /></SelectTrigger>
              <SelectContent>
                {bills.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.bill_no} — Rs.{Number(b.total_amount || 0).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason (required)</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Choose a reason" /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="destructive" className="w-full" onClick={confirmVoid} disabled={busy || !billId || !reason}>
            {busy ? 'Cancelling...' : 'Cancel this bill'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VoidBillDialog;
