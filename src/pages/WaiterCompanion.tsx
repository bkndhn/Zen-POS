import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Search, ShoppingCart, Plus, Minus, Trash2, Utensils, Clipboard, ChefHat, User, ChevronRight, X, AlertTriangle, LayoutGrid, List, ArrowRightLeft } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useOffline';
import { cn } from '@/lib/utils';
import { formatQuantityWithUnit, getShortUnit, isWeightOrVolumeUnit, parseQuickChipQuantity } from '@/utils/timeUtils';
import { getKOTStatusBadgeInfo, getOccupancyTimerInfo } from '@/utils/seatUtils';
import { reservationManager, TableReservation } from '@/utils/reservationManager';
import { TableMoveDialog } from '@/components/TableMoveDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { checkOfflineLicenseStatus } from '@/utils/offlineLicenseManager';

interface Table {
    id: string;
    table_number: string;
    table_name: string | null;
    capacity: number;
    status: 'available' | 'occupied' | 'reserved' | 'cleaning';
    has_seats: boolean;
    seat_count: number;
    seat_configuration: any;
    seat_order_mode?: string | null;

}

interface MenuItem {
    id: string;
    name: string;
    price: number;
    category?: string;
    unit?: string;
    base_value?: number;
    selling_unit?: string;
    selling_quantity?: number;
    quantity_step?: number;
    is_saleable?: boolean;
    is_active: boolean;
    image_url?: string;
    quick_chips?: string[] | null;
    stock_quantity?: number;
    min_stock_threshold?: number;
    is_unlimited_stock?: boolean;
}

interface CartItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
    unit?: string;
    base_value?: number;
    selling_unit?: string;
    selling_quantity?: number;
    quantity_step?: number;
    instructions: string;
    seatId: string | null; // null represents whole table or no seat assignment
    image_url?: string;
}

/** Resolve seat labels for a table: custom labels from seat_configuration, else S1..Sn */
const getSeatLabels = (table: Pick<Table, 'seat_count' | 'seat_configuration'>): string[] => {
    const cfg = table.seat_configuration;
    if (Array.isArray(cfg) && cfg.length > 0) {
        const labels = cfg
            .map((s: any) => (typeof s === 'string' ? s : s?.label || s?.id))
            .filter((s: any): s is string => typeof s === 'string' && s.trim().length > 0);
        if (labels.length > 0) return labels;
    }
    return Array.from({ length: table.seat_count || 0 }).map((_, idx) => `S${idx + 1}`);
};


