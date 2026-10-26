"""Module 3: BlindShiftClose.tsx - Safe Drop & Handover Float"""

path = r"C:\Users\USER\.gemini\antigravity\scratch\hotel-zen-pos\src\components\BlindShiftClose.tsx"

new_content = """import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DENOMINATIONS, DenominationCounts, denominationTotal, cashVariance, varianceNeedsReason, varianceLabel,
} from '@/utils/shiftReconciliation';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Kept hidden from the cashier until the count is locked. */
  expectedCash: number;
  busy?: boolean;
  shiftName?: string;
  onConfirm: (actualCash: number, reason: string, counts: DenominationCounts, safeDrop: number, handoverFloat: number, handoverStaff: string) => void | Promise<void>;
}

export const BlindShiftClose: React.FC<Props> = ({ open, onOpenChange, expectedCash, busy, shiftName, onConfirm }) => {
  const [phase, setPhase] = useState<'count' | 'reveal'>('count');
  const [counts, setCounts] = useState<DenominationCounts>({});
  const [reason, setReason] = useState('');
  const [safeDrop, setSafeDrop] = useState(0);
  const [handoverStaff, setHandoverStaff] = useState('');

  const actual = denominationTotal(counts);
  const variance = cashVariance(actual, expectedCash);
  const label = varianceLabel(variance);
  const needsReason = varianceNeedsReason(variance);

  const reset = () => { setPhase('count'); setCounts({}); setReason(''); setSafeDrop(0); setHandoverStaff(''); };
  const handleOpen = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>🧾 Close Shift — Count Drawer{shiftName ? ` (${shiftName})` : ''}</DialogTitle>
          <DialogDescription className="text-xs">
            {phase === 'count' ? 'Count the notes in the drawer. The expected amount is shown only after you lock the count.' : 'Check the result and confirm to close the shift.'}
          </DialogDescription>
        </DialogHeader>

        {phase === 'count' ? (
          <div className="space-y-2">
            {DENOMINATIONS.map(d => (
              <div key={d.key} className="flex items-center gap-2">
                <span className="w-28 text-sm font-medium">{d.label}</span>
                <Input
                  type="number" inputMode="numeric" min={0}
                  value={counts[d.key] ?? ''}
                  onChange={e => setCounts(c => ({ ...c, [d.key]: Math.max(0, Number(e.target.value) || 0) }))}
                  className="h-9"
                />
                <span className="w-20 text-right text-xs text-muted-foreground">
                  ₹{((counts[d.key] || 0) * d.value).toLocaleString('en-IN')}
                </span>
              </div>
            ))}
            <div className="flex justify-between rounded-lg bg-muted p-3 font-bold">
              <span>Counted cash</span><span>₹{actual.toLocaleString('en-IN')}</span>
            </div>
            <Button className="w-full" onClick={() => setPhase('reveal')}>Lock count</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
              <div className="flex justify-between"><span>Counted</span><span>₹{actual.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between"><span>Expected</span><span>₹{expectedCash.toLocaleString('en-IN')}</span></div>
            </div>
            <div className={`rounded-lg p-3 text-center font-bold ${label === 'Exact' ? 'bg-success/10 text-success' : label === 'Over' ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive'}`}>
              {label === 'Exact' ? '✅ Drawer matches' : `${label} by ₹${Math.abs(variance).toLocaleString('en-IN')}`}
            </div>
            {needsReason && (
              <Input placeholder="Reason for difference (required)" value={reason} onChange={e => setReason(e.target.value)} />
            )}
            {/* Safe Drop & Handover allocation */}
            <div className="space-y-2 border border-border rounded-xl p-3 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cash Allocation</p>
              <div className="flex items-center gap-2">
                <label className="text-xs w-36 shrink-0">Safe Drop / Bank (₹)</label>
                <Input type="number" inputMode="numeric" min={0} max={actual}
                  value={safeDrop} onChange={e => setSafeDrop(Math.min(actual, Math.max(0, Number(e.target.value) || 0)))}
                  className="h-8 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs w-36 shrink-0">Float for Next Shift (₹)</label>
                <span className="text-sm font-bold text-primary">₹{Math.max(0, actual - safeDrop).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs w-36 shrink-0">Handover To (Name)</label>
                <Input placeholder="Incoming cashier name" value={handoverStaff} onChange={e => setHandoverStaff(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPhase('count')} disabled={busy}>Recount</Button>
              <Button
                className="flex-1"
                disabled={busy || (needsReason && !reason.trim())}
                onClick={async () => { await onConfirm(actual, reason.trim(), counts, safeDrop, Math.max(0, actual - safeDrop), handoverStaff.trim()); reset(); }}
              >
                {busy ? 'Closing…' : 'Close shift & print'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
"""

out = new_content.replace('\n', '\r\n').encode('utf-8')
with open(path, 'wb') as f:
    f.write(out)

print("Module 3 done.")
