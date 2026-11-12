import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { PrinterHealthBanner } from '@/components/PrinterHealthBanner';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import {
    Search,
    ShoppingCart,
    Plus,
    Minus,
    Trash2,
    Utensils,
    Clipboard,
    ChefHat,
    User,
    ChevronRight,
    ChevronDown,
    X,
    LayoutGrid,
    List,
    ArrowRightLeft,
    Printer,
    Sun,
    Moon,
    ArrowLeft,
    MoreHorizontal,
    Users,
    Clock,
    CheckCircle2,
    RefreshCw,
    Calendar,
    Phone,
} from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useOffline';
import { cn } from '@/lib/utils';
import { formatQuantityWithUnit, getShortUnit, isWeightOrVolumeUnit, parseQuickChipQuantity } from '@/utils/timeUtils';
import { printTableOrderKOT } from '@/utils/kotGenerator';
import { getKOTStatusBadgeInfo, getOccupancyTimerInfo } from '@/utils/seatUtils';
import { reservationManager, TableReservation } from '@/utils/reservationManager';
import { TableMoveDialog } from '@/components/TableMoveDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { checkOfflineLicenseStatus } from '@/utils/offlineLicenseManager';
import { usePrinter } from '@/hooks/usePrinter';
import { RemoteOrderStatusBoard } from '@/components/reports/RemoteOrderStatusBoard';

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
    floor_name?: string | null;
    shape?: string | null;
}

interface WaiterTableOrder {
    id: string;
    table_number: string;
    order_number: number;
    status: string;
    total_amount: number;
    items: any;
    created_at: string | null;
    seat_label?: string | null;
    seat_id?: string | null;
    customer_note?: string | null;
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
    
