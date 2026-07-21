import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Receipt, ChevronRight, Clock, Loader2, ShoppingCart, Plus, Minus, Trash2, AlertTriangle, LayoutGrid, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInstantBillNumber, initBillCounter, syncBillCounter } from '@/utils/billNumberGenerator';
import { calculateSmartQtyCount, getTimeElapsed } from '@/utils/timeUtils';
import { CompletePaymentDialog } from '@/components/CompletePaymentDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useNetworkStatus } from '@/hooks/useOffline';
import { printBrowserReceipt } from '@/utils/browserPrinter';
import { printKOTs, KOTPrintStationResult } from '@/utils/kotGenerator';
import { toast as sonnerToast } from 'sonner';

// BroadcastChannel for instant cross-tab sync
const billsChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bills-updates') : null;

interface TableOrder {
    id: string;
    admin_id: string;
    table_number: string;
    session_id: string;
    seat_id?: string | null;
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
    is_billed: boolean;
}

interface TableWithOrders {
    table_number: string;
    seat_id?: string | null;
    orders: TableOrder[];
    total: number;
    orderCount: number;
}

interface PaymentType {
    id: string;
    payment_type: string;
    is_disabled: boolean;
    is_default: boolean;
}

interface CartItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
    unit?: string;
    base_value?: number;
    quantity_step?: number;
    stock_quantity?: number;
    unlimited_stock?: boolean;
    tax_rate_id?: string | null;
    is_tax_inclusive?: boolean;
    hsn_code?: string | null;
    category?: string | null;
    selling_unit?: string | null;
    inventory_unit?: string | null;
}

const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
    pending: { label: 'Pending', color: 'bg-yellow-500', icon: '⏳' },
    preparing: { label: 'Preparing', color: 'bg-orange-500', icon: '👨‍🍳' },
    ready: { label: 'Ready', color: 'bg-green-500', icon: '✅' },
    served: { label: 'Served', color: 'bg-blue-500', icon: '🍽️' },
    cancelled: { label: 'Cancelled', color: 'bg-red-500', icon: '❌' },
};

