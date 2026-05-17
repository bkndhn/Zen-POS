import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChefHat, Clock, Bell, Volume2, VolumeX, Wifi, WifiOff, RefreshCw, Undo2, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { getTimeElapsed, formatTimeAMPM, formatQuantityWithUnit } from '@/utils/timeUtils';
import { cn } from '@/lib/utils';
import { kitchenOfflineManager } from '@/utils/kitchenOfflineManager';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { AllBranchesReadOnlyBanner } from '@/components/AllBranchesReadOnlyBanner';

// BroadcastChannel for instant cross-tab sync
const billsChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bills-updates') : null;

// Type definition for kitchen bills
interface KitchenBillItem {
    id: string;
    quantity: number;
    items: {
        id: string;
        name: string;
        unit?: string;
        base_value?: number;
    } | null;
}

interface KitchenBill {
    id: string;
    bill_no: string;
    created_at: string;
    kitchen_status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'rejected';
    service_status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'rejected';
    bill_items: KitchenBillItem[];
    table_no?: string;
    order_type?: string;
}

// Type for table QR orders
interface KitchenTableOrder {
    id: string;
    admin_id: string;
    table_number: string;
    session_id: string;
    order_number: number;
    items: Array<{
        item_id: string;
        name: string;
        price: number;
        quantity: number;
        unit?: string;
        base_value?: number;
        instructions?: string;
    }>;
    total_amount: number;
    status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
    customer_note?: string;
    created_at: string;
}

