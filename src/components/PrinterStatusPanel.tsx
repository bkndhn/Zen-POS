/**
 * PrinterStatusPanel
 * A single mobile-friendly control that lives in the POS/Billing screen and provides:
 *   - Live connection status indicator (chip)
 *   - Selected printer summary (name, service UUID, last error)
 *   - Test Print & Self-Test buttons with clear success/failure toasts
 *   - Quick diagnostics runner with step-by-step results
 *   - Visible print queue log with timestamps
 * Persistence & auto-reconnect are handled inside `printerManager`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Printer, Wifi, WifiOff, Activity, RefreshCw, PlayCircle, Bug, Trash2, CheckCircle2, XCircle, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { printerManager, PrintLogEntry, PrinterConnectionState } from '@/utils/printerManager';
import { usePrinter } from '@/hooks/usePrinter';
import { cn } from '@/lib/utils';

const stateColor: Record<PrinterConnectionState, string> = {
    connected: 'bg-success text-success-foreground',
    connecting: 'bg-warning text-warning-foreground',
    disconnected: 'bg-muted text-muted-foreground',
    error: 'bg-destructive text-destructive-foreground',
};

const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
};

export const PrinterStatusPanel: React.FC = () => {
    const { connectionState, deviceName, isConnected, connect, disconnect, printerType } = usePrinter();
    const [open, setOpen] = useState(false);
    const [log, setLog] = useState<PrintLogEntry[]>([]);
    const [diagnostics, setDiagnostics] = useState<Array<{ step: string; ok: boolean; detail?: string }>>([]);
    const [running, setRunning] = useState<'test' | 'diag' | 'connect' | null>(null);

    useEffect(() => {
        const unsub = printerManager.subscribeLog(setLog);
        return () => { unsub(); };
    }, []);

    // Push/pop state to history to capture hardware back button on mobile
    useEffect(() => {
        if (open) {
            // Push a temporary history state so back button closes the sheet
            window.history.pushState({ sheet: 'printer-status' }, '');
        }

        const handlePopState = (event: PopStateEvent) => {
            if (open) {
                // Close sheet instead of navigating back / closing app
                setOpen(false);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
            // Clean up history state if sheet is closed programmatically
            if (!open && window.history.state?.sheet === 'printer-status') {
                window.history.back();
            }
        };
    }, [open]);

    const info = useMemo(() => printerManager.getServiceInfo(), [connectionState, deviceName]);
    const lastError = printerManager.getLastError();

    const doTest = async () => {
        setRunning('test');
        const t = toast.loading('Sending test print…');
        const res = await printerManager.sendTestPrint();
        setRunning(null);
        if (res.ok) toast.success(`Test print OK (${res.ms}ms)`, { id: t });
        else toast.error(`Test print failed: ${res.error || 'unknown'}`, { id: t });
    };

    const doConnect = async () => {
        setRunning('connect');
        const ok = await connect(true);
        setRunning(null);
        if (ok) toast.success('Printer connected');
        else toast.error('Could not connect to printer');
    };

    const doDiag = async () => {
        setRunning('diag');
        const t = toast.loading('Running diagnostics…');
        const rep = await printerManager.runDiagnostics();
        setDiagnostics(rep);
        setRunning(null);
        const failed = rep.filter(r => !r.ok).length;
        if (failed === 0) toast.success('Diagnostics passed', { id: t });
        else toast.error(`${failed} check(s) failed`, { id: t });
    };

    const doRetry = async () => {
        setRunning('test');
        const t = toast.loading('Reprinting last bill…');
        const res = await printerManager.retryLastPrint();
        setRunning(null);
        if (res.ok) toast.success(`Reprinted ${res.billNo ? '#' + res.billNo : 'last bill'}`, { id: t });
        else toast.error(res.error || 'Retry failed', { id: t });
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <button
                    className={cn(
                        'fixed z-40 top-16 right-2 h-9 px-2.5 rounded-full shadow-md border flex items-center gap-1.5 backdrop-blur',
                        'bg-card/90 hover:bg-card active:scale-95 transition-all sm:top-20 sm:right-3 sm:h-10 sm:px-3'
                    )}
                    aria-label="Printer status"
                >
                    <span className={cn('w-2 h-2 rounded-full', isConnected ? 'bg-success animate-pulse' : 'bg-destructive')} />
                    <Printer className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-medium max-w-[6rem] truncate hidden xs:inline sm:inline">
                        {isConnected ? (deviceName || 'Printer') : 'No printer'}
                    </span>
                </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
                <SheetHeader className="p-4 border-b">
                    <SheetTitle className="flex items-center gap-2">
                        <Printer className="w-5 h-5" /> Printer
                    </SheetTitle>
                </SheetHeader>

                <ScrollArea className="flex-1">
                    <div className="p-4 space-y-4">
                        {/* Status card */}
                        <Card className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <Badge className={stateColor[connectionState]}>
                                    {connectionState === 'connected' ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
                                    {connectionState.toUpperCase()}
                                </Badge>
                                <span className="text-xs text-muted-foreground uppercase">{printerType}</span>
                            </div>
                            <div className="text-sm">
                                <div className="font-medium truncate">{deviceName || '— not selected —'}</div>
                                {info.serviceUUID && <div className="text-[11px] text-muted-foreground font-mono truncate">svc {info.serviceUUID}</div>}
                                {info.characteristicUUID && <div className="text-[11px] text-muted-foreground font-mono truncate">chr {info.characteristicUUID}</div>}
                                {lastError && (
                                    <div className="mt-2 text-xs text-destructive break-words">
                                        Last error: {lastError}
                                    </div>
                                )}
                            </div>
                        </Card>

                        {/* Actions */}
                        <div className="grid grid-cols-2 gap-2">
                            <Button variant="default" onClick={doTest} disabled={running !== null} className="h-11">
                                <PlayCircle className="w-4 h-4 mr-2" /> Test Print
                            </Button>
                            <Button variant="secondary" onClick={doDiag} disabled={running !== null} className="h-11">
                                <RefreshCw className={cn('w-4 h-4 mr-2', running === 'diag' && 'animate-spin')} /> Run Diagnostics
                            </Button>
                            <Button variant="outline" onClick={doRetry} disabled={running !== null} className="h-11">
                                <Repeat className="w-4 h-4 mr-2" /> Retry Last Bill
                            </Button>
                            <Button variant="outline" onClick={doConnect} disabled={running !== null} className="h-11">
                                <RefreshCw className={cn('w-4 h-4 mr-2', running === 'connect' && 'animate-spin')} /> {isConnected ? 'Reconnect' : 'Connect'}
                            </Button>
                            <Button variant="ghost" onClick={disconnect} disabled={!isConnected} className="h-11 text-destructive col-span-2">
                                <WifiOff className="w-4 h-4 mr-2" /> Disconnect
                            </Button>
                        </div>

                        {/* Diagnostics report */}
                        {diagnostics.length > 0 && (
                            <Card className="p-3">
                                <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                                    <Bug className="w-4 h-4" /> Diagnostics Report
                                </div>
                                <ul className="space-y-1.5">
                                    {diagnostics.map((r, i) => (
                                        <li key={i} className="flex items-start gap-2 text-xs">
                                            {r.ok
                                                ? <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                                                : <XCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                                            }
                                            <div className="min-w-0">
                                                <div className="font-medium">{r.step}</div>
                                                {r.detail && <div className="text-muted-foreground break-words">{r.detail}</div>}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                                {diagnostics.some(r => !r.ok) && (
                                    <div className="mt-3 text-xs text-muted-foreground border-t pt-2 space-y-1">
                                        <div className="font-medium">If printing still fails:</div>
                                        <div>1. Turn the printer OFF then ON.</div>
                                        <div>2. Ensure Bluetooth is enabled on this device.</div>
                                        <div>3. Tap Reconnect and pick the printer again.</div>
                                        <div>4. Move closer to the printer (&lt;3m).</div>
                                        <div>5. Confirm paper is loaded and cover is closed.</div>
                                    </div>
                                )}
                            </Card>
                        )}

                        {/* Print queue log */}
                        <Card className="p-3">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-semibold flex items-center gap-2">
                                    <Activity className="w-4 h-4" /> Print Log
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => printerManager.clearPrintLog()} className="h-7 px-2">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                            {log.length === 0 ? (
                                <div className="text-xs text-muted-foreground py-4 text-center">No activity yet.</div>
                            ) : (
                                <ul className="space-y-1 max-h-64 overflow-auto">
                                    {log.map((e, i) => (
                                        <li key={i} className="flex items-center gap-2 text-[11px] font-mono">
                                            <span className={cn(
                                                'w-1.5 h-1.5 rounded-full flex-shrink-0',
                                                e.status === 'ok' && 'bg-success',
                                                e.status === 'fail' && 'bg-destructive',
                                                e.status === 'info' && 'bg-muted-foreground'
                                            )} />
                                            <span className="text-muted-foreground">{formatTime(e.ts)}</span>
                                            <span className="uppercase font-semibold">{e.action}</span>
                                            {e.billNo && (
                                                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">#{e.billNo}</span>
                                            )}
                                            {typeof e.ms === 'number' && <span className="text-muted-foreground">{e.ms}ms</span>}
                                            <span className="truncate flex-1">{e.detail}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
};

export default PrinterStatusPanel;
