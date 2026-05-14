import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Receipt, ChevronRight, Clock, Loader2, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInstantBillNumber, initBillCounter } from '@/utils/billNumberGenerator';
import { formatQuantityWithUnit } from '@/utils/timeUtils';
import { CompletePaymentDialog } from '@/components/CompletePaymentDialog';

// BroadcastChannel for instant cross-tab sync
const billsChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bills-updates') : null;

interface TableOrder {
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
    is_billed: boolean;
}

interface TableWithOrders {
    table_number: string;
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
}

const getTimeElapsed = (created: string) => {
    const diff = Date.now() - new Date(created).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
};

const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
    pending: { label: 'Pending', color: 'bg-yellow-500', icon: '⏳' },
    preparing: { label: 'Preparing', color: 'bg-orange-500', icon: '👨‍🍳' },
    ready: { label: 'Ready', color: 'bg-green-500', icon: '✅' },
    served: { label: 'Served', color: 'bg-blue-500', icon: '🍽️' },
    cancelled: { label: 'Cancelled', color: 'bg-red-500', icon: '❌' },
};

const TableOrderBilling: React.FC = () => {
    const { profile } = useAuth();
    const { operatingBranchId } = useBranch();
    const [loading, setLoading] = useState(true);
    const [tables, setTables] = useState<TableWithOrders[]>([]);
    const [selectedTable, setSelectedTable] = useState<TableWithOrders | null>(null);
    const [isBilling, setIsBilling] = useState(false);
    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([]);
    const [additionalCharges, setAdditionalCharges] = useState<any[]>([]);
    const [whatsappEnabled, setWhatsappEnabled] = useState(false);
    const [whatsappShareMode, setWhatsappShareMode] = useState<'text' | 'image'>('text');
    const [billSettings, setBillSettings] = useState<any>(null);
    const syncChannelRef = useRef<any>(null);
    const tableOrderChannelRef = useRef<any>(null);

    const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;

    // Convert table orders into cart items for CompletePaymentDialog
    const getCartForTable = useCallback((table: TableWithOrders): CartItem[] => {
        const mergedItems: Record<string, CartItem> = {};

        table.orders.forEach(order => {
            order.items.forEach(item => {
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
                    };
                }
            });
        });

        return Object.values(mergedItems);
    }, []);

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
                query = query.or(`branch_id.eq.${operatingBranchId},branch_id.is.null`);
            }

            const { data, error } = await query.order('payment_type');
            if (error) throw error;
            setPaymentTypes(data || []);
        } catch (error) {
            console.error('Error fetching payment types:', error);
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
                query = query.or(`branch_id.eq.${operatingBranchId},branch_id.is.null`);
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

            const { data } = await supabase
                .from('shop_settings')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (data) {
                setBillSettings({
                    shopName: data.shop_name || '',
                    address: data.address || '',
                    contactNumber: data.contact_number || '',
                    logoUrl: data.logo_url || '',
                    whatsapp: data.whatsapp || '',
                    showWhatsapp: data.show_whatsapp,
                    printerWidth: data.printer_width as '58mm' | '80mm' || '58mm',
                });
                setWhatsappEnabled(data.whatsapp_bill_share_enabled || false);
                setWhatsappShareMode((data as any).whatsapp_share_mode === 'image' ? 'image' : 'text');
            }
        } catch (error) {
            console.error('Error fetching shop settings:', error);
        }
    }, []);

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

            // Group by table_number
            const grouped: Record<string, TableOrder[]> = {};
            (data || []).forEach((order: TableOrder) => {
                if (!grouped[order.table_number]) {
                    grouped[order.table_number] = [];
                }
                grouped[order.table_number].push(order);
            });

            const tablesWithOrders: TableWithOrders[] = Object.entries(grouped)
                .map(([tableNum, orders]) => ({
                    table_number: tableNum,
                    orders,
                    total: orders.reduce((sum, o) => sum + o.total_amount, 0),
                    orderCount: orders.length,
                }))
                .sort((a, b) => a.table_number.localeCompare(b.table_number, undefined, { numeric: true }));

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
        fetchPaymentTypes();
        fetchAdditionalCharges();
        fetchShopSettings();

        // Seed bill counter
        initBillCounter(adminId, operatingBranchId).catch(console.warn);

        const interval = setInterval(fetchTableOrders, 15000);

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
    }, [fetchTableOrders, fetchPaymentTypes, fetchAdditionalCharges, fetchShopSettings, adminId]);

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
        additionalChargesData: { name: string; amount: number }[]
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
                    shopName: billSettings?.shopName || '',
                    address: billSettings?.address || '',
                    phone: billSettings?.contactNumber || '',
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
                    shopName: billSettings?.shopName || '',
                } as any);
                shareViaWhatsApp(customerMobile, message);
                toast({ title: "WhatsApp", description: "Opening WhatsApp to share bill..." });
            }
        } catch (err) {
            console.error('WhatsApp share error:', err);
            toast({ title: "WhatsApp Error", description: "Failed to share via WhatsApp", variant: "destructive" });
        }
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
        sendWhatsApp?: boolean;
        customerGstin?: string;
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

            // Calculate totals with rounding
            const subtotal = validItems.reduce((sum, item) => {
                const baseValue = item.base_value || 1;
                return sum + Math.round((item.quantity / baseValue) * item.price);
            }, 0);

            const totalAdditionalCharges = paymentData.additionalCharges.reduce((sum, charge) => sum + charge.amount, 0);
            const totalAmount = Math.round(subtotal + totalAdditionalCharges - paymentData.discount);

            const billNumber = getInstantBillNumber(adminId, operatingBranchId);
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            const paymentMode = mapPaymentMode(paymentData.paymentMethod);
            const additionalChargesArray = paymentData.additionalCharges.map(c => ({ name: c.name, amount: c.amount }));

            // 1. Create Bill
            const billPayload = {
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
                table_no: `T${tableNumber}`,
            };

            const { data: billData, error: billError } = await supabase
                .from('bills')
                .insert(billPayload as any)
                .select()
                .single();

            if (billError) throw billError;
            if (!billData) throw new Error('Failed to create bill');

            // 2. Create Bill Items (with rounding)
            const billItems = validItems.map(item => ({
                bill_id: billData.id,
                item_id: item.id,
                quantity: item.quantity,
                price: item.price,
                total: Math.round((item.quantity / (item.base_value || 1)) * item.price),
            }));

            const { error: itemsError } = await supabase
                .from('bill_items')
                .insert(billItems);

            if (itemsError) {
                // Rollback bill
                await supabase.from('bills').delete().eq('id', billData.id);
                throw itemsError;
            }

            // 3. Mark all table orders as billed
            const orderIds = orders.map(o => o.id);
            const { error: updateError } = await supabase
                .from('table_orders')
                .update({ is_billed: true, status: 'served' })
                .in('id', orderIds);

            if (updateError) {
                console.warn('Failed to mark orders as billed:', updateError);
            }

            // 4. Free the table
            const { error: tableError } = await supabase
                .from('tables')
                .update({ status: 'available', current_bill_id: null })
                .eq('admin_id', adminId)
                .eq('table_number', tableNumber);

            if (tableError) {
                console.warn('Failed to free table:', tableError);
            }

            // Broadcast table freed to TableManagement via shared channel
            // syncChannelRef is pos-global-sync (for Kitchen/ServiceArea)
            syncChannelRef.current?.send({
                type: 'broadcast',
                event: 'table-status-updated',
                payload: { table_number: tableNumber, status: 'available', timestamp: Date.now() }
            });
            // Also send on the shared table-order-sync channel (for Tables/TableBilling)
            // Use persistent ref to avoid destroying the listener
            tableOrderChannelRef.current?.send({
                type: 'broadcast',
                event: 'table-status-updated',
                payload: { table_number: tableNumber, status: 'available', timestamp: Date.now() }
            });

            // 5. Broadcast bill creation (4-layer sync)
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

            // 6. Broadcast status update to customer sessions (include is_billed for instant hide)
            const sessionIds = [...new Set(orders.map(o => o.session_id))];
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

            // 7. WhatsApp share (if requested)
            if (paymentData.sendWhatsApp && paymentData.customerMobile) {
                await handleWhatsAppShare(
                    paymentData.customerMobile,
                    billNumber,
                    validItems,
                    totalAmount,
                    paymentData.paymentMethod.toUpperCase(),
                    paymentData.discount,
                    additionalChargesArray
                );
            }

            toast({
                title: '✅ Bill Generated!',
                description: `Bill ${billNumber} created for Table ${tableNumber} (₹${totalAmount})`,
            });

            setSelectedTable(null);
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
        setSelectedTable(table);
        setPaymentDialogOpen(true);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    // Build cart items for the currently selected table
    const currentCart = selectedTable ? getCartForTable(selectedTable) : [];

    return (
        <div className="min-h-screen p-3 sm:p-4">
            <div className="max-w-6xl mx-auto">
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

                {/* No tables */}
                {tables.length === 0 ? (
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
                                key={table.table_number}
                                className="cursor-pointer transition-all hover:shadow-md border-l-4 border-l-purple-500"
                                onClick={() => handleTableSelect(table)}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-2xl font-black">T{table.table_number}</h3>
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

                {/* Payment Dialog — reuse CompletePaymentDialog */}
                <CompletePaymentDialog
                    open={paymentDialogOpen}
                    onOpenChange={(open) => {
                        setPaymentDialogOpen(open);
                        if (!open) setSelectedTable(null);
                    }}
                    cart={currentCart}
                    paymentTypes={paymentTypes}
                    additionalCharges={additionalCharges}
                    onUpdateQuantity={() => { }}
                    onRemoveItem={() => { }}
                    onCompletePayment={handleCompletePayment}
                    whatsappEnabled={whatsappEnabled}
                    whatsappShareMode={whatsappShareMode}
                />
            </div>
        </div>
    );
};

export default TableOrderBilling;
