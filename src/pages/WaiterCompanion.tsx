import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Search, ShoppingCart, Plus, Minus, Trash2, Utensils, Clipboard, ChefHat, User, ChevronRight, X, AlertTriangle } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useOffline';
import { cn } from '@/lib/utils';
import { formatQuantityWithUnit, getShortUnit, isWeightOrVolumeUnit } from '@/utils/timeUtils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';

interface Table {
    id: string;
    table_number: string;
    table_name: string | null;
    capacity: number;
    status: 'available' | 'occupied' | 'reserved' | 'cleaning';
    has_seats: boolean;
    seat_count: number;
    seat_configuration: Array<{ id: string; label: string }> | null;
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
}

const WaiterCompanion: React.FC = () => {
    const { profile } = useAuth();
    const { operatingBranchId } = useBranch();
    const isOnline = useNetworkStatus();
    const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;

    // State
    const [tables, setTables] = useState<Table[]>([]);
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [selectedTable, setSelectedTable] = useState<Table | null>(null);
    const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [customerNote, setCustomerNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState<'tables' | 'menu' | 'cart'>('tables');
    const [clearCartOpen, setClearCartOpen] = useState(false);

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
    }, [fetchTables, fetchMenu]);

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
            const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
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
                setCart(JSON.parse(savedCart));
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
                seatId: selectedSeatId
            }];
        });

        toast({
            title: 'Added to order',
            description: `${item.name} added for ${selectedSeatId ? `Seat ${selectedSeatId}` : 'Table'}`,
            duration: 1000
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

    // Cart total
    const cartTotal = useMemo(() => {
        return cart.reduce((sum, item) => {
            const baseValue = item.base_value || 1;
            return sum + ((item.quantity / baseValue) * item.price);
        }, 0);
    }, [cart]);

    // Submit table order
    const handleSubmitOrder = async () => {
        if (!selectedTable || cart.length === 0 || !adminId) return;

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
                    return sum + ((i.quantity / baseValue) * i.price);
                }, 0);
                
                const tableOrderData = {
                    admin_id: adminId,
                    branch_id: operatingBranchId || null,
                    table_number: selectedTable.table_number,
                    session_id: sessionId,
                    seat_id: currentSeatId,
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
                            instructions: item.instructions
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
        <div className="flex flex-col min-h-[calc(100vh-4rem)] bg-background">
            {/* Mobile Tab Header */}
            <div className="flex border-b bg-card sticky top-0 z-10">
                <Button
                    variant="ghost"
                    onClick={() => setActiveTab('tables')}
                    className={cn(
                        "flex-1 py-4 text-center rounded-none border-b-2 font-medium text-sm transition-all",
                        activeTab === 'tables' ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                    )}
                >
                    1. Select Table {selectedTable && <Badge variant="secondary" className="ml-1.5">{selectedTable.table_number}</Badge>}
                </Button>
                <Button
                    variant="ghost"
                    onClick={() => setActiveTab('menu')}
                    disabled={!selectedTable}
                    className={cn(
                        "flex-1 py-4 text-center rounded-none border-b-2 font-medium text-sm transition-all",
                        activeTab === 'menu' ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                    )}
                >
                    2. Add Items
                </Button>
                <Button
                    variant="ghost"
                    onClick={() => setActiveTab('cart')}
                    disabled={cart.length === 0}
                    className={cn(
                        "flex-1 py-4 text-center rounded-none border-b-2 font-medium text-sm transition-all relative",
                        activeTab === 'cart' ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                    )}
                >
                    3. Cart
                    {cart.length > 0 && (
                        <Badge variant="destructive" className="absolute top-1.5 right-1.5 text-[10px] px-1.5 h-4 min-w-4 flex items-center justify-center">
                            {cart.reduce((sum, i) => sum + (i.quantity / (i.base_value || 1)), 0)}
                        </Badge>
                    )}
                </Button>
            </div>

            {/* Main Scrollable Workspace */}
            <div className="flex-1 p-4 overflow-y-auto">

                {/* TAB 1: TABLES SELECTOR */}
                {activeTab === 'tables' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Utensils className="w-5 h-5 text-primary" />
                            <h2 className="text-lg font-bold">Choose Dine-In Table</h2>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {tables.map(table => (
                                <Card
                                    key={table.id}
                                    onClick={() => handleSelectTable(table)}
                                    className={cn(
                                        "cursor-pointer hover:shadow-md transition-all border-2",
                                        selectedTable?.id === table.id ? "border-primary bg-primary/5" : "border-muted",
                                        table.status === 'occupied' && "border-l-4 border-l-red-500",
                                        table.status === 'cleaning' && "border-l-4 border-l-blue-500",
                                        table.status === 'reserved' && "border-l-4 border-l-yellow-500"
                                    )}
                                >
                                    <CardContent className="p-4 flex flex-col justify-between h-28">
                                        <div className="flex justify-between items-start">
                                            <span className="text-2xl font-black">{table.table_number}</span>
                                            <Badge variant={table.status === 'available' ? 'outline' : 'secondary'} className="text-[10px] uppercase">
                                                {table.status}
                                            </Badge>
                                        </div>
                                        <div className="text-xs text-muted-foreground flex justify-between items-center mt-2">
                                            <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> Max {table.capacity}</span>
                                            {table.has_seats && <Badge variant="outline" className="text-[9px]">S1-S{table.seat_count}</Badge>}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
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
                                    <Button
                                        variant={selectedSeatId === null ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setSelectedSeatId(null)}
                                        className="h-8 rounded-full text-xs shrink-0"
                                    >
                                        Whole Table
                                    </Button>
                                    {Array.from({ length: selectedTable.seat_count }).map((_, idx) => {
                                        const seatLabel = `S${idx + 1}`;
                                        return (
                                            <Button
                                                key={seatLabel}
                                                variant={selectedSeatId === seatLabel ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => setSelectedSeatId(seatLabel)}
                                                className="h-8 rounded-full text-xs shrink-0"
                                            >
                                                Seat {seatLabel}
                                            </Button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Search & Category Filter */}
                        <div className="space-y-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search food item..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 h-10 rounded-xl"
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

                            {/* Swipeable Category list */}
                            <div className="flex gap-1.5 overflow-x-auto pb-1.5 pt-0.5">
                                {categories.map(cat => (
                                    <Button
                                        key={cat}
                                        variant={selectedCategory === cat ? 'default' : 'secondary'}
                                        size="sm"
                                        onClick={() => setSelectedCategory(cat)}
                                        className="h-8 rounded-full text-xs shrink-0 px-3.5"
                                    >
                                        {cat}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Menu Items Grid */}
                        <ScrollArea className="flex-1 h-[45vh]">
                            <div className="grid grid-cols-1 gap-2.5">
                                {filteredMenuItems.map(item => (
                                    <Card key={item.id} className="overflow-hidden border border-muted shadow-sm hover:shadow-md transition-all">
                                        <CardContent className="p-3 flex items-center justify-between">
                                            <div className="min-w-0 pr-2">
                                                <h4 className="font-bold text-sm truncate">{item.name}</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-primary font-black text-sm">₹{item.price.toFixed(0)}</span>
                                                    {(item.selling_unit || item.unit) && (
                                                        <Badge variant="outline" className="text-[10px] scale-90 px-1 py-0 h-4">
                                                            per {item.selling_quantity || item.base_value || 1} {getShortUnit(item.selling_unit || item.unit)}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            {(() => {
                                                const cartItem = cart.find(i => i.id === item.id && i.seatId === selectedSeatId);
                                                if (cartItem) {
                                                    return (
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
                                                    );
                                                }
                                                return (
                                                    <Button
                                                        size="sm"
                                                        onClick={(e) => { e.stopPropagation(); handleAddToCart(item); }}
                                                        className="rounded-full h-8 w-8 p-0"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </Button>
                                                );
                                            })()}
                                        </CardContent>
                                    </Card>
                                ))}
                                {filteredMenuItems.length === 0 && (
                                    <div className="text-center py-8 text-muted-foreground text-sm">
                                        No items found.
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                )}

                {/* TAB 3: CART VIEW */}
                {activeTab === 'cart' && selectedTable && (
                    <div className="space-y-4 flex flex-col h-full">
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
                        <ScrollArea className="flex-1 max-h-[45vh]">
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
                                                        <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 text-[10px] h-4 py-0 px-1.5">
                                                            Seat {item.seatId}
                                                        </Badge>
                                                    )}
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
                        </ScrollArea>

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
            
            {/* Quick Floating Cart Bar for Mobile (when not on cart tab) */}
            {activeTab !== 'cart' && cart.length > 0 && (
                <div
                    onClick={() => setActiveTab('cart')}
                    className="mx-4 mb-4 p-3 bg-primary text-primary-foreground rounded-2xl flex items-center justify-between cursor-pointer shadow-lg animate-bounce shrink-0"
                >
                    <div className="flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5" />
                        <span className="font-bold text-xs">
                            {cart.reduce((sum, i) => sum + i.quantity, 0)} items selected
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="font-bold text-sm">View Cart (₹{cartTotal.toFixed(0)})</span>
                        <ChevronRight className="w-4 h-4" />
                    </div>
                </div>
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
        </div>
    );
};

export default WaiterCompanion;
