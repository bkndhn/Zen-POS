import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shift: {
    id: string;
    opened_at: string;
    opening_cash: number;
    shift_name?: string;
  };
  adminId: string;
  branchId: string;
  /** Called after successful retroactive close — passes handover float for today's shift */
  onReconciledAndReady: (handoverFloat: number) => void;
}

export function OvernightShiftWarningDialog({
  open,
  onOpenChange,
  shift,
  adminId,
  branchId,
  onReconciledAndReady,
}: Props) {
  const [actualCash, setActualCash] = useState<string>('');
  const [handoverFloat, setHandoverFloat] = useState<string>('');
  const [managerNote, setManagerNote] = useState<string>('');
  const [closingBusy, setClosingBusy] = useState(false);

  const formattedOpenedAt = new Date(shift.opened_at).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const handleReconcile = async () => {
    const actual = Number(actualCash);
    const handover = handoverFloat !== '' ? Number(handoverFloat) : actual;

    if (isNaN(actual) || actualCash === '') {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter the cash counted in the drawer.',
        variant: 'destructive',
      });
      return;
    }
    if (!managerNote.trim()) {
      toast({
        title: 'Manager Note Required',
        description: 'Please enter a manager sign-off / note.',
        variant: 'destructive',
      });
      return;
    }

    setClosingBusy(true);
    try {
      const now = new Date().toISOString();

      const { error: reconError } = await (supabase as any)
        .from('shift_reconciliations')
        .insert({
          shift_id: shift.id,
          admin_id: adminId,
          branch_id: branchId,
          actual_closing_cash: actual,
          expected_closing_cash: shift.opening_cash, // simplified — real calc needs sales data
          variance: actual - shift.opening_cash,
          notes: `[OVERNIGHT CLOSE - Manager Sign-off: ${managerNote}]`,
          closed_at: now,
          handover_float: handover,
        });

      if (reconError) throw reconError;

      const { error: shiftError } = await supabase
        .from('shifts')
        .update({ status: 'closed', closed_at: now } as any)
        .eq('id', shift.id);

      if (shiftError) throw shiftError;

      toast({
        title: "Yesterday's Shift Closed",
        description: "Please start today's shift.",
      });

      onReconciledAndReady(handover);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message ?? 'Failed to close shift.',
        variant: 'destructive',
      });
    } finally {
      setClosingBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>⚠️ Unclosed Shift from Previous Day</DialogTitle>
          <DialogDescription>
            Shift &ldquo;{shift.shift_name ?? 'General Shift'}&rdquo; was opened on{' '}
            {formattedOpenedAt} and was never closed. Please reconcile yesterday&apos;s
            drawer before starting today&apos;s billing.
          </DialogDescription>
        </DialogHeader>

        {/* Info section */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Shift Opened</span>
            <span className="font-medium">{formattedOpenedAt}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Opening Float</span>
            <span className="font-medium">
              ₹{shift.opening_cash.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <div className="space-y-3 py-1">
          {/* Actual cash count */}
          <div className="space-y-1">
            <Label htmlFor="overnight-actual-cash">Cash Counted in Drawer (₹)</Label>
            <Input
              id="overnight-actual-cash"
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={actualCash}
              onChange={(e) => {
                setActualCash(e.target.value);
                // Auto-fill handover float if not yet manually entered
                if (handoverFloat === '') {
                  setHandoverFloat(e.target.value);
                }
              }}
            />
          </div>

          {/* Today's opening float */}
          <div className="space-y-1">
            <Label htmlFor="overnight-handover-float">Today&apos;s Opening Float (₹)</Label>
            <Input
              id="overnight-handover-float"
              type="number"
              inputMode="decimal"
              placeholder="Defaults to cash counted"
              value={handoverFloat}
              onChange={(e) => setHandoverFloat(e.target.value)}
            />
          </div>

          {/* Manager sign-off */}
          <div className="space-y-1">
            <Label htmlFor="overnight-manager-note">Manager Sign-off / Note</Label>
            <Input
              id="overnight-manager-note"
              type="text"
              placeholder="e.g. Approved by Rajesh"
              value={managerNote}
              onChange={(e) => setManagerNote(e.target.value)}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleReconcile}
            disabled={closingBusy || !managerNote.trim()}
          >
            {closingBusy ? 'Closing…' : "Reconcile & Close Yesterday's Shift"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
