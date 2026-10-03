import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2, Copy, ExternalLink, Loader2, Smartphone, QrCode, AlertCircle, ArrowRight
} from 'lucide-react';

/**
 * UpiPrePaymentDialog
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows the shop's UPI ID / QR code and deep-links for all major UPI apps.
 * After the customer pays, they enter their UTR / transaction ID.
 * onConfirm(utrOrSkip) is called with:
 *   - a non-empty UTR string if the customer entered one
 *   - '' (empty string) if they used the "Pay Later" skip button (only shown
 *     when requirePayment is false — i.e. table mode optional payment)
 *
 * Props:
 *   isOpen          — dialog visibility
 *   onClose         — called when dialog is dismissed without paying
 *   onConfirm(utr)  — called when customer confirms payment (UTR may be empty
 *                     if payment gateway link is used instead)
 *   amount          — order total in INR
 *   upiId           — merchant UPI ID (e.g. merchant@ybl)
 *   upiName         — merchant display name
 *   orderLabel      — short label for UPI note (e.g. "Order #3", "Table 4 Order")
 *   requirePayment  — if true, hides the "Pay Later" skip option
 *   shopPrimaryColor — brand colour for buttons
 */

interface UpiPrePaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (utr: string) => void;
  amount: number;
  upiId: string;
  upiName: string;
  orderLabel: string;
  requirePayment?: boolean;
  shopPrimaryColor?: string;
}

interface UpiApp {
  name: string;
  label: string;
  color: string;
  logo: string; // emoji or image url
  getLink: (upiId: string, name: string, amount: string, note: string) => string;
}

const UPI_APPS: UpiApp[] = [
  {
    name: 'gpay',
    label: 'GPay',
    color: '#4285F4',
    logo: '🔵',
    getLink: (id, n, amt, note) =>
      `tez://upi/pay?pa=${encodeURIComponent(id)}&pn=${encodeURIComponent(n)}&am=${amt}&cu=INR&tn=${encodeURIComponent(note)}`,
  },
  {
    name: 'phonepe',
    label: 'PhonePe',
    color: '#5F259F',
    logo: '🟣',
    getLink: (id, n, amt, note) =>
      `phonepe://pay?pa=${encodeURIComponent(id)}&pn=${encodeURIComponent(n)}&am=${amt}&cu=INR&tn=${encodeURIComponent(note)}`,
  },
  {
    name: 'paytm',
    label: 'Paytm',
    color: '#00BAF2',
    logo: '🔷',
    getLink: (id, n, amt, note) =>
      `paytmmp://pay?pa=${encodeURIComponent(id)}&pn=${encodeURIComponent(n)}&am=${amt}&cu=INR&tn=${encodeURIComponent(note)}`,
  },
  {
    name: 'bhim',
    label: 'BHIM',
    color: '#0A4C8B',
    logo: '🇮🇳',
    getLink: (id, n, amt, note) =>
      `bhim://pay?pa=${encodeURIComponent(id)}&pn=${encodeURIComponent(n)}&am=${amt}&cu=INR&tn=${encodeURIComponent(note)}`,
  },
  {
    name: 'amazon',
    label: 'Amazon Pay',
    color: '#FF9900',
    logo: '🟠',
    getLink: (id, n, amt, note) =>
      `upi://pay?pa=${encodeURIComponent(id)}&pn=${encodeURIComponent(n)}&am=${amt}&cu=INR&tn=${encodeURIComponent(note)}`,
  },
  {
    name: 'upi',
    label: 'Any UPI App',
    color: '#2C8C2C',
    logo: '💳',
    getLink: (id, n, amt, note) =>
      `upi://pay?pa=${encodeURIComponent(id)}&pn=${encodeURIComponent(n)}&am=${amt}&cu=INR&tn=${encodeURIComponent(note)}`,
  },
];