const WaiterCompanion: React.FC = () => {
    const { profile , adminProfileId } = useAuth();
    const { operatingBranchId } = useBranch();
    const isOnline = useNetworkStatus();
    const adminId = adminProfileId;

    // State
    const [tables, setTables] = useState<Table[]>([]);
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [selectedTable, setSelectedTable] = useState<Table | null>(null);
    const [moveDialogOpen, setMoveDialogOpen] = useState(false);
    const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [customerNote, setCustomerNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState<'tables' | 'menu' | 'cart'>('tables');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [gridCols, setGridCols] = useState<number>(() => {
        const saved = localStorage.getItem('waiter_grid_cols');
        return saved ? parseInt(saved, 10) || 2 : 2;
    });

    const handleSetGridCols = (cols: number) => {
        setGridCols(cols);
        localStorage.setItem('waiter_grid_cols', cols.toString());
    };
    const [clearCartOpen, setClearCartOpen] = useState(false);
    const [reservations, setReservations] = useState<TableReservation[]>([]);

    const fetchReservations = useCallback(async () => {
        const list = await reservationManager.fetchReservations(adminId, operatingBranchId);
        setReservations(list);
    }, [adminId, operatingBranchId]);

    useEffect(() => {
        fetchReservations();
    }, [fetchReservations]);
    const [gstSettings, setGstSettings] = useState<{
        enabled: boolean;
        taxRatesMap: Record<string, { rate: number; name: string; cess: number }>;
    }>({ enabled: false, taxRatesMap: {} });

    // Fetch GST settings using correct Auth UID
    const fetchGstSettings = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            // Resolve admin Auth UID (shop_settings.user_id = Auth UID)
            let targetAuthId = user.id;
            if (profile?.role === 'user' && profile.admin_id) {
                const { data: parentProfile } = await supabase
                    .from('profiles')
                    .select('user_id')
                    .eq('id', profile.admin_id)
                    .single();
                if (parentProfile?.user_id) targetAuthId = parentProfile.user_id;
            }
            // Check gst_enabled from shop_settings
            let ssQuery = supabase.from('shop_settings').select('gst_enabled, gstin').eq('user_id', targetAuthId);
            if (operatingBranchId) ssQuery = ssQuery.eq('branch_id', operatingBranchId);
            else ssQuery = ssQuery.is('branch_id', null);
            let { data: ss } = await ssQuery.maybeSingle();
            if (!ss) {
                const { data: anyss } = await supabase.from('shop_settings').select('gst_enabled, gstin').eq('user_id', targetAuthId).limit(1).maybeSingle();
                ss = anyss;
            }
            if (ss?.gst_enabled) {
                // tax_rates.admin_id = Auth UID
                let ratesQuery = (supabase as any).from('tax_rates').select('id, name, rate, cess_rate').eq('admin_id', targetAuthId).eq('is_active', true);
                if (operatingBranchId) ratesQuery = ratesQuery.or(`branch_id.eq.${operatingBranchId},branch_id.is.null`);
                const { data: rates } = await ratesQuery;
                const taxRatesMap: Record<string, any> = {};
                (rates || []).forEach((r: any) => {
                    taxRatesMap[r.id] = { rate: r.rate, name: r.name, cess: r.cess_rate || 0 };
                });
                setGstSettings({ enabled: true, taxRatesMap });
            } else {
                setGstSettings({ enabled: false, taxRatesMap: {} });
            }
        } catch (err) {
            console.warn('Could not load GST settings:', err);
        }
    }, [profile, operatingBranchId]);

    // Fetch tables
    const fetchTables = useCallback(async () => {
        if (!adminId) return;
        try {
            if (!navigator.onLine) {
                const cached = localStorage.getItem('hotel_pos_cached_tables');
                if (cached) {
                    setTables(JSON.parse(cached));
                    return;
                }
            }

            let query = (supabase as any)
                .from('tables')
                .select('*')
                .eq('admin_id', adminId)
                .eq('is_active', true)
                .order('display_order', { ascending: true });
            
            if (operatingBranchId) {
                query = query.eq('branch_id', operatingBranchId);
            }
            
            const { data, error } = await query;
            if (error) throw error;
            setTables(data || []);
            localStorage.setItem('hotel_pos_cached_tables', JSON.stringify(data || []));
        } catch (err) {
            console.error('Error fetching tables:', err);
            if (navigator.onLine) {
                toast({ title: 'Error', description: 'Failed to load tables', variant: 'destructive' });
            }
        }
    }, [adminId, operatingBranchId]);

    // Fetch active menu items
    const fetchMenu = useCallback(async () => {
        if (!adminId) return;
        try {
            if (!navigator.onLine) {
                const { offlineManager } = await import('@/utils/offlineManager');
                const cachedItems = await offlineManager.getCachedItems();
                if (cachedItems && cachedItems.length > 0) {
                    const filtered = cachedItems.filter((item: any) => item.is_saleable !== false && item.is_active !== false);
                    setMenuItems(filtered);
                    return;
                }
            }

            let query = (supabase as any)
                .from('items')
                .select('*')
                .eq('admin_id', adminId)
                .eq('is_active', true)
                .order('name', { ascending: true });
            
            if (operatingBranchId) {
                query = query.eq('branch_id', operatingBranchId);
            }
            
            const { data, error } = await query;
            
            if (error) {
                // If branch_id column doesn't exist, retry without it
                if (error.message?.includes('branch_id') || error.code === 'PGRST204') {
                    const { data: fallbackData, error: fallbackError } = await (supabase as any)
                        .from('items')
                        .select('*')
                        .eq('admin_id', adminId)
                        .eq('is_active', true)
                        .order('name', { ascending: true });
                    if (fallbackError) throw fallbackError;
                    // Client-side filter: only show saleable items (default true if column missing)
                    const filtered = (fallbackData || []).filter((item: any) => item.is_saleable !== false);
                    setMenuItems(filtered);
                    return;
                }
                throw error;
            }
            // Client-side filter: only show saleable items (default true if column missing)
            const filtered = (data || []).filter((item: any) => item.is_saleable !== false);
            setMenuItems(filtered);
        } catch (err) {
            console.error('Error fetching menu items:', err);
            if (navigator.onLine) {
                toast({ title: 'Error', description: 'Failed to load menu items', variant: 'destructive' });
            }
        }
    }, [adminId, operatingBranchId]);

    useEffect(() => {
        fetchTables();
        fetchMenu();
        fetchGstSettings();
    }, [fetchTables, fetchMenu, fetchGstSettings]);

    // Real-time stock sync
    useEffect(() => {
        if (!adminId) return;

        const channel = new BroadcastChannel('stock_update');
        channel.onmessage = (event) => {
            if (event.data?.type === 'STOCK_UPDATED') {
                const { itemId, newStock } = event.data;
                setMenuItems(prev => prev.map(item => 
                    item.id === itemId ? { ...item, stock_quantity: newStock } : item
                ));
            }
        };

        const subscription = supabase
            .channel('waiter_items_stock')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'items',
                    filter: `admin_id=eq.${adminId}`
                },
                (payload) => {
                    const updatedItem = payload.new as MenuItem;
                    setMenuItems(prev => prev.map(item => 
                        item.id === updatedItem.id 
                            ? { ...item, stock_quantity: updatedItem.stock_quantity, min_stock_threshold: updatedItem.min_stock_threshold, is_unlimited_stock: updatedItem.is_unlimited_stock } 
                            : item
                    ));
                }
            )
            .subscribe();

        return () => {
            channel.close();
            supabase.removeChannel(subscription);
        };
    }, [adminId]);

    // Extract unique categories
    const categories = useMemo(() => {
        const cats = new Set<string>();
        menuItems.forEach(item => {
            if (item.category) cats.add(item.category);
        });
        return ['All', ...Array.from(cats)];
    }, [menuItems]);

    // Filter menu items
    const filteredMenuItems = useMemo(() => {
        return menuItems.filter(item => {
            const matchesSearch = (item.name || '').toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    }, [menuItems, searchQuery, selectedCategory]);

    // Handle table selection
    const handleSelectTable = (table: Table) => {
        setSelectedTable(table);
        setSelectedSeatId(null);
        setCustomerNote('');
        setActiveTab('menu');
        
        // Load cart from localStorage for this table
        const savedCart = localStorage.getItem(`waiter_cart_${table.id}`);
        if (savedCart) {
            try {
                const parsed = JSON.parse(savedCart);
                setCart(Array.isArray(parsed) ? parsed : []);
            } catch (e) {
                setCart([]);
            }
        } else {
            setCart([]);
        }
    };

    // Save cart to localStorage whenever it changes
    useEffect(() => {
        if (selectedTable) {
            if (cart.length > 0) {
                localStorage.setItem(`waiter_cart_${selectedTable.id}`, JSON.stringify(cart));
            } else {
                localStorage.removeItem(`waiter_cart_${selectedTable.id}`);
            }
        }
    }, [cart, selectedTable]);

    // Add to cart
    const handleAddToCart = (item: MenuItem) => {
        if (!selectedTable) {
            toast({ title: 'Select Table', description: 'Please select a table first', variant: 'destructive' });
            setActiveTab('tables');
            return;
        }

        setCart(prev => {
            const step = item.quantity_step || item.selling_quantity || item.base_value || 1;
            const existingIndex = prev.findIndex(i => i.id === item.id && i.seatId === selectedSeatId);
            if (existingIndex > -1) {
                const updated = [...prev];
                updated[existingIndex].quantity += step;
                return updated;
            }
            return [...prev, {
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: item.selling_quantity || item.base_value || 1,
                unit: item.selling_unit || item.unit,
                base_value: item.selling_quantity || item.base_value || 1,
                selling_unit: item.selling_unit,
                selling_quantity: item.selling_quantity,
                quantity_step: item.quantity_step || item.selling_quantity || item.base_value || 1,
                instructions: '',
                seatId: selectedSeatId,
                tax_rate_id: (item as any).tax_rate_id || null,
                is_tax_inclusive: (item as any).is_tax_inclusive !== false
            }];
        });

        toast({
            title: 'Added to order',
            description: `${item.name} added for ${selectedSeatId ? `Seat ${selectedSeatId}` : 'Table'}`,
            duration: 1000
        });
    };

    // Add item to cart with quick chip quantity
    const handleAddToCartWithChip = (item: MenuItem, chipText: string) => {
        if (!selectedTable) {
            toast({
                title: 'Select Table',
                description: 'Please select a table before adding items to order.',
                variant: 'destructive'
            });
            return;
        }

        const unitToUse = item.selling_unit || item.unit;
        const parsedQty = parseQuickChipQuantity(chipText, unitToUse);
        const qtyToAdd = parsedQty && parsedQty > 0 ? parsedQty : (item.selling_quantity || item.base_value || 1);

        setCart(prev => {
            const existingIndex = prev.findIndex(i => i.id === item.id && i.seatId === selectedSeatId);
            if (existingIndex > -1) {
                const updated = [...prev];
                updated[existingIndex].quantity = qtyToAdd;
                return updated;
            }
            return [...prev, {
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: qtyToAdd,
                unit: item.selling_unit || item.unit,
                base_value: item.selling_quantity || item.base_value || 1,
                selling_unit: item.selling_unit,
                selling_quantity: item.selling_quantity,
                quantity_step: item.quantity_step || item.selling_quantity || item.base_value || 1,
                instructions: '',
                seatId: selectedSeatId,
                tax_rate_id: (item as any).tax_rate_id || null,
                is_tax_inclusive: (item as any).is_tax_inclusive !== false
            }];
        });

        toast({
            title: '⚡ Quick Portion Set',
            description: `${item.name} (${chipText}) set for ${selectedSeatId ? `Seat ${selectedSeatId}` : `Table ${selectedTable.table_number}`}`,
            duration: 1500
        });
    };

    // Update cart item quantity
    const handleUpdateQty = (itemId: string, seatId: string | null, deltaMultiplier: number) => {
        setCart(prev => {
            const index = prev.findIndex(i => i.id === itemId && i.seatId === seatId);
            if (index === -1) return prev;
            
            const updated = [...prev];
            const item = updated[index];
            const step = item.quantity_step || item.selling_quantity || item.base_value || 1;
            const newQty = item.quantity + (deltaMultiplier * step);
            
            if (newQty <= 0) {
                return updated.filter((_, idx) => idx !== index);
            }
            updated[index].quantity = newQty;
            return updated;
        });
    };

    // Update item instructions
    const handleUpdateInstructions = (itemId: string, seatId: string | null, text: string) => {
        setCart(prev => prev.map(item => 
            item.id === itemId && item.seatId === seatId ? { ...item, instructions: text } : item
        ));
    };

    // Cart totals — including GST if enabled
    const { cartSubtotal, cartExclusiveTax, cartTaxesList, cartTotal } = useMemo(() => {
        let subtotal = 0;
        let exclusiveTax = 0;
        const rateSummary: Record<string, { rate: number; taxable: number; tax: number; name: string }> = {};

        cart.forEach(item => {
            const bv = item.base_value || 1;
            const lineTotal = (item.quantity / bv) * item.price;
            subtotal += lineTotal;

            const taxRateId = (item as any).tax_rate_id;
            const taxRateInfo = (gstSettings.enabled && taxRateId) ? gstSettings.taxRatesMap[taxRateId] : null;

            if (taxRateInfo) {
                const totalRate = taxRateInfo.rate + taxRateInfo.cess;
                const isInclusive = (item as any).is_tax_inclusive !== false;
                let taxable = lineTotal;
                let tax = 0;
                if (isInclusive) {
                    taxable = lineTotal / (1 + totalRate / 100);
                    tax = lineTotal - taxable;
                } else {
                    taxable = lineTotal;
                    tax = lineTotal * (totalRate / 100);
                    exclusiveTax += tax;
                }
                const key = String(taxRateInfo.rate);
                if (!rateSummary[key]) rateSummary[key] = { rate: taxRateInfo.rate, name: taxRateInfo.name || `GST ${taxRateInfo.rate}%`, taxable: 0, tax: 0 };
                rateSummary[key].taxable += taxable;
                rateSummary[key].tax += tax;
            }
        });

        return {
            cartSubtotal: subtotal,
            cartExclusiveTax: exclusiveTax,
            cartTaxesList: Object.values(rateSummary),
            cartTotal: subtotal + exclusiveTax
        };
    }, [cart, gstSettings]);

    // Submit table order
    const handleSubmitOrder = async () => {
        if (!selectedTable || cart.length === 0 || !adminId) return;

        const licStatus = checkOfflineLicenseStatus();
        if (!licStatus.isValid) {
            toast({
                title: '🚫 License Lockout',
                description: licStatus.lockReason === 'clock_tampered'
                    ? 'System clock discrepancy detected. Please connect to internet to verify license.'
                    : '7-Day Offline Grace Period Expired. Connect online to verify active SaaS subscription.',
                variant: 'destructive',
            });
            return;
        }

        setIsSubmitting(true);
        try {
            const isOffline = !navigator.onLine;
            let nextOrderNo = 1;
            const sessionId = `waiter-${selectedTable.table_number}-${Date.now()}`;

            if (!isOffline) {
                // Get order number
                const { data: lastOrder } = await supabase
                    .from('table_orders')
                    .select('order_number')
                    .eq('admin_id', adminId)
                    .order('order_number', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                
                nextOrderNo = (lastOrder?.order_number || 0) + 1;
            } else {
                nextOrderNo = Math.floor(1000 + Math.random() * 9000);
            }

            // Group cart by seatId and create separate orders for each seat
            const seatGroups: Record<string, CartItem[]> = {};
            cart.forEach(item => {
                const key = item.seatId || 'table';
                if (!seatGroups[key]) seatGroups[key] = [];
                seatGroups[key].push(item);
            });

            const { offlineManager } = await import('@/utils/offlineManager');

            for (const [seatKey, itemsInSeat] of Object.entries(seatGroups)) {
                const currentSeatId = seatKey === 'table' ? null : seatKey;
                const seatTotal = itemsInSeat.reduce((sum, i) => {
                    const baseValue = i.base_value || 1;
                    const lineTotal = (i.quantity / baseValue) * i.price;
                    // Add exclusive tax for this item if applicable
                    let excTax = 0;
                    const txRateId = (i as any).tax_rate_id;
                    const txInfo = (gstSettings.enabled && txRateId) ? gstSettings.taxRatesMap[txRateId] : null;
                    if (txInfo && (i as any).is_tax_inclusive === false) {
                        excTax = lineTotal * (txInfo.rate + txInfo.cess) / 100;
                    }
                    return sum + lineTotal + excTax;
                }, 0);
                
                const tableOrderData = {
                    admin_id: adminId,
                    branch_id: operatingBranchId || null,
                    table_number: selectedTable.table_number,
                    session_id: sessionId,
                    seat_id: currentSeatId,
                    seat_label: currentSeatId,
                    order_scope: currentSeatId ? 'seat' : 'table',

                    order_number: nextOrderNo,
                    items: itemsInSeat.map(item => {
                        const baseValue = item.base_value || 1;
                        return {
                            item_id: item.id,
                            name: item.name,
                            price: item.price,
                            total: (item.quantity / baseValue) * item.price,
                            quantity: item.quantity,
                            unit: item.unit,
                            base_value: item.base_value,
                            selling_unit: item.selling_unit,
                            selling_quantity: item.selling_quantity,
                            instructions: item.instructions,
                            seat_id: item.seatId || null,
                            seat_label: item.seatId || null,

                        };
                    }),
                    total_amount: seatTotal,
                    status: 'pending',
                    customer_note: customerNote || null,
                    is_billed: false
                };

                if (!isOffline) {
                    const { data, error } = await supabase
                        .from('table_orders')
                        .insert(tableOrderData)
                        .select()
                        .single();

                    if (error) throw error;

                    // Send realtime broadcast to notify KDS instantly
                    try {
                        const channel = supabase.channel('table-order-sync');
                        channel.subscribe((status) => {
                            if (status === 'SUBSCRIBED') {
                                channel.send({
                                    type: 'broadcast',
                                    event: 'new-table-order',
                                    payload: data
                                });
                                setTimeout(() => supabase.removeChannel(channel), 1000);
                            }
                        });
                    } catch (broadcastErr) {
                        console.warn('Realtime broadcast failed, but order was saved', broadcastErr);
                    }
                } else {
                    // Queue the table order offline
                    await offlineManager.addToSyncQueue({
                        type: 'table_order' as any,
                        action: 'create',
                        data: tableOrderData
                    });
                }
            }

            if (!isOffline) {
                // Update table status to occupied
                await supabase
                    .from('tables')
                    .update({ status: 'occupied' })
                    .eq('id', selectedTable.id);
            } else {
                // Queue table status update offline
                await offlineManager.addToSyncQueue({
                    type: 'table' as any,
                    action: 'update_status',
                    data: { id: selectedTable.id, status: 'occupied' }
                });
            }

            // Update UI status immediately
            setTables(prev => prev.map(t => t.id === selectedTable.id ? { ...t, status: 'occupied' } : t));

            toast({ 
                title: isOffline ? '📴 Order Saved Offline' : 'Order Pushed!', 
                description: isOffline ? `Order queued for Table ${selectedTable.table_number}. Will sync when online.` : `Order submitted for Table ${selectedTable.table_number}` 
            });
            setCart([]);
            setCustomerNote('');
            setSelectedTable(null);
            setActiveTab('tables');
        } catch (err) {
            console.error('Order submission failed:', err);
            toast({ title: 'Order Failed', description: 'Could not push order to kitchen', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] bg-background overflow-hidden">
            {/* Mobile Step Header */}
            <div className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 px-2 py-2">
                <div className="flex items-center gap-1.5">
                    {([
                        { key: 'tables' as const, step: 1, label: 'Table', disabled: false, badge: selectedTable ? selectedTable.table_number : null },
                        { key: 'menu' as const, step: 2, label: 'Items', disabled: !selectedTable, badge: null },
                        {
                            key: 'cart' as const, step: 3, label: 'Cart', disabled: cart.length === 0,
                            badge: cart.length > 0 ? String(cart.reduce((sum, i) => sum + (i.quantity / (i.base_value || 1)), 0)) : null
                        },
                    ]).map((t) => {
                        const active = activeTab === t.key;
                        return (
                            <button
                                key={t.key}
                                type="button"
                                disabled={t.disabled}
                                onClick={() => setActiveTab(t.key)}
                                className={cn(
                                    'relative flex-1 flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-bold transition-all duration-200 border',
                                    active
                                        ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-primary shadow-lg shadow-primary/25 scale-[1.02]'
                                        : 'bg-muted/40 text-muted-foreground border-transparent hover:bg-muted active:scale-[0.97]',
                                    t.disabled && 'opacity-40 pointer-events-none'
                                )}
                            >
                                <span className={cn(
                                    'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black tabular-nums',
                                    active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background text-muted-foreground'
                                )}>
                                    {t.step}
                                </span>
                                <span className="truncate">{t.label}</span>
                                {t.badge && (
                                    <span className={cn(
                                        'ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums',
                                        active ? 'bg-primary-foreground text-primary' : 'bg-primary/15 text-primary'
                                    )}>
                                        {t.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>


            {/* Main Scrollable Workspace */}
            <div className="flex-1 p-4 overflow-y-auto">

                {/* TAB 1: TABLES SELECTOR */}
                {activeTab === 'tables' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-2 mb-2 p-2 rounded-xl bg-muted/40 border border-border">
                            <div className="flex items-center gap-2">
                                <Utensils className="w-5 h-5 text-primary" />
                                <h2 className="text-sm font-bold">Choose Dine-In Table</h2>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setMoveDialogOpen(true)}
                                className="h-8 text-xs font-semibold border-primary/40 text-primary hover:bg-primary/10 gap-1.5 shadow-2xs"
                            >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                Move Table / Seat
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {tables.map(table => {
                                const upcomingRes = reservationManager.getUpcomingForTable(table.table_number, reservations);
                                return (
                                    <Card
                                        key={table.id}
                                        onClick={() => handleSelectTable(table)}
                                        className={cn(
                                            "cursor-pointer hover:shadow-md transition-all border-2",
                                            selectedTable?.id === table.id ? "border-primary bg-primary/5 shadow-md" : "border-muted",
                                            table.status === 'occupied' && "border-l-4 border-l-red-500",
                                            table.status === 'cleaning' && "border-l-4 border-l-blue-500",
                                            table.status === 'reserved' && "border-l-4 border-l-yellow-500",
                                            upcomingRes && "ring-2 ring-yellow-500/60"
                                        )}
                                    >
                                        <CardContent className="p-3.5 flex flex-col justify-between min-h-28">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <span className="text-2xl font-black">T{table.table_number}</span>
                                                    {upcomingRes && (
                                                        <span className="text-[9px] block font-bold text-yellow-700 dark:text-yellow-300">
                                                            ⭐ Res: {upcomingRes.reservation_time} ({upcomingRes.customer_name})
                                                        </span>
                                                    )}
                                                </div>
                                                <Badge variant={table.status === 'available' ? 'outline' : 'secondary'} className="text-[10px] uppercase font-bold">
                                                    {table.status}
                                                </Badge>
                                            </div>
                                            <div className="text-xs text-muted-foreground flex justify-between items-center mt-2">
                                                <span className="flex items-center gap-1 text-[11px] font-semibold"><User className="w-3.5 h-3.5" /> Max {table.capacity}</span>
                                                {table.has_seats && <Badge variant="outline" className="text-[9px] font-bold">S1-S{table.seat_count}</Badge>}
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* TAB 2: MENU & SEAT SELECTOR */}
                {activeTab === 'menu' && selectedTable && (
                    <div className="space-y-4 flex flex-col h-full">
                        {/* Seat Selector Row */}
                        {selectedTable.has_seats && (
                            <div className="bg-card p-3 rounded-xl border border-muted shadow-sm">
                                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-2">Assign Items to Seat</Label>
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                    {(selectedTable.seat_order_mode || 'both') !== 'seat' && (
                                        <Button
                                            variant={selectedSeatId === null ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => setSelectedSeatId(null)}
                                            className="h-8 rounded-full text-xs shrink-0"
                                        >
                                            Whole Table
                                        </Button>
                                    )}
                                    {(selectedTable.seat_order_mode || 'both') !== 'table' && getSeatLabels(selectedTable).map((seatLabel) => (
                                        <Button
                                            key={seatLabel}
                                            variant={selectedSeatId === seatLabel ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => setSelectedSeatId(seatLabel)}
                                            className="h-8 rounded-full text-xs shrink-0"
                                        >
                                            Seat {seatLabel}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}


                        {/* Search & View Mode Filter */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search food item..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9 h-10 rounded-xl bg-card"
                                    />
                                    {searchQuery && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="absolute right-1 top-1 h-8 w-8"
                                            onClick={() => setSearchQuery('')}
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                                <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-muted shrink-0 gap-1">
                                    <div className="flex items-center">
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant={viewMode === 'grid' ? 'default' : 'ghost'}
                                            onClick={() => setViewMode('grid')}
                                            className="h-8 w-8 rounded-lg p-0"
                                        >
                                            <LayoutGrid className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant={viewMode === 'list' ? 'default' : 'ghost'}
                                            onClick={() => setViewMode('list')}
                                            className="h-8 w-8 rounded-lg p-0"
                                        >
                                            <List className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    {viewMode === 'grid' && (
                                        <div className="flex items-center border-l pl-1 gap-0.5">
                                            {[2, 3, 4].map(c => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onClick={() => handleSetGridCols(c)}
                                                    className={cn(
                                                        "h-7 w-7 rounded-lg text-[11px] font-extrabold transition-all",
                                                        gridCols === c ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
                                                    )}
                                                    title={`${c} per row`}
                                                >
                                                    {c}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Swipeable Category list with item count */}
                            <div className="flex gap-1.5 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin">
                                {categories.map(cat => {
                                    const count = cat === 'All'
                                        ? menuItems.length
                                        : menuItems.filter(i => (i.category || 'Other').toLowerCase() === cat.toLowerCase()).length;
                                    return (
                                        <Button
                                            key={cat}
                                            variant={selectedCategory === cat ? 'default' : 'secondary'}
                                            size="sm"
                                            onClick={() => setSelectedCategory(cat)}
                                            className="h-8 rounded-full text-xs shrink-0 px-3.5 flex items-center gap-1 font-semibold"
                                        >
                                            <span>{cat}</span>
                                            <span className={cn(
                                                "text-[10px] px-1.5 py-0.2 rounded-full font-bold",
                                                selectedCategory === cat ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                                            )}>
                                                ({count})
                                            </span>
                                        </Button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Menu Items Grid / List Container */}
                        <div className="flex-1 overflow-y-auto min-h-[48vh] pb-24 space-y-3 pr-1">
                            {viewMode === 'grid' ? (
                                <div className={cn(
                                    "grid gap-2.5",
                                    gridCols === 2 && "grid-cols-2",
                                    gridCols === 3 && "grid-cols-3",
                                    gridCols === 4 && "grid-cols-2 sm:grid-cols-4"
                                )}>
                                    {filteredMenuItems.map(item => {
                                        const cartItem = cart.find(i => i.id === item.id && i.seatId === selectedSeatId);
                                        const isOutOfStock = !item.is_unlimited_stock && (item.stock_quantity ?? 0) <= 0;
                                        const isLowStock = !item.is_unlimited_stock && !isOutOfStock && (item.stock_quantity ?? 0) <= (item.min_stock_threshold ?? 0);
                                        return (
                                            <Card key={item.id} className={cn("overflow-hidden border border-muted shadow-sm transition-all flex flex-col justify-between group", isOutOfStock ? "opacity-50" : "hover:shadow-md")}>
                                                <div className="relative">
                                                    {/* Food image or fallback icon */}
                                                    <div className="w-full h-24 bg-muted/30 relative flex items-center justify-center overflow-hidden">
                                                        {item.image_url ? (
                                                            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                                                <Utensils className="w-5 h-5 text-primary/70" />
                                                            </div>
                                                        )}
                                                        {(item.selling_unit || item.unit) && (
                                                            <Badge className="absolute bottom-1.5 right-1.5 bg-black/60 backdrop-blur-md text-white text-[9px] px-1.5 py-0 border-none font-bold">
                                                                {item.selling_quantity || item.base_value || 1} {getShortUnit(item.selling_unit || item.unit)}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    
                                                    {isOutOfStock && (
                                                        <div className="absolute top-2 right-2 z-10">
                                                            <Badge className="bg-red-500 hover:bg-red-600 text-white font-bold text-[10px] px-1.5 py-0.5 border-none shadow-sm">
                                                                SOLD OUT
                                                            </Badge>
                                                        </div>
                                                    )}
                                                    {isLowStock && (
                                                        <div className="absolute top-2 right-2 z-10">
                                                            <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] px-1.5 py-0.5 border-none shadow-sm">
                                                                Only {item.stock_quantity} left
                                                            </Badge>
                                                        </div>
                                                    )}

                                                    <div className="p-2.5">
                                                        <h4 className="font-bold text-xs line-clamp-2 leading-snug">{item.name}</h4>
                                                        <span className="text-primary font-black text-xs block mt-1">₹{item.price.toFixed(0)}</span>

                                                        {/* Quick Chips per Item */}
                                                        {item.quick_chips && item.quick_chips.length > 0 && (
                                                            <div className="flex gap-1 overflow-x-auto pt-1.5 pb-0.5 scrollbar-none">
                                                                {item.quick_chips.map((chip: string) => (
                                                                    <button
                                                                        key={chip}
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleAddToCartWithChip(item, chip);
                                                                        }}
                                                                        className="px-1.5 py-0.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-[9px] font-extrabold border border-primary/20 whitespace-nowrap shrink-0 transition-colors"
                                                                    >
                                                                        {chip}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="p-2.5 pt-0">
                                                    {cartItem ? (
                                                        <div className="flex items-center justify-between bg-primary/10 rounded-xl p-1 border border-primary/20">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="rounded-lg h-7 w-7 p-0 hover:bg-primary/20 hover:text-primary"
                                                                onClick={(e) => { e.stopPropagation(); handleUpdateQty(item.id, selectedSeatId, -1); }}
                                                            >
                                                                <Minus className="w-3.5 h-3.5" />
                                                            </Button>
                                                            <span className="font-black text-xs text-primary">
                                                                {cartItem.quantity / (item.selling_quantity || item.base_value || 1)}
                                                            </span>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="rounded-lg h-7 w-7 p-0 hover:bg-primary/20 hover:text-primary"
                                                                onClick={(e) => { e.stopPropagation(); handleUpdateQty(item.id, selectedSeatId, 1); }}
                                                            >
                                                                <Plus className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            disabled={isOutOfStock}
                                                            onClick={(e) => { e.stopPropagation(); handleAddToCart(item); }}
                                                            className={cn("w-full rounded-xl h-8 text-xs font-bold gap-1", isOutOfStock ? "bg-muted text-muted-foreground" : "")}
                                                        >
                                                            <Plus className="w-3.5 h-3.5" /> Add
                                                        </Button>
                                                    )}
                                                </div>
                                            </Card>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-2.5">
                                    {filteredMenuItems.map(item => {
                                        const cartItem = cart.find(i => i.id === item.id && i.seatId === selectedSeatId);
                                        const isOutOfStock = !item.is_unlimited_stock && (item.stock_quantity ?? 0) <= 0;
                                        const isLowStock = !item.is_unlimited_stock && !isOutOfStock && (item.stock_quantity ?? 0) <= (item.min_stock_threshold ?? 0);
                                        return (
                                            <Card key={item.id} className={cn("overflow-hidden border border-muted shadow-sm transition-all", isOutOfStock ? "opacity-50" : "hover:shadow-md")}>
                                                <CardContent className="p-3 flex items-center justify-between">
                                                    <div className="flex items-center gap-3 min-w-0 pr-2">
                                                        <div className="w-12 h-12 rounded-xl bg-muted/40 shrink-0 overflow-hidden flex items-center justify-center">
                                                            {item.image_url ? (
                                                                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <Utensils className="w-5 h-5 text-primary/70" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="font-bold text-sm truncate">{item.name}</h4>
                                                                {isOutOfStock && <Badge className="bg-red-500 hover:bg-red-600 text-white font-bold text-[9px] px-1 py-0 h-4 border-none shrink-0">SOLD OUT</Badge>}
                                                                {isLowStock && <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-[9px] px-1 py-0 h-4 border-none shrink-0">Only {item.stock_quantity} left</Badge>}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="text-primary font-black text-sm">₹{item.price.toFixed(0)}</span>
                                                                {(item.selling_unit || item.unit) && (
                                                                    <Badge variant="outline" className="text-[10px] scale-90 px-1 py-0 h-4">
                                                                        per {item.selling_quantity || item.base_value || 1} {getShortUnit(item.selling_unit || item.unit)}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            {item.quick_chips && item.quick_chips.length > 0 && (
                                                                <div className="flex gap-1 overflow-x-auto pt-1 scrollbar-none">
                                                                    {item.quick_chips.map((chip: string) => (
                                                                        <button
                                                                            key={chip}
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleAddToCartWithChip(item, chip);
                                                                            }}
                                                                            className="px-1.5 py-0.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-[9px] font-extrabold border border-primary/20 whitespace-nowrap shrink-0 transition-colors"
                                                                        >
                                                                            {chip}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {cartItem ? (
                                                        <div className="flex items-center gap-2 bg-primary/10 rounded-full p-1 border border-primary/20">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="rounded-full h-7 w-7 p-0 hover:bg-primary/20 hover:text-primary"
                                                                onClick={(e) => { e.stopPropagation(); handleUpdateQty(item.id, selectedSeatId, -1); }}
                                                            >
                                                                <Minus className="w-3.5 h-3.5" />
                                                            </Button>
                                                            <span className="font-black text-sm w-4 text-center text-primary">{cartItem.quantity / (item.selling_quantity || item.base_value || 1)}</span>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="rounded-full h-7 w-7 p-0 hover:bg-primary/20 hover:text-primary"
                                                                onClick={(e) => { e.stopPropagation(); handleUpdateQty(item.id, selectedSeatId, 1); }}
                                                            >
                                                                <Plus className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            disabled={isOutOfStock}
                                                            onClick={(e) => { e.stopPropagation(); handleAddToCart(item); }}
                                                            className={cn("rounded-full h-8 w-8 p-0", isOutOfStock ? "bg-muted text-muted-foreground" : "")}
                                                        >
                                                            <Plus className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                                </div>
                            )}

                            {filteredMenuItems.length === 0 && (
                                <div className="text-center py-12 text-muted-foreground text-sm space-y-2">
                                    <Utensils className="w-8 h-8 mx-auto opacity-40" />
                                    <p>No menu items found matching search.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 3: CART VIEW */}
                {activeTab === 'cart' && selectedTable && (
                    <div className="space-y-4 flex flex-col h-full pb-20">
                        <div className="flex items-center justify-between border-b pb-2">
                            <div>
                                <h3 className="font-bold text-base">Table {selectedTable.table_number} Order Cart</h3>
                                <p className="text-xs text-muted-foreground">Confirm and push to kitchen display</p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setClearCartOpen(true);
                                }}
                                className="text-destructive h-8 px-2"
                            >
                                <Trash2 className="w-4 h-4 mr-1" /> Clear All
                            </Button>
                        </div>

                        {/* Cart List */}
                        <div className="flex-1 overflow-y-auto max-h-[48vh] space-y-3 pr-1">
                            <div className="space-y-3 pr-1">
                                {cart.map((item, idx) => (
                                    <Card key={`${item.id}-${item.seatId}-${idx}`} className="p-3 border border-muted">
                                        <div className="flex items-start justify-between">
                                            <div className="min-w-0 pr-2">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-bold text-sm">
                                                        {isWeightOrVolumeUnit(item.selling_unit || item.unit) ? (
                                                            `${item.quantity / (item.base_value || 1)} × ${formatQuantityWithUnit(item.base_value || 1, item.selling_unit || item.unit)} ${item.name}`
                                                        ) : (
                                                            `${item.quantity} × ${item.name}`
                                                        )}
                                                    </span>
                                                    {item.seatId && (
                                                        <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 text-[10px] h-4 py-0 px-1.5 font-bold">
                                                            Seat {item.seatId}
                                                        </Badge>
                                                    )}
                                                    {(() => {
                                                        const badge = getKOTStatusBadgeInfo((item as any).status || 'unsent');
                                                        return (
                                                            <Badge variant={badge.variant} className={badge.className}>
                                                                <span className={cn("w-1.5 h-1.5 rounded-full", badge.dotColor)} />
                                                                {badge.label}
                                                            </Badge>
                                                        );
                                                    })()}
                                                </div>
                                                <span className="text-xs text-muted-foreground block mt-0.5">₹{item.price.toFixed(0)} each ({item.selling_quantity || item.base_value || 1} {getShortUnit(item.selling_unit || item.unit)})</span>
                                            </div>

                                            {/* Quantity controls */}
                                            <div className="flex items-center gap-2.5">
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-7 w-7 rounded-full"
                                                    onClick={() => handleUpdateQty(item.id, item.seatId, -1)}
                                                >
                                                    <Minus className="w-3.5 h-3.5" />
                                                </Button>
                                                <span className="font-black text-sm w-4 text-center">
                                                    {item.quantity / (item.base_value || 1)}
                                                </span>
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-7 w-7 rounded-full"
                                                    onClick={() => handleUpdateQty(item.id, item.seatId, 1)}
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Cooking instructions input */}
                                        <div className="mt-2.5 flex items-center gap-2">
                                            <Clipboard className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                            <Input
                                                placeholder="Add cooking instruction..."
                                                value={item.instructions}
                                                onChange={(e) => handleUpdateInstructions(item.id, item.seatId, e.target.value)}
                                                className="h-7 text-xs rounded-md py-1 px-2 border-muted"
                                            />
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </div>

                        {/* Customer Overall Note */}
                        <div className="space-y-1.5 bg-muted/20 p-3 rounded-xl border border-muted">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block">Customer Note / Table Comment</label>
                            <Input
                                placeholder="General order note (e.g. no ice in drinks)..."
                                value={customerNote}
                                onChange={(e) => setCustomerNote(e.target.value)}
                                className="h-9 text-xs rounded-md"
                            />
                        </div>

                        {/* Bottom Total & Checkout Summary */}
                        <div className="bg-card border-t pt-3 space-y-3 mt-auto">
                            <div className="space-y-1 text-xs text-muted-foreground px-1">
                                <div className="flex justify-between">
                                    <span>Subtotal:</span>
                                    <span>₹{cartSubtotal.toFixed(2)}</span>
                                </div>
                                {cartExclusiveTax > 0 && (
                                    <div className="flex justify-between text-amber-600 font-medium">
                                        <span>Tax (Exclusive):</span>
                                        <span>+₹{cartExclusiveTax.toFixed(2)}</span>
                                    </div>
                                )}
                                {gstSettings.enabled && cartTaxesList.map((entry: any) => (
                                    <div key={entry.rate} className="flex justify-between pl-2 text-[10px]">
                                        <span>{entry.name} (Taxable ₹{entry.taxable.toFixed(2)}):</span>
                                        <span>₹{entry.tax.toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between items-center px-1">
                                <span className="font-bold text-muted-foreground text-sm">Estimated Total:</span>
                                <span className="text-xl font-black text-primary">₹{cartTotal.toFixed(0)}</span>
                            </div>
                            <Button
                                onClick={handleSubmitOrder}
                                disabled={isSubmitting}
                                className="w-full h-12 rounded-xl text-white font-bold bg-primary hover:bg-primary/95 flex items-center justify-center gap-2 text-sm shadow-md"
                            >
                                <ChefHat className="w-4 h-4" />
                                {isSubmitting ? 'Pushing to Kitchen...' : 'Send Order to Kitchen'}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Sticky Floating Cart Bar (Rendered via Portal to match POS page position exactly) */}
            {activeTab !== 'cart' && cart.length > 0 && createPortal(
                <div className="fixed bottom-[68px] left-0 right-0 z-[9999] px-3 pb-1 pointer-events-none animate-in slide-in-from-bottom-5 duration-300">
                    <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white p-2.5 sm:p-3 rounded-2xl shadow-2xl border border-blue-400/30 flex items-center justify-between backdrop-blur-md pointer-events-auto">
                        <div
                            onClick={() => setActiveTab('cart')}
                            className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                        >
                            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                                <ShoppingCart className="w-5 h-5 text-white" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-sm text-white truncate">
                                        {cart.reduce((sum, i) => sum + (i.quantity / (i.base_value || 1)), 0)} items selected
                                    </span>
                                    {selectedTable?.table_number && (
                                        <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-md text-white font-medium">
                                            Table {selectedTable.table_number}
                                        </span>
                                    )}
                                </div>
                                <span className="text-lg font-black text-white block leading-tight">
                                    ₹{cartTotal.toFixed(0)}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setClearCartOpen(true);
                                }}
                                className="h-9 w-9 rounded-xl text-white/80 hover:text-white hover:bg-white/20"
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                            <Button
                                onClick={() => setActiveTab('cart')}
                                size="sm"
                                className="rounded-xl h-9 px-3 font-bold bg-white text-blue-700 hover:bg-white/90 shadow-md flex items-center gap-1 text-xs"
                            >
                                <span>View Cart</span>
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Modern Clear Cart Confirmation Dialog */}
            <AlertDialog open={clearCartOpen} onOpenChange={setClearCartOpen}>
                <AlertDialogContent className="max-w-[90vw] sm:max-w-md rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Clear Cart?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to remove all items from this table's cart? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex gap-2 justify-end mt-4">
                        <AlertDialogCancel className="rounded-xl mt-0">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                setCart([]);
                                setClearCartOpen(false);
                            }}
                            className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Clear All
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <TableMoveDialog
                open={moveDialogOpen}
                onOpenChange={setMoveDialogOpen}
                onMoveSuccess={() => fetchTables()}
            />
        </div>
    );
};

export default WaiterCompanion;