    minimum_stock_alert?: number;
    unlimited_stock?: boolean;
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

const formatOrderElapsed = (iso?: string | null): string => {
    if (!iso) return '0m';
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
};


const WaiterCompanion: React.FC = () => {
    const { profile , adminProfileId } = useAuth();
    const { operatingBranchId } = useBranch();
    const isOnline = useNetworkStatus();
    const adminId = adminProfileId;
    const { connectionState, isConnected, hasNativeBridge, deviceName, connect } = usePrinter();
    const isPrinterReady = isConnected || (hasNativeBridge && Boolean(localStorage.getItem('hotel_pos_bluetooth_printer_address')));

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
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState<'tables' | 'orders' | 'kitchen' | 'customers' | 'menu' | 'cart'>('tables');
    const [selectedFloor, setSelectedFloor] = useState<string>('All Floors');
    const [floorMenuOpen, setFloorMenuOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [tableOrders, setTableOrders] = useState<WaiterTableOrder[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [isDark, setIsDark] = useState(() =>
        typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    );
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

    useEffect(() => {
        const syncTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        window.addEventListener('theme-changed', syncTheme);
        return () => window.removeEventListener('theme-changed', syncTheme);
    }, []);

    const toggleDarkMode = () => {
        const root = document.documentElement;
        const next = !root.classList.contains('dark');
        root.classList.toggle('dark', next);
        localStorage.setItem('hotel_pos_dark_mode', next ? 'true' : 'false');
        setIsDark(next);
        window.dispatchEvent(new CustomEvent('theme-changed'));
    };

    const fetchTableOrders = useCallback(async () => {
        if (!adminId || !navigator.onLine) return;
        setOrdersLoading(true);
        try {
            let q = supabase
                .from('table_orders')
                .select('id, table_number, order_number, status, total_amount, items, created_at, seat_label, seat_id, customer_note')
                .eq('admin_id', adminId)
                .eq('is_billed', false)
                .neq('status', 'cancelled')
                .order('created_at', { ascending: false })
                .limit(100);
            if (operatingBranchId) {
                q = q.eq('branch_id', operatingBranchId);
            }
            const { data, error } = await q;
            if (!error && data) {
                setTableOrders(data as WaiterTableOrder[]);
            }
        } catch (err) {
            console.warn('Could not load table orders:', err);
        } finally {
            setOrdersLoading(false);
        }
    }, [adminId, operatingBranchId]);

    useEffect(() => {
        fetchTableOrders();
    }, [fetchTableOrders]);

    useEffect(() => {
        if (!adminId) return;
        const ordersChannel = supabase
            .channel(`waiter_table_orders_${adminId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'table_orders', filter: `admin_id=eq.${adminId}` },
                () => { fetchTableOrders(); }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'tables', filter: `admin_id=eq.${adminId}` },
                () => { fetchTables(); }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(ordersChannel);
        };
    }, [adminId, fetchTableOrders, fetchTables]);
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
            if (ss?.gst_enabled && adminProfileId) {
                let ratesQuery = (supabase as any).from('tax_rates').select('id, name, rate, cess_rate').eq('admin_id', adminProfileId).eq('is_active', true);
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
    }, [profile, adminProfileId, operatingBranchId]);

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
                            ? { ...item, stock_quantity: updatedItem.stock_quantity, minimum_stock_alert: updatedItem.minimum_stock_alert, unlimited_stock: updatedItem.unlimited_stock } 
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
    const handleSubmitOrder = async (printKOT: boolean = false) => {
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

            // KOT Print (if requested) — never throws or cancels the saved order
            if (printKOT) {
                const allCartItems = cart.map(item => ({
                    name: item.name,
                    quantity: item.quantity,
                    unit: item.unit,
                    instructions: item.instructions,
                    category: menuItems.find(m => m.id === item.id)?.category
                }));
                try {
                    await printTableOrderKOT({
                        id: `KOT-${selectedTable.table_number}-${Date.now()}`,
                        order_number: String(nextOrderNo),
                        table_number: selectedTable.table_number,
                        customer_note: customerNote,
                        items: allCartItems
                    });
                } catch (printErr) {
                    console.warn('KOT Print failed, order remains saved:', printErr);
                    toast({
                        title: 'Order Saved — Printer Busy',
                        description: 'Order pushed to kitchen. Thermal printer was not reachable.',
                        variant: 'default'
                    });
                }
            }

            toast({ 
                title: isOffline ? '📴 Order Saved Offline' : 'Order Pushed!', 
                description: isOffline ? `Order queued for Table ${selectedTable.table_number}. Will sync when online.` : `Order submitted for Table ${selectedTable.table_number}` 
            });
            setCart([]);
            setCustomerNote('');
            setSelectedTable(null);
            setActiveTab('tables');
            fetchTableOrders();
        } catch (err) {
            console.error('Order submission failed:', err);
            toast({ title: 'Order Failed', description: 'Could not push order to kitchen', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReprintKOT = (table: Table) => async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!adminId) return;
        try {
            // 1. Try table_orders first
            const { data: orders } = await supabase
                .from('table_orders')
                .select('*')
                .eq('admin_id', adminId)
                .eq('table_number', table.table_number)
                .in('status', ['pending', 'preparing', 'ready', 'served'])
                .order('created_at', { ascending: false });

            let kotItems: { name: string; quantity: number; notes?: string; unit?: string }[] = [];
            let billRef = `T${table.table_number}`;
            let orderNumber: string | number | undefined;

            if (orders && orders.length > 0) {
                const latest = orders[0];
                const items = Array.isArray(latest.items) ? latest.items : [];
                kotItems = items.map((it: any) => ({ name: it.name || it.item_name || 'Item', quantity: it.quantity || 1, notes: it.notes, unit: it.unit }));
                orderNumber = latest.order_number;
                billRef = latest.order_number ? String(latest.order_number) : billRef;
            } else {
                // Fallback: latest bill for this table
                const { data: latestBill } = await (supabase as any)
                    .from('bills')
                    .select('*, bill_items(*, items(name, unit))')
                    .eq('admin_id', adminId)
                    .eq('table_no', table.table_number)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (latestBill?.bill_items?.length > 0) {
                    kotItems = latestBill.bill_items.map((bi: any) => ({
                        name: bi.items?.name || bi.name || 'Item',
                        quantity: bi.quantity || 1,
                        unit: bi.items?.unit,
                    }));
                    orderNumber = latestBill.bill_no;
                    billRef = latestBill.bill_no ? String(latestBill.bill_no) : billRef;
                }
            }

            if (kotItems.length === 0) {
                toast({ title: `No active items found`, description: `No active items found to reprint for Table T${table.table_number}`, variant: 'destructive' });
                return;
            }

            await printTableOrderKOT({
                order_number: `[REPRINT] ${billRef}`,
                table_number: String(table.table_number),
                items: kotItems.map(it => ({ name: it.name, quantity: it.quantity, unit: it.unit, instructions: it.notes, category: menuItems.find(m => m.name === it.name)?.category })),
            });
            toast({ title: `KOT Reprinted`, description: `KOT Reprinted for Table T${table.table_number}` });
        } catch (err: any) {
            console.error('Reprint KOT error:', err);
            toast({ title: 'Printer Error', description: 'Ensure Bluetooth printer is powered on and within range', variant: 'destructive' });
        }
    };

    const floorOptions = useMemo(() => {
        const floors = new Set<string>();
        tables.forEach(t => floors.add((t.floor_name || '').trim() || 'Main Floor'));
        const list = Array.from(floors);
        return list.length > 0 ? ['All Floors', ...list] : ['All Floors', 'Main Floor'];
    }, [tables]);

    const visibleTables = useMemo(() => {
        if (selectedFloor === 'All Floors') return tables;
        return tables.filter(t => ((t.floor_name || '').trim() || 'Main Floor') === selectedFloor);
    }, [tables, selectedFloor]);

    const kitchenActiveCount = useMemo(
        () => tableOrders.filter(o => o.status === 'pending' || o.status === 'preparing').length,
        [tableOrders]
    );

    const waiterInitials = useMemo(() => {
        const name = (profile?.name || 'Waiter').trim();
        const parts = name.split(/\s+/);
        if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        return name.slice(0, 2).toUpperCase();
    }, [profile?.name]);

    const cartBadgeCount = useMemo(
        () => cart.reduce((sum, i) => sum + (i.quantity / (i.base_value || 1)), 0),
        [cart]
    );

    const renderSeatDot = (label: string, key: string | number) => (
        <div
            key={key}
            className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-[8px] flex items-center justify-center font-bold text-gray-500 dark:text-gray-300 shrink-0"
        >
            {label}
        </div>
    );

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#F9F7F5] dark:bg-gray-950 overflow-hidden">
            <div className="px-2 pt-2 empty:hidden"><PrinterHealthBanner /></div>

            {/* ZenPOS Waiter Header */}
            <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="text-xl font-black tracking-tight leading-none flex items-center shrink-0">
                        <span className="text-gray-900 dark:text-white">Zen</span>
                        <span className="text-[#C0392B]">POS</span>
                    </div>
                    <span
                        className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-semibold cursor-pointer truncate max-w-[145px]',
                            connectionState === 'connecting' || !isPrinterReady
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        )}
                        onClick={() => {
                            if (!isPrinterReady) {
                                connect();
                            } else {
                                toast({ title: 'Printer connected', description: deviceName || 'Printer is ready' });
                            }
                        }}
                    >
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: isPrinterReady ? '#10b981' : '#f59e0b' }} />
                        <span className="truncate">
                            {connectionState === 'connecting'
                                ? 'Connecting...'
                                : isPrinterReady
                                    ? (deviceName || 'Printer Ready')
                                    : 'Printer Offline'}
                        </span>
                    </span>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                    <button
                        type="button"
                        onClick={toggleDarkMode}
                        aria-label="Toggle dark mode"
                        className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 bg-[#F9F7F5] dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                        {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
                    </button>
                    <div className="flex items-center gap-2">
                        <span className="hidden xs:inline text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 truncate max-w-[110px]">
                            {profile?.name || 'Waiter'}
                        </span>
                        <div
                            className="w-8 h-8 rounded-full bg-[#C0392B]/15 text-[#C0392B] dark:bg-[#C0392B]/30 dark:text-red-300 flex items-center justify-center font-bold text-xs border border-[#C0392B]/20 shrink-0"
                            title={profile?.name || 'Waiter'}
                        >
                            {waiterInitials}
                        </div>
                    </div>
                </div>
            </header>

            {/* Top Segment Switcher */}
            <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-2 flex items-center gap-2 overflow-x-auto shrink-0">
                <button
                    type="button"
                    onClick={() => setActiveTab('tables')}
                    className={cn(
                        'shrink-0 flex items-center transition-colors',
                        (activeTab === 'tables' || activeTab === 'menu' || activeTab === 'cart')
                            ? 'bg-[#C0392B] text-white rounded-full px-4 py-1.5 font-semibold text-sm shadow-xs'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full px-4 py-1.5 text-sm hover:bg-gray-200 dark:hover:bg-gray-700'
                    )}
                >
                    Table Map
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setActiveTab('orders');
                        fetchTableOrders();
                    }}
                    className={cn(
                        'shrink-0 flex items-center transition-colors',
                        activeTab === 'orders'
                            ? 'bg-[#C0392B] text-white rounded-full px-4 py-1.5 font-semibold text-sm shadow-xs'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full px-4 py-1.5 text-sm hover:bg-gray-200 dark:hover:bg-gray-700'
                    )}
                >
                    <span>Orders</span>
                    <span
                        className={cn(
                            'bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ml-1',
                            activeTab === 'orders' && 'ring-1 ring-white/70'
                        )}
                    >
                        {tableOrders.length}
                    </span>
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setActiveTab('kitchen');
                        fetchTableOrders();
                    }}
                    className={cn(
                        'shrink-0 flex items-center transition-colors',
                        activeTab === 'kitchen'
                            ? 'bg-[#C0392B] text-white rounded-full px-4 py-1.5 font-semibold text-sm shadow-xs'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full px-4 py-1.5 text-sm hover:bg-gray-200 dark:hover:bg-gray-700'
                    )}
                >
                    <span>Kitchen</span>
                    <span
                        className={cn(
                            'w-2 h-2 rounded-full bg-red-500 ml-1 animate-pulse',
                            activeTab === 'kitchen' && 'ring-2 ring-white',
                            kitchenActiveCount === 0 && activeTab !== 'kitchen' && 'opacity-60'
                        )}
                    />
                </button>
            </div>

            {/* Active Table Order Context Bar (shown while taking Menu / Cart order) */}
            {selectedTable && (activeTab === 'menu' || activeTab === 'cart') && (
                <div className="bg-white/95 dark:bg-gray-900/95 border-b border-gray-100 dark:border-gray-800 px-4 py-2 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setActiveTab('tables')}
                            className="h-8 px-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:text-[#C0392B] rounded-lg"
                        >
                            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                            Floor
                        </Button>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#C0392B]/10 text-[#C0392B] dark:text-red-300 text-xs font-bold">
                            Table {selectedTable.table_number}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            type="button"
                            onClick={() => setActiveTab('menu')}
                            className={cn(
                                'px-3 py-1 rounded-full text-xs font-semibold transition-colors',
                                activeTab === 'menu'
                                    ? 'bg-[#C0392B] text-white'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                            )}
                        >
                            Items
                        </button>
                        <button
                            type="button"
                            disabled={cart.length === 0}
                            onClick={() => setActiveTab('cart')}
                            className={cn(
                                'px-3 py-1 rounded-full text-xs font-semibold transition-colors flex items-center gap-1',
                                activeTab === 'cart'
                                    ? 'bg-[#C0392B] text-white'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
                                cart.length === 0 && 'opacity-40 cursor-not-allowed'
                            )}
                        >
                            <span>Cart</span>
                            {cart.length > 0 && (
                                <span className={cn(
                                    'px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                                    activeTab === 'cart' ? 'bg-white/20 text-white' : 'bg-[#C0392B] text-white'
                                )}>
                                    {cartBadgeCount}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Main Scrollable Workspace */}
            <div className="flex-1 p-4 pb-24 overflow-y-auto">

                {/* TAB 1: INTERACTIVE TABLE MAP / FLOOR VIEW */}
                {activeTab === 'tables' && (
                    <div className="space-y-4">
                        {/* Floor/Section Selector + Status Legend Row */}
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-gray-900 rounded-2xl px-3.5 py-2.5 border border-gray-100 dark:border-gray-800 shadow-xs">
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setFloorMenuOpen(prev => !prev)}
                                    className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 text-sm flex items-center gap-1 font-medium text-gray-800 dark:text-gray-100"
                                >
                                    <span>{selectedFloor}</span>
                                    <ChevronDown className="w-4 h-4 text-gray-500" />
                                </button>
                                {floorMenuOpen && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-20"
                                            onClick={() => setFloorMenuOpen(false)}
                                        />
                                        <div className="absolute left-0 mt-1.5 w-44 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-lg py-1 z-30">
                                            {floorOptions.map(floor => {
                                                const count = floor === 'All Floors'
                                                    ? tables.length
                                                    : tables.filter(t => ((t.floor_name || '').trim() || 'Main Floor') === floor).length;
                                                return (
                                                    <button
                                                        key={floor}
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedFloor(floor);
                                                            setFloorMenuOpen(false);
                                                        }}
                                                        className={cn(
                                                            'w-full text-left px-3 py-2 text-xs font-medium flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800',
                                                            selectedFloor === floor
                                                                ? 'text-[#C0392B] font-bold bg-[#C0392B]/5'
                                                                : 'text-gray-700 dark:text-gray-300'
                                                        )}
                                                    >
                                                        <span>{floor}</span>
                                                        <span className="text-[10px] text-gray-400">{count}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-3">
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                                        <span className="w-2 h-2 rounded-full bg-green-600 inline-block" />
                                        Free
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                                        <span className="w-2 h-2 rounded-full bg-[#C0392B] inline-block" />
                                        Occupied
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                                        <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                                        Reserved
                                    </span>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setMoveDialogOpen(true)}
                                    className="h-8 text-xs font-semibold border-[#C0392B]/30 text-[#C0392B] hover:bg-[#C0392B]/5 gap-1.5 bg-white dark:bg-gray-900 rounded-lg"
                                >
                                    <ArrowRightLeft className="w-3.5 h-3.5" />
                                    Move Table / Seat
                                </Button>
                            </div>
                        </div>

                        {/* Visual Floor Map Grid */}
                        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs">
                            {visibleTables.length === 0 ? (
                                <div className="text-center py-14 px-4 text-gray-500 dark:text-gray-400 space-y-2">
                                    <Utensils className="w-8 h-8 mx-auto opacity-40" />
                                    <p className="text-sm font-medium">No tables found in this section.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 p-4">
                                    {visibleTables.map((table, index) => {
                                        const upcomingRes = reservationManager.getUpcomingForTable(table.table_number, reservations);
                                        const rawSeatLabels = table.has_seats ? getSeatLabels(table) : [];
                                        const seatLabels = rawSeatLabels.length > 0
                                            ? rawSeatLabels
                                            : Array.from({ length: Math.min(Math.max(table.capacity || 4, 2), 6) }, (_, idx) => `S${idx + 1}`);
                                        const isSideSeated = (table.shape === 'rectangle' || index % 3 === 1) && seatLabels.length >= 2 && seatLabels.length <= 4;
                                        const isMultiAllAround = seatLabels.length > 4;
                                        const statusStr = table.status as string;
                                        const statusBg =
                                            statusStr === 'available' || statusStr === 'free'
                                                ? 'bg-[#27AE60]'
                                                : statusStr === 'occupied'
                                                    ? 'bg-[#C0392B]'
                                                    : statusStr === 'cleaning'
                                                        ? 'bg-amber-500'
                                                        : 'bg-gray-400';
                                        const activeTableOrdersCount = tableOrders.filter(o => o.table_number === table.table_number).length;

                                        const tableCenterBox = (
                                            <div
                                                className={cn(
                                                    'w-16 h-16 rounded-xl flex flex-col items-center justify-center font-black text-white text-lg shadow-md transition-transform group-hover:scale-105 group-active:scale-95 relative select-none',
                                                    statusBg,
                                                    selectedTable?.id === table.id && 'ring-2 ring-offset-2 ring-[#C0392B] dark:ring-offset-gray-900',
                                                    upcomingRes && 'ring-2 ring-yellow-400'
                                                )}
                                            >
                                                <span>T{table.table_number}</span>
                                                {activeTableOrdersCount > 0 && (
                                                    <span className="text-[9px] font-semibold bg-black/25 px-1.5 rounded-full leading-tight mt-0.5">
                                                        {activeTableOrdersCount} ord
                                                    </span>
                                                )}
                                            </div>
                                        );

                                        return (
                                            <div
                                                key={table.id}
                                                onClick={() => handleSelectTable(table)}
                                                className="group cursor-pointer flex flex-col items-center gap-1.5"
                                            >
                                                {isMultiAllAround ? (
                                                    <div className="flex flex-col items-center gap-1">
                                                        <div className="flex gap-1">
                                                            {seatLabels.slice(0, 2).map((s, idx) => renderSeatDot(s, `top-${idx}`))}
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <div className="flex flex-col gap-1">
                                                                {seatLabels[2] && renderSeatDot(seatLabels[2], 'left-0')}
                                                            </div>
                                                            {tableCenterBox}
                                                            <div className="flex flex-col gap-1">
                                                                {seatLabels[3] && renderSeatDot(seatLabels[3], 'right-0')}
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            {seatLabels.slice(4, 6).map((s, idx) => renderSeatDot(s, `bot-${idx}`))}
                                                            {seatLabels.length > 6 && renderSeatDot(`+${seatLabels.length - 6}`, 'more')}
                                                        </div>
                                                    </div>
                                                ) : isSideSeated ? (
                                                    <div className="flex items-center gap-1 py-2">
                                                        <div className="flex flex-col gap-1">
                                                            {seatLabels.filter((_, idx) => idx % 2 === 0).map((s, idx) => renderSeatDot(s, `l-${idx}`))}
                                                        </div>
                                                        {tableCenterBox}
                                                        <div className="flex flex-col gap-1">
                                                            {seatLabels.filter((_, idx) => idx % 2 === 1).map((s, idx) => renderSeatDot(s, `r-${idx}`))}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center gap-1">
                                                        <div className="flex gap-1">
                                                            {seatLabels.slice(0, Math.ceil(seatLabels.length / 2)).map((s, idx) => renderSeatDot(s, `t-${idx}`))}
                                                        </div>
                                                        {tableCenterBox}
                                                        <div className="flex gap-1">
                                                            {seatLabels.slice(Math.ceil(seatLabels.length / 2)).map((s, idx) => renderSeatDot(s, `b-${idx}`))}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex flex-col items-center gap-0.5 text-center">
                                                    <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 truncate max-w-[96px]">
                                                        {table.table_name || `${table.capacity} Seats`}
                                                    </span>
                                                    {upcomingRes && (
                                                        <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded-full">
                                                            ⭐ {upcomingRes.reservation_time}
                                                        </span>
                                                    )}
                                                    {table.status === 'occupied' && (
                                                        <button
                                                            type="button"
                                                            onClick={handleReprintKOT(table)}
                                                            className="mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-[#C0392B] bg-white dark:bg-gray-800 border border-[#C0392B]/30 hover:bg-[#C0392B]/10 transition-colors"
                                                        >
                                                            <Printer className="w-2.5 h-2.5" />
                                                            KOT
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB: LIVE ORDERS */}
                {activeTab === 'orders' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-2xl px-4 py-3 border border-gray-100 dark:border-gray-800 shadow-xs">
                            <div>
                                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Active Table Orders</h2>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Open dine-in tickets & online orders</p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={fetchTableOrders}
                                disabled={ordersLoading}
                                className="h-8 text-xs gap-1.5 rounded-lg"
                            >
                                <RefreshCw className={cn('w-3.5 h-3.5', ordersLoading && 'animate-spin')} />
                                Refresh
                            </Button>
                        </div>

                        {tableOrders.length === 0 ? (
                            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-8 text-center text-gray-500 dark:text-gray-400 space-y-2">
                                <Clipboard className="w-8 h-8 mx-auto opacity-40" />
                                <p className="text-sm font-medium">No open dine-in orders right now.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {tableOrders.map(order => {
                                    const matchingTable = tables.find(t => t.table_number === order.table_number);
                                    const orderItems = Array.isArray(order.items) ? order.items : [];
                                    return (
                                        <Card key={order.id} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xs">
                                            <CardContent className="p-4 space-y-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="px-2.5 py-1 rounded-lg bg-[#C0392B] text-white text-xs font-black">
                                                            T{order.table_number}
                                                        </span>
                                                        <div>
                                                            <p className="text-xs font-bold text-gray-900 dark:text-white">
                                                                Order #{order.order_number}
                                                                {order.seat_label ? ` · Seat ${order.seat_label}` : ''}
                                                            </p>
                                                            <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                                <Clock className="w-3 h-3" />
                                                                {formatOrderElapsed(order.created_at)} ago
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <Badge
                                                        className={cn(
                                                            'text-[10px] font-bold uppercase border-none',
                                                            order.status === 'ready'
                                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                                : order.status === 'preparing'
                                                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                                                    : 'bg-red-100 text-[#C0392B] dark:bg-red-950/60 dark:text-red-300'
                                                        )}
                                                    >
                                                        {order.status}
                                                    </Badge>
                                                </div>

                                                <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1 border-t border-gray-100 dark:border-gray-800 pt-2">
                                                    {orderItems.slice(0, 4).map((it: any, idx: number) => (
                                                        <div key={idx} className="flex justify-between gap-2">
                                                            <span className="truncate">{it.quantity ?? 1}× {it.name}</span>
                                                            <span className="font-semibold text-gray-800 dark:text-gray-200 shrink-0">
                                                                ₹{Number(it.total ?? (it.price || 0) * (it.quantity || 1)).toFixed(0)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                    {orderItems.length > 4 && (
                                                        <p className="text-[11px] text-gray-400">+{orderItems.length - 4} more items</p>
                                                    )}
                                                </div>

                                                <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
                                                    <span className="text-sm font-black text-gray-900 dark:text-white">
                                                        ₹{Number(order.total_amount || 0).toFixed(0)}
                                                    </span>
                                                    <div className="flex items-center gap-1.5">
                                                        {matchingTable && (
                                                            <>
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={handleReprintKOT(matchingTable)}
                                                                    className="h-7 px-2 text-[11px] rounded-lg"
                                                                >
                                                                    <Printer className="w-3 h-3 mr-1" /> KOT
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    onClick={() => handleSelectTable(matchingTable)}
                                                                    className="h-7 px-2.5 text-[11px] rounded-lg bg-[#C0392B] hover:bg-[#A93226] text-white"
                                                                >
                                                                    + Add
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}

                        <details className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 shadow-xs">
                            <summary className="cursor-pointer text-sm font-bold text-gray-800 dark:text-gray-100">
                                Online orders in progress
                            </summary>
                            <div className="mt-3"><RemoteOrderStatusBoard compact /></div>
                        </details>
                    </div>
                )}

                {/* TAB: KITCHEN LIVE STATUS */}
                {activeTab === 'kitchen' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-2.5">
                            <div className="bg-white dark:bg-gray-900 rounded-2xl p-3 border border-gray-100 dark:border-gray-800 text-center">
                                <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Pending</p>
                                <p className="text-xl font-black text-[#C0392B]">
                                    {tableOrders.filter(o => o.status === 'pending').length}
                                </p>
                            </div>
                            <div className="bg-white dark:bg-gray-900 rounded-2xl p-3 border border-gray-100 dark:border-gray-800 text-center">
                                <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Preparing</p>
                                <p className="text-xl font-black text-amber-500">
                                    {tableOrders.filter(o => o.status === 'preparing').length}
                                </p>
                            </div>
                            <div className="bg-white dark:bg-gray-900 rounded-2xl p-3 border border-gray-100 dark:border-gray-800 text-center">
                                <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Ready</p>
                                <p className="text-xl font-black text-[#27AE60]">
                                    {tableOrders.filter(o => o.status === 'ready').length}
                                </p>
                            </div>
                        </div>

                        {tableOrders.length === 0 ? (
                            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-8 text-center text-gray-500 dark:text-gray-400 space-y-2">
                                <ChefHat className="w-8 h-8 mx-auto opacity-40" />
                                <p className="text-sm font-medium">Kitchen queue is clear.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {tableOrders.map(order => {
                                    const orderItems = Array.isArray(order.items) ? order.items : [];
                                    const isReady = order.status === 'ready';
                                    const isPreparing = order.status === 'preparing';
                                    return (
                                        <Card
                                            key={order.id}
                                            className={cn(
                                                'bg-white dark:bg-gray-900 rounded-2xl border shadow-xs',
                                                isReady
                                                    ? 'border-l-4 border-l-[#27AE60] border-gray-100 dark:border-gray-800'
                                                    : isPreparing
                                                        ? 'border-l-4 border-l-amber-500 border-gray-100 dark:border-gray-800'
                                                        : 'border-l-4 border-l-[#C0392B] border-gray-100 dark:border-gray-800'
                                            )}
                                        >
                                            <CardContent className="p-4 space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className={cn(
                                                            'px-2.5 py-1 rounded-lg text-white text-xs font-black',
                                                            isReady ? 'bg-[#27AE60]' : isPreparing ? 'bg-amber-500' : 'bg-[#C0392B]'
                                                        )}>
                                                            T{order.table_number}
                                                        </span>
                                                        <span className="font-bold text-sm text-gray-900 dark:text-white">
                                                            #{order.order_number}
                                                            {order.seat_label ? ` · ${order.seat_label}` : ''}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                                                            {formatOrderElapsed(order.created_at)}
                                                        </span>
                                                        <Badge className={cn(
                                                            'text-[10px] font-bold uppercase border-none',
                                                            isReady
                                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                                : isPreparing
                                                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                                                    : 'bg-red-100 text-[#C0392B] dark:bg-red-950/60 dark:text-red-300'
                                                        )}>
                                                            {isReady ? 'Ready to Serve' : order.status}
                                                        </Badge>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 pt-1">
                                                    {orderItems.map((it: any, idx: number) => (
                                                        <span
                                                            key={idx}
                                                            className="px-2 py-1 rounded-lg bg-[#F9F7F5] dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-200"
                                                        >
                                                            {it.quantity ?? 1}× {it.name}
                                                        </span>
                                                    ))}
                                                </div>
                                                {order.customer_note && (
                                                    <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-2.5 py-1.5">
                                                        Note: {order.customer_note}
                                                    </p>
                                                )}
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* TAB: CUSTOMERS & RESERVATIONS */}
                {activeTab === 'customers' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-2xl px-4 py-3 border border-gray-100 dark:border-gray-800 shadow-xs">
                            <div>
                                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Reservations & Guests</h2>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Today&apos;s bookings & customer directory</p>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => navigate('/crm')}
                                className="h-8 text-xs rounded-lg bg-[#C0392B] hover:bg-[#A93226] text-white"
                            >
                                Open CRM
                            </Button>
                        </div>

                        {reservations.length === 0 ? (
                            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-8 text-center text-gray-500 dark:text-gray-400 space-y-2">
                                <Users className="w-8 h-8 mx-auto opacity-40" />
                                <p className="text-sm font-medium">No active reservations for today.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {reservations.map(res => (
                                    <Card key={res.id} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xs">
                                        <CardContent className="p-4 flex items-center justify-between gap-3">
                                            <div className="space-y-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-sm text-gray-900 dark:text-white truncate">{res.customer_name}</span>
                                                    <Badge className="bg-[#C0392B]/10 text-[#C0392B] border-none text-[10px] font-bold">
                                                        T{res.table_number}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                                                    <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> {res.reservation_time}</span>
                                                    <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> {res.guest_count} guests</span>
                                                    {res.customer_phone && (
                                                        <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {res.customer_phone}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <Badge variant="outline" className="capitalize text-[10px] shrink-0">
                                                {res.status}
                                            </Badge>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 2: MENU & SEAT SELECTOR */}
                {activeTab === 'menu' && selectedTable && (
                    <div className="space-y-4 flex flex-col h-full">
                        {/* Seat Selector Row */}
                        {selectedTable.has_seats && (
                            <div className="bg-white dark:bg-gray-900 p-3 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs">
                                <Label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest block mb-2">Assign Items to Seat</Label>
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                    {(selectedTable.seat_order_mode || 'both') !== 'seat' && (
                                        <Button
                                            variant={selectedSeatId === null ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => setSelectedSeatId(null)}
                                            className={cn(
                                                'h-8 rounded-full text-xs shrink-0',
                                                selectedSeatId === null && 'bg-[#C0392B] hover:bg-[#A93226] text-white border-[#C0392B]'
                                            )}
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
                                            className={cn(
                                                'h-8 rounded-full text-xs shrink-0',
                                                selectedSeatId === seatLabel && 'bg-[#C0392B] hover:bg-[#A93226] text-white border-[#C0392B]'
                                            )}
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
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                    <Input
                                        placeholder="Search food item..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9 h-10 rounded-xl bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
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
                                <div className="flex items-center bg-white dark:bg-gray-900 p-1 rounded-xl border border-gray-200 dark:border-gray-700 shrink-0 gap-1">
                                    <div className="flex items-center">
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant={viewMode === 'grid' ? 'default' : 'ghost'}
                                            onClick={() => setViewMode('grid')}
                                            className={cn('h-8 w-8 rounded-lg p-0', viewMode === 'grid' && 'bg-[#C0392B] hover:bg-[#A93226] text-white')}
                                        >
                                            <LayoutGrid className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant={viewMode === 'list' ? 'default' : 'ghost'}
                                            onClick={() => setViewMode('list')}
                                            className={cn('h-8 w-8 rounded-lg p-0', viewMode === 'list' && 'bg-[#C0392B] hover:bg-[#A93226] text-white')}
                                        >
                                            <List className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    {viewMode === 'grid' && (
                                        <div className="flex items-center border-l border-gray-200 dark:border-gray-700 pl-1 gap-0.5">
                                            {[2, 3, 4].map(c => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onClick={() => handleSetGridCols(c)}
                                                    className={cn(
                                                        'h-7 w-7 rounded-lg text-[11px] font-extrabold transition-all',
                                                        gridCols === c
                                                            ? 'bg-[#C0392B] text-white shadow-sm'
                                                            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
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
                                    const isSelected = selectedCategory === cat;
                                    return (
                                        <button
                                            key={cat}
                                            type="button"
                                            onClick={() => setSelectedCategory(cat)}
                                            className={cn(
                                                'h-8 rounded-full text-xs shrink-0 px-3.5 flex items-center gap-1 font-semibold transition-colors',
                                                isSelected
                                                    ? 'bg-[#C0392B] text-white'
                                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                            )}
                                        >
                                            <span>{cat}</span>
                                            <span className={cn(
                                                'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                                                isSelected ? 'bg-white/20 text-white' : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300'
                                            )}>
                                                ({count})
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Menu Items Grid / List Container */}
                        <div className="flex-1 overflow-y-auto min-h-[48vh] pb-24 space-y-3 pr-1">
                            {viewMode === 'grid' ? (
                                <div className={cn(
                                    'grid gap-2.5',
                                    gridCols === 2 && 'grid-cols-2',
                                    gridCols === 3 && 'grid-cols-3',
                                    gridCols === 4 && 'grid-cols-2 sm:grid-cols-4'
                                )}>
                                    {filteredMenuItems.map(item => {
                                        const cartItem = cart.find(i => i.id === item.id && i.seatId === selectedSeatId);
                                        const isOutOfStock = item.stock_quantity !== null && item.stock_quantity !== undefined && Number(item.stock_quantity) <= 0;
                                        const isLowStock = !isOutOfStock && item.stock_quantity !== null && item.stock_quantity !== undefined && Number(item.stock_quantity) <= Number(item.minimum_stock_alert ?? 0);
                                        return (
                                            <Card key={item.id} className={cn('bg-white dark:bg-gray-900 overflow-hidden border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xs transition-all flex flex-col justify-between group', isOutOfStock ? 'opacity-50' : 'hover:shadow-md')}>
                                                <div className="relative">
                                                    <div className="w-full h-24 bg-[#F9F7F5] dark:bg-gray-800 relative flex items-center justify-center overflow-hidden">
                                                        {item.image_url ? (
                                                            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-full bg-[#C0392B]/10 flex items-center justify-center">
                                                                <Utensils className="w-5 h-5 text-[#C0392B]" />
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
                                                        <h4 className="font-bold text-xs line-clamp-2 leading-snug text-gray-900 dark:text-white">{item.name}</h4>
                                                        <div className="flex items-center justify-between mt-1">
                                                            <span className="text-[#C0392B] font-black text-xs block">₹{item.price.toFixed(0)}</span>
                                                            {item.stock_quantity !== null && item.stock_quantity !== undefined && !isOutOfStock && !isLowStock && (
                                                                <span className="text-[9px] text-gray-500 border border-gray-200 dark:border-gray-700 px-1 rounded-sm bg-gray-50 dark:bg-gray-800 whitespace-nowrap">Stk: {item.stock_quantity}</span>
                                                            )}
                                                        </div>

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
                                                                        className="px-1.5 py-0.5 rounded-md bg-[#C0392B]/10 hover:bg-[#C0392B]/20 text-[#C0392B] text-[9px] font-extrabold border border-[#C0392B]/20 whitespace-nowrap shrink-0 transition-colors"
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
                                                        <div className="flex items-center justify-between bg-[#C0392B]/10 rounded-xl p-1 border border-[#C0392B]/20">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="rounded-lg h-7 w-7 p-0 hover:bg-[#C0392B]/20 text-[#C0392B]"
                                                                onClick={(e) => { e.stopPropagation(); handleUpdateQty(item.id, selectedSeatId, -1); }}
                                                            >
                                                                <Minus className="w-3.5 h-3.5" />
                                                            </Button>
                                                            <span className="font-black text-xs text-[#C0392B]">
                                                                {cartItem.quantity / (item.selling_quantity || item.base_value || 1)}
                                                            </span>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="rounded-lg h-7 w-7 p-0 hover:bg-[#C0392B]/20 text-[#C0392B]"
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
                                                            className={cn(
                                                                'w-full rounded-xl h-8 text-xs font-bold gap-1',
                                                                isOutOfStock ? 'bg-muted text-muted-foreground' : 'bg-[#C0392B] hover:bg-[#A93226] text-white'
                                                            )}
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
                                        const isOutOfStock = item.stock_quantity !== null && item.stock_quantity !== undefined && Number(item.stock_quantity) <= 0;
                                        const isLowStock = !isOutOfStock && item.stock_quantity !== null && item.stock_quantity !== undefined && Number(item.stock_quantity) <= Number(item.minimum_stock_alert ?? 0);
                                        return (
                                            <Card key={item.id} className={cn('bg-white dark:bg-gray-900 overflow-hidden border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xs transition-all', isOutOfStock ? 'opacity-50' : 'hover:shadow-md')}>
                                                <CardContent className="p-3 flex items-center justify-between">
                                                    <div className="flex items-center gap-3 min-w-0 pr-2">
                                                        <div className="w-12 h-12 rounded-xl bg-[#F9F7F5] dark:bg-gray-800 shrink-0 overflow-hidden flex items-center justify-center">
                                                            {item.image_url ? (
                                                                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <Utensils className="w-5 h-5 text-[#C0392B]" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="font-bold text-sm truncate text-gray-900 dark:text-white">{item.name}</h4>
                                                                {isOutOfStock && <Badge className="bg-red-500 hover:bg-red-600 text-white font-bold text-[9px] px-1 py-0 h-4 border-none shrink-0">SOLD OUT</Badge>}
                                                                {isLowStock && <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-[9px] px-1 py-0 h-4 border-none shrink-0">Only {item.stock_quantity} left</Badge>}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="text-[#C0392B] font-black text-sm">₹{item.price.toFixed(0)}</span>
                                                                {item.stock_quantity !== null && item.stock_quantity !== undefined && !isOutOfStock && !isLowStock && (
                                                                    <span className="text-[10px] text-gray-500 border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 rounded-sm bg-gray-50 dark:bg-gray-800 font-medium whitespace-nowrap">Stk: {item.stock_quantity}</span>
                                                                )}
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
                                                                            className="px-1.5 py-0.5 rounded-md bg-[#C0392B]/10 hover:bg-[#C0392B]/20 text-[#C0392B] text-[9px] font-extrabold border border-[#C0392B]/20 whitespace-nowrap shrink-0 transition-colors"
                                                                        >
                                                                            {chip}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {cartItem ? (
                                                        <div className="flex items-center gap-2 bg-[#C0392B]/10 rounded-full p-1 border border-[#C0392B]/20">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="rounded-full h-7 w-7 p-0 hover:bg-[#C0392B]/20 text-[#C0392B]"
                                                                onClick={(e) => { e.stopPropagation(); handleUpdateQty(item.id, selectedSeatId, -1); }}
                                                            >
                                                                <Minus className="w-3.5 h-3.5" />
                                                            </Button>
                                                            <span className="font-black text-sm w-4 text-center text-[#C0392B]">{cartItem.quantity / (item.selling_quantity || item.base_value || 1)}</span>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="rounded-full h-7 w-7 p-0 hover:bg-[#C0392B]/20 text-[#C0392B]"
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
                                                            className={cn(
                                                                'rounded-full h-8 w-8 p-0',
                                                                isOutOfStock ? 'bg-muted text-muted-foreground' : 'bg-[#C0392B] hover:bg-[#A93226] text-white'
                                                            )}
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
                                <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm space-y-2">
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
                        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-2">
                            <div>
                                <h3 className="font-bold text-base text-gray-900 dark:text-white">Table {selectedTable.table_number} Order Cart</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Confirm and push to kitchen display</p>
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
                                    <Card key={`${item.id}-${item.seatId}-${idx}`} className="bg-white dark:bg-gray-900 p-3 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xs">
                                        <div className="flex items-start justify-between">
                                            <div className="min-w-0 pr-2">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-bold text-sm text-gray-900 dark:text-white">
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
                                                                <span className={cn('w-1.5 h-1.5 rounded-full', badge.dotColor)} />
                                                                {badge.label}
                                                            </Badge>
                                                        );
                                                    })()}
                                                </div>
                                                <span className="text-xs text-gray-500 dark:text-gray-400 block mt-0.5">₹{item.price.toFixed(0)} each ({item.selling_quantity || item.base_value || 1} {getShortUnit(item.selling_unit || item.unit)})</span>
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
                                            <Clipboard className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                            <Input
                                                placeholder="Add cooking instruction..."
                                                value={item.instructions}
                                                onChange={(e) => handleUpdateInstructions(item.id, item.seatId, e.target.value)}
                                                className="h-7 text-xs rounded-md py-1 px-2 border-gray-200 dark:border-gray-700"
                                            />
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </div>

                        {/* Customer Overall Note */}
                        <div className="space-y-1.5 bg-white dark:bg-gray-900 p-3 rounded-2xl border border-gray-100 dark:border-gray-800">
                            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest block">Customer Note / Table Comment</label>
                            <Input
                                placeholder="General order note (e.g. no ice in drinks)..."
                                value={customerNote}
                                onChange={(e) => setCustomerNote(e.target.value)}
                                className="h-9 text-xs rounded-md"
                            />
                        </div>

                        {/* Bottom Total & Checkout Summary */}
                        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 space-y-3 mt-auto rounded-2xl shadow-xs">
                            <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400 px-1">
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
                                <span className="font-bold text-gray-600 dark:text-gray-300 text-sm">Estimated Total:</span>
                                <span className="text-xl font-black text-[#C0392B]">₹{cartTotal.toFixed(0)}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-1">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => handleSubmitOrder(false)}
                                    disabled={isSubmitting || cart.length === 0}
                                    className="h-12 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-xs sm:text-sm border-[#C0392B]/40 text-[#C0392B] hover:bg-[#C0392B]/5 active:scale-[0.97] transition-all"
                                >
                                    <ChefHat className="w-4 h-4 text-[#C0392B]" />
                                    {isSubmitting ? 'Pushing...' : 'Send to Kitchen'}
                                </Button>

                                <Button
                                    type="button"
                                    onClick={() => handleSubmitOrder(true)}
                                    disabled={isSubmitting || cart.length === 0}
                                    className="h-12 rounded-xl font-bold bg-[#C0392B] hover:bg-[#A93226] text-white flex items-center justify-center gap-1.5 text-xs sm:text-sm shadow-md active:scale-[0.97] transition-all"
                                >
                                    <Printer className="w-4 h-4" />
                                    {isSubmitting ? 'Printing...' : 'Send & Print KOT'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Navigation Bar */}
            <nav
                aria-label="Waiter companion navigation"
                className="fixed bottom-0 left-0 right-0 md:sticky md:bottom-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex items-center justify-around py-2 px-4 z-[55] shrink-0"
            >
                {([
                    {
                        id: 'floor',
                        label: 'Floor',
                        icon: Utensils,
                        active: activeTab === 'tables' || activeTab === 'menu' || activeTab === 'cart',
                        onClick: () => setActiveTab('tables'),
                    },
                    {
                        id: 'orders',
                        label: 'Orders',
                        icon: Clipboard,
                        active: activeTab === 'orders',
                        onClick: () => { setActiveTab('orders'); fetchTableOrders(); },
                    },
                    {
                        id: 'customers',
                        label: 'Customers',
                        icon: Users,
                        active: activeTab === 'customers',
                        onClick: () => setActiveTab('customers'),
                    },
                    {
                        id: 'more',
                        label: 'More',
                        icon: MoreHorizontal,
                        active: moreOpen,
                        onClick: () => setMoreOpen(true),
                    },
                ] as const).map((item) => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={item.onClick}
                            className={cn(
                                'flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-0.5 transition-colors',
                                item.active ? 'text-[#C0392B]' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                            )}
                        >
                            <Icon className="w-5 h-5" />
                            <span className={cn('text-[11px]', item.active ? 'font-semibold text-[#C0392B]' : 'font-medium')}>
                                {item.label}
                            </span>
                            <span className={cn('w-1.5 h-1.5 rounded-full mt-0.5', item.active ? 'bg-[#C0392B]' : 'bg-transparent')} />
                        </button>
                    );
                })}
            </nav>

            {/* More Actions & Navigation Sheet */}
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                <SheetContent side="bottom" className="rounded-t-3xl max-h-[75vh] overflow-y-auto bg-white dark:bg-gray-900">
                    <SheetHeader>
                        <SheetTitle className="text-left flex items-center gap-2">
                            <span className="font-black text-gray-900 dark:text-white">Zen<span className="text-[#C0392B]">POS</span></span>
                            <span className="text-xs font-medium text-gray-500">Quick Actions</span>
                        </SheetTitle>
                    </SheetHeader>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pb-4">
                        <button
                            type="button"
                            onClick={() => { setMoreOpen(false); setMoveDialogOpen(true); }}
                            className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-[#F9F7F5] dark:bg-gray-800/60 hover:border-[#C0392B]/40 text-left text-xs font-semibold text-gray-800 dark:text-gray-100"
                        >
                            <ArrowRightLeft className="w-4 h-4 text-[#C0392B] shrink-0" />
                            Move Table / Seat
                        </button>
                        <button
                            type="button"
                            onClick={() => { setMoreOpen(false); setActiveTab('kitchen'); fetchTableOrders(); }}
                            className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-[#F9F7F5] dark:bg-gray-800/60 hover:border-[#C0392B]/40 text-left text-xs font-semibold text-gray-800 dark:text-gray-100"
                        >
                            <ChefHat className="w-4 h-4 text-[#C0392B] shrink-0" />
                            Kitchen Queue
                        </button>
                        {[
                            { label: 'Table Billing', to: '/table-billing', icon: CheckCircle2 },
                            { label: 'POS Billing', to: '/billing', icon: ShoppingCart },
                            { label: 'Kitchen Display', to: '/kitchen', icon: ChefHat },
                            { label: 'Table Setup', to: '/tables', icon: LayoutGrid },
                            { label: 'Dashboard', to: '/dashboard', icon: Utensils },
                            { label: 'CRM Customers', to: '/crm', icon: Users },
                        ].map((link) => {
                            const LinkIcon = link.icon;
                            return (
                                <button
                                    key={link.to}
                                    type="button"
                                    onClick={() => { setMoreOpen(false); navigate(link.to); }}
                                    className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-[#C0392B]/40 text-left text-xs font-semibold text-gray-800 dark:text-gray-100"
                                >
                                    <LinkIcon className="w-4 h-4 text-gray-500 shrink-0" />
                                    {link.label}
                                </button>
                            );
                        })}
                    </div>
                </SheetContent>
            </Sheet>

            {/* Sticky Floating Cart Bar */}
            {activeTab !== 'cart' && cart.length > 0 && createPortal(
                <div className="fixed bottom-[68px] left-0 right-0 z-[9999] px-3 pb-1 pointer-events-none animate-in slide-in-from-bottom-5 duration-300">
                    <div className="bg-gradient-to-r from-[#C0392B] via-[#A93226] to-[#922B21] text-white p-2.5 sm:p-3 rounded-2xl shadow-2xl border border-red-300/30 flex items-center justify-between backdrop-blur-md pointer-events-auto">
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
                                        {cartBadgeCount} items selected
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
                                className="rounded-xl h-9 px-3 font-bold bg-white text-[#C0392B] hover:bg-white/90 shadow-md flex items-center gap-1 text-xs"
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