// Build QR code URL using QR server API (no library needed)
function buildQrUrl(upiId: string, upiName: string, amount: number, note: string): string {
  const upiStr = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiStr)}&color=111111&bgcolor=ffffff&margin=2`;
}

type Step = 'choose' | 'qr' | 'confirm';

export const UpiPrePaymentDialog: React.FC<UpiPrePaymentDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  amount,
  upiId,
  upiName,
  orderLabel,
  requirePayment = false,
  shopPrimaryColor = '#ea580c',
}) => {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('choose');
  const [utr, setUtr] = useState('');
  const [copied, setCopied] = useState(false);
  const [appLaunched, setAppLaunched] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const utrRef = useRef<HTMLInputElement>(null);

  const amtStr = amount.toFixed(2);
  const note = orderLabel;
  const qrUrl = buildQrUrl(upiId, upiName, amount, note);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setStep('choose');
      setUtr('');
      setCopied(false);
      setAppLaunched(false);
      setIsConfirming(false);
    }
  }, [isOpen]);

  // Focus UTR input when step changes to confirm
  useEffect(() => {
    if (step === 'confirm') {
      setTimeout(() => utrRef.current?.focus(), 100);
    }
  }, [step]);

  const handleCopyUpiId = async () => {
    try {
      await navigator.clipboard.writeText(upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', description: 'Please copy manually: ' + upiId });
    }
  };

  const handleAppClick = (app: UpiApp) => {
    const link = app.getLink(upiId, upiName, amtStr, note);
    window.location.href = link;
    setAppLaunched(true);
    // After a short delay, move to UTR confirmation step
    setTimeout(() => setStep('confirm'), 2000);
  };

  const handleConfirm = async () => {
    if (requirePayment && !utr.trim()) {
      toast({
        title: 'Enter UTR / Transaction ID',
        description: 'Please enter the transaction ID from your UPI app after paying.',
        variant: 'destructive',
      });
      return;
    }
    setIsConfirming(true);
    try {
      await onConfirm(utr.trim());
    } finally {
      setIsConfirming(false);
    }
  };

  const btnStyle = { background: shopPrimaryColor, color: '#fff' };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="px-5 pt-5 pb-3" style={{ background: `linear-gradient(135deg, ${shopPrimaryColor}18, ${shopPrimaryColor}08)` }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <span style={{ color: shopPrimaryColor }}>💸</span>
              Pay to Confirm Order
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">{orderLabel}</span>
            <span className="text-xl font-black" style={{ color: shopPrimaryColor }}>
              ₹{Number(amount).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* ── STEP: choose ── */}
          {step === 'choose' && (
            <>
              {/* UPI App Buttons */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  Pay with your UPI app
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {UPI_APPS.slice(0, 5).map((app) => (
                    <button
                      key={app.name}
                      onClick={() => handleAppClick(app)}
                      className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-background py-3 px-2 text-center shadow-sm transition-all active:scale-95 hover:border-primary/40 hover:shadow-md"
                    >
                      <span className="text-2xl">{app.logo}</span>
                      <span className="text-[11px] font-semibold text-foreground">{app.label}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => setStep('qr')}
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-background py-3 px-2 text-center shadow-sm transition-all active:scale-95 hover:border-primary/40 hover:shadow-md"
                  >
                    <QrCode className="w-6 h-6 text-muted-foreground" />
                    <span className="text-[11px] font-semibold text-foreground">Scan QR</span>
                  </button>
                </div>
              </div>

              {/* UPI ID copy row */}
              <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground">UPI ID</p>
                  <p className="text-sm font-semibold font-mono truncate">{upiId}</p>
                </div>
                <button
                  onClick={handleCopyUpiId}
                  className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                  style={{ color: shopPrimaryColor }}
                >
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Already paid → confirm */}
              <Button
                className="w-full font-bold h-11 text-sm"
                style={btnStyle}
                onClick={() => setStep('confirm')}
              >
                I've Paid — Enter Transaction ID <ArrowRight className="w-4 h-4 ml-1" />
              </Button>

              {!requirePayment && (
                <button
                  className="w-full text-xs text-muted-foreground underline underline-offset-2 py-1"
                  onClick={() => onConfirm('')}
                >
                  Pay later at counter
                </button>
              )}
            </>
          )}

          {/* ── STEP: qr ── */}
          {step === 'qr' && (
            <>
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-2xl border-2 overflow-hidden shadow-lg" style={{ borderColor: shopPrimaryColor + '40' }}>
                  <img
                    src={qrUrl}
                    alt="UPI QR Code"
                    width={220}
                    height={220}
                    className="block"
                  />
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Scan with any UPI app</p>
                  <p className="text-sm font-bold mt-0.5">{upiName}</p>
                  <p className="text-xs text-muted-foreground font-mono">{upiId}</p>
                  <p className="text-lg font-black mt-1" style={{ color: shopPrimaryColor }}>₹{amtStr}</p>
                </div>
              </div>

              <Button
                className="w-full font-bold h-11 text-sm"
                style={btnStyle}
                onClick={() => setStep('confirm')}
              >
                I've Paid — Confirm Order <ArrowRight className="w-4 h-4 ml-1" />
              </Button>

              <button
                className="w-full text-xs text-muted-foreground underline py-1"
                onClick={() => setStep('choose')}
              >
                ← Back to UPI Apps
              </button>
            </>
          )}

          {/* ── STEP: confirm ── */}
          {step === 'confirm' && (
            <>
              <div className="flex flex-col items-center gap-2 py-2 text-center">
                <CheckCircle2 className="w-10 h-10" style={{ color: shopPrimaryColor }} />
                <p className="font-semibold text-sm">Enter your UPI Transaction ID</p>
                <p className="text-xs text-muted-foreground">
                  Find the 12-digit UTR in your UPI app's payment history.
                  {!requirePayment && ' This helps us verify your payment.'}
                </p>
              </div>

              <Input
                ref={utrRef}
                placeholder="e.g. 419234567890 (UTR / Ref No.)"
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                className="text-center font-mono text-sm h-11 tracking-widest"
                maxLength={30}
              />

              {requirePayment && !utr.trim() && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-lg px-3 py-2 border border-amber-200">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Transaction ID is required to confirm your order.
                </div>
              )}

              <Button
                className="w-full font-bold h-11 text-sm"
                style={btnStyle}
                onClick={handleConfirm}
                disabled={isConfirming || (requirePayment && !utr.trim())}
              >
                {isConfirming ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Placing Order...</>
                ) : (
                  <>Confirm Order ₹{amtStr} ✓</>
                )}
              </Button>

              {appLaunched && !utr && (
                <button
                  className="w-full text-xs text-muted-foreground underline py-1"
                  onClick={() => setStep('choose')}
                >
                  ← Back (didn't pay yet?)
                </button>
              )}

              {!requirePayment && (
                <button
                  className="w-full text-xs text-muted-foreground underline py-1"
                  onClick={() => onConfirm('')}
                >
                  Skip — Pay later at counter
                </button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
