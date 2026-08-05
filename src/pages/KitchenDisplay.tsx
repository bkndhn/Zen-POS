import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ServiceHeader, ServiceLoading, LivePill, SectionHeading, EmptyState } from '@/components/service/ServiceUI';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChefHat, Clock, Bell, Volume2, VolumeX, Wifi, WifiOff, RefreshCw, Undo2, Filter, Printer, CheckCircle2, TrendingUp, X, Activity } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from '@/hooks/use-toast';
import { getTimeElapsed, formatTimeAMPM, formatQuantityWithUnit } from '@/utils/timeUtils';
import { cn } from '@/lib/utils';
import { kitchenOfflineManager } from '@/utils/kitchenOfflineManager';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { RemoteOrdersKDS } from '@/components/RemoteOrdersKDS';
import { AllBranchesReadOnlyBanner } from '@/components/AllBranchesReadOnlyBanner';
import TableSeatGroups from '@/components/TableSeatGroups';
import { getOrderTargetLabel, getSeatText, shouldApplyStatusUpdate, mergeOrdersConflictSafe } from '@/utils/seatUtils';
import { printTableOrderKOT, printSeatGroupKOT } from '@/utils/kotGenerator';
import { triggerNewOrderPushNotification } from '@/utils/pwaPushNotifications';

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
    seat_id?: string | null;
    seat_label?: string | null;
    order_scope?: 'table' | 'seat' | null;
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
    const { profile , adminProfileId } = useAuth();
    const adminId = adminProfileId;
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
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);

    // Recently processed bills/orders for undo (last 5 minutes)
    const [recentlyProcessed, setRecentlyProcessed] = useState<Array<{
        id: string;
        type: 'bill' | 'table-order';
        label: string;
        previousStatus: string;
        newStatus: string;
        timestamp: string;
    }>>([]);

    // Update current time every 10s for responsive time warnings
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 10000);
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

    // --- WebAudio Chime Synthesis ---
    const audioCtxRef = useRef<AudioContext | null>(null);

    const getAudioCtx = useCallback(() => {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }
        return audioCtxRef.current;
    }, []);

    const playChime = useCallback((type: 'new-order' | 'order-ready') => {
        if (!voiceEnabled) return;
        try {
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            const masterGain = ctx.createGain();
            masterGain.gain.setValueAtTime(0.25, now);
            masterGain.connect(ctx.destination);

            if (type === 'new-order') {
                // Ascending three-note chime (C5 → E5 → G5)
                const freqs = [523.25, 659.25, 783.99];
                freqs.forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, now);
                    // ADSR envelope
                    gain.gain.setValueAtTime(0, now + i * 0.15);
                    gain.gain.linearRampToValueAtTime(0.6, now + i * 0.15 + 0.03); // attack
                    gain.gain.exponentialRampToValueAtTime(0.3, now + i * 0.15 + 0.1); // decay
                    gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.4); // release
                    osc.connect(gain);
                    gain.connect(masterGain);
                    osc.start(now + i * 0.15);
                    osc.stop(now + i * 0.15 + 0.5);
                });
            } else {
                // Two-tone ding (G5 → C6) for order ready
                const freqs = [783.99, 1046.5];
                freqs.forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, now);
                    gain.gain.setValueAtTime(0, now + i * 0.2);
                    gain.gain.linearRampToValueAtTime(0.7, now + i * 0.2 + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.35, now + i * 0.2 + 0.08);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.2 + 0.6);
                    osc.connect(gain);
                    gain.connect(masterGain);
                    osc.start(now + i * 0.2);
                    osc.stop(now + i * 0.2 + 0.7);
                });
            }
        } catch (e) {
            console.warn('[Kitchen] Chime playback error:', e);
        }
    }, [voiceEnabled, getAudioCtx]);

    // Voice announcement function (now also plays chime)
    const announce = useCallback((text: string, chimeType?: 'new-order' | 'order-ready') => {
        if (!voiceEnabled) return;
        if (chimeType) playChime(chimeType);
        if (!('speechSynthesis' in window)) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-IN';
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
    }, [voiceEnabled, playChime]);

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
                    announce(`New order received, Bill number ${payload.payload.bill_no}`, 'new-order');
                }
                const billNo = payload?.payload?.bill_no || 'New';
                const tableInfo = payload?.payload?.table_no ? `Table ${payload.payload.table_no}` : 'Takeaway / Order';
                const amount = payload?.payload?.total_amount || 0;
                triggerNewOrderPushNotification(billNo, tableInfo, amount);
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

    // Listen for table order broadcasts from customers and service devices
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
                        announce(`New table order from Table ${order.table_number}, ${getSeatText(order)}`, 'new-order');
                    }
                }
                fetchTableOrders();
            })
            .on('broadcast', { event: 'table-order-status-update' }, (payload: any) => {
                const data = payload?.payload;
                if (data?.order_id && data?.status) {
                    setTableOrders(prev => prev.map(o =>
                        o.id === data.order_id && shouldApplyStatusUpdate(o.status, data.status)
                            ? { ...o, status: data.status }
                            : o
                    ));
                }
            })
            .on('broadcast', { event: 'table-order-batch-status-update' }, (payload: any) => {
                const data = payload?.payload;
                if (Array.isArray(data?.order_ids) && data?.status) {
                    setTableOrders(prev => prev.map(o =>
                        data.order_ids.includes(o.id) && shouldApplyStatusUpdate(o.status, data.status)
                            ? { ...o, status: data.status }
                            : o
                    ));
                }
            })
            .subscribe();

        tableOrderChannelRef.current = channel;

        // Also subscribe to postgres_changes for table_orders with conflict-safe merge
        const pgChannel = supabase.channel('table-order-kitchen-pg')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'table_orders' }, () => {
                fetchTableOrders();
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'table_orders' }, (payload: any) => {
                if (payload.new?.id && payload.new?.status) {
                    setTableOrders(prev => prev.map(o =>
                        o.id === payload.new.id && shouldApplyStatusUpdate(o.status, payload.new.status)
                            ? { ...o, ...payload.new }
                            : o
                    ));
                }
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
                        announce(`New order received, Bill number ${billNo}`, 'new-order');
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
                    announce(`New order received, Bill number ${data.bill_no}`, 'new-order');
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
                announce(`Bill number ${billNo} is ready`, 'order-ready');
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

    // Extract unique item categories from all visible orders and compute bulk item counts with units
    const { allCategories, itemCountsMap, totalOrdersCount } = useMemo(() => {
        const names = new Set<string>();
        const counts: Record<string, { qty: number; unit: string; ordersCount: number }> = {};
        let totalOrders = 0;

        filteredBills.forEach(b => (b.bill_items || []).forEach(bi => {
            if (bi.items?.name) {
                const name = bi.items.name;
                names.add(name);
                const qty = bi.quantity || 1;
                const unit = (bi as any).unit || (bi.items as any)?.selling_unit || bi.items?.unit || 'pc';
                if (!counts[name]) {
                    counts[name] = { qty: 0, unit, ordersCount: 0 };
                }
                counts[name].qty += qty;
                counts[name].ordersCount += 1;
                totalOrders += 1;
            }
        }));

        filteredTableOrders.forEach(o => (o.items || []).forEach(item => {
            if (item.name) {
                const name = item.name;
                names.add(name);
                const qty = item.quantity || 1;
                const unit = item.unit || (item as any)?.selling_unit || 'pc';
                if (!counts[name]) {
                    counts[name] = { qty: 0, unit, ordersCount: 0 };
                }
                counts[name].qty += qty;
                counts[name].ordersCount += 1;
                totalOrders += 1;
            }
        }));

        return {
            allCategories: Array.from(names).sort(),
            itemCountsMap: counts,
            totalOrdersCount: totalOrders
        };
    }, [filteredBills, filteredTableOrders]);

    // Helper: compute urgency level from created_at
    const getUrgencyColor = useCallback((createdAt: string) => {
        const elapsed = (currentTime.getTime() - new Date(createdAt).getTime()) / 60000;
        if (elapsed > 20) return 'red' as const;
        if (elapsed > 10) return 'orange' as const;
        return 'green' as const;
    }, [currentTime]);

    const getElapsedMinutes = useCallback((createdAt: string) => {
        return Math.floor((currentTime.getTime() - new Date(createdAt).getTime()) / 60000);
    }, [currentTime]);

    // Urgency styling maps
    const urgencyBorderClass: Record<string, string> = {
        green: 'border-green-400 shadow-green-500/10',
        orange: 'border-orange-400 shadow-orange-500/20',
        red: 'border-red-500 shadow-red-500/30 shadow-lg',
    };
    const urgencyBadgeClass: Record<string, string> = {
        green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
        orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
        red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 animate-pulse',
    };

    // Group bills by status
    const pendingBills = filteredBills.filter(b => b.kitchen_status === 'pending');
    const preparingBills = filteredBills.filter(b => b.kitchen_status === 'preparing');
    const readyBills = filteredBills.filter(b => b.kitchen_status === 'ready');

    // Group table orders by status
    const pendingTableOrders = filteredTableOrders.filter(o => o.status === 'pending');
    const preparingTableOrders = filteredTableOrders.filter(o => o.status === 'preparing');
    const readyTableOrders = filteredTableOrders.filter(o => o.status === 'ready');

    // Update table order status (single ticket)
    const updateTableOrderStatus = async (orderId: string, tableNumber: string, sessionId: string, status: 'preparing' | 'ready' | 'served') => {
        const targetOrder = tableOrders.find(o => o.id === orderId);
        const previousStatus = targetOrder?.status || 'pending';
        const seatId = targetOrder?.seat_id;
        const seatText = targetOrder ? getSeatText(targetOrder) : 'Whole Table';
        const seatLabel = ` · ${seatText}`;
        const labelText = `T${tableNumber}${seatLabel}`;

        // Track for undo
        setRecentlyProcessed(prev => [{
            id: orderId,
            type: 'table-order' as const,
            label: labelText,
            previousStatus,
            newStatus: status,
            timestamp: new Date().toISOString(),
        }, ...prev.filter(p => p.id !== orderId)].slice(0, 10));

        // Conflict-safe optimistic update
        setTableOrders(prev => prev.map(o =>
            o.id === orderId && shouldApplyStatusUpdate(o.status, status)
                ? { ...o, status }
                : o
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
                payload: { order_id: orderId, status, timestamp: Date.now() }
            });
            supabase.removeChannel(channel);

            // Broadcast to Service Area and other displays via persistent shared channel
            tableOrderChannelRef.current?.send({
                type: 'broadcast',
                event: 'table-order-status-update',
                payload: { order_id: orderId, table_number: tableNumber, seat_id: seatId || null, seat_label: targetOrder?.seat_label || null, order_scope: targetOrder?.order_scope || 'table', status, timestamp: Date.now() }
            });

            // Also broadcast to other kitchen/service displays
            syncChannelRef.current?.send({
                type: 'broadcast',
                event: 'bills-updated',
                payload: { table_order_id: orderId, status, timestamp: Date.now() }
            });

            if (status === 'ready') {
                announce(`Table ${tableNumber}, ${seatText} order is ready`, 'order-ready');
                toast({ title: '🔔 Table Order Ready!', description: `Table ${tableNumber}${seatLabel} order ready` });
            } else if (status === 'preparing') {
                toast({ title: '👨‍🍳 Preparing', description: `Table ${tableNumber}${seatLabel} order` });
            } else if (status === 'served') {
                toast({ title: '✅ Order Served', description: `Table ${tableNumber}${seatLabel} served` });
            }
        } catch (error) {
            console.error('Table order update failed:', error);
            fetchTableOrders();
            toast({ title: 'Update Failed', description: 'Please try again', variant: 'destructive' });
        }
    };

    // Batch update table order status per seat group
    const updateSeatGroupStatus = async (
        tableNumber: string,
        seatKey: string,
        orders: KitchenTableOrder[],
        nextStatus: 'preparing' | 'ready' | 'served'
    ) => {
        if (orders.length === 0) return;
        const orderIds = orders.map(o => o.id);
        const seatText = getSeatText(orders[0]);
        const seatLabel = ` · ${seatText}`;
        const labelText = `Table ${tableNumber}${seatLabel}`;

        // 1. Conflict-safe optimistic update
        setTableOrders(prev => prev.map(o =>
            orderIds.includes(o.id) && shouldApplyStatusUpdate(o.status, nextStatus)
                ? { ...o, status: nextStatus }
                : o
        ));

        try {
            // 2. Batch update Supabase
            const { error } = await supabase
                .from('table_orders')
                .update({ status: nextStatus })
                .in('id', orderIds);

            if (error) throw error;

            // 3. Broadcast to customers and other displays in real-time
            orders.forEach(async (order) => {
                if (order.session_id) {
                    const channel = supabase.channel(`table-order-status-${order.session_id}`);
                    await channel.send({
                        type: 'broadcast',
                        event: 'order-status-update',
                        payload: { order_id: order.id, status: nextStatus, timestamp: Date.now() }
                    });
                    supabase.removeChannel(channel);
                }
            });

            // Persistent shared broadcast
            tableOrderChannelRef.current?.send({
                type: 'broadcast',
                event: 'table-order-batch-status-update',
                payload: { table_number: tableNumber, seat_key: seatKey, order_ids: orderIds, status: nextStatus, timestamp: Date.now() }
            });

            syncChannelRef.current?.send({
                type: 'broadcast',
                event: 'bills-updated',
                payload: { table_number: tableNumber, seat_key: seatKey, status: nextStatus, timestamp: Date.now() }
            });

            // Audio chime & toast
            if (nextStatus === 'ready') {
                announce(`Table ${tableNumber}, ${seatText} orders are ready`, 'order-ready');
                toast({ title: '🔔 Seat Ready!', description: `${labelText} orders marked ready` });
            } else if (nextStatus === 'preparing') {
                toast({ title: '👨‍🍳 Preparing Seat', description: `Started ${labelText}` });
            } else if (nextStatus === 'served') {
                toast({ title: '✅ Seat Served', description: `${labelText} served to customer` });
            }
        } catch (err) {
            console.error('Batch seat update failed:', err);
            fetchTableOrders();
            toast({ title: 'Seat Update Failed', description: 'Please try again', variant: 'destructive' });
        }
    };

    const handleRefreshClick = () => {
        fetchBills();
    };

    // Only show loading on initial load, not on refreshes
    if (loading && !initialLoadDone) {
        return <ServiceLoading label="Loading kitchen orders…" cards={6} />;
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header Bar */}
            <div className="bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 border-b border-border/60 sticky top-0 z-20 px-3 sm:px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="grid place-items-center shrink-0 h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25">
                            <ChefHat className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h1 className="text-[15px] sm:text-xl font-bold tracking-tight leading-tight">Kitchen Display</h1>
                                <LivePill online={isOnline} />
                            </div>
                            <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight mt-0.5 tabular-nums">
                                {formatTimeAMPM(currentTime)} • {bills.length + tableOrders.length} active orders
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        {/* Pending Sync Badge */}
                        {pendingUpdatesCount > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleManualSync}
                                disabled={!isOnline || syncing}
                                className="h-8 rounded-xl gap-1"
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
                            className={cn("h-8 w-8 rounded-xl", voiceEnabled && "bg-primary text-primary-foreground border-primary")}
                        >
                            {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setIsAnalyticsOpen(!isAnalyticsOpen)}
                            className={cn("h-8 w-8 rounded-xl", isAnalyticsOpen && "bg-primary text-primary-foreground border-primary")}
                            title="Analytics"
                        >
                            <TrendingUp className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs" onClick={handleRefreshClick}>
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

                {/* Category Tab Strip */}
                {allCategories.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-muted">
                        <button
                            onClick={() => setCategoryFilter('all')}
                            className={cn(
                                'shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors flex items-center gap-1',
                                categoryFilter === 'all'
                                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                    : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
                            )}
                        >
                            <span>All Items</span>
                            <span className={cn(
                                "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                                categoryFilter === 'all'
                                    ? "bg-primary-foreground/20 text-primary-foreground"
                                    : "bg-muted text-muted-foreground"
                            )}>
                                {totalOrdersCount}
                            </span>
                        </button>
                        {allCategories.map(cat => {
                            const info = itemCountsMap[cat];
                            const formattedQtyUnit = info ? formatQuantityWithUnit(info.qty, info.unit) : '0';
                            const isSelected = categoryFilter === cat;
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setCategoryFilter(isSelected ? 'all' : cat)}
                                    className={cn(
                                        'shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors flex items-center gap-1',
                                        isSelected
                                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                            : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
                                    )}
                                >
                                    <span>{cat}</span>
                                    <span className={cn(
                                        "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                                        isSelected
                                            ? "bg-primary-foreground/20 text-primary-foreground"
                                            : "bg-primary/10 text-primary"
                                    )}>
                                        ({formattedQtyUnit})
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
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
                        <SectionHeading title="New Orders" tone="amber" count={pendingBills.length} pulse className="mb-3 sticky top-[104px] z-10" />


                        {pendingBills.map((bill) => (
                            <KitchenOrderCard
                                key={bill.id}
                                bill={bill}
                                processing={processingBillId === bill.id}
                                onAction={() => updateKitchenStatus(bill.id, bill.bill_no, 'preparing')}
                                actionLabel="Start Preparing"
                                actionColor="bg-orange-500 hover:bg-orange-600"
                                currentTime={currentTime}
                                highlightedCategory={categoryFilter}
                            />
                        ))}

                        {/* Table QR Orders - Pending */}
                        <TableSeatGroups
                            orders={pendingTableOrders}
                            keyPrefix="pending"
                            onUpdateSeatStatus={updateSeatGroupStatus}
                            onPrintSeatGroup={printSeatGroupKOT}
                            renderOrder={(order) => {
                                const urgency = getUrgencyColor(order.created_at);
                                const elapsedMin = getElapsedMinutes(order.created_at);
                                return (
                                <Card key={`to-${order.id}`} className={cn("p-4 border-l-4 border-l-purple-500 border-2", urgencyBorderClass[urgency])}>
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-xl font-bold">{getOrderTargetLabel(order)}</h3>
                                                <Badge className="bg-purple-100 text-purple-700 text-[10px]">QR Order</Badge>
                                            </div>
                                            <span className="text-xs text-muted-foreground">Order #{order.order_number}</span>
                                        </div>
                                        <Badge className={cn('text-xs font-mono font-bold', urgencyBadgeClass[urgency])}>
                                            <Clock className="w-3 h-3 mr-1" />
                                            {elapsedMin < 60 ? `${elapsedMin}m` : `${Math.floor(elapsedMin/60)}h ${elapsedMin%60}m`}
                                        </Badge>
                                    </div>
                                    <div className="space-y-1.5 mb-3">
                                        {(order.items || []).map((item, idx) => {
                                            const isHighlighted = categoryFilter !== 'all' && item.name === categoryFilter;
                                            return (
                                            <div key={idx} className={cn(
                                                'rounded-lg px-3 py-2',
                                                isHighlighted ? 'bg-primary/15 ring-2 ring-primary/40' : 'bg-muted/30',
                                                categoryFilter !== 'all' && !isHighlighted && 'opacity-40'
                                            )}>
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className={cn('font-medium', isHighlighted && 'text-primary font-bold')}>{item.name}</span>
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
                                            );
                                        })}
                                    </div>
                                    {order.customer_note && (
                                        <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2 mb-3 text-xs text-amber-700">
                                            💬 Customer Note: {order.customer_note}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => printTableOrderKOT(order)}
                                            className="h-9 px-3 border border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 shrink-0"
                                            title="Print KOT Ticket"
                                        >
                                            <Printer className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            onClick={() => updateTableOrderStatus(order.id, order.table_number, order.session_id, 'preparing')}
                                            className="flex-1 text-white bg-orange-500 hover:bg-orange-600 font-bold"
                                        >
                                            Start Preparing
                                        </Button>
                                    </div>
                                </Card>
                                );
                            }}
                        />

                        {pendingBills.length === 0 && pendingTableOrders.length === 0 && (
                            <Card className="p-6 text-center text-muted-foreground">
                                No new orders
                            </Card>
                        )}
                    </div>

                    {/* PREPARING Column */}
                    <div className="space-y-3">
                        <SectionHeading title="Preparing" tone="rose" count={preparingBills.length} pulse className="mb-3 sticky top-[104px] z-10" />


                        {preparingBills.map((bill) => (
                            <KitchenOrderCard
                                key={bill.id}
                                bill={bill}
                                processing={processingBillId === bill.id}
                                onAction={() => updateKitchenStatus(bill.id, bill.bill_no, 'ready')}
                                actionLabel="Mark Ready"
                                actionColor="bg-green-500 hover:bg-green-600"
                                currentTime={currentTime}
                                highlightedCategory={categoryFilter}
                            />
                        ))}

                        {/* Table QR Orders - Preparing */}
                        <TableSeatGroups
                            orders={preparingTableOrders}
                            keyPrefix="preparing"
                            onUpdateSeatStatus={updateSeatGroupStatus}
                            onPrintSeatGroup={printSeatGroupKOT}
                            renderOrder={(order) => {
                                const urgency = getUrgencyColor(order.created_at);
                                const elapsedMin = getElapsedMinutes(order.created_at);
                                return (
                                <Card key={`to-${order.id}`} className={cn("p-4 border-l-4 border-l-purple-500 border-2", urgencyBorderClass[urgency])}>
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-xl font-bold">{getOrderTargetLabel(order)}</h3>
                                                <Badge className="bg-purple-100 text-purple-700 text-[10px]">QR Order</Badge>
                                            </div>
                                            <span className="text-xs text-muted-foreground">Order #{order.order_number}</span>
                                        </div>
                                        <Badge className={cn('text-xs font-mono font-bold', urgencyBadgeClass[urgency])}>
                                            <Clock className="w-3 h-3 mr-1" />
                                            {elapsedMin < 60 ? `${elapsedMin}m` : `${Math.floor(elapsedMin/60)}h ${elapsedMin%60}m`}
                                        </Badge>
                                    </div>
                                    <div className="space-y-1.5 mb-3">
                                        {(order.items || []).map((item, idx) => {
                                            const isHighlighted = categoryFilter !== 'all' && item.name === categoryFilter;
                                            return (
                                            <div key={idx} className={cn(
                                                'rounded-lg px-3 py-2',
                                                isHighlighted ? 'bg-primary/15 ring-2 ring-primary/40' : 'bg-muted/30',
                                                categoryFilter !== 'all' && !isHighlighted && 'opacity-40'
                                            )}>
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className={cn('font-medium', isHighlighted && 'text-primary font-bold')}>{item.name}</span>
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
                                            );
                                        })}
                                    </div>
                                    {order.customer_note && (
                                        <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2 mb-3 text-xs text-amber-700">
                                            💬 {order.customer_note}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => printTableOrderKOT(order)}
                                            className="h-9 px-3 border border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 shrink-0"
                                            title="Print KOT Ticket"
                                        >
                                            <Printer className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            onClick={() => updateTableOrderStatus(order.id, order.table_number, order.session_id, 'ready')}
                                            className="flex-1 text-white bg-green-500 hover:bg-green-600 font-bold"
                                        >
                                            Mark Ready
                                        </Button>
                                    </div>
                                </Card>
                                );
                            }}
                        />

                        {preparingBills.length === 0 && preparingTableOrders.length === 0 && (
                            <Card className="p-6 text-center text-muted-foreground">
                                Nothing cooking
                            </Card>
                        )}
                    </div>

                    {/* READY Column */}
                    <div className="space-y-3">
                        <SectionHeading title="Ready to Serve" tone="emerald" count={readyBills.length} className="mb-3 sticky top-[104px] z-10" />


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
                        <TableSeatGroups
                            orders={readyTableOrders}
                            keyPrefix="ready"
                            onUpdateSeatStatus={updateSeatGroupStatus}
                            onPrintSeatGroup={printSeatGroupKOT}
                            renderOrder={(order) => (
                            <Card
                                key={`to-${order.id}`}
                                className="p-4 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900 border-l-4 border-l-purple-500"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="text-2xl font-bold text-green-600">
                                            {getOrderTargetLabel(order)}
                                        </h3>
                                        <div className="flex items-center gap-1.5">
                                            <Badge className="bg-purple-100 text-purple-700 text-[10px]">QR Order #{order.order_number}</Badge>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => printTableOrderKOT(order)}
                                            className="h-8 px-2 border border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50"
                                            title="Print KOT Ticket"
                                        >
                                            <Printer className="w-3.5 h-3.5" />
                                        </Button>
                                        <Badge className="bg-green-500 text-white animate-pulse">
                                            <Bell className="w-3 h-3 mr-1" />
                                            READY
                                        </Badge>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-green-200/60 dark:border-green-900/60">
                                    <span className="text-xs text-muted-foreground">{getTimeElapsed(order.created_at)} ago</span>
                                    <Button
                                        size="sm"
                                        onClick={() => updateTableOrderStatus(order.id, order.table_number, order.session_id, 'served')}
                                        className="bg-blue-600 hover:bg-blue-700 text-white h-7 px-3 text-xs font-bold"
                                    >
                                        <CheckCircle2 className="w-3 h-3 mr-1" />
                                        Mark Served
                                    </Button>
                                </div>
                            </Card>
                        )} />

                        {readyBills.length === 0 && readyTableOrders.length === 0 && (
                            <Card className="p-6 text-center text-muted-foreground">
                                No orders ready
                            </Card>
                        )}
                    </div>

                </div>

                {/* ========== REMOTE ORDERS SECTION ========== */}
                {adminId && branchFilterId && (
                    <div className="mt-6 pt-4 border-t-2 border-dashed border-purple-300">
                        <RemoteOrdersKDS adminId={adminId} branchId={branchFilterId} />
                    </div>
                )}

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

            {/* Analytics Panel Overlay */}
            {isAnalyticsOpen && (
                <>
                    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40" onClick={() => setIsAnalyticsOpen(false)} />
                    <KitchenAnalytics bills={bills} tableOrders={tableOrders} onClose={() => setIsAnalyticsOpen(false)} />
                </>
            )}
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
    currentTime: Date;
    highlightedCategory: string;
}

const KitchenOrderCard: React.FC<KitchenOrderCardProps> = ({
    bill,
    processing,
    onAction,
    actionLabel,
    actionColor,
    currentTime,
    highlightedCategory,
}) => {
    // Compute elapsed time and urgency
    const elapsedMin = Math.floor((currentTime.getTime() - new Date(bill.created_at).getTime()) / 60000);
    const urgency: 'green' | 'orange' | 'red' = elapsedMin > 20 ? 'red' : elapsedMin > 10 ? 'orange' : 'green';

    const borderClass: Record<string, string> = {
        green: 'border-green-400 shadow-green-500/10',
        orange: 'border-orange-400 shadow-orange-500/20',
        red: 'border-red-500 shadow-red-500/30 shadow-lg',
    };
    const badgeClass: Record<string, string> = {
        green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
        orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
        red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 animate-pulse',
    };

    return (
        <Card className={cn("p-4 border-2 transition-shadow", borderClass[urgency], processing && "opacity-50")}>
            {/* Bill Header */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-bold">#{bill.bill_no}</h3>
                    {bill.order_type === 'parcel' && (
                        <Badge className="bg-amber-500 text-white text-[10px]">📦 PARCEL</Badge>
                    )}
                </div>
                <Badge className={cn('text-xs font-mono font-bold', badgeClass[urgency])}>
                    <Clock className="w-3 h-3 mr-1" />
                    {elapsedMin < 60 ? `${elapsedMin}m` : `${Math.floor(elapsedMin/60)}h ${elapsedMin%60}m`}
                </Badge>
                {bill.table_no && (
                    <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded absolute right-4 top-10">
                        {bill.table_no}
                    </span>
                )}
            </div>

            {/* Items List */}
            <div className="space-y-2 mb-3">
                {(bill.bill_items || []).map((item) => {
                    const itemName = item.items?.name || 'Unknown';
                    const isHighlighted = highlightedCategory !== 'all' && itemName === highlightedCategory;
                    return (
                    <div
                        key={item.id}
                        className={cn(
                            'flex items-center justify-between text-sm rounded-lg px-3 py-2',
                            isHighlighted ? 'bg-primary/15 ring-2 ring-primary/40' : 'bg-muted/30',
                            highlightedCategory !== 'all' && !isHighlighted && 'opacity-40'
                        )}
                    >
                        <span className={cn('font-medium flex-1', isHighlighted && 'text-primary font-bold')}>
                            {itemName}
                        </span>
                        <Badge
                            variant="secondary"
                            className="font-bold text-base min-w-[60px] justify-center ml-2"
                        >
                            {formatQuantityWithUnit(item.quantity, item.items?.unit)}
                        </Badge>
                    </div>
                    );
                })}
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

const KitchenAnalytics = ({ bills, tableOrders, onClose }: { bills: any[], tableOrders: any[], onClose: () => void }) => {
    // Current Load
    const loadData = [
        { name: 'Pending', count: bills.filter(b => b.kitchen_status === 'pending').length + tableOrders.filter(o => o.status === 'pending').length, fill: '#f59e0b' },
        { name: 'Preparing', count: bills.filter(b => b.kitchen_status === 'preparing').length + tableOrders.filter(o => o.status === 'preparing').length, fill: '#f43f5e' },
        { name: 'Ready', count: bills.filter(b => b.kitchen_status === 'ready').length + tableOrders.filter(o => o.status === 'ready').length, fill: '#10b981' },
    ];

    // Item Prep Times
    const itemStats: Record<string, { totalMs: number; count: number }> = {};
    
    const processItems = (items: any[], orderCreatedAt: string, orderUpdatedAt?: string) => {
        const start = new Date(orderCreatedAt).getTime();
        const end = orderUpdatedAt ? new Date(orderUpdatedAt).getTime() : Date.now();
        const prepTimeMs = Math.max(0, end - start);
        
        items.forEach(item => {
            const name = item.name || item.items?.name;
            if (name) {
                if (!itemStats[name]) itemStats[name] = { totalMs: 0, count: 0 };
                itemStats[name].totalMs += prepTimeMs;
                itemStats[name].count += 1;
            }
        });
    };

    bills.filter(b => b.kitchen_status === 'ready').forEach(b => {
        processItems(b.bill_items || [], b.created_at, b.updated_at);
    });
    tableOrders.filter(o => o.status === 'ready').forEach(o => {
        processItems(o.items || [], o.created_at, o.updated_at);
    });

    const itemPrepTimes = Object.entries(itemStats).map(([name, stats]) => ({
        name,
        avgMs: stats.totalMs / stats.count,
        avgMin: Math.round((stats.totalMs / stats.count) / 60000)
    })).sort((a, b) => b.avgMs - a.avgMs).slice(0, 10);

    // Heatmap (orders by hour)
    const hourCounts = new Array(24).fill(0);
    [...bills, ...tableOrders].forEach(o => {
        const h = new Date(o.created_at).getHours();
        hourCounts[h]++;
    });
    const peakHours = hourCounts.map((count, hour) => {
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 === 0 ? 12 : hour % 12;
      return { hour: `${displayHour}:00 ${ampm}`, count };
    }).filter(h => h.count > 0);

    return (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[450px] bg-background/95 backdrop-blur-xl border-l z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-bold">Kitchen Analytics</h2>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Current Load */}
                <section>
                    <h3 className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wider">Current Load</h3>
                    <div className="h-[150px] w-full bg-card rounded-xl border p-3">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={loadData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={80} fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip cursor={{fill: 'var(--muted)'}} contentStyle={{ borderRadius: '8px', backgroundColor: 'var(--background)' }} />
                                <Bar dataKey="count" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                {/* Avg Prep Time */}
                <section>
                    <h3 className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wider">Avg Prep Time (Top 10)</h3>
                    <div className="space-y-3 bg-card rounded-xl border p-3">
                        {itemPrepTimes.length === 0 ? (
                            <div className="text-sm text-muted-foreground text-center py-4">Not enough completed data</div>
                        ) : (
                            itemPrepTimes.map(item => (
                                <div key={item.name} className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span className="font-medium truncate max-w-[200px]">{item.name}</span>
                                        <span className={cn("font-bold", item.avgMin > 20 ? 'text-red-500' : item.avgMin > 10 ? 'text-orange-500' : 'text-green-500')}>
                                            {item.avgMin} min
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                        <div 
                                            className={cn("h-full rounded-full transition-all", item.avgMin > 20 ? 'bg-red-500' : item.avgMin > 10 ? 'bg-orange-500' : 'bg-green-500')}
                                            style={{ width: `${Math.min(100, (item.avgMin / 30) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
                
                {/* Peak Hours */}
                <section>
                    <h3 className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wider">Today's Peak Hours</h3>
                    <div className="flex flex-wrap gap-2">
                        {peakHours.length === 0 ? (
                            <div className="text-sm text-muted-foreground">No orders yet today</div>
                        ) : (
                            peakHours.map(ph => (
                                <div key={ph.hour} className="flex flex-col items-center justify-center p-3 rounded-xl bg-card border min-w-[70px]">
                                    <span className="text-xs text-muted-foreground mb-1">{ph.hour}</span>
                                    <span className="text-xl font-bold">{ph.count}</span>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default KitchenDisplay;