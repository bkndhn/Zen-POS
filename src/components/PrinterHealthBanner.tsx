import React, { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { usePrinter } from '@/hooks/usePrinter';

/**
 * PrinterHealthBanner
 *
 * Renders an amber warning strip during pre-rush time windows (12:00–13:00 and 19:00–20:00)
 * if no printer is connected. Provides a 1-tap Quick Test Print button.
 * Hidden outside pre-rush windows or when printer is ready.
 */

const PRE_RUSH_WINDOWS = [
  { startH: 12, endH: 13 },  // Lunch rush
  { startH: 19, endH: 20 },  // Dinner rush
];

function isPreRushNow(d: Date): boolean {
  const h = d.getHours();
  return PRE_RUSH_WINDOWS.some(w => h >= w.startH && h < w.endH);
}

export const PrinterHealthBanner: React.FC = () => {
  const { isConnected, hasNativeBridge, connectionState, connect, print } = usePrinter();
  const [now, setNow] = useState(new Date());
  const [dismissed, setDismissed] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);

  // Update clock every 60 seconds
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Reset dismissed flag when a new pre-rush window starts
  const preRush = isPreRushNow(now);
  const prevPreRush = React.useRef(preRush);
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
      if (!isPrinterReady) {
        await connect();
      }
      // Send a minimal ESC/POS feed — bluetoothPrinter print() accepts raw bytes or receipt data
      // We pass a minimal receipt object; the actual structure is handled by printerManager
      await (print as any)({
        shopName: 'ZenPOS',
        billNo: 'TEST',
        items: [],
        subtotal: 0,
        tax: 0,
        total: 0,
        paymentMode: '',
        date: new Date().toLocaleString('en-IN'),
        isTestPrint: true,
      });
      toast({ title: 'Test Print Sent', description: 'Check your printer for output.' });
    } catch {
      toast({
        title: 'Print Failed',
        description: 'Ensure Bluetooth printer is powered on and paired.',
        variant: 'destructive',
      });
    } finally {
      setTestPrinting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 text-amber-800 dark:text-amber-200 text-xs font-medium mb-2 w-full">
      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
      <span className="flex-1 min-w-0 truncate">
        <strong>Peak Rush Alert:</strong> Counter printer is offline. Connect before orders rush in.
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs shrink-0 border-amber-400 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40"
        onClick={handleQuickTestPrint}
        disabled={testPrinting || connectionState === 'connecting'}
      >
        {testPrinting ? 'Printing…' : 'Test Print'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 shrink-0 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
};

export default PrinterHealthBanner;
