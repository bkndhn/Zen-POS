import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { buildTableUpiLink } from '@/utils/tableUpiQr';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableNumber: string;
  amount: number;
  upiId: string | null;
  payeeName?: string | null;
  gstApplies?: boolean;
  onSettle: () => void;
}

/** Customer-facing UPI QR for a table. Settlement always goes through the normal table billing flow. */
export function TableUpiPayDialog({ open, onOpenChange, tableNumber, amount, upiId, payeeName, gstApplies, onSettle }: Props) {
  const [qr, setQr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const link = upiId ? buildTableUpiLink({ upiId, payeeName: payeeName || undefined, amount, tableNumber }) : null;

  useEffect(() => {
    setConfirming(false);
    if (!open || !link) { setQr(null); return; }
    QRCode.toDataURL(link, { width: 320, margin: 1, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(null));
  }, [open, link]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Table {tableNumber} · Pay by UPI</DialogTitle>
          <DialogDescription>Show this to the customer. Scan with GPay, PhonePe, Paytm or BHIM.</DialogDescription>
        </DialogHeader>
        {!upiId ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Add your shop UPI ID in Settings → Shop Details to use table QR payment.</p>
        ) : !link ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing to pay for this table yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="mx-auto w-fit rounded-xl bg-background p-2 ring-1 ring-border">
              {qr ? <img src={qr} alt={`UPI QR for table ${tableNumber}`} className="h-64 w-64" /> : <div className="h-64 w-64 animate-pulse rounded bg-muted" />}
            </div>
            <div className="text-center">
              <p className="text-3xl font-black">₹{amount.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{upiId}</p>
              {gstApplies && <p className="mt-1 text-xs font-semibold text-warning">Order total before tax — final bill amount may differ.</p>}
            </div>
            <div className="flex items-center justify-center gap-2 rounded-lg bg-warning/10 p-2 text-sm font-semibold text-warning">
              <span className="h-2 w-2 animate-pulse rounded-full bg-warning" /> Awaiting payment — check your UPI app
            </div>
            {!confirming ? (
              <Button className="w-full" onClick={() => setConfirming(true)}>Payment received</Button>
            ) : (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-sm">Confirm ₹{amount.toFixed(2)} arrived in your UPI app, then complete the bill as UPI.</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setConfirming(false)}>Back</Button>
                  <Button className="flex-1" onClick={onSettle}>Bill & settle</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
