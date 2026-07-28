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
import { Printer, Wifi, WifiOff, Activity, RefreshCw, PlayCircle, Bug, Trash2, CheckCircle2, XCircle, Repeat, Link, Unlink, ShieldCheck, Smartphone } from 'lucide-react';
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

export const PrinterStatusPanel: React.FC<{ inline?: boolean; className?: string }> = ({ inline, className }) => {
    const { connectionState, deviceName, isConnected, connect, disconnect, printerType, autoReconnectState, autoReconnectEnabled, reconnectStatus, isTrusted, hasNativeBridge, trustPrinter } = usePrinter();
    const [open, setOpen] = useState(false);
    const [log, setLog] = useState<PrintLogEntry[]>([]);
    const [diagnostics, setDiagnostics] = useState<Array<{ step: string; ok: boolean; detail?: string }>>([]);
    const [running, setRunning] = useState<'test' | 'diag' | 'connect' | 'trust' | null>(null);

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
        if (res.ok) {
            toast.success(`Test print OK (${res.ms}ms)`, { id: t });
            setDiagnostics(prev => {
                const stepName = 'Test Write';
                const nextReport = prev.filter(r => r.step !== stepName);
                return [
                    ...nextReport,
                    { step: stepName, ok: true, detail: `Success: ${res.ms}ms` }
                ];
            });
        } else {
            toast.error(`Test print failed: ${res.error || 'unknown'}`, { id: t });
            setDiagnostics(prev => {
                const stepName = 'Test Write';
                const nextReport = prev.filter(r => r.step !== stepName);
                return [
                    ...nextReport,
                    { step: stepName, ok: false, detail: res.error || 'Test print failed' }
                ];
            });
        }
    };

    const doConnect = async () => {
        setRunning('connect');
        // First reconnect the already-authorized printer without opening a picker.
        // Pairing/changing devices remains an explicit action in Printer Settings.
        const ok = await connect(printerType === 'none');
        setRunning(null);
        if (ok) toast.success('Printer connected');
        else toast.error('Could not connect to printer');
    };

    const doDisconnect = () => {
        disconnect();
        toast.success('Printer disconnected. Auto-reconnect is off.');
    };

    const doTrust = async () => {
        setRunning('trust');
        const t = toast.loading('Choose and authorize your printer once…');
        const ok = await trustPrinter();
        setRunning(null);
        if (ok) toast.success('Printer trusted. Automatic reconnect is enabled.', { id: t });
        else toast.error('Printer authorization was not completed.', { id: t });
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
                        inline ? 'h-9 px-2.5 rounded-full shadow-sm border flex items-center gap-1.5 bg-card/90 hover:bg-card active:scale-95 transition-all' : 'fixed z-40 top-16 right-2 h-9 px-2.5 rounded-full shadow-md border flex items-center gap-1.5 backdrop-blur bg-card/90 hover:bg-card active:scale-95 transition-all sm:top-20 sm:right-3 sm:h-10 sm:px-3',
                        className
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
            <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col max-w-[100vw] overflow-x-hidden">
                <SheetHeader className="p-4 border-b">
                    <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
                        <Printer className="w-5 h-5 shrink-0" /> Printer Controls
                    </SheetTitle>
                </SheetHeader>

                <ScrollArea className="flex-1 overflow-x-hidden">
                    <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 max-w-full overflow-hidden">
                        {/* Status card */}
                        <Card className="p-3 sm:p-4 space-y-2 max-w-full overflow-hidden">
                            <div className="flex items-center justify-between gap-2">
                                <Badge className={cn('text-xs px-2 py-0.5', stateColor[connectionState])}>
                                    {connectionState === 'connected' ? <Wifi className="w-3 h-3 mr-1 shrink-0" /> : <WifiOff className="w-3 h-3 mr-1 shrink-0" />}
                                    {connectionState.toUpperCase()}
                                </Badge>
                                <span className="text-[11px] text-muted-foreground uppercase font-semibold">{printerType}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs flex-wrap">
                                <span className={cn(
                                    'w-2 h-2 rounded-full shrink-0',
                                    autoReconnectState === 'connected' && 'bg-success',
                                    autoReconnectState === 'reconnecting' && 'bg-warning animate-pulse',
                                    autoReconnectState === 'waiting' && 'bg-warning',
                                    autoReconnectState === 'off' && 'bg-muted-foreground'
                                )} />
                                <span className="font-medium">
                                    Auto-reconnect: {autoReconnectState === 'connected' ? 'active' : autoReconnectState}
                                </span>
                                {autoReconnectEnabled && autoReconnectState === 'waiting' && (
                                    <span className="text-muted-foreground">retrying automatically</span>
                                )}
                            </div>
                            <div className="text-xs sm:text-sm min-w-0">
                                <div className="font-semibold truncate">{deviceName || '— not selected —'}</div>
                                {info.serviceUUID && <div className="text-[10px] sm:text-[11px] text-muted-foreground font-mono break-all line-clamp-1">svc {info.serviceUUID}</div>}
                                {info.characteristicUUID && <div className="text-[10px] sm:text-[11px] text-muted-foreground font-mono break-all line-clamp-1">chr {info.characteristicUUID}</div>}
                                {lastError && (
                                    <div className="mt-2 text-xs text-destructive break-words">
                                        Last error: {lastError}
                                    </div>
                                )}
                            </div>
                            <div className="border-t pt-2 text-xs space-y-1 min-w-0">
                                <div className="flex items-center gap-1.5 font-medium flex-wrap">
                                    {hasNativeBridge ? <Smartphone className="w-3.5 h-3.5 text-success shrink-0" /> : <ShieldCheck className={cn('w-3.5 h-3.5 shrink-0', isTrusted ? 'text-success' : 'text-warning')} />}
                                    <span className="break-words">{hasNativeBridge ? 'Native Android printer bridge active' : isTrusted ? 'Printer trusted for silent reconnect' : 'Printer authorization required'}</span>
                                </div>
                                <div className={cn('break-words', reconnectStatus.reason === 'none' ? 'text-muted-foreground' : 'text-destructive')}>
                                    {reconnectStatus.reason !== 'none' && <span className="font-semibold">{reconnectStatus.reason}: </span>}{reconnectStatus.detail}
                                </div>
                                {reconnectStatus.nextRetryMs && <div className="text-muted-foreground">Next retry in {(reconnectStatus.nextRetryMs / 1000).toFixed(1)}s · attempt {reconnectStatus.attempt}</div>}
                            </div>
                        </Card>

                        {!hasNativeBridge && !isTrusted && (
                            <Button onClick={doTrust} disabled={running !== null} className="w-full h-10 sm:h-11 text-xs sm:text-sm">
                                {running === 'trust' ? <RefreshCw className="w-4 h-4 mr-2 animate-spin shrink-0" /> : <ShieldCheck className="w-4 h-4 mr-2 shrink-0" />} Trust this printer
                            </Button>
                        )}

                        {/* Actions */}
                        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                            <Button variant="default" onClick={doTest} disabled={running !== null} className="h-10 sm:h-11 text-xs sm:text-sm px-2">
                                <PlayCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2 shrink-0" /> <span className="truncate">Test Print</span>
                            </Button>
                            <Button variant="secondary" onClick={doDiag} disabled={running !== null} className="h-10 sm:h-11 text-xs sm:text-sm px-2">
                                <RefreshCw className={cn('w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2 shrink-0', running === 'diag' && 'animate-spin')} /> <span className="truncate">Diagnostics</span>
                            </Button>
                            <Button variant="outline" onClick={doRetry} disabled={running !== null} className="h-10 sm:h-11 text-xs sm:text-sm px-2">
                                <Repeat className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2 shrink-0" /> <span className="truncate">Retry Bill</span>
                            </Button>
                            <Button variant="outline" onClick={doConnect} disabled={running !== null || isConnected} className="h-10 sm:h-11 text-xs sm:text-sm px-2">
                                {running === 'connect' ? <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin shrink-0" /> : <Link className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2 shrink-0" />}
                                <span className="truncate">Connect</span>
                            </Button>
                            <Button variant="ghost" onClick={doDisconnect} disabled={!autoReconnectEnabled && !isConnected} className="h-10 text-destructive col-span-2 text-xs sm:text-sm">
                                <Unlink className="w-3.5 h-3.5 mr-1.5 shrink-0" /> Disconnect Printer
                            </Button>
                        </div>

                        {/* Diagnostics report */}
                        {diagnostics.length > 0 && (
                            <Card className="p-3 max-w-full overflow-hidden">
                                <div className="text-xs sm:text-sm font-semibold mb-2 flex items-center gap-2">
                                    <Bug className="w-4 h-4 text-primary shrink-0" /> Diagnostics Report
                                </div>
                                <ul className="space-y-1.5 max-w-full">
                                    {diagnostics.map((r, i) => (
                                        <li key={i} className="flex items-start gap-2 text-xs min-w-0">
                                            {r.ok
                                                ? <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                                                : <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                                            }
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium truncate">{r.step}</div>
                                                {r.detail && <div className="text-muted-foreground break-all text-[11px]">{r.detail}</div>}
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
                        <Card className="p-3 max-w-full overflow-hidden">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-xs sm:text-sm font-semibold flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-primary shrink-0" /> Print Log
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => printerManager.clearPrintLog()} className="h-7 px-2">
                                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                                </Button>
                            </div>
                            {log.length === 0 ? (
                                <div className="text-xs text-muted-foreground py-4 text-center">No activity yet.</div>
                            ) : (
                                <ul className="space-y-1.5 max-h-64 overflow-y-auto overflow-x-hidden pr-1">
                                    {log.map((e, i) => (
                                        <li key={i} className="text-[10px] sm:text-[11px] font-mono w-full min-w-0 border-b border-border/40 last:border-0 pb-1">
                                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                                <span className={cn(
                                                    'w-1.5 h-1.5 rounded-full shrink-0',
                                                    e.status === 'ok' && 'bg-success',
                                                    e.status === 'fail' && 'bg-destructive',
                                                    e.status === 'info' && 'bg-muted-foreground'
                                                )} />
                                                <span className="text-muted-foreground">{formatTime(e.ts)}</span>
                                                <span className="uppercase font-semibold">{e.action}</span>
                                                {e.billNo && (
                                                    <span className="px-1 py-0.5 rounded bg-primary/10 text-primary font-semibold max-w-[8rem] truncate">#{e.billNo}</span>
                                                )}
                                                {typeof e.ms === 'number' && <span className="text-muted-foreground">{e.ms}ms</span>}
                                            </div>
                                            {e.detail && (
                                                <div className="text-muted-foreground break-words whitespace-pre-wrap pl-3">{e.detail}</div>
                                            )}
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
