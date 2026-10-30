import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { usePrinter } from '@/hooks/usePrinter';
import { isPreRushNow, PRE_RUSH_WINDOWS } from '@/utils/preRush';

/**
 * Pre-rush printer health banner.
 * Shows during the build-up to lunch and dinner rush when the counter printer is not connected,
 * with a one-tap connect + test print. Hidden when the printer is ready or outside those windows.
 */

export { isPreRushNow, PRE_RUSH_WINDOWS };

interface Props {
  /** Show even outside rush windows (used for previews/tests). */
  force?: boolean;
}

export const PrinterHealthBanner: React.FC<Props> = ({ force = false }) => {
  const { isConnected, hasNativeBridge, connectionState, connect, print } = usePrinter();
  const [now, setNow] = useState(new Date());
  const [dismissed, setDismissed] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const preRush = force || isPreRushNow(now);
  const prevPreRush = useRef(preRush);
  useEffect(() => {
    if (preRush && !prevPreRush.current) setDismissed(false);
    prevPreRush.current = preRush;
  }, [preRush]);

  const isPrinterReady =
    isConnected ||
    (hasNativeBridge && Boolean(localStorage.getItem('hotel_pos_bluetooth_printer_address')));

  if (!preRush || isPrinterReady || dismissed) return null;

  const handleQuickTestPrint = async () => {
    setTestPrinting(true);
    try {
      if (!isConnected) {
        const ok = await (connect as any)();
        if (ok === false) throw new Error('connect failed');
      }
      const d = new Date();
      const ok = await print({
        billNo: 'TEST',
        date: d.toLocaleDateString('en-IN'),
        time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        items: [],
        subtotal: 0,
        total: 0,
        paymentMethod: 'Printer check',
        shopName: 'ZenPOS printer check',
      } as any);
      if (!ok) throw new Error('print failed');
      toast({ title: 'Test print sent', description: 'Check the printer for a short test slip.' });
    } catch {
      toast({
        title: 'Printer not responding',
        description: 'Turn the printer on, check paper, and pair it in Settings → Printer.',
        variant: 'destructive',
      });
    } finally {
      setTestPrinting(false);
    }
  };

  return (
    <div
      role="alert"
      data-testid="printer-health-banner"
      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-warning/50 bg-warning/10 text-foreground text-xs font-medium mb-2 w-full"
    >
      <AlertTriangle className="w-4 h-4 shrink-0 text-warning" />
      <span className="flex-1 min-w-0">
        <strong>Rush coming:</strong> printer is offline. Test it now.
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs shrink-0"
        onClick={handleQuickTestPrint}
        disabled={testPrinting || connectionState === 'connecting'}
      >
        {testPrinting ? 'Printing…' : 'Test print'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 shrink-0"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss printer warning"
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
};

export default PrinterHealthBanner;
