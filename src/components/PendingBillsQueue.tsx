import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, AlertTriangle, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { offlineManager, PendingBill } from '@/utils/offlineManager';
import { useNetworkStatus } from '@/hooks/useOffline';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export const PendingBillsQueue: React.FC = () => {
    const [pendingBills, setPendingBills] = useState<PendingBill[]>([]);
    const [expanded, setExpanded] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const isOnline = useNetworkStatus();

    const fetchPendingBills = async () => {
        const bills = await offlineManager.getPendingBills();
        setPendingBills(bills);
    };

    useEffect(() => {
        fetchPendingBills();
        
        // Subscribe to changes
        const unsubscribe = offlineManager.onPendingBillsChange(() => {
            fetchPendingBills();
        });
        
        // Refresh periodically
        const interval = setInterval(fetchPendingBills, 5000);
        
        return () => {
            unsubscribe();
            clearInterval(interval);
        };
    }, []);

    const handleSync = async () => {
        if (!isOnline || syncing) return;
        
        setSyncing(true);
        try {
            const result = await offlineManager.processSyncQueue(true);
            
            if (result.synced > 0) {
                toast({
                    title: '✅ Bills Synced',
                    description: `${result.synced} bill(s) synced successfully`,
                });
            }
            
            if (result.failed > 0) {
                toast({
                    title: '⚠️ Some bills failed',
                    description: `${result.failed} bill(s) could not be synced`,
                    variant: 'destructive',
                });
            }
            
            await fetchPendingBills();
        } finally {
            setSyncing(false);
        }
    };

    if (pendingBills.length === 0) {
        return null;
    }

    return (
        <div className="fixed bottom-20 right-4 z-50 w-72 sm:w-80">
            {/* Collapsed View - Just the badge */}
            <div 
                onClick={() => setExpanded(!expanded)}
                className={cn(
                    "flex items-center justify-between px-4 py-3 rounded-t-lg cursor-pointer transition-all",
                    "bg-amber-500 text-white shadow-lg",
                    !expanded && "rounded-b-lg"
                )}
            >
                <div className="flex items-center gap-2">
                    <CloudOff className="w-4 h-4" />
                    <span className="font-bold text-sm">
                        {pendingBills.length} Pending Bill{pendingBills.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {isOnline && (
                        <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-6 px-2 hover:bg-amber-600 text-white"
                            onClick={(e) => { e.stopPropagation(); handleSync(); }}
                            disabled={syncing}
                        >
                            <RefreshCw className={cn("w-3 h-3", syncing && "animate-spin")} />
                        </Button>
                    )}
                    {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </div>
            </div>

            {/* Expanded Queue List */}
            {expanded && (
                <Card className="rounded-t-none border-t-0 shadow-lg">
                    <ScrollArea className="max-h-60">
                        <div className="p-2 space-y-2">
                            {pendingBills.map((bill) => (
                                <div 
                                    key={bill.id}
                                    className={cn(
                                        "p-2.5 rounded-lg border transition-all",
                                        bill.syncError 
                                            ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900"
                                            : "bg-muted/50 border-border"
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-bold text-sm">#{bill.bill_no}</span>
                                        <Badge variant="secondary" className="text-[10px] h-5">
                                            ₹{bill.total_amount.toFixed(2)}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span>{formatDistanceToNow(new Date(bill.created_at), { addSuffix: true })}</span>
                                        {bill.syncError && (
                                            <span className="text-red-500 flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3" />
                                                Retry {bill.retries}
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-1.5 text-[10px] text-muted-foreground">
                                        {bill.items.slice(0, 3).map((item, i) => (
                                            <span key={i}>
                                                {item.quantity}× {item.name}
                                                {i < Math.min(2, bill.items.length - 1) ? ', ' : ''}
                                            </span>
                                        ))}
                                        {bill.items.length > 3 && <span> +{bill.items.length - 3} more</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                    
                    {/* Sync Button at bottom */}
                    {isOnline && pendingBills.length > 0 && (
                        <div className="p-2 border-t">
                            <Button 
                                className="w-full" 
                                size="sm"
                                onClick={handleSync}
                                disabled={syncing}
                            >
                                {syncing ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                        Syncing...
                                    </>
                                ) : (
                                    <>
                                        <Cloud className="w-4 h-4 mr-2" />
                                        Sync All Bills Now
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                    
                    {!isOnline && (
                        <div className="p-3 border-t bg-muted/30 text-center text-xs text-muted-foreground">
                            <CloudOff className="w-4 h-4 mx-auto mb-1 text-amber-500" />
                            Bills will sync when you're back online
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
};