const TableOrderBilling: React.FC = () => {
    const { profile , adminProfileId , adminAuthUid } = useAuth();
    const adminId = adminProfileId;
    const { operatingBranchId, activeBranch } = useBranch();
    const isOnline = useNetworkStatus();
    const [loading, setLoading] = useState(true);
    const [tables, setTables] = useState<TableWithOrders[]>([]);
    const [configuredTables, setConfiguredTables] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
    const [selectedTable, setSelectedTable] = useState<TableWithOrders | null>(null);
    const [isBilling, setIsBilling] = useState(false);
    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([]);
    const [additionalCharges, setAdditionalCharges] = useState<any[]>([]);
    const [whatsappEnabled, setWhatsappEnabled] = useState(false);
    const [whatsappShareMode, setWhatsappShareMode] = useState<'text' | 'image'>('text');
    const [billSettings, setBillSettings] = useState<any>(null);
    const [showOrderType, setShowOrderType] = useState(false);
    const [itemCategories, setItemCategories] = useState<any[]>([]);
    const retryKOTRef = useRef<(() => Promise<unknown>) | null>(null);

    const fetchItems = useCallback(async () => {
        if (!adminId) return;
        try {
            let q = supabase
                .from('items')
                .select('id, tax_rate_id, is_tax_inclusive, hsn_code, is_saleable, category, unit, selling_unit, inventory_unit')
                .eq('admin_id', adminId)
                .eq('is_active', true);
            if (operatingBranchId) q = q.eq('branch_id', operatingBranchId);
            const { data } = await q;
            if (data) {
                const filtered = data.filter((item: any) => item.is_saleable !== false);
                setItems(filtered);
            }
        } catch (e) {
            console.error('Error fetching items for tax lookup:', e);
        }
    }, [adminId, operatingBranchId]);

    const [gstSettings, setGstSettings] = useState<{
        enabled: boolean;
        gstin: string;
        isComposition: boolean;
        taxRatesMap: Record<string, { rate: number; name: string; cess: number; hsn_code: string }>;
    }>({
        enabled: false,
        gstin: '',
        isComposition: false,
        taxRatesMap: {}
    });

    const [optionsDialogOpen, setOptionsDialogOpen] = useState(false);
    const [splitDialogOpen, setSplitDialogOpen] = useState(false);
    const [splitType, setSplitType] = useState<'item' | 'even' | null>(null);
    const [checkedSplitItems, setCheckedSplitItems] = useState<Record<string, number>>({});
    const [evenSplitParts, setEvenSplitParts] = useState(2);
    const [evenSplitTracking, setEvenSplitTracking] = useState<{ completedParts: number; totalParts: number; totalAmount: number } | null>(null);
    const syncChannelRef = useRef<any>(null);
    const tableOrderChannelRef = useRef<any>(null);


    const getCartForTable = useCallback((table: TableWithOrders): CartItem[] => {
        const mergedItems: Record<string, CartItem> = {};

        table.orders.forEach(order => {
            order.items.forEach(item => {
                const dbItem = items.find(i => i.id === item.item_id);
                if (mergedItems[item.item_id]) {
                    mergedItems[item.item_id].quantity += item.quantity;
                } else {
                    mergedItems[item.item_id] = {
                        id: item.item_id,
                        name: item.name,
                        price: item.price,
                        quantity: item.quantity,
                        unit: item.unit,
                        base_value: item.base_value,
                        tax_rate_id: dbItem?.tax_rate_id || null,
                        is_tax_inclusive: dbItem?.is_tax_inclusive !== false,
                        hsn_code: dbItem?.hsn_code || null,
                        category: dbItem?.category || null,
                        selling_unit: dbItem?.selling_unit || item.unit || null,
                        inventory_unit: dbItem?.inventory_unit || dbItem?.unit || item.unit || null,
                    };
                }
            });
        });

        return Object.values(mergedItems);
    }, [items]);

    // Fetch payment types
    const fetchPaymentTypes = useCallback(async () => {
        if (!adminId) return;
        try {
            let query = (supabase as any)
                .from('payments')
                .select('*')
                .eq('admin_id', adminId)
                .eq('is_disabled', false);

            if (operatingBranchId) {
                query = query.eq('branch_id', operatingBranchId);
            }

            const { data, error } = await query.order('payment_type');
            if (error) throw error;
            setPaymentTypes(data || []);
        } catch (error) {
            console.error('Error fetching payment types:', error);
        }
    }, [adminId, operatingBranchId]);

    const fetchItemCategories = useCallback(async () => {
        if (!adminId) return;
        try {
            let q: any = supabase
                .from('item_categories')
                .select('id, name, print_station, is_deleted')
                .eq('admin_id', adminId)
                .eq('is_deleted', false);
            if (operatingBranchId) q = q.eq('branch_id', operatingBranchId);
            const { data, error } = await q.order('name');
            if (error) throw error;
            setItemCategories(data || []);
        } catch (e) {
            console.warn('Error fetching item categories:', e);
        }
    }, [adminId, operatingBranchId]);

    // Fetch additional charges
    const fetchAdditionalCharges = useCallback(async () => {
        if (!adminId) return;
        try {
            let query = (supabase as any)
                .from('additional_charges')
                .select('*')
                .eq('admin_id', adminId)
                .eq('is_active', true);

            if (operatingBranchId) {
                query = query.eq('branch_id', operatingBranchId);
            }

            const { data, error } = await query.order('name');
            if (error) throw error;
            setAdditionalCharges(data || []);
        } catch (error) {
            console.error('Error fetching additional charges:', error);
        }
    }, [adminId, operatingBranchId]);

    // Fetch WhatsApp/shop settings
    const fetchShopSettings = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            let targetAuthId = user.id;
            if (profile?.role === 'user' && profile.admin_id) {
                const { data: parentProfile } = await supabase
                    .from('profiles')
                    .select('user_id')
                    .eq('id', profile.admin_id)
                    .single();
                if (parentProfile?.user_id) {
                    targetAuthId = parentProfile.user_id;
                }
            }

            let query = supabase
                .from('shop_settings')
                .select('*')
                .eq('user_id', targetAuthId);

            if (operatingBranchId) {
                query = query.eq('branch_id', operatingBranchId);
            } else {
                query = query.is('branch_id', null);
            }

            let { data, error } = await query.maybeSingle();

            // Fallback: main branch or any branch
            if (!data && !error) {
                const { data: mainBranch } = await supabase
                    .from('branches')
                    .select('id')
                    .eq('admin_id', adminId)
                    .eq('is_main', true)
                    .maybeSingle();

                if (mainBranch?.id) {
                    const { data: fallbackData } = await supabase
                        .from('shop_settings')
                        .select('*')
                        .eq('user_id', targetAuthId)
                        .eq('branch_id', mainBranch.id)
                        .maybeSingle();
                    data = fallbackData;
                }

                if (!data) {
                    const { data: anyData } = await supabase
                        .from('shop_settings')
                        .select('*')
                        .eq('user_id', targetAuthId)
                        .order('branch_id', { nullsFirst: false })
                        .limit(1)
                        .maybeSingle();
                    data = anyData;
                }
            }

            if (data) {
                const settings = {
                    shopName: (activeBranch?.shop_name && activeBranch.shop_name.trim()) || data.shop_name || '',
                    address: (activeBranch?.address && activeBranch.address.trim()) || data.address || '',
                    contactNumber: (activeBranch?.contact_number && activeBranch.contact_number.trim()) || data.contact_number || '',
                    logoUrl: (activeBranch?.logo_url && activeBranch.logo_url.trim()) || data.logo_url || '',
                    whatsapp: data.whatsapp || '',
                    showWhatsapp: data.show_whatsapp,
                    printerWidth: data.printer_width as '58mm' | '80mm' || '58mm',
                    whatsappEnabled: data.whatsapp_bill_share_enabled || false,
                    whatsappShareMode: (data as any).whatsapp_share_mode || 'text',
                    showOrderType: (data as any).show_order_type || false,
                    qrPaymentEnabled: data.qr_payment_enabled || false,
                    telegram: data.telegram || '',
                    receiptQrEnabled: data.receipt_qr_enabled || false,
                    receiptQrType: data.receipt_qr_type || 'payment',
                    upiId: data.upi_id || '',
                    upiName: data.upi_name || ''
                };
                setBillSettings(settings);
                setWhatsappEnabled(data.whatsapp_bill_share_enabled || false);
                setWhatsappShareMode((data as any).whatsapp_share_mode === 'image' ? 'image' : 'text');
                setShowOrderType((data as any).show_order_type || false);

                // Update cache
                const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
                localStorage.setItem(headerKey, JSON.stringify(settings));

                // Load GST settings
                if ((data as any).gst_enabled) {
                    let adminAuthId = adminAuthUid || null;
                    if (profile?.role === 'user' && profile.admin_id) {
                        const { data: parentProfile } = await supabase
                            .from('profiles')
                            .select('user_id')
                            .eq('id', profile.admin_id)
                            .single();
                        if (parentProfile?.user_id) {
                            adminAuthId = parentProfile.user_id;
                        }
                    }

                    if (adminAuthId) {
                        let query = (supabase as any)
                            .from('tax_rates')
                            .select('id, name, rate, cess_rate, hsn_code')
                            .eq('admin_id', adminAuthId)
                            .eq('is_active', true);
                        if (operatingBranchId) {
                            query = query.or(`branch_id.eq.${operatingBranchId},branch_id.is.null`);
                        }
                        const { data: rates } = await query;
                        const taxRatesMap: Record<string, any> = {};
                        (rates || []).forEach((r: any) => {
                            taxRatesMap[r.id] = { rate: r.rate, name: r.name, cess: r.cess_rate || 0, hsn_code: r.hsn_code || '' };
                        });
                        setGstSettings({
                            enabled: true,
                            gstin: (data as any).gstin || '',
                            isComposition: (data as any).is_composition_scheme || false,
                            taxRatesMap
                        });
                    }
                } else {
                    setGstSettings({ enabled: false, gstin: '', isComposition: false, taxRatesMap: {} });
                }
            }
        } catch (error) {
            console.error('Error fetching shop settings:', error);
        }
    }, [operatingBranchId, profile, activeBranch]);

    // Cache-first shop settings loading
    const loadShopSettingsFromCache = useCallback(() => {
        const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
        const saved = localStorage.getItem(headerKey) ?? localStorage.getItem('hotel_pos_bill_header');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setBillSettings({
                    shopName: parsed.shopName || '',
                    address: parsed.address || '',
                    contactNumber: parsed.contactNumber || '',
                    logoUrl: parsed.logoUrl || '',
                    whatsapp: parsed.whatsapp || '',
                    showWhatsapp: parsed.showWhatsapp !== false,
                    printerWidth: parsed.printerWidth || '58mm',
                    qrPaymentEnabled: parsed.qrPaymentEnabled || false,
                    telegram: parsed.telegram || '',
                    receiptQrEnabled: parsed.receiptQrEnabled || false,
                    receiptQrType: parsed.receiptQrType || 'payment',
                    upiId: parsed.upiId || '',
                    upiName: parsed.upiName || ''
                });
                setWhatsappEnabled(parsed.whatsappEnabled || parsed.whatsappBillShareEnabled || false);
                setWhatsappShareMode(parsed.whatsappShareMode === 'image' ? 'image' : 'text');
                setShowOrderType(parsed.showOrderType || false);
            } catch (e) { /* ignore */ }
        }
    }, [operatingBranchId]);

    // Fetch configured tables from DB for visual floor layout
    const fetchConfiguredTables = useCallback(async () => {
        if (!adminId) return;
        try {
            let query = supabase
                .from('tables')
                .select('*')
                .eq('admin_id', adminId)
                .eq('is_active', true);
            if (operatingBranchId) {
                query = query.eq('branch_id', operatingBranchId);
            }
            const { data, error } = await query;
            if (!error && data) {
                setConfiguredTables(data);
            }
        } catch (e) {
            console.warn('Error fetching configured tables:', e);
        }
    }, [adminId, operatingBranchId]);

    // Fetch all unbilled table orders grouped by table
    const fetchTableOrders = useCallback(async () => {
        if (!adminId) return;
        try {
            const { data, error } = await (supabase as any)
                .from('table_orders')
                .select('*')
                .eq('admin_id', adminId)
                .eq('is_billed', false)
                .neq('status', 'cancelled')
                .order('created_at', { ascending: true });

            if (error) throw error;

            // Group by table_number AND seat_id
            const grouped: Record<string, TableOrder[]> = {};
            (data || []).forEach((order: TableOrder) => {
                const key = order.seat_id 
                    ? `${order.table_number}-seat-${order.seat_id}` 
                    : `${order.table_number}-general`;
                if (!grouped[key]) {
                    grouped[key] = [];
                }
                grouped[key].push(order);
            });

            const tablesWithOrders: TableWithOrders[] = Object.entries(grouped)
                .map(([key, orders]) => {
                    const firstOrder = orders[0];
                    return {
                        table_number: firstOrder.table_number,
                        seat_id: firstOrder.seat_id || null,
                        orders,
                        total: orders.reduce((sum, o) => sum + o.total_amount, 0),
                        orderCount: orders.length,
                    };
                })
                .sort((a, b) => {
                    const tableCompare = a.table_number.localeCompare(b.table_number, undefined, { numeric: true });
                    if (tableCompare !== 0) return tableCompare;
                    const seatA = a.seat_id || '';
                    const seatB = b.seat_id || '';
                    return seatA.localeCompare(seatB);
                });

            setTables(tablesWithOrders);
        } catch (err) {
            console.error('Error fetching table orders:', err);
            toast({ title: 'Error', description: 'Failed to fetch table orders', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [adminId]);

    // Setup real-time sync
    useEffect(() => {
        fetchTableOrders();
        fetchConfiguredTables();
        fetchItems();
        fetchItemCategories();
        fetchPaymentTypes();
        fetchAdditionalCharges();
        loadShopSettingsFromCache();
        fetchShopSettings();

        // Seed bill counter
        initBillCounter(adminId, operatingBranchId).catch(console.warn);

        const interval = setInterval(() => {
            fetchTableOrders();
            fetchConfiguredTables();
        }, 15000);

        // Listen on the SAME shared channel that PublicMenu/Kitchen/ServiceArea use
        const channel = supabase.channel('table-order-sync', {
            config: { broadcast: { self: true } }
        })
            .on('broadcast', { event: 'new-table-order' }, () => fetchTableOrders())
            .on('broadcast', { event: 'table-order-status-update' }, () => fetchTableOrders())
            .on('broadcast', { event: 'table-status-updated' }, () => fetchTableOrders())
            .subscribe();

        tableOrderChannelRef.current = channel;

        const pgChannel = supabase.channel('table-billing-pg')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'table_orders' }, () => fetchTableOrders())
            .subscribe();

        // Setup sync channel for broadcasting bill creation
        const syncChannel = supabase.channel('pos-global-sync', {
            config: { broadcast: { self: true } }
        }).subscribe();
        syncChannelRef.current = syncChannel;

        return () => {
            clearInterval(interval);
            supabase.removeChannel(channel);
            supabase.removeChannel(pgChannel);
            supabase.removeChannel(syncChannel);
        };
    }, [fetchTableOrders, fetchItems, fetchItemCategories, fetchPaymentTypes, fetchAdditionalCharges, loadShopSettingsFromCache, fetchShopSettings, adminId]);

    // Map payment mode string to database enum
    const mapPaymentMode = (method: string): string => {
        const lower = method.toLowerCase();
        if (lower.includes('cash')) return 'cash';
        if (lower.includes('upi')) return 'upi';
        if (lower === 'card' || lower.includes('card')) return 'card';
        return 'other';
    };

    // WhatsApp share handler
    const handleWhatsAppShare = async (
        customerMobile: string,
        billNumber: string,
        items: CartItem[],
        totalAmount: number,
        paymentMethod: string,
        discount: number,
        additionalChargesData: { name: string; amount: number }[],
        customerName?: string
    ) => {
        try {
            const { formatBillMessage, shareViaWhatsApp, isValidPhoneNumber } = await import('@/utils/whatsappBillShare');

            const isImageMode = whatsappShareMode === 'image';
            if (!isImageMode && !isValidPhoneNumber(customerMobile)) {
                toast({ title: "Invalid Phone", description: "Cannot send WhatsApp - invalid number", variant: "destructive" });
                return;
            }

            if (isImageMode) {
                const { shareBillImageViaWhatsApp } = await import('@/utils/billImageGenerator');
                const billData: any = {
                    billNo: billNumber,
                    date: new Date().toLocaleDateString('en-IN'),
                    time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                    items: items.map(item => ({
                        name: item.name,
                        quantity: item.quantity,
                        price: item.price,
                        total: Math.round((item.quantity / (item.base_value || 1)) * item.price),
                        unit: item.unit,
                        base_value: item.base_value,
                    })),
                    subtotal: items.reduce((sum, item) => sum + Math.round((item.quantity / (item.base_value || 1)) * item.price), 0),
                    discount,
                    additionalCharges: additionalChargesData,
                    total: totalAmount,
                    paymentMethod,
                    shopName: billSettings?.shopName || activeBranch?.shop_name || profile?.hotel_name || 'Hotel',
                    address: billSettings?.address || activeBranch?.address || '',
                    phone: billSettings?.contactNumber || activeBranch?.contact_number || '',
                    totalItemsCount: items.length,
                    smartQtyCount: calculateSmartQtyCount(items),
                };

                const result = await shareBillImageViaWhatsApp(customerMobile, billData);
                toast({
                    title: result.success ? "Shared!" : "Downloaded",
                    description: result.success
                        ? 'Bill image shared via WhatsApp'
                        : 'Bill image downloaded. Attach it in WhatsApp chat.',
                });
            } else {
                const message = formatBillMessage({
                    billNo: billNumber,
                    date: new Date().toLocaleDateString('en-IN'),
                    items: items.map(item => ({
                        name: item.name,
                        quantity: item.quantity,
                        price: item.price,
                        total: Math.round((item.quantity / (item.base_value || 1)) * item.price),
                        unit: item.unit,
                        base_value: item.base_value,
                    })),
                    subtotal: items.reduce((sum, item) => sum + Math.round((item.quantity / (item.base_value || 1)) * item.price), 0),
                    discount,
                    additionalCharges: additionalChargesData,
                    total: totalAmount,
                    paymentMethod,
                    shopName: billSettings?.shopName || activeBranch?.shop_name || profile?.hotel_name || 'Hotel',
                    customerName
                } as any);
                shareViaWhatsApp(customerMobile, message);
                toast({ title: "WhatsApp", description: "Opening WhatsApp to share bill..." });
            }
        } catch (err) {
            console.error('WhatsApp share error:', err);
            toast({ title: "WhatsApp Error", description: "Failed to share via WhatsApp", variant: "destructive" });
        }
    };

    const printSplitKOTsWithFeedback = async (
        validItems: CartItem[],
        billNumber: string,
        tableNumber: string,
        orderType?: string,
        retryStations?: string[]
    ) => {
        const catStationMap: Record<string, string> = {};
        itemCategories.forEach(c => {
            catStationMap[String(c.name || '').toLowerCase()] = String(c.print_station || 'kitchen').toLowerCase();
        });
        const toastId = `table-kot-${billNumber}-${retryStations?.join('-') || 'all'}`;
        sonnerToast.loading('Printing station KOT/BOT…', {
            id: toastId,
            description: retryStations?.length ? `Retrying ${retryStations.join(', ')}` : 'Preparing Kitchen/Bar/Dessert tickets',
        });

        const result = await printKOTs(validItems.map((item: any) => ({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            selling_unit: item.selling_unit,
            category: item.category,
        })), catStationMap, {
            billNo: billNumber,
            tableNo: tableNumber,
            orderType: orderType === 'parcel' ? 'parcel' : 'dine_in',
            printerWidth: billSettings?.printerWidth || '58mm',
            shopName: billSettings?.shopName,
        }, {
            stationFilter: retryStations,
            onProgress: (event) => {
                const station = event.station.charAt(0).toUpperCase() + event.station.slice(1);
                if (event.status === 'printing') {
                    sonnerToast.loading('Printing station KOT/BOT…', {
                        id: toastId,
                        description: `${event.index}/${event.total}: ${station}${event.deviceName ? ` → ${event.deviceName}` : ' → active printer'}`,
                    });
                }
            },
        });

        const failedStations = result.results.filter((r: KOTPrintStationResult) => !r.ok).map(r => r.station);
        if (result.failed > 0) {
            retryKOTRef.current = () => printSplitKOTsWithFeedback(validItems, billNumber, tableNumber, orderType, failedStations);
            sonnerToast.error(`KOT failed for ${result.failed} station${result.failed > 1 ? 's' : ''}`, {
                id: toastId,
                description: failedStations.join(', '),
                action: { label: 'Retry failed', onClick: () => retryKOTRef.current?.() },
                duration: 10000,
            });
        } else if (result.ok > 0) {
            sonnerToast.success('Station KOT/BOT printed', {
                id: toastId,
                description: `${result.ok} station${result.ok > 1 ? 's' : ''} printed successfully`,
            });
        } else {
            sonnerToast.dismiss(toastId);
        }
        return result;
    };

    // Handle payment completion from CompletePaymentDialog
    const handleCompletePayment = async (paymentData: {
        paymentMethod: string;
        paymentAmounts: Record<string, number>;
        discount: number;
        discountType: 'flat' | 'percentage';
        additionalCharges: { name: string; amount: number; enabled: boolean }[];
        finalItems?: CartItem[];
        customerMobile?: string;
        customerName?: string;
        sendWhatsApp?: boolean;
        customerGstin?: string;
        orderType?: string;
    }) => {
        if (!selectedTable || !adminId || isBilling) return;

        setPaymentDialogOpen(false);
        setIsBilling(true);

        try {
            const orders = selectedTable.orders;
            const tableNumber = selectedTable.table_number;

            // Use final items from dialog (with any quantity/price overrides)
            const cartItems = paymentData.finalItems || getCartForTable(selectedTable);
            const validItems = cartItems.filter(item => item.quantity > 0);

            if (validItems.length === 0) {
                toast({ title: 'Error', description: 'No items to bill', variant: 'destructive' });
                return;
            }

            // Calculate totals (float precision for accuracy)
            const subtotal = validItems.reduce((sum, item) => {
                const baseValue = item.base_value || 1;
                return sum + ((item.quantity / baseValue) * item.price);
            }, 0);

            const totalAdditionalCharges = paymentData.additionalCharges.reduce((sum, charge) => sum + charge.amount, 0);
            let totalAmount = subtotal + totalAdditionalCharges - paymentData.discount;

            if (isOnline) {
                await syncBillCounter(adminId, operatingBranchId);
            }
            const billNumber = getInstantBillNumber(adminId, operatingBranchId);
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            const paymentMode = mapPaymentMode(paymentData.paymentMethod);
            const additionalChargesArray = paymentData.additionalCharges.map(c => ({ name: c.name, amount: c.amount }));

            // Calculate GST if enabled
            let taxSummary: any = null;
            let totalTax = 0;
            let totalExclusiveTax = 0;
            let itemTaxes: any[] = [];
            let roundOff = 0;
            let dbItemsMap = new Map<string, any>();

            if (gstSettings.enabled) {
                const itemIds = validItems.map(item => item.id);
                const { data: dbItems } = await supabase
                    .from('items')
                    .select('id, tax_rate_id, is_tax_inclusive, hsn_code')
                    .in('id', itemIds);
                dbItemsMap = new Map((dbItems || []).map(i => [i.id, i]));

                const { calculateItemTax, calculateBillTaxSummary } = await import('@/utils/gstCalculator');
                itemTaxes = validItems.map(item => {
                    const dbItem = dbItemsMap.get(item.id);
                    const taxRateId = dbItem?.tax_rate_id;
                    const taxRateInfo = taxRateId ? gstSettings.taxRatesMap[taxRateId] : null;
                    if (!taxRateInfo) return { taxableAmount: (item.quantity / (item.base_value || 1)) * item.price, cgst: 0, sgst: 0, cess: 0, totalTax: 0, totalWithTax: (item.quantity / (item.base_value || 1)) * item.price, taxRate: 0, _cessRate: 0, _taxName: '', _isTaxInclusive: true };
                    const lineTotal = (item.quantity / (item.base_value || 1)) * item.price;
                    const isTaxInclusive = dbItem?.is_tax_inclusive !== false;
                    const cessRate = (taxRateInfo as any).cess_rate || taxRateInfo.cess || 0;
                    const result = calculateItemTax(lineTotal, taxRateInfo.rate, cessRate, isTaxInclusive);
                    if (!isTaxInclusive) {
                        totalExclusiveTax += result.totalTax;
                    }
                    return { ...result, _cessRate: cessRate, _taxName: taxRateInfo.name || `GST ${taxRateInfo.rate}%`, _isTaxInclusive: isTaxInclusive };
                });

                const summary = calculateBillTaxSummary(validItems.map((item, i) => {
                    const dbItem = dbItemsMap.get(item.id);
                    return {
                        price: item.price,
                        quantity: item.quantity,
                        total: (item.quantity / (item.base_value || 1)) * item.price,
                        taxRate: itemTaxes[i].taxRate,
                        taxName: (itemTaxes[i] as any)._taxName || `GST ${itemTaxes[i].taxRate}%`,
                        cessRate: (itemTaxes[i] as any)._cessRate || 0,
                        isTaxInclusive: (itemTaxes[i] as any)._isTaxInclusive !== false,
                        hsnCode: dbItem?.hsn_code || gstSettings.taxRatesMap[dbItem?.tax_rate_id || '']?.hsn_code || ''
                    };
                }));
                taxSummary = summary;
                totalTax = itemTaxes.reduce((s, t) => s + t.totalTax, 0);
            }

            // Exclusive tax is added on top of the subtotal
            totalAmount = subtotal + totalExclusiveTax + totalAdditionalCharges - paymentData.discount;

            if (gstSettings.enabled && totalTax > 0) {
                // Round-off: round total to nearest integer
                const rawTotal = totalAmount;
                const roundedTotal = Math.round(rawTotal);
                roundOff = roundedTotal - rawTotal;
                if (Math.abs(roundOff) > 0.001) {
                    totalAmount = roundedTotal;
                } else {
                    roundOff = 0;
                }
            } else {
                totalAmount = Math.round(totalAmount);
            }

            // 1. Create Bill
            const billPayload: any = {
                bill_no: billNumber,
                total_amount: totalAmount,
                discount: paymentData.discount,
                payment_mode: paymentMode,
                payment_details: paymentData.paymentAmounts,
                additional_charges: additionalChargesArray,
                created_by: profile?.user_id,
                admin_id: adminId,
                branch_id: operatingBranchId || null,
                date: todayStr,
                service_status: 'completed',
                kitchen_status: 'completed',
                status_updated_at: now.toISOString(),
                table_no: selectedTable.seat_id ? `T${tableNumber} (Seat ${selectedTable.seat_id})` : `T${tableNumber}`,
                round_off: roundOff !== 0 ? roundOff : 0,
                order_type: paymentData.orderType || 'dine_in',
                customer_mobile: paymentData.customerMobile || null,
                customer_phone: paymentData.customerMobile || null
            };

            if (gstSettings.enabled && taxSummary) {
                billPayload.tax_summary = JSON.stringify(taxSummary);
                billPayload.total_tax = totalTax;
                billPayload.customer_gstin = paymentData.customerGstin || null;
            }

            const { data: resultData, error: rpcError } = await supabase.rpc('secure_create_bill', {
                p_bill_payload: {
                    bill_no: billNumber,
                    total_amount: totalAmount,
                    created_by: profile?.user_id,
                    payment_mode: paymentMode,
                    payment_details: paymentData.paymentAmounts,
                    additional_charges: additionalChargesArray,
                    discount: paymentData.discount || 0,
                    order_type: paymentData.orderType || 'dine_in',
                    table_no: selectedTable.seat_id ? `T${tableNumber} (Seat ${selectedTable.seat_id})` : `T${tableNumber}`,
                    customer_mobile: paymentData.customerMobile || null,
                    customer_gstin: paymentData.customerGstin || null,
                    branch_id: operatingBranchId || null,
                    admin_id: adminId || null,
                    channel: 'store',
                    billing_type: 'pos'
                },
                p_cart_items: validItems.map(item => ({
                    id: item.id,
                    quantity: item.quantity
                }))
            });

            if (rpcError) throw rpcError;
            if (!resultData) throw new Error('Failed to create secure bill');

            const billData = resultData as any;

            // 3. Update table orders / billing state in DB based on split mode
            const orderIds = orders.map(o => o.id);
            const isFinalPart = splitType === 'even' && evenSplitTracking
                ? (evenSplitTracking.completedParts + 1 >= evenSplitTracking.totalParts)
                : true;

            if (splitType === 'item') {
                // Deduct selected quantities from active orders in DB
                for (const billedItem of validItems) {
                    let remainingQtyToDeduct = billedItem.quantity;
                    for (const order of orders) {
                        if (remainingQtyToDeduct <= 0) break;
                        
                        const orderItems = Array.isArray(order.items) ? [...order.items] : [];
                        const itemIndex = orderItems.findIndex((i: any) => i.item_id === billedItem.id);
                        
                        if (itemIndex > -1) {
                            const itemQty = orderItems[itemIndex].quantity;
                            if (itemQty <= remainingQtyToDeduct) {
                                remainingQtyToDeduct -= itemQty;
                                orderItems.splice(itemIndex, 1);
                            } else {
                                orderItems[itemIndex].quantity -= remainingQtyToDeduct;
                                remainingQtyToDeduct = 0;
                            }
                            
                            const newTotal = orderItems.reduce((s: number, i: any) => s + (i.quantity * i.price), 0);
                            if (orderItems.length === 0) {
                                // Mark this order as fully billed
                                await supabase
                                    .from('table_orders')
                                    .update({ items: [], total_amount: 0, is_billed: true, status: 'served' })
                                    .eq('id', order.id);
                            } else {
                                // Update remaining items in order
                                await supabase
                                    .from('table_orders')
                                    .update({ items: orderItems, total_amount: newTotal })
                                    .eq('id', order.id);
                            }
                        }
                    }
                }
            } else if (splitType === 'even' && evenSplitTracking) {
                const nextCompleted = evenSplitTracking.completedParts + 1;
                if (isFinalPart) {
                    // Mark all orders as billed
                    await supabase
                        .from('table_orders')
                        .update({ is_billed: true, status: 'served' })
                        .in('id', orderIds);
                } else {
                    // Save progress locally in state
                    setEvenSplitTracking({
                        ...evenSplitTracking,
                        completedParts: nextCompleted
                    });
                }
            } else {
                // Full checkout: Mark all orders as billed
                await supabase
                    .from('table_orders')
                    .update({ is_billed: true, status: 'served' })
                    .in('id', orderIds);
            }

            // 4. Free the table only if there are no other active (unbilled) orders for this table
            // And only if this is the final split part
            const { count: remainingCount, error: countError } = await supabase
                .from('table_orders')
                .select('id', { count: 'exact', head: true })
                .eq('admin_id', adminId)
                .eq('table_number', tableNumber)
                .eq('is_billed', false)
                .neq('status', 'cancelled')
                .not('id', 'in', `(${orderIds.join(',')})`);

            if (countError) {
                console.warn('Failed to count remaining orders:', countError);
            }

            const shouldFreeTable = isFinalPart && (!remainingCount || remainingCount === 0);

            if (shouldFreeTable) {
                const { error: tableError } = await supabase
                    .from('tables')
                    .update({ status: 'available', current_bill_id: null })
                    .eq('admin_id', adminId)
                    .eq('table_number', tableNumber);

                if (tableError) {
                    console.warn('Failed to free table:', tableError);
                }

                // Broadcast table freed to TableManagement via shared channel
                syncChannelRef.current?.send({
                    type: 'broadcast',
                    event: 'table-status-updated',
                    payload: { table_number: tableNumber, status: 'available', timestamp: Date.now() }
                });
                tableOrderChannelRef.current?.send({
                    type: 'broadcast',
                    event: 'table-status-updated',
                    payload: { table_number: tableNumber, status: 'available', timestamp: Date.now() }
                });
            }

            // 5. Broadcast bill creation
            window.dispatchEvent(new CustomEvent('bills-updated'));

            billsChannel?.postMessage({
                type: 'new-bill',
                bill_no: billNumber,
                bill_id: billData.id,
                timestamp: Date.now()
            });

            syncChannelRef.current?.send({
                type: 'broadcast',
                event: 'new-bill',
                payload: {
                    bill_id: billData.id,
                    bill_no: billNumber,
                    action: 'create',
                    timestamp: Date.now()
                }
            });

            // 6. Broadcast status update to customer sessions (if final part/item is settled)
            const sessionIds = [...new Set(orders.map(o => o.session_id))];
            if (isFinalPart) {
                for (const sid of sessionIds) {
                    const channel = supabase.channel(`table-order-status-${sid}`);
                    for (const order of orders.filter(o => o.session_id === sid)) {
                        await channel.send({
                            type: 'broadcast',
                            event: 'order-status-update',
                            payload: { order_id: order.id, status: 'served', is_billed: true }
                        });
                    }
                    supabase.removeChannel(channel);
                }
            }

            // 7. WhatsApp share (if requested)
            if (paymentData.sendWhatsApp && paymentData.customerMobile) {
                await handleWhatsAppShare(
                    paymentData.customerMobile,
                    billNumber,
                    validItems,
                    totalAmount,
                    paymentData.paymentMethod.toUpperCase(),
                    paymentData.discount,
                    additionalChargesArray,
                    paymentData.customerName
                );
            }

            // 8. Auto Print receipt (if enabled)
            const printData = {
                billNo: billNumber,
                date: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
                items: validItems.map(item => {
                    const baseValue = item.base_value || 1;
                    return {
                        name: item.name,
                        quantity: item.quantity,
                        price: item.price,
                        total: (item.quantity / baseValue) * item.price,
                        unit: item.unit,
                        base_value: item.base_value,
                        selling_unit: (item as any).selling_unit,
                        selling_quantity: (item as any).selling_quantity
                    };
                }),
                subtotal: subtotal,
                additionalCharges: additionalChargesArray,
                discount: paymentData.discount,
                total: totalAmount,
                paymentMethod: paymentData.paymentMethod.toUpperCase(),
                paymentDetails: paymentData.paymentAmounts,
                shopName: billSettings?.shopName,
                address: billSettings?.address,
                contactNumber: billSettings?.contactNumber,
                printerWidth: billSettings?.printerWidth || '58mm',
                logoUrl: billSettings?.logoUrl,
                receiptQrEnabled: billSettings?.receiptQrEnabled,
                receiptQrType: billSettings?.receiptQrType,
                upiId: billSettings?.upiId,
                upiName: billSettings?.upiName,
                telegram: billSettings?.telegram,
                tableNo: selectedTable.seat_id ? `T${tableNumber} (${selectedTable.seat_id})` : `T${tableNumber}`,
                totalItemsCount: validItems.length,
                smartQtyCount: calculateSmartQtyCount(validItems),
                // GST fields
                gstin: gstSettings.enabled ? gstSettings.gstin : undefined,
                customerGstin: paymentData.customerGstin || undefined,
                customerMobile: paymentData.customerMobile || undefined,
                taxSummary: billPayload.tax_summary || undefined,
                totalTax: billPayload.total_tax || undefined,
                isComposition: gstSettings.enabled ? gstSettings.isComposition : undefined,
                roundOff: roundOff !== 0 ? roundOff : undefined,
                orderType: paymentData.orderType
            };

            const autoPrintEnabled = (localStorage.getItem(operatingBranchId ? `hotel_pos_auto_print_${operatingBranchId}` : 'hotel_pos_auto_print') ?? localStorage.getItem('hotel_pos_auto_print')) !== 'false';

            if (autoPrintEnabled) {
                try {
                    const { printReceipt } = await import('@/utils/bluetoothPrinter');
                    const [receiptResult] = await Promise.allSettled([
                        printReceipt(printData as any),
                        printSplitKOTsWithFeedback(validItems, billNumber, printData.tableNo, paymentData.orderType),
                    ]);
                    const printed = receiptResult.status === 'fulfilled' && receiptResult.value;
                    if (!printed) {
                        await printBrowserReceipt(printData as any);
                    }
                } catch (printErr) {
                    console.error('Print failed, falling back to browser print:', printErr);
                    await printBrowserReceipt(printData as any);
                }
            } else {
                await printBrowserReceipt(printData as any);
            }

            // 9. Save Customer details to CRM (Auto-Save on every Checkout)
            const cleanPhone = paymentData.customerMobile?.replace(/[\s\-\(\)\+]/g, '') || '';
            if (adminId && cleanPhone.length >= 10) {
                try {
                    let lookup: any = supabase
                        .from('customers')
                        .select('id, visit_count, total_spent')
                        .eq('admin_id', adminId)
                        .eq('phone', cleanPhone);
                    if (operatingBranchId) lookup = lookup.eq('branch_id', operatingBranchId);
                    const { data: existingCustomer } = await lookup.maybeSingle();

                    if (existingCustomer) {
                        const updatePayload: any = {
                            visit_count: existingCustomer.visit_count + 1,
                            total_spent: Number(existingCustomer.total_spent) + totalAmount,
                            last_visit: new Date().toISOString()
                        };
                        if (paymentData.customerName) {
                            updatePayload.name = paymentData.customerName;
                        }
                        await supabase
                            .from('customers')
                            .update(updatePayload)
                            .eq('id', existingCustomer.id);
                    } else {
                        await supabase
                            .from('customers')
                            .insert({
                                admin_id: adminId,
                                branch_id: operatingBranchId || null,
                                phone: cleanPhone,
                                name: paymentData.customerName || `Customer (${cleanPhone.slice(-4)})`,
                                visit_count: 1,
                                total_spent: totalAmount,
                                last_visit: new Date().toISOString()
                            });
                    }
                } catch (crmErr) {
                    console.warn('[CRM] Failed to save/update customer:', crmErr);
                }
            }

            toast({
                title: '✅ Bill Generated!',
                description: `Bill ${billNumber} created for Table ${tableNumber} (₹${totalAmount})`,
            });

            if (isFinalPart || splitType !== 'even') {
                setSelectedTable(null);
                setSplitType(null);
                setEvenSplitTracking(null);
                setCheckedSplitItems({});
            }
            await fetchTableOrders();

        } catch (err) {
            console.error('Bill generation error:', err);
            toast({
                title: 'Error',
                description: 'Failed to generate bill. Please try again.',
                variant: 'destructive'
            });
        } finally {
            setIsBilling(false);
        }
    };

    // Handle opening payment dialog for a table
    const handleTableSelect = (table: TableWithOrders) => {
        if (!isOnline) {
            toast({
                title: "Offline Mode",
                description: "Table billing is restricted while offline. Please use the POS Billing page.",
                variant: "destructive"
            });
            return;
        }
        setSelectedTable(table);
        setOptionsDialogOpen(true);
    };

    // Build cart items for the currently selected table based on mode
    // NOTE: This must be BEFORE any early returns to satisfy React's rules of hooks
    const currentCart = useMemo(() => {
        if (!selectedTable) return [];
        
        if (splitType === 'item') {
            return getCartForTable(selectedTable).map(item => {
                const qty = checkedSplitItems[item.id] || 0;
                return { ...item, quantity: qty };
            }).filter(item => item.quantity > 0);
        }
        
        if (splitType === 'even' && evenSplitTracking) {
            return [{
                id: `split-even-${selectedTable.table_number}`,
                name: `Even Split Part ${evenSplitTracking.completedParts + 1}/${evenSplitTracking.totalParts} - Table T${selectedTable.table_number}`,
                price: Math.round(evenSplitTracking.totalAmount / evenSplitTracking.totalParts),
                quantity: 1,
                unit: 'pc',
                base_value: 1
            }];
        }
        
        return getCartForTable(selectedTable);
    }, [selectedTable, splitType, checkedSplitItems, evenSplitTracking]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-3 sm:p-4">
            <div className="max-w-6xl mx-auto">
                {!isOnline && (
                    <Alert className="mb-6 border-amber-500 bg-amber-500/10 text-amber-700">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle className="font-bold">Offline Mode Active</AlertTitle>
                        <AlertDescription>
                            Table management and billing are restricted while offline. Please use the <strong>POS Billing</strong> page to create offline bills.
                        </AlertDescription>
                    </Alert>
                )}
                {/* Header */}
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-purple-500/20">
                            <Receipt className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg sm:text-xl font-bold tracking-tight">Table Billing</h1>
                            <p className="text-xs text-muted-foreground">
                                {tables.length} table{tables.length !== 1 ? 's' : ''} with active orders
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => fetchTableOrders()}>
                        Refresh
                    </Button>
                </div>

                {/* View Mode Toggle */}
                {configuredTables.length > 0 && (
                    <div className="flex justify-end gap-2 mb-4 bg-muted/30 p-1.5 rounded-xl border max-w-xs ml-auto">
                        <Button
                            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setViewMode('grid')}
                            className={cn("h-8 rounded-lg text-xs font-semibold flex-1", viewMode === 'grid' && "bg-background shadow-sm")}
                        >
                            <LayoutGrid className="w-3.5 h-3.5 mr-1" />
                            List View
                        </Button>
                        <Button
                            variant={viewMode === 'map' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setViewMode('map')}
                            className={cn("h-8 rounded-lg text-xs font-semibold flex-1", viewMode === 'map' && "bg-background shadow-sm")}
                        >
                            <Sparkles className="w-3.5 h-3.5 mr-1 text-primary" />
                            Floor Map
                        </Button>
                    </div>
                )}

                {/* Content */}
                {viewMode === 'map' ? (
                    <div 
                        className="relative w-full h-[580px] border-2 border-border/80 rounded-2xl overflow-hidden shadow-xl bg-slate-50 dark:bg-zinc-950 p-4"
                        style={{ 
                            backgroundImage: 'linear-gradient(to right, rgb(128 128 128 / 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgb(128 128 128 / 0.08) 1px, transparent 1px)', 
                            backgroundSize: '20px 20px' 
                        }}
                    >
                        <div className="absolute top-2 left-2 bg-background/80 backdrop-blur border text-[11px] font-semibold px-2 py-1 rounded shadow-sm z-10 text-muted-foreground flex items-center gap-1">
                            🟣 <span className="font-bold text-foreground">Status Map:</span> Highlighted tables have active orders. Click to generate bill.
                        </div>
                        
                        <div className="relative w-full h-full rounded-xl">
                            {configuredTables.map((cTable) => {
                                // Find if this table has pending orders
                                const matchedTables = tables.filter(t => t.table_number === cTable.table_number);
                                const hasOrders = matchedTables.length > 0;
                                const totalAmount = matchedTables.reduce((sum, t) => sum + t.total, 0);
                                const totalOrders = matchedTables.reduce((sum, t) => sum + t.orderCount, 0);

                                const width = cTable.width || 100;
                                const height = cTable.height || 100;
                                const x = cTable.x_pos !== null && cTable.x_pos !== undefined ? cTable.x_pos : 50;
                                const y = cTable.y_pos !== null && cTable.y_pos !== undefined ? cTable.y_pos : 50;
                                const isCircle = cTable.shape === 'circle';

                                return (
                                    <button
                                        key={cTable.id}
                                        onClick={() => {
                                            if (hasOrders) {
                                                handleTableSelect(matchedTables[0]);
                                            } else {
                                                toast({ title: 'No Orders', description: `Table T${cTable.table_number} does not have any active orders.` });
                                            }
                                        }}
                                        style={{
                                            position: 'absolute',
                                            left: `${x}px`,
                                            top: `${y}px`,
                                            width: `${width}px`,
                                            height: `${height}px`,
                                        }}
                                        className={cn(
                                            "flex flex-col items-center justify-center border-2 shadow-md transition-all text-center p-2",
                                            isCircle ? "rounded-full" : "rounded-2xl",
                                            hasOrders 
                                                ? "border-purple-400 bg-purple-500/10 text-purple-700 dark:text-purple-400 hover:bg-purple-500/20 cursor-pointer ring-2 ring-purple-200" 
                                                : "border-gray-200 bg-card text-muted-foreground opacity-40 cursor-default",
                                        )}
                                    >
                                        <span className="font-black text-sm md:text-base">T{cTable.table_number}</span>
                                        {hasOrders ? (
                                            <>
                                                <span className="text-[10px] font-bold text-primary">₹{Math.round(totalAmount)}</span>
                                                <Badge className="bg-purple-500 text-white text-[9px] scale-95 mt-1">
                                                    {totalOrders} Order{totalOrders > 1 ? 's' : ''}
                                                </Badge>
                                            </>
                                        ) : (
                                            <span className="text-[9px] opacity-70">Empty</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : tables.length === 0 ? (
                    <Card className="p-12 text-center border-dashed bg-muted/20">
                        <div className="text-muted-foreground">
                            <Receipt className="w-16 h-16 mx-auto mb-4 opacity-20" />
                            <p className="text-xl font-bold text-foreground">No pending table orders</p>
                            <p className="text-sm">Table orders will appear here when customers place orders via QR code</p>
                        </div>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {tables.map((table) => (
                            <Card
                                key={table.seat_id ? `${table.table_number}-seat-${table.seat_id}` : `${table.table_number}-general`}
                                className="cursor-pointer transition-all hover:shadow-md border-l-4 border-l-purple-500"
                                onClick={() => handleTableSelect(table)}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-2xl font-black flex items-baseline">
                                                T{table.table_number}
                                                {table.seat_id && (
                                                    <span className="text-xs font-bold text-purple-600 ml-1 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                                        Seat {table.seat_id}
                                                    </span>
                                                )}
                                            </h3>
                                            <Badge className="bg-purple-100 text-purple-700 text-[10px]">
                                                <ShoppingCart className="w-2.5 h-2.5 mr-0.5" />
                                                {table.orderCount} order{table.orderCount > 1 ? 's' : ''}
                                            </Badge>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                                    </div>

                                    {/* Order summary */}
                                    <div className="space-y-1.5 mb-3">
                                        {table.orders.map((order) => (
                                            <div key={order.id} className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-1.5">
                                                    <span>{statusConfig[order.status]?.icon}</span>
                                                    <span className="text-muted-foreground">
                                                        Order #{order.order_number}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">₹{order.total_amount}</span>
                                                    <span className="text-muted-foreground">
                                                        {getTimeElapsed(order.created_at)}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Total */}
                                    <div className="flex items-center justify-between border-t pt-2">
                                        <span className="text-sm font-semibold">Total</span>
                                        <span className="text-lg font-black text-primary">₹{Math.round(table.total)}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Checkout Options Dialog */}
                <Dialog open={optionsDialogOpen} onOpenChange={setOptionsDialogOpen}>
                    <DialogContent className="sm:max-w-[400px] bg-background text-foreground">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold">Checkout: Table T{selectedTable?.table_number}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="bg-muted/50 p-4 rounded-xl text-center">
                                <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold block mb-1">Total Bill Amount</span>
                                <span className="text-3xl font-black text-primary">₹{selectedTable ? Math.round(selectedTable.total) : 0}</span>
                                <span className="text-xs text-muted-foreground block mt-1">{selectedTable?.orderCount} active orders</span>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-3">
                                <Button 
                                    onClick={() => {
                                        setOptionsDialogOpen(false);
                                        setSplitType(null);
                                        setPaymentDialogOpen(true);
                                    }}
                                    className="w-full text-white font-bold h-12 bg-primary hover:bg-primary/95 rounded-xl shadow-md"
                                >
                                    Pay Full Bill (₹{selectedTable ? Math.round(selectedTable.total) : 0})
                                </Button>
                                
                                <Button 
                                    variant="outline"
                                    onClick={() => {
                                        setOptionsDialogOpen(false);
                                        // Initialize items list for splitting
                                        const initialChecked: Record<string, number> = {};
                                        if (selectedTable) {
                                            getCartForTable(selectedTable).forEach(item => {
                                                initialChecked[item.id] = item.quantity;
                                            });
                                        }
                                        setCheckedSplitItems(initialChecked);
                                        setSplitType('item'); // Default to item split
                                        setSplitDialogOpen(true);
                                    }}
                                    className="w-full font-bold h-12 border-2 rounded-xl"
                                >
                                    Split Bill...
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Split Bill Dialog */}
                <Dialog open={splitDialogOpen} onOpenChange={(open) => {
                    setSplitDialogOpen(open);
                    if (!open) {
                        setSelectedTable(null);
                        setSplitType(null);
                    }
                }}>
                    <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto bg-background text-foreground">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold">Split Bill: Table T{selectedTable?.table_number}</DialogTitle>
                        </DialogHeader>
                        
                        <div className="flex border-b mb-4">
                            <Button
                                variant="ghost"
                                onClick={() => setSplitType('item')}
                                className={cn(
                                    "flex-1 py-2 rounded-none border-b-2 font-bold text-sm",
                                    splitType === 'item' || splitType === null ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                                )}
                            >
                                Split by Item
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => setSplitType('even')}
                                className={cn(
                                    "flex-1 py-2 rounded-none border-b-2 font-bold text-sm",
                                    splitType === 'even' ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                                )}
                            >
                                Split Evenly
                            </Button>
                        </div>

                        {/* Content: Split by Item */}
                        {(splitType === 'item' || splitType === null) && selectedTable && (
                            <div className="space-y-4">
                                <p className="text-xs text-muted-foreground">Select the items and quantities you want to checkout in this split.</p>
                                <ScrollArea className="max-h-[300px] pr-2">
                                    <div className="space-y-3">
                                        {getCartForTable(selectedTable).map(item => {
                                            const isChecked = (checkedSplitItems[item.id] || 0) > 0;
                                            const currentQty = checkedSplitItems[item.id] || 0;
                                            return (
                                                <div key={item.id} className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-muted">
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                                setCheckedSplitItems(prev => ({
                                                                    ...prev,
                                                                    [item.id]: e.target.checked ? item.quantity : 0
                                                                }));
                                                            }}
                                                            className="w-4 h-4 rounded text-primary focus:ring-primary border-muted"
                                                        />
                                                        <div>
                                                            <span className="font-bold text-sm block">{item.name}</span>
                                                            <span className="text-xs text-muted-foreground">₹{item.price.toFixed(0)} each</span>
                                                        </div>
                                                    </div>
                                                    {isChecked && (
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                className="h-7 w-7 rounded-full"
                                                                disabled={currentQty <= 1}
                                                                onClick={() => setCheckedSplitItems(prev => ({
                                                                    ...prev,
                                                                    [item.id]: Math.max(1, currentQty - 1)
                                                                }))}
                                                            >
                                                                <Minus className="w-3.5 h-3.5" />
                                                            </Button>
                                                            <span className="font-black text-sm w-4 text-center">{currentQty}</span>
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                className="h-7 w-7 rounded-full"
                                                                disabled={currentQty >= item.quantity}
                                                                onClick={() => setCheckedSplitItems(prev => ({
                                                                    ...prev,
                                                                    [item.id]: Math.min(item.quantity, currentQty + 1)
                                                                }))}
                                                            >
                                                                <Plus className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                                
                                <Button
                                    onClick={() => {
                                        setSplitType('item');
                                        setSplitDialogOpen(false);
                                        setPaymentDialogOpen(true);
                                    }}
                                    disabled={Object.values(checkedSplitItems).reduce((sum, q) => sum + q, 0) === 0}
                                    className="w-full text-white font-bold h-11 bg-primary hover:bg-primary/95 rounded-xl mt-4"
                                >
                                    Checkout Selected Items
                                </Button>
                            </div>
                        )}

                        {/* Content: Split Evenly */}
                        {splitType === 'even' && selectedTable && (
                            <div className="space-y-4">
                                <p className="text-xs text-muted-foreground">Divide the total bill amount into equal parts and pay sequentially.</p>
                                
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block">Number of Splits</label>
                                    <div className="flex items-center gap-3">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-9 w-9 rounded-xl border-2"
                                            disabled={evenSplitParts <= 2}
                                            onClick={() => setEvenSplitParts(prev => Math.max(2, prev - 1))}
                                        >
                                            <Minus className="w-4 h-4" />
                                        </Button>
                                        <span className="font-black text-lg w-8 text-center">{evenSplitParts}</span>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-9 w-9 rounded-xl border-2"
                                            onClick={() => setEvenSplitParts(prev => prev + 1)}
                                        >
                                            <Plus className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                                
                                <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 flex justify-between items-center mt-4">
                                    <div>
                                        <span className="text-xs text-muted-foreground font-semibold block">Total Amount:</span>
                                        <span className="font-bold text-sm text-foreground">₹{Math.round(selectedTable.total)}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs text-muted-foreground font-semibold block">Amount Per Split:</span>
                                        <span className="font-black text-xl text-primary">₹{Math.round(selectedTable.total / evenSplitParts)}</span>
                                    </div>
                                </div>

                                <Button
                                    onClick={() => {
                                        setSplitType('even');
                                        setEvenSplitTracking({
                                            completedParts: 0,
                                            totalParts: evenSplitParts,
                                            totalAmount: selectedTable.total
                                        });
                                        setSplitDialogOpen(false);
                                        setPaymentDialogOpen(true);
                                    }}
                                    className="w-full text-white font-bold h-11 bg-primary hover:bg-primary/95 rounded-xl mt-4"
                                >
                                    Proceed to Split Payment (Part 1/{evenSplitParts})
                                </Button>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

                {/* Payment Dialog — reuse CompletePaymentDialog */}
                <CompletePaymentDialog
                    open={paymentDialogOpen}
                    onOpenChange={(open) => {
                        setPaymentDialogOpen(open);
                        if (!open) {
                            setSelectedTable(null);
                            setSplitType(null);
                            setEvenSplitTracking(null);
                            setCheckedSplitItems({});
                        }
                    }}
                    cart={currentCart}
                    paymentTypes={paymentTypes}
                    additionalCharges={additionalCharges}
                    onUpdateQuantity={() => { }}
                    onRemoveItem={() => { }}
                    onCompletePayment={handleCompletePayment}
                    whatsappEnabled={whatsappEnabled}
                    whatsappShareMode={whatsappShareMode}
                    gstEnabled={gstSettings.enabled}
                    showOrderType={showOrderType}
                    taxRatesMap={gstSettings.taxRatesMap}
                />
            </div>
        </div>
    );
};

export default TableOrderBilling;
