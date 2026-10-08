import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  adminId: string;
  shiftId?: string;
  expectedCash?: number; // kept HIDDEN until after entry
}

export const BlindShiftClose: React.FC<Props> = ({ open, onOpenChange, adminId, shiftId, expectedCash }) => {
  const [phase, setPhase] = useState<'count' | 'reveal'>('count');
  const [denominations, setDenominations] = useState({
    n2000: 0, n500: 0, n200: 0, n100: 0, n50: 0, n20: 0, n10: 0, coins: 0,
  });
  const [reason, setReason] = useState('');

  const actualCash = (
    denominations.n2000 * 2000 +
    denominations.n500 * 500 +
    denominations.n200 * 200 +
    denominations.n100 * 100 +
    denominations.n50 * 50 +
    denominations.n20 * 20 +
    denominations.n10 * 10 +
    denominations.coins
  );

  const variance = expectedCash !== undefined && phase === 'reveal'
    ? actualCash - expectedCash
    : null;

  const handleReveal = () => setPhase('reveal');

  const handleClose = async () => {
    if (!shiftId) return;
    await supabase.from('shift_reconciliations').insert({
      admin_id: adminId,
      shift_id: shiftId,
      actual_cash: actualCash,
      expected_cash: expectedCash,
      variance: variance,
      notes: reason,
    });
    toast.success('Shift closed and logged');
    onOpenChange(false);
    setPhase('count');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>🔒 Close Shift — Count Drawer</DialogTitle>
        </DialogHeader>
        {phase === 'count' ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Count the physical cash in the drawer BEFORE seeing the expected total.</p>
            {([
              ['₹2000 notes', 'n2000'],
              ['₹500 notes', 'n500'],
              ['₹200 notes', 'n200'],
              ['₹100 notes', 'n100'],
              ['₹50 notes', 'n50'],
              ['₹20 notes', 'n20'],
              ['₹10 notes', 'n10'],
              ['Coins (total ₹)', 'coins'],
            ] as const).map(([label, key]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground w-32">{label}</span>
                <input
                  type="number"
                  min="0"
                  value={denominations[key] || ''}
                  onChange={e => setDenominations(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))}
                  className="w-24 border border-border rounded-lg px-2 py-1 text-sm text-right bg-background"
                />
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-2">
              <span className="font-semibold text-sm">Total Counted</span>
              <span className="font-bold text-lg">₹{actualCash.toLocaleString('en-IN')}</span>
            </div>
            <button
              type="button"
              onClick={handleReveal}
              className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold"
            >
              Reveal Expected & Close Shift
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-muted rounded-lg p-2">
                <div className="text-xs text-muted-foreground">Counted</div>
                <div className="font-bold">₹{actualCash.toLocaleString('en-IN')}</div>
              </div>
              <div className="bg-muted rounded-lg p-2">
                <div className="text-xs text-muted-foreground">Expected</div>
                <div className="font-bold">₹{(expectedCash || 0).toLocaleString('en-IN')}</div>
              </div>
              <div className={`rounded-lg p-2 ${
                (variance || 0) === 0 ? 'bg-green-50 dark:bg-green-950/20'
                : (variance || 0) > 0 ? 'bg-amber-50 dark:bg-amber-950/20'
                : 'bg-destructive/10'
              }`}>
                <div className="text-xs text-muted-foreground">Variance</div>
                <div className={`font-bold ${
                  (variance || 0) === 0 ? 'text-green-600'
                  : (variance || 0) > 0 ? 'text-amber-600'
                  : 'text-destructive'
                }`}>
                  {(variance || 0) >= 0 ? '+' : ''}₹{variance?.toLocaleString('en-IN')}
                </div>
              </div>
            </div>
            {(variance || 0) !== 0 && (
              <textarea
                placeholder="Reason for variance (required)..."
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background resize-none"
                rows={2}
              />
            )}
            <button
              type="button"
              onClick={handleClose}
              disabled={(variance || 0) !== 0 && !reason.trim()}
              className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              ✅ Confirm & Close Shift
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BlindShiftClose;