const KitchenDisplay = () => {
    const { profile } = useAuth();
    const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
    const { branchFilterId } = useBranchScopedQuery(() => { fetchBills(true); fetchTableOrders(); });
    const [bills, setBills] = useState<KitchenBill[]>([]);
    const [loading, setLoading] = useState(true);
    const [initialLoadDone, setInitialLoadDone] = useState(false);
    const [processingBillId, setProcessingBillId] = useState<string | null>(null);
    const [voiceEnabled, setVoiceEnabled] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isOnline, setIsOnline] = useState(true); // Start optimistic
    const [pendingUpdatesCount, setPendingUpdatesCount] = useState(0);
    const [syncing, setSyncing] = useState(false);
    const syncChannelRef = useRef<any>(null);
    const tableOrderChannelRef = useRef<any>(null);
    const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Table orders state
    const [tableOrders, setTableOrders] = useState<KitchenTableOrder[]>([]);
    const knownTableOrderIds = useRef<Set<string>>(new Set());

    // Filters
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'preparing' | 'ready'>('all');
    const [timeFilter, setTimeFilter] = useState<'all' | '15' | '30' | '60'>('all');

    // Recently processed bills/orders for undo (last 5 minutes)
    const [recentlyProcessed, setRecentlyProcessed] = useState<Array<{
        id: string;
        type: 'bill' | 'table-order';
        label: string;
        previousStatus: string;
        newStatus: string;
        timestamp: string;
    }>>([]);

    // Update current time every minute
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    // Monitor online status using native browser API (more reliable)
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Also check with offline manager but don't block on it
        const checkPending = async () => {
            try {
                const pending = await kitchenOfflineManager.getPendingUpdates();
                setPendingUpdatesCount(pending.length);
            } catch (e) {
                console.warn('[Kitchen] Offline manager error:', e);
            }
        };
        checkPending();
        const interval = setInterval(checkPending, 10000); // Less frequent

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, []);

    // Voice announcement function
    const announce = useCallback((text: string) => {
        if (!voiceEnabled || !('speechSynthesis' in window)) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-IN';
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
    }, [voiceEnabled]);

    // Fetch kitchen orders - always try online first, with timeout
    const fetchBills = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);

        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        try {
            // Always try to fetch from server first with a timeout
            let query: any = (supabase as any)
                .from('bills')
                .select(`
                    id, bill_no, created_at, kitchen_status, service_status, table_no, order_type,
                    bill_items (
                        id, quantity, items (id, name, unit, base_value)
                    )
                `)
                .eq('admin_id', adminId)
                .eq('date', today)
                .or('is_deleted.is.null,is_deleted.eq.false')
                .in('kitchen_status', ['pending', 'preparing', 'ready'])
                .neq('service_status', 'completed')
                .neq('service_status', 'rejected')
                .order('created_at', { ascending: false });
            if (branchFilterId) query = query.eq('branch_id', branchFilterId);

            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => {
                fetchTimeoutRef.current = setTimeout(() => reject(new Error('Timeout')), 8000);
            });

            const result = await Promise.race([query, timeoutPromise]) as any;
            if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);

            if (result.error) throw result.error;

            const serverBills = result.data || [];
            setBills(serverBills);
            setIsOnline(true);

            // Cache for offline use (non-blocking)
            kitchenOfflineManager.cacheBills(serverBills).catch(console.warn);

        } catch (error) {
            console.warn('Error fetching kitchen bills:', error);
            setIsOnline(false);

            // Fallback to cache on error
            try {
                const cachedBills = await kitchenOfflineManager.getCachedBills();
                setBills(cachedBills);
                if (!silent && cachedBills.length > 0) {
                    toast({
                        title: '📴 Using Cached Data',
                        description: `Showing ${cachedBills.length} cached orders`,
                    });
                }
            } catch (cacheError) {
                console.warn('Cache error:', cacheError);
                // Just show empty if cache also fails
                setBills([]);
            }
        } finally {
            if (!silent) setLoading(false);
            setInitialLoadDone(true);
        }
    }, [branchFilterId, adminId]);

    // Fetch table orders (from table QR ordering)
    const fetchTableOrders = useCallback(async () => {
        if (!adminId) return;
        try {
            let q: any = (supabase as any)
                .from('table_orders')
                .select('*')
                .eq('admin_id', adminId)
                .in('status', ['pending', 'preparing', 'ready'])
                .eq('is_billed', false)
                .order('created_at', { ascending: false });
            if (branchFilterId) q = q.eq('branch_id', branchFilterId);
            const { data, error } = await q;

            if (!error && data) {
                setTableOrders(data as KitchenTableOrder[]);
            }
        } catch (e) {
            console.warn('[Kitchen] Table orders fetch error:', e);
        }
    }, [adminId, branchFilterId]);

    // Track known bill IDs to detect new orders
    const knownBillIds = useRef<Set<string>>(new Set());

    // Setup Global Sync Channel for Cross-Device updates
    useEffect(() => {
        if (!isOnline) return;

        const channel = supabase.channel('pos-global-sync', {
            config: { broadcast: { self: true } }
        })
            .on('broadcast', { event: 'bills-updated' }, (payload: any) => {
                console.log('Kitchen: Cross-device broadcast received!', payload);
                fetchBills(true);
            })
            .on('broadcast', { event: 'new-bill' }, (payload: any) => {
                console.log('Kitchen: New bill broadcast received!', payload);
                if (voiceEnabled && payload?.payload?.bill_no) {
                    announce(`New order received, Bill number ${payload.payload.bill_no}`);
                }
                fetchBills(true);
            })
            .subscribe();

        syncChannelRef.current = channel;
        return () => { supabase.removeChannel(channel); };
    }, [fetchBills, voiceEnabled, announce, isOnline]);

    // Initial fetch with cleanup
    useEffect(() => {
        fetchBills();
        fetchTableOrders();
        const pollInterval = setInterval(() => {
            fetchBills(true);
            fetchTableOrders();
        }, 30000);
        return () => {
            clearInterval(pollInterval);
            if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
        };
    }, [fetchBills, fetchTableOrders]);

    // Listen for table order broadcasts from customers
    useEffect(() => {
        if (!isOnline) return;

        const channel = supabase.channel('table-order-sync', {
            config: { broadcast: { self: true } }
        })
            .on('broadcast', { event: 'new-table-order' }, (payload: any) => {
                console.log('Kitchen: New table order received!', payload);
                const order = payload.payload;
                if (order?.id && !knownTableOrderIds.current.has(order.id)) {
                    knownTableOrderIds.current.add(order.id);
                    if (voiceEnabled) {
                        announce(`New table order from Table ${order.table_number}`);
                    }
                }
                fetchTableOrders();
            })
            .subscribe();

        tableOrderChannelRef.current = channel;

        // Also subscribe to postgres_changes for table_orders
        const pgChannel = supabase.channel('table-order-kitchen-pg')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'table_orders' }, () => {
                fetchTableOrders();
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'table_orders' }, () => {
                fetchTableOrders();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(pgChannel);
        };
    }, [fetchTableOrders, voiceEnabled, announce, isOnline]);

    // Realtime subscription (backup - slower but reliable)
    useEffect(() => {
        if (!isOnline) return;

        const channel = supabase
            .channel('kitchen-sync')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bills' }, (payload) => {
                const billNo = payload.new?.bill_no;
                const billId = payload.new?.id;
                if (billId && !knownBillIds.current.has(billId)) {
                    knownBillIds.current.add(billId);
                    if (voiceEnabled && billNo) {
                        announce(`New order received, Bill number ${billNo}`);
                    }
                }
                fetchBills(true);
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bills' }, () => {
                fetchBills(true);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchBills, voiceEnabled, announce, isOnline]);

    // Listen for BroadcastChannel updates (0ms same-device sync)
    useEffect(() => {
        if (!billsChannel) return;

        const handleMessage = (event: MessageEvent) => {
            const data = event.data;

            if (data?.type === 'new-bill' && voiceEnabled && data?.bill_no) {
                if (data?.bill_id && !knownBillIds.current.has(data.bill_id)) {
                    knownBillIds.current.add(data.bill_id);
                    announce(`New order received, Bill number ${data.bill_no}`);
                }
            }

            fetchBills(true);
        };

        billsChannel.addEventListener('message', handleMessage);
        return () => billsChannel.removeEventListener('message', handleMessage);
    }, [fetchBills, voiceEnabled, announce]);

    // Listen for offline bills updates
    useEffect(() => {
        const unsubBills = kitchenOfflineManager.onBillsChange((updatedBills) => {
            setBills(updatedBills);
        });
        return unsubBills;
    }, []);

    /**
     * OPTIMISTIC UPDATE with OFFLINE SUPPORT
     */
    const updateKitchenStatus = async (
        billId: string,
        billNo: string,
        status: 'preparing' | 'ready'
    ) => {
        const prevBills = [...bills];
        const targetBill = bills.find(b => b.id === billId);
        const previousStatus = targetBill?.kitchen_status || 'pending';

        // Track for undo
        setRecentlyProcessed(prev => [{
            id: billId,
            type: 'bill' as const,
            label: `#${billNo}`,
            previousStatus,
            newStatus: status,
            timestamp: new Date().toISOString(),
        }, ...prev.filter(p => p.id !== billId)].slice(0, 10));

        // 1. Instant local update (Optimistic UI)
        setBills(prev => prev.map(bill =>
            bill.id === billId
                ? { ...bill, kitchen_status: status, service_status: status === 'ready' ? 'ready' : bill.service_status }
                : bill
        ));

        try {
            if (isOnline) {
                // 2a. Online: Update server directly
                const updateData: any = { kitchen_status: status };
                if (status === 'ready') updateData.service_status = 'ready';

                const { error } = await supabase
                    .from('bills')
                    .update(updateData)
                    .eq('id', billId);

                if (error) throw error;

                // Sync others
                billsChannel?.postMessage({ type: 'update', timestamp: Date.now() });
                syncChannelRef.current?.send({
                    type: 'broadcast',
                    event: 'bills-updated',
                    payload: { bill_id: billId, status }
                });
            } else {
                // 2b. Offline: Save to IndexedDB for later sync
                await kitchenOfflineManager.saveOfflineUpdate(billId, status);

                toast({
                    title: '📴 Saved Offline',
                    description: `Will sync when online`,
                });
            }

            // Voice feedback
            if (status === 'ready') {
                announce(`Bill number ${billNo} is ready`);
                toast({ title: '🔔 Order Ready!', description: `Bill #${billNo} is ready` });
            } else {
                toast({ title: '👨‍🍳 Preparing', description: `Started #${billNo}` });
            }

        } catch (error) {
            console.error('Update failed:', error);
            // Rollback on failure
            setBills(prevBills);
            toast({
                title: 'Update Failed',
                description: 'Please check your connection',
                variant: 'destructive'
            });
        }
    };

    // Manual sync
    const handleManualSync = async () => {
        if (!isOnline || syncing) return;

        setSyncing(true);
        try {
            const result = await kitchenOfflineManager.syncPendingUpdates();
            if (result.synced > 0) {
                toast({
                    title: '✅ Synced',
                    description: `${result.synced} updates synced successfully`,
                });
            }
            await fetchBills(true);
            const pending = await kitchenOfflineManager.getPendingUpdates();
            setPendingUpdatesCount(pending.length);
        } finally {
            setSyncing(false);
        }
    };

    // Apply time-window filter (minutes since created)
    const withinWindow = (createdAt: string) => {
      if (timeFilter === 'all') return true;
      const minutes = (Date.now() - new Date(createdAt).getTime()) / 60000;
      return minutes <= Number(timeFilter);
    };
    const matchesStatus = (s: string) => statusFilter === 'all' || s === statusFilter;

    const filteredBills = bills.filter(b => withinWindow(b.created_at) && matchesStatus(b.kitchen_status));
    const filteredTableOrders = tableOrders.filter(o => withinWindow(o.created_at) && matchesStatus(o.status));

    // Group bills by status
    const pendingBills = filteredBills.filter(b => b.kitchen_status === 'pending');
    const preparingBills = filteredBills.filter(b => b.kitchen_status === 'preparing');
    const readyBills = filteredBills.filter(b => b.kitchen_status === 'ready');

    // Group table orders by status
    const pendingTableOrders = filteredTableOrders.filter(o => o.status === 'pending');
    const preparingTableOrders = filteredTableOrders.filter(o => o.status === 'preparing');
    const readyTableOrders = filteredTableOrders.filter(o => o.status === 'ready');

    // Update table order status
    const updateTableOrderStatus = async (orderId: string, tableNumber: string, sessionId: string, status: 'preparing' | 'ready' | 'served') => {
        const targetOrder = tableOrders.find(o => o.id === orderId);
        const previousStatus = targetOrder?.status || 'pending';

        // Track for undo
        setRecentlyProcessed(prev => [{
            id: orderId,
            type: 'table-order' as const,
            label: `T${tableNumber}`,
            previousStatus,
            newStatus: status,
            timestamp: new Date().toISOString(),
        }, ...prev.filter(p => p.id !== orderId)].slice(0, 10));

        // Optimistic update
        setTableOrders(prev => prev.map(o =>
            o.id === orderId ? { ...o, status } : o
        ));

        try {
            const { error } = await supabase
                .from('table_orders')
                .update({ status })
                .eq('id', orderId);

            if (error) throw error;

            // Broadcast status update to customer
            const channel = supabase.channel(`table-order-status-${sessionId}`);
            await channel.send({
                type: 'broadcast',
                event: 'order-status-update',
                payload: { order_id: orderId, status }
            });
            supabase.removeChannel(channel);

            // Broadcast to Service Area and other displays via persistent shared channel
            // IMPORTANT: Do NOT create a new channel('table-order-sync') — it returns the
            // existing persistent listener and removeChannel would destroy it.
            tableOrderChannelRef.current?.send({
                type: 'broadcast',
                event: 'table-order-status-update',
                payload: { order_id: orderId, table_number: tableNumber, status }
            });

            // Also broadcast to other kitchen/service displays
            syncChannelRef.current?.send({
                type: 'broadcast',
                event: 'bills-updated',
                payload: { table_order_id: orderId, status }
            });

            if (status === 'ready') {
                announce(`Table ${tableNumber} order is ready`);
                toast({ title: '🔔 Table Order Ready!', description: `Table ${tableNumber} order ready` });
            } else if (status === 'preparing') {
                toast({ title: '👨‍🍳 Preparing', description: `Table ${tableNumber} order` });
            }
        } catch (error) {
            console.error('Table order update failed:', error);
            fetchTableOrders();
            toast({ title: 'Update Failed', description: 'Please try again', variant: 'destructive' });
        }
    };

    const handleRefreshClick = () => {
        fetchBills();
    };

    // Only show loading on initial load, not on refreshes
    if (loading && !initialLoadDone) {
        return (
            <div className="min-h-screen bg-background p-4">
                <div className="flex flex-col items-center justify-center h-64 gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
                    <p className="text-sm text-muted-foreground">Loading kitchen orders...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header Bar */}
            <div className="bg-card border-b sticky top-0 z-10 px-4 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <ChefHat className="w-8 h-8 text-primary" />
                        <div>
                            <h1 className="text-xl font-bold">Kitchen Display</h1>
                            <p className="text-xs text-muted-foreground">
                                {formatTimeAMPM(currentTime)} • {bills.length + tableOrders.length} active orders
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Online/Offline Status */}
                        <div className={cn(
                            "flex items-center gap-1.5 px-2 py-1 rounded-full border",
                            isOnline
                                ? "bg-green-500/10 border-green-500/20"
                                : "bg-orange-500/10 border-orange-500/20"
                        )}>
                            {isOnline ? (
                                <>
                                    <Wifi className="w-3.5 h-3.5 text-green-500" />
                                    <span className="text-[10px] uppercase tracking-wider font-bold text-green-600">Live</span>
                                </>
                            ) : (
                                <>
                                    <WifiOff className="w-3.5 h-3.5 text-orange-500" />
                                    <span className="text-[10px] uppercase tracking-wider font-bold text-orange-600">Offline</span>
                                </>
                            )}
                        </div>

                        {/* Pending Sync Badge */}
                        {pendingUpdatesCount > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleManualSync}
                                disabled={!isOnline || syncing}
                                className="gap-1"
                            >
                                <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
                                <Badge variant="secondary" className="text-[10px] px-1.5">
                                    {pendingUpdatesCount}
                                </Badge>
                            </Button>
                        )}

                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setVoiceEnabled(!voiceEnabled)}
                            className={cn(voiceEnabled && "bg-primary text-primary-foreground")}
                        >
                            {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleRefreshClick}>
                            Refresh
                        </Button>
                    </div>
                </div>
                {/* Filters row */}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                    <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                        <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="pending">New</SelectItem>
                            <SelectItem value="preparing">Preparing</SelectItem>
                            <SelectItem value="ready">Ready</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={timeFilter} onValueChange={(v: any) => setTimeFilter(v)}>
                        <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue placeholder="Time window" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All time</SelectItem>
                            <SelectItem value="15">Last 15 min</SelectItem>
                            <SelectItem value="30">Last 30 min</SelectItem>
                            <SelectItem value="60">Last 60 min</SelectItem>
                        </SelectContent>
                    </Select>
                    {(statusFilter !== 'all' || timeFilter !== 'all') && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                            onClick={() => { setStatusFilter('all'); setTimeFilter('all'); }}>
                            Clear
                        </Button>
                    )}
                </div>
            </div>

            <div className="px-4 pt-3"><AllBranchesReadOnlyBanner message="Switch to a specific branch to manage kitchen orders." /></div>

            {/* Offline Banner */}
            {!isOnline && (
                <div className="bg-orange-500/10 border-b border-orange-500/20 px-4 py-2 text-center">
                    <span className="text-sm text-orange-700 dark:text-orange-400">
                        📴 You're offline. Changes will sync when connection restores.
                    </span>
                </div>
            )}

            {/* Main Content */}
            <div className="p-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                    {/* PENDING Column */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-3 h-3 rounded-full bg-yellow-500" />
                            <h2 className="text-lg font-semibold">New Orders</h2>
                            <Badge variant="secondary">{pendingBills.length}</Badge>
                        </div>

                        {pendingBills.map((bill) => (
                            <KitchenOrderCard
                                key={bill.id}
                                bill={bill}
                                processing={processingBillId === bill.id}
                                onAction={() => updateKitchenStatus(bill.id, bill.bill_no, 'preparing')}
                                actionLabel="Start Preparing"
                                actionColor="bg-orange-500 hover:bg-orange-600"
                            />
                        ))}

                        {/* Table QR Orders - Pending */}
                        {pendingTableOrders.map((order) => (
                            <Card key={`to-${order.id}`} className="p-4 border-l-4 border-l-purple-500">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-xl font-bold">Table {order.table_number}</h3>
                                            <Badge className="bg-purple-100 text-purple-700 text-[10px]">QR Order</Badge>
                                        </div>
                                        <span className="text-xs text-muted-foreground">Order #{order.order_number}</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Clock className="w-3 h-3" />
                                        {getTimeElapsed(order.created_at)}
                                    </div>
                                </div>
                                <div className="space-y-1.5 mb-3">
                                    {order.items.map((item, idx) => (
                                        <div key={idx} className="bg-muted/30 rounded-lg px-3 py-2">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="font-medium">{item.name}</span>
                                                <Badge variant="secondary" className="font-bold text-base min-w-[60px] justify-center ml-2">
                                                    {formatQuantityWithUnit(item.quantity, item.unit)}
                                                </Badge>
                                            </div>
                                            {item.instructions && (
                                                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                                    📝 {item.instructions}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {order.customer_note && (
                                    <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2 mb-3 text-xs text-amber-700">
                                        💬 Customer Note: {order.customer_note}
                                    </div>
                                )}
                                <Button
                                    onClick={() => updateTableOrderStatus(order.id, order.table_number, order.session_id, 'preparing')}
                                    className="w-full text-white bg-orange-500 hover:bg-orange-600"
                                >
                                    Start Preparing
                                </Button>
                            </Card>
                        ))}

                        {pendingBills.length === 0 && pendingTableOrders.length === 0 && (
                            <Card className="p-6 text-center text-muted-foreground">
                                No new orders
                            </Card>
                        )}
                    </div>

                    {/* PREPARING Column */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-3 h-3 rounded-full bg-orange-500 animate-pulse" />
                            <h2 className="text-lg font-semibold">Preparing</h2>
                            <Badge variant="secondary">{preparingBills.length}</Badge>
                        </div>

                        {preparingBills.map((bill) => (
                            <KitchenOrderCard
                                key={bill.id}
                                bill={bill}
                                processing={processingBillId === bill.id}
                                onAction={() => updateKitchenStatus(bill.id, bill.bill_no, 'ready')}
                                actionLabel="Mark Ready"
                                actionColor="bg-green-500 hover:bg-green-600"
                            />
                        ))}

                        {/* Table QR Orders - Preparing */}
                        {preparingTableOrders.map((order) => (
                            <Card key={`to-${order.id}`} className="p-4 border-l-4 border-l-purple-500">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-xl font-bold">Table {order.table_number}</h3>
                                            <Badge className="bg-purple-100 text-purple-700 text-[10px]">QR Order</Badge>
                                        </div>
                                        <span className="text-xs text-muted-foreground">Order #{order.order_number}</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Clock className="w-3 h-3" />
                                        {getTimeElapsed(order.created_at)}
                                    </div>
                                </div>
                                <div className="space-y-1.5 mb-3">
                                    {order.items.map((item, idx) => (
                                        <div key={idx} className="bg-muted/30 rounded-lg px-3 py-2">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="font-medium">{item.name}</span>
                                                <Badge variant="secondary" className="font-bold text-base min-w-[60px] justify-center ml-2">
                                                    {formatQuantityWithUnit(item.quantity, item.unit)}
                                                </Badge>
                                            </div>
                                            {item.instructions && (
                                                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                                    📝 {item.instructions}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {order.customer_note && (
                                    <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2 mb-3 text-xs text-amber-700">
                                        💬 {order.customer_note}
                                    </div>
                                )}
                                <Button
                                    onClick={() => updateTableOrderStatus(order.id, order.table_number, order.session_id, 'ready')}
                                    className="w-full text-white bg-green-500 hover:bg-green-600"
                                >
                                    Mark Ready
                                </Button>
                            </Card>
                        ))}

                        {preparingBills.length === 0 && preparingTableOrders.length === 0 && (
                            <Card className="p-6 text-center text-muted-foreground">
                                Nothing cooking
                            </Card>
                        )}
                    </div>

                    {/* READY Column */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-3 h-3 rounded-full bg-green-500" />
                            <h2 className="text-lg font-semibold">Ready to Serve</h2>
                            <Badge variant="secondary">{readyBills.length}</Badge>
                        </div>

                        {readyBills.map((bill) => (
                            <Card
                                key={bill.id}
                                className="p-4 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-3xl font-bold text-green-600">
                                        #{bill.bill_no}
                                    </h3>
                                    {bill.table_no && (
                                        <span className="text-sm font-bold bg-green-200 text-green-800 px-2 py-1 rounded ml-2">
                                            {bill.table_no}
                                        </span>
                                    )}
                                    <Badge className="bg-green-500 text-white animate-pulse">
                                        <Bell className="w-3 h-3 mr-1" />
                                        READY
                                    </Badge>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    {getTimeElapsed(bill.created_at)} ago
                                </div>
                            </Card>
                        ))}

                        {/* Table QR Orders - Ready */}
                        {readyTableOrders.map((order) => (
                            <Card
                                key={`to-${order.id}`}
                                className="p-4 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900 border-l-4 border-l-purple-500"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="text-2xl font-bold text-green-600">
                                            Table {order.table_number}
                                        </h3>
                                        <div className="flex items-center gap-1.5">
                                            <Badge className="bg-purple-100 text-purple-700 text-[10px]">QR Order #{order.order_number}</Badge>
                                        </div>
                                    </div>
                                    <Badge className="bg-green-500 text-white animate-pulse">
                                        <Bell className="w-3 h-3 mr-1" />
                                        READY
                                    </Badge>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    {getTimeElapsed(order.created_at)} ago
                                </div>
                            </Card>
                        ))}

                        {readyBills.length === 0 && readyTableOrders.length === 0 && (
                            <Card className="p-6 text-center text-muted-foreground">
                                No orders ready
                            </Card>
                        )}
                    </div>

                </div>

                {/* Recently Processed - Undo Section */}
                {recentlyProcessed.filter(p => {
                    const elapsed = Date.now() - new Date(p.timestamp).getTime();
                    return elapsed < 5 * 60 * 1000; // 5 min window
                }).length > 0 && (
                        <div className="mt-6 pt-4 border-t border-dashed">
                            <h3 className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2 uppercase tracking-widest">
                                <Undo2 className="w-4 h-4" />
                                Recently Processed (Undo)
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {recentlyProcessed.filter(p => {
                                    const elapsed = Date.now() - new Date(p.timestamp).getTime();
                                    return elapsed < 5 * 60 * 1000;
                                }).map((p) => (
                                    <Button
                                        key={p.id}
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            if (p.type === 'bill') {
                                                updateKitchenStatus(p.id, p.label.replace('#', ''), p.previousStatus as any);
                                            } else {
                                                const order = tableOrders.find(o => o.id === p.id);
                                                if (order) {
                                                    updateTableOrderStatus(p.id, order.table_number, order.session_id, p.previousStatus as any);
                                                }
                                            }
                                            setRecentlyProcessed(prev => prev.filter(x => x.id !== p.id));
                                        }}
                                        className="gap-2 h-10 border-2 hover:bg-muted/50"
                                    >
                                        <Undo2 className="w-3 h-3 text-muted-foreground" />
                                        <span className="font-bold">{p.label}</span>
                                        <Badge
                                            variant={p.newStatus === 'ready' ? 'default' : 'secondary'}
                                            className="h-5 px-1.5 min-w-[20px] justify-center text-[10px]"
                                        >
                                            {p.previousStatus} ← {p.newStatus}
                                        </Badge>
                                    </Button>
                                ))}
                            </div>
                        </div>
                    )}

            </div>
        </div>
    );
};

// Kitchen Order Card Component
interface KitchenOrderCardProps {
    bill: KitchenBill;
    processing: boolean;
    onAction: () => void;
    actionLabel: string;
    actionColor: string;
}

const KitchenOrderCard: React.FC<KitchenOrderCardProps> = ({
    bill,
    processing,
    onAction,
    actionLabel,
    actionColor,
}) => {
    return (
        <Card className={cn("p-4", processing && "opacity-50")}>
            {/* Bill Header */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-bold">#{bill.bill_no}</h3>
                    {bill.order_type === 'parcel' && (
                        <Badge className="bg-amber-500 text-white text-[10px]">📦 PARCEL</Badge>
                    )}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {getTimeElapsed(bill.created_at)}
                </div>
                {bill.table_no && (
                    <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded absolute right-4 top-10">
                        {bill.table_no}
                    </span>
                )}
            </div>

            {/* Items List */}
            <div className="space-y-2 mb-3">
                {bill.bill_items.map((item) => (
                    <div
                        key={item.id}
                        className="flex items-center justify-between text-sm bg-muted/30 rounded-lg px-3 py-2"
                    >
                        <span className="font-medium flex-1">
                            {item.items?.name || 'Unknown'}
                        </span>
                        <Badge
                            variant="secondary"
                            className="font-bold text-base min-w-[60px] justify-center ml-2"
                        >
                            {formatQuantityWithUnit(item.quantity, item.items?.unit)}
                        </Badge>
                    </div>
                ))}
            </div>

            {/* Action Button */}
            <Button
                onClick={onAction}
                disabled={processing}
                className={cn("w-full text-white", actionColor)}
            >
                {processing ? 'Processing...' : actionLabel}
            </Button>
        </Card>
    );
};

export default KitchenDisplay;