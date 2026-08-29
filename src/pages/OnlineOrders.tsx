import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { useBranchSettings } from '@/hooks/useBranchSettings';
import { AllBranchesReadOnlyBanner } from '@/components/AllBranchesReadOnlyBanner';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getInstantBillNumber } from '@/utils/billNumberGenerator';
import {
  Smartphone, Package, Truck, Clock, Phone, MessageCircle, MapPin, Ban, Play, Pause,
  Search, Calendar, Star, TrendingUp, AlertTriangle, Volume2, VolumeX, Bell,
  CheckCircle2, XCircle, Navigation, ShieldBan, RefreshCw, Filter, MessageSquare
} from 'lucide-react';

export default function OnlineOrders() {
  const { profile, adminProfileId } = useAuth();
  const adminId = adminProfileId;
  const { operatingBranchId } = useBranch();
  const branchId = operatingBranchId;

  const { data: shopSettings, save: saveShopSettings, loading: settingsLoading } = useBranchSettings<any>('shop_settings');
  
  const [orders, setOrders] = useState<any[]>([]);
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [blockedDevices, setBlockedDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Dialog states
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [prepTime, setPrepTime] = useState<string>('15');
  const [customPrepTime, setCustomPrepTime] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  
  // History tab state
  const [historySearch, setHistorySearch] = useState('');
  
  // View Details state
  const [viewDetailOrder, setViewDetailOrder] = useState<any>(null);
  
  // Payment Modal state (before completing an order)
  const [paymentOrder, setPaymentOrder] = useState<any>(null);
  const [paymentMode, setPaymentMode] = useState<Record<string, number>>({ 'Cash': 0, 'UPI': 0, 'Card': 0, 'GPay': 0 });
  const [isCompletingPayment, setIsCompletingPayment] = useState(false);
  const [paymentDiscount, setPaymentDiscount] = useState(0);
  
  // Delegate & Pickup Security PIN state
  const [collectorName, setCollectorName] = useState('');
  const [collectorPhone, setCollectorPhone] = useState('');
  const [isDelegatePickup, setIsDelegatePickup] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  
  const audioContext = useRef<AudioContext | null>(null);

  // Computed Values
  const isPaused = shopSettings?.remote_ordering_paused === true;
  const orderModes = shopSettings?.remote_order_modes || 'both';

  const fetchOrders = async () => {
    if (!adminId || !branchId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('remote_orders')
        .select('*')
        .eq('admin_id', adminId)
        .eq('branch_id', branchId)
        .not('status', 'in', '(completed,cancelled,no_show)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (err: any) {
      console.error('Error fetching remote orders:', err);
      toast({ variant: 'destructive', title: 'Error loading orders', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    if (!adminId || !branchId) return;
    try {
      const { data, error } = await (supabase as any)
        .from('remote_orders')
        .select('*')
        .eq('admin_id', adminId)
        .eq('branch_id', branchId)
        .in('status', ['completed', 'cancelled', 'no_show'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setHistoryOrders(data || []);
    } catch (err: any) {
      console.error('Error fetching history:', err);
    }
  };

  const fetchBlockedDevices = async () => {
    if (!adminId || !branchId) return;
    try {
      const { data, error } = await (supabase as any)
        .from('blocked_devices')
        .select('*')
        .eq('admin_id', adminId)
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBlockedDevices(data || []);
    } catch (err: any) {
      console.error('Error fetching blocked devices:', err);
    }
  };

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  useResilientChannel({
    channelName: adminId && branchId ? `online-orders:${branchId}` : null,
    table: 'remote_orders',
    filter: `admin_id=eq.${adminId}`,
    onResync: () => {
      fetchOrders();
      fetchHistory();
      fetchBlockedDevices();
    },
    onChange: (payload: any) => {
      if (payload.new && payload.new.branch_id === branchId) {
        if (payload.eventType === 'INSERT') {
          playChime();
          showNotification(payload.new.customer_name);
          setOrders(prev => (prev.some(o => o.id === payload.new.id) ? prev : [payload.new, ...prev]));
        } else if (payload.eventType === 'UPDATE') {
          const isCompleted = ['completed', 'cancelled', 'no_show'].includes(payload.new.status);
          setOrders(prev => {
            const exists = prev.some(o => o.id === payload.new.id);
            if (!exists && !isCompleted) return [payload.new, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            if (isCompleted) return prev.filter(o => o.id !== payload.new.id);
            return prev.map(o => o.id === payload.new.id ? payload.new : o);
          });
          if (isCompleted) {
            setHistoryOrders(prev => [payload.new, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 50));
          }
        }
      }
    },
  });


  const playChime = () => {
    if (!audioEnabled) return;
    try {
      if (!audioContext.current) {
        audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContext.current;
      if (ctx.state === 'suspended') ctx.resume();
      
      const playNote = (frequency: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, startTime);
        
        gain.gain.setValueAtTime(0.5, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      playNote(523.25, now, 0.15); // C5
      playNote(659.25, now + 0.15, 0.15); // E5
      playNote(783.99, now + 0.3, 0.15); // G5
    } catch (e) {
      console.error('Failed to play chime:', e);
    }
  };

  const showNotification = (customerName: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('New Online Order!', { body: `Order from ${customerName || 'Customer'}` });
    }
  };

  const togglePause = async () => {
    try {
      await saveShopSettings({ remote_ordering_paused: !isPaused });
      toast({ title: !isPaused ? 'Online Ordering Paused' : 'Online Ordering Resumed' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to update settings' });
    }
  };

  const updateOrderStatus = async (id: string, status: string, additionalFields: any = {}) => {
    try {
      const payload: any = { status, updated_at: new Date().toISOString(), ...additionalFields };
      if (status === 'completed' && !payload.completed_at) {
        payload.completed_at = new Date().toISOString();
      }
      const { error } = await (supabase as any)
        .from('remote_orders')
        .update(payload)
        .eq('id', id);

      if (error) throw error;
      
      // Realtime subscription handles moving orders between active<->history
      // We only do local optimistic update for non-terminal statuses to avoid duplicates
      if (['completed', 'cancelled', 'no_show'].includes(status)) {
        setOrders(prev => prev.filter(o => o.id !== id));
        // Don't add to historyOrders here - Realtime UPDATE event will do it
      } else {
        setOrders(prev => prev.map(o => o.id === id ? { ...o, ...payload } : o));
      }
      
      toast({ title: `Order ${status.replace(/_/g, ' ')}` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: err.message });
    }
  };

  // Complete an online order with payment: creates a bill + marks order as completed
  const completeWithPayment = async (order: any) => {
    if (!adminId || !branchId || !profile?.user_id) return;
    setIsCompletingPayment(true);
    try {
      // Calculate payment total
      const total = Number(order.total_amount) - paymentDiscount;
      const payTotal = Object.values(paymentMode).reduce((s: number, v: any) => s + Number(v || 0), 0);
      if (Math.abs(payTotal - total) > 0.5) {
        toast({ variant: 'destructive', title: 'Payment mismatch', description: `Payment amounts (₹${payTotal}) must equal total (₹${total})` });
        setIsCompletingPayment(false);
        return;
      }

      // Build payment_details object (e.g. { Cash: 30 })
      const paymentDetails: Record<string, number> = {};
      Object.entries(paymentMode).forEach(([k, v]) => {
        if (Number(v) > 0) paymentDetails[k] = Number(v);
      });
      const primaryMode = (Object.keys(paymentDetails)[0] || 'cash').toLowerCase() as 'cash' | 'upi' | 'card' | 'other';

      // Get next bill number using the same utility as POS
      const nextBillNo = getInstantBillNumber(adminId, branchId);

      // Build cart items from order.items
      const cartItems = Array.isArray(order.items) ? order.items.map((item: any) => ({
        id: item.id || null,
        name: item.name,
        item_name_override: item.name,
        price: Number(item.price),
        quantity: Number(item.qty || item.quantity || 1),
        billing_type: 'pos'
      })) : [];

      // Create bill via secure_create_bill RPC (same as POS)
      const { data: billData, error: rpcError } = await supabase.rpc('secure_create_bill', {
        p_bill_payload: {
          bill_no: nextBillNo,
          total_amount: total,
          created_by: profile.user_id,
          payment_mode: primaryMode,
          payment_details: paymentDetails,
          additional_charges: [],
          discount: paymentDiscount,
          order_type: order.order_type === 'delivery' ? 'delivery' : 'pickup',
          table_no: order.order_number,
          customer_mobile: order.customer_phone || null,
          customer_gstin: null,
          branch_id: branchId,
          admin_id: adminId,
          channel: 'online',
          billing_type: 'pos'
        },
        p_cart_items: cartItems
      });

      if (rpcError) throw rpcError;

      // Mark remote order as completed with bill reference and collector audit info
      await updateOrderStatus(order.id, 'completed', {
        completed_at: new Date().toISOString(),
        payment_mode: primaryMode === 'cash' ? 'pay_on_pickup' : 'paid',
        is_paid: true,
        payment_reference: (billData as any)?.id || null,
        collected_by_name: isDelegatePickup ? collectorName.trim() : order.customer_name,
        collected_by_phone: isDelegatePickup ? collectorPhone.trim() : order.customer_phone,
        is_delegate_pickup: isDelegatePickup
      });

      // Update customer record in customers table for CRM
      try {
        const phone = order.customer_phone?.trim();
        const custName = order.customer_name?.trim();
        if (phone && phone.length >= 10) {
          const nowIso = new Date().toISOString();
          const { data: existingCust } = await (supabase as any)
            .from('customers')
            .select('id, visit_count, total_spent, name')
            .eq('admin_id', adminId)
            .eq('phone', phone)
            .maybeSingle();

          if (existingCust) {
            await (supabase as any)
              .from('customers')
              .update({
                name: custName || existingCust.name,
                visit_count: (existingCust.visit_count || 0) + 1,
                total_spent: (Number(existingCust.total_spent) || 0) + total,
                last_visit: nowIso,
                updated_at: nowIso
              })
              .eq('id', existingCust.id);
          } else {
            await (supabase as any)
              .from('customers')
              .insert({
                admin_id: adminId,
                branch_id: branchId,
                phone: phone,
                name: custName,
                visit_count: 1,
                total_spent: total,
                last_visit: nowIso,
                updated_at: nowIso,
                created_at: nowIso
              });
          }
        }
      } catch (cErr) {
        console.warn('Customer stats update error:', cErr);
      }

      toast({ title: '✅ Order Completed & Bill Created', description: `Bill #${nextBillNo} created. Revenue added to reports.` });
      setPaymentOrder(null);
      setPaymentDiscount(0);
      setPaymentMode({ 'Cash': 0, 'UPI': 0, 'Card': 0, 'GPay': 0 });
      
      // Signal reports and CRM to refresh
      window.dispatchEvent(new CustomEvent('bills-updated'));
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Payment failed', description: err.message });
    } finally {
      setIsCompletingPayment(false);
    }
  };

  const handleAccept = async () => {
    if (!selectedOrder) return;
    const minutes = prepTime === 'custom' ? parseInt(customPrepTime) : parseInt(prepTime);
    if (isNaN(minutes)) {
      toast({ variant: 'destructive', title: 'Invalid time' });
      return;
    }
    
    await updateOrderStatus(selectedOrder.id, 'accepted', { 
      accepted_at: new Date().toISOString(),
      estimated_wait_minutes: minutes,
      estimated_prep_time: minutes
    });
    setAcceptDialogOpen(false);
  };

  const handleReject = async () => {
    if (!selectedOrder || !rejectReason.trim()) return;
    await updateOrderStatus(selectedOrder.id, 'cancelled', { 
      reject_reason: rejectReason,
      rejection_reason: rejectReason 
    });
    setRejectDialogOpen(false);
    setRejectReason('');
  };

  const handleBlockDevice = async () => {
    if (!selectedOrder?.device_id) return;
    try {
      const { error } = await (supabase as any)
        .from('blocked_devices')
        .insert({ 
          admin_id: adminId, 
          branch_id: branchId, 
          device_id: selectedOrder.device_id,
          reason: 'Blocked from Online Orders Hub'
        });
      if (error) throw error;
      toast({ title: 'Device blocked successfully' });
      fetchBlockedDevices();
      setBlockDialogOpen(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to block device', description: err.message });
    }
  };

  const unblockDevice = async (id: string) => {
    try {
      const { error } = await (supabase as any).from('blocked_devices').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Device unblocked' });
      setBlockedDevices(prev => prev.filter(d => d.id !== id));
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to unblock', description: err.message });
    }
  };

  const formatTimeAgo = (dateString: string) => {
    if (!dateString) return '';
    const diff = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 60000);
    if (diff < 1) return 'Just now';
    if (diff === 1) return '1 min ago';
    return `${diff} mins ago`;
  };

  const getElapsedTimeColor = (dateString: string) => {
    if (!dateString) return 'text-muted-foreground';
    const diff = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 60000);
    if (diff > 15) return 'text-red-600 font-bold';
    if (diff > 5) return 'text-orange-500 font-medium';
    return 'text-green-600';
  };

  // Derived state
  const activeOrders = orders;
  const pickupOrders = orders.filter(o => o.order_type === 'pickup' && o.status === 'ready');
  const deliveryOrders = orders.filter(o => o.order_type === 'delivery' && ['ready', 'out_for_delivery'].includes(o.status));
  
  // Analytics
  const analytics = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayOrders = historyOrders.filter(o => o.created_at.startsWith(today));
    
    const totalRevenue = historyOrders.filter(o => o.status === 'completed').reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const totalDeliveryFees = historyOrders.filter(o => o.status === 'completed').reduce((sum, o) => sum + (Number(o.delivery_fee) || 0), 0);
    const ratedOrders = historyOrders.filter(o => o.rating > 0);
    const avgRating = ratedOrders.length > 0 ? (ratedOrders.reduce((sum, o) => sum + o.rating, 0) / ratedOrders.length).toFixed(1) : 'N/A';
    const cancelledCount = historyOrders.filter(o => o.status === 'cancelled').length;
    const cancelRate = historyOrders.length > 0 ? ((cancelledCount / historyOrders.length) * 100).toFixed(1) + '%' : '0%';

    // Popular items
    const itemCounts: Record<string, number> = {};
    historyOrders.forEach(o => {
      if (Array.isArray(o.items)) {
        o.items.forEach((item: any) => {
          if (item.name) {
            itemCounts[item.name] = (itemCounts[item.name] || 0) + (item.qty ?? item.quantity ?? 1);
          }
        });
      }
    });
    const popularItems = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { totalRevenue, totalDeliveryFees, avgRating, cancelRate, todayOrders: todayOrders.length, popularItems };
  }, [historyOrders]);

  const filteredHistory = historyOrders.filter(o => {
    if (!historySearch) return true;
    const term = historySearch.toLowerCase();
    return (
      (o.order_number && o.order_number.toLowerCase().includes(term)) ||
      (o.customer_name && o.customer_name.toLowerCase().includes(term)) ||
      (o.customer_phone && o.customer_phone.includes(term))
    );
  });

  if (!branchId) {
    return (
      <div className="p-4">
        <AllBranchesReadOnlyBanner />
        <Card className="mt-4 p-8 text-center text-muted-foreground">
          Please select a specific branch to manage online orders.
        </Card>
      </div>
    );
  }

  const renderOrderCard = (order: any, mode: 'active' | 'pickup' | 'delivery') => {
    const isPickup = order.order_type === 'pickup';
    return (
      <Card key={order.id} className="flex flex-col border-2 overflow-hidden" style={{
        borderColor: order.status === 'pending' ? 'var(--orange-500)' : 
                     order.status === 'accepted' ? 'var(--blue-500)' :
                     order.status === 'preparing' ? 'var(--yellow-500)' :
                     order.status === 'ready' ? 'var(--green-500)' : 'var(--border)'
      }}>
        <CardHeader className="pb-2 bg-muted/20">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-xl">#{order.order_number}</CardTitle>
              <div className="font-semibold mt-1 text-lg">{order.customer_name || 'Guest'}</div>
              <div className="text-sm text-muted-foreground">{order.customer_phone}</div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant={isPickup ? 'secondary' : 'default'} className="flex items-center gap-1 text-sm py-1">
                {isPickup ? <Package className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
                {order.order_type?.toUpperCase()}
              </Badge>
              {order.is_scheduled && order.scheduled_for && (
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                  Scheduled: {new Date(order.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Badge>
              )}
              <div className={`text-sm font-medium flex items-center gap-1 ${getElapsedTimeColor(order.created_at)}`}>
                <Clock className="w-4 h-4" />
                {formatTimeAgo(order.created_at)}
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 pb-2 text-sm space-y-3 mt-4">
          <div className="bg-muted/30 p-3 rounded-md max-h-48 overflow-y-auto border">
            {Array.isArray(order.items) && order.items.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between py-1.5 border-b last:border-0 border-border/50">
                <span><span className="font-bold text-base mr-2">{(item.qty ?? item.quantity)}x</span> {item.name}</span>
                <span className="font-medium">₹{(item.price * (item.qty ?? item.quantity)).toFixed(2)}</span>
              </div>
            ))}
          </div>
          
          <div className="space-y-1 pt-2">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>₹{order.subtotal || order.total_amount}</span>
            </div>
            {order.delivery_fee > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Delivery Fee</span>
                <span>₹{order.delivery_fee}</span>
              </div>
            )}
            {order.packaging_fee > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Packaging</span>
                <span>₹{order.packaging_fee}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg border-t pt-1 mt-1">
              <span>Total ({Array.isArray(order.items) ? order.items.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0) : 0} items)</span>
              <span>₹{order.total_amount}</span>
            </div>
          </div>

          {!isPickup && order.delivery_address && (
            <div className="text-sm bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md text-blue-900 dark:text-blue-100 border border-blue-100 dark:border-blue-800">
              <div className="flex items-center gap-1 font-semibold mb-1"><MapPin className="w-4 h-4" /> Delivery Address:</div>
              {order.delivery_address}
            </div>
          )}
          
          <div className="flex flex-wrap gap-2 pt-2">
            {order.customer_phone && (
              <>
                <Button size="sm" variant="outline" className="h-9 flex-1" asChild>
                  <a href={`tel:${order.customer_phone}`}><Phone className="w-4 h-4 mr-1" /> Call</a>
                </Button>
                <Button size="sm" variant="outline" className="h-9 flex-1 text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200" asChild>
                  <a href={`https://wa.me/91${order.customer_phone}?text=Hi ${order.customer_name}, regarding your order ${order.order_number}...`} target="_blank" rel="noreferrer"><MessageCircle className="w-4 h-4 mr-1" /> WhatsApp</a>
                </Button>
              </>
            )}
            {!isPickup && order.customer_latitude && order.customer_longitude && (
               <Button size="sm" variant="outline" className="h-9 flex-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200" asChild>
                 <a href={`https://www.google.com/maps/dir/?api=1&destination=${order.customer_latitude},${order.customer_longitude}`} target="_blank" rel="noreferrer"><Navigation className="w-4 h-4 mr-1" /> Navigate</a>
               </Button>
            )}
            {order.device_id && mode === 'active' && (
              <Button size="sm" variant="ghost" className="h-9 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => { setSelectedOrder(order); setBlockDialogOpen(true); }}>
                <ShieldBan className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardContent>
        
        <CardFooter className="pt-2 flex-col gap-2 bg-muted/10 border-t">
          {mode === 'active' && order.status === 'pending' && (
            <div className="flex gap-2 w-full">
              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-base py-6" onClick={() => { setSelectedOrder(order); setAcceptDialogOpen(true); }}>
                Accept Order
              </Button>
              <Button variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50 py-6" onClick={() => { setSelectedOrder(order); setRejectDialogOpen(true); }}>
                Reject
              </Button>
            </div>
          )}
          
          {mode === 'active' && order.status === 'accepted' && (
            <div className="flex gap-2 w-full">
               <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-base py-6" onClick={() => updateOrderStatus(order.id, 'preparing')}>
                 Start Preparing
               </Button>
            </div>
          )}

          {mode === 'active' && order.status === 'preparing' && (
            <div className="flex gap-2 w-full">
               <Button className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-base py-6 text-white" onClick={() => updateOrderStatus(order.id, 'ready', { ready_at: new Date().toISOString() })}>
                 Mark Ready
               </Button>
            </div>
          )}
          
          {((mode === 'active' || mode === 'pickup') && order.status === 'ready' && isPickup) && (
            <div className="flex gap-2 w-full">
              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-base py-6" onClick={() => {
                setPaymentOrder(order);
                const total = Number(order.total_amount);
                setPaymentMode({ 'Cash': total, 'UPI': 0, 'Card': 0, 'GPay': 0 });
                setPaymentDiscount(0);
                setCollectorName('');
                setCollectorPhone('');
                setIsDelegatePickup(false);
                setEnteredPin('');
              }}>
                <CheckCircle2 className="w-5 h-5 mr-2" /> Complete & Pay
              </Button>
              <Button variant="outline" className="py-6" onClick={() => updateOrderStatus(order.id, 'no_show', { no_show_at: new Date().toISOString() })}>No Show</Button>
            </div>
          )}

          {((mode === 'active' || mode === 'delivery') && order.status === 'ready' && !isPickup) && (
            <div className="flex gap-2 w-full">
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-base py-6" onClick={() => updateOrderStatus(order.id, 'out_for_delivery', { out_for_delivery_at: new Date().toISOString() })}>
                <Truck className="w-5 h-5 mr-2" /> Dispatch for Delivery
              </Button>
            </div>
          )}

          {((mode === 'active' || mode === 'delivery') && order.status === 'out_for_delivery' && !isPickup) && (
            <div className="flex gap-2 w-full">
              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-base py-6" onClick={() => {
                setPaymentOrder(order);
                const total = Number(order.total_amount);
                setPaymentMode({ 'Cash': 0, 'UPI': total, 'Card': 0, 'GPay': 0 });
                setPaymentDiscount(0);
                setCollectorName('');
                setCollectorPhone('');
                setIsDelegatePickup(false);
                setEnteredPin('');
              }}>
                <CheckCircle2 className="w-5 h-5 mr-2" /> Complete & Pay
              </Button>
            </div>
          )}
        </CardFooter>
      </Card>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header Bar */}
      <div className="sticky top-0 z-10 flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-card border-b shadow-sm gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-full text-primary">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Online Orders Hub</h1>
            <p className="text-sm text-muted-foreground">Manage remote pickup and delivery</p>
          </div>
          {activeOrders.length > 0 && (
            <Badge className="ml-2 bg-orange-500 hover:bg-orange-600 text-white rounded-full px-3 py-1 text-sm animate-pulse">
              {activeOrders.length} Active
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          {/* Status Badges */}
          <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-md border">
            <Badge variant="outline" className={cn("px-2 py-1", orderModes === 'pickup' || orderModes === 'both' ? 'bg-primary/10 text-primary border-primary/20' : 'text-muted-foreground opacity-50')}>
              Pickup
            </Badge>
            <Badge variant="outline" className={cn("px-2 py-1", orderModes === 'delivery' || orderModes === 'both' ? 'bg-primary/10 text-primary border-primary/20' : 'text-muted-foreground opacity-50')}>
              Delivery
            </Badge>
          </div>

          <div className="h-8 w-px bg-border hidden md:block"></div>

          {/* Emergency Pause Toggle */}
          <div className={cn("flex items-center gap-3 px-4 py-2 rounded-md border-2 transition-colors", 
              isPaused ? "border-red-500 bg-red-50 dark:bg-red-950/20" : "border-transparent bg-muted")}>
            <div className="flex flex-col">
              <span className={cn("text-sm font-semibold", isPaused ? "text-red-600" : "")}>
                {isPaused ? "ORDERING PAUSED" : "Accepting Orders"}
              </span>
            </div>
            <Switch 
              checked={!isPaused} 
              onCheckedChange={togglePause} 
              disabled={settingsLoading}
              className={isPaused ? "data-[state=unchecked]:bg-red-500" : "data-[state=checked]:bg-green-500"}
            />
          </div>

          <Button variant="outline" size="icon" onClick={() => setAudioEnabled(!audioEnabled)} title={audioEnabled ? "Disable Chime" : "Enable Chime"}>
            {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}
          </Button>
        </div>
      </div>

      {isPaused && (
        <div className="bg-red-500 text-white p-2 text-center font-bold flex items-center justify-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          ONLINE ORDERING IS CURRENTLY PAUSED. CUSTOMERS CANNOT PLACE NEW ORDERS.
        </div>
      )}

      {/* Main Content Tabs */}
      <div className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col">
        <Tabs defaultValue="active" className="flex-1 flex flex-col h-full">
          <TabsList className="grid grid-cols-5 md:w-[600px] mb-4">
            <TabsTrigger value="active" className="relative">
              Active
              {activeOrders.length > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>}
            </TabsTrigger>
            <TabsTrigger value="pickup">Pickup Q</TabsTrigger>
            <TabsTrigger value="delivery">Delivery Q</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* ACTIVE TAB */}
          <TabsContent value="active" className="flex-1 overflow-y-auto min-h-0 m-0">
            {loading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground"><RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading orders...</div>
            ) : activeOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-60">
                <Smartphone className="w-24 h-24 mb-4 text-muted" />
                <h3 className="text-xl font-medium">No Active Orders</h3>
                <p>Waiting for new online orders to arrive...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-12">
                {activeOrders.map(order => renderOrderCard(order, 'active'))}
              </div>
            )}
          </TabsContent>

          {/* PICKUP TAB */}
          <TabsContent value="pickup" className="flex-1 overflow-y-auto min-h-0 m-0">
            {pickupOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-60">
                <Package className="w-24 h-24 mb-4 text-muted" />
                <h3 className="text-xl font-medium">Pickup Queue Empty</h3>
                <p>No orders are currently ready for pickup.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pickupOrders.map(order => renderOrderCard(order, 'pickup'))}
              </div>
            )}
          </TabsContent>

          {/* DELIVERY TAB */}
          <TabsContent value="delivery" className="flex-1 overflow-y-auto min-h-0 m-0">
             {deliveryOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-60">
                <Truck className="w-24 h-24 mb-4 text-muted" />
                <h3 className="text-xl font-medium">Delivery Queue Empty</h3>
                <p>No orders are waiting for delivery dispatch.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {deliveryOrders.map(order => renderOrderCard(order, 'delivery'))}
              </div>
            )}
          </TabsContent>

          {/* HISTORY TAB */}
          <TabsContent value="history" className="flex-1 overflow-y-auto min-h-0 m-0">
            <Card className="h-full flex flex-col">
              <CardHeader className="py-4 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle>Order History</CardTitle>
                  <div className="flex items-center gap-2 w-full max-w-sm">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search customer, order #"
                        className="pl-8"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto p-0">
                {filteredHistory.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No historical orders found.</div>
                ) : (
                  <div className="divide-y">
                    {filteredHistory.map(order => (
                      <div key={order.id} className="p-4 hover:bg-muted/30 transition-colors flex flex-col md:flex-row gap-4 justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold">{order.order_number}</span>
                            <Badge variant={order.status === 'completed' ? 'default' : 'secondary'} className={order.status === 'completed' ? 'bg-green-600' : ''}>
                              {order.status.toUpperCase()}
                            </Badge>
                            <Badge variant="outline">{order.order_type}</Badge>
                          </div>
                          <div className="text-sm font-medium">{order.customer_name} • {order.customer_phone}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(order.created_at).toLocaleString()}
                          </div>
                          {order.status === 'cancelled' && order.rejection_reason && (
                            <div className="text-sm text-red-500 mt-1 flex items-center gap-1">
                              <XCircle className="w-3 h-3" /> Reason: {order.rejection_reason}
                            </div>
                          )}
                          {order.rating > 0 && (
                            <div className="flex items-center gap-1 mt-2 text-yellow-500">
                              {Array.from({length: order.rating}).map((_, i) => <Star key={i} className="w-3 h-3 fill-current" />)}
                              {order.feedback && <span className="text-xs text-muted-foreground ml-2 truncate max-w-xs block">"{order.feedback}"</span>}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg">₹{order.total_amount}</div>
                          <Button variant="ghost" size="sm" className="mt-2 text-xs h-7" onClick={() => setViewDetailOrder(order)}>
                            View Details
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ANALYTICS TAB */}
          <TabsContent value="analytics" className="flex-1 overflow-y-auto min-h-0 m-0 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-full mb-3">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-medium text-muted-foreground">Today's Orders</h3>
                  <div className="text-3xl font-bold mt-1">{analytics.todayOrders}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="p-3 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full mb-3">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-medium text-muted-foreground">Total Revenue</h3>
                  <div className="text-3xl font-bold mt-1">₹{analytics.totalRevenue.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 rounded-full mb-3">
                    <Star className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-medium text-muted-foreground">Average Rating</h3>
                  <div className="text-3xl font-bold mt-1">{analytics.avgRating}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full mb-3">
                    <XCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-medium text-muted-foreground">Cancel Rate</h3>
                  <div className="text-3xl font-bold mt-1">{analytics.cancelRate}</div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
               <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Popular Items</CardTitle>
                </CardHeader>
                <CardContent>
                  {analytics.popularItems.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">Not enough data</div>
                  ) : (
                    <div className="space-y-4">
                      {analytics.popularItems.map(([name, count], i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="w-6 h-6 p-0 flex items-center justify-center rounded-full bg-muted">{i+1}</Badge>
                            <span className="font-medium">{name}</span>
                          </div>
                          <span className="text-muted-foreground">{count} ordered</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShieldBan className="w-5 h-5" /> Blocked Devices
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {blockedDevices.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">No blocked devices</div>
                  ) : (
                    <div className="space-y-3">
                      {blockedDevices.map(device => (
                        <div key={device.id} className="flex items-center justify-between bg-muted/30 p-2 rounded border">
                          <div>
                            <div className="text-xs font-mono text-muted-foreground">{device.device_id.substring(0, 16)}...</div>
                            <div className="text-sm">{device.reason}</div>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => unblockDevice(device.id)}>Unblock</Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept Order #{selectedOrder?.order_number}</DialogTitle>
            <DialogDescription>Set the estimated preparation time for this order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Label>Estimated Prep Time</Label>
            <Select value={prepTime} onValueChange={setPrepTime}>
              <SelectTrigger>
                <SelectValue placeholder="Select time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 minutes</SelectItem>
                <SelectItem value="10">10 minutes</SelectItem>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="20">20 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
                <SelectItem value="custom">Custom (minutes)</SelectItem>
              </SelectContent>
            </Select>
            {prepTime === 'custom' && (
              <Input 
                type="number" 
                placeholder="Enter minutes" 
                value={customPrepTime} 
                onChange={e => setCustomPrepTime(e.target.value)} 
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptDialogOpen(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleAccept}>Confirm Accept</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Reject Order #{selectedOrder?.order_number}</DialogTitle>
            <DialogDescription>Please provide a reason for rejecting this order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Label>Rejection Reason</Label>
            <Input 
              placeholder="e.g. Items out of stock, Too busy..." 
              value={rejectReason} 
              onChange={e => setRejectReason(e.target.value)} 
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectReason.trim()}>Confirm Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <ShieldBan className="w-5 h-5" /> Block Customer Device
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to block this device? They will no longer be able to place online orders.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBlockDevice}>Block Device</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ====== VIEW DETAILS DIALOG ====== */}
      <Dialog open={!!viewDetailOrder} onOpenChange={open => !open && setViewDetailOrder(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Order #{viewDetailOrder?.order_number}
            </DialogTitle>
          </DialogHeader>
          {viewDetailOrder && (
            <div className="space-y-4 py-2">
              {/* Customer Info */}
              <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                <div className="font-semibold text-base">{viewDetailOrder.customer_name}</div>
                <div className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{viewDetailOrder.customer_phone}</div>
                <div className="flex gap-2 mt-1">
                  <Badge variant={viewDetailOrder.order_type === 'pickup' ? 'secondary' : 'default'}>
                    {viewDetailOrder.order_type === 'pickup' ? '📦 Pickup' : '🚗 Delivery'}
                  </Badge>
                  <Badge className={
                    viewDetailOrder.status === 'completed' ? 'bg-green-600' :
                    viewDetailOrder.status === 'cancelled' ? 'bg-red-600' :
                    viewDetailOrder.status === 'pending' ? 'bg-orange-500' : 'bg-blue-600'
                  }>{viewDetailOrder.status.replace(/_/g, ' ')}</Badge>
                </div>
              </div>

              {/* Delivery Address */}
              {viewDetailOrder.order_type === 'delivery' && viewDetailOrder.delivery_address && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm">
                  <div className="font-semibold flex items-center gap-1 mb-1"><MapPin className="w-3.5 h-3.5" /> Delivery Address</div>
                  <div>{viewDetailOrder.delivery_address}</div>
                  {viewDetailOrder.delivery_distance_km && <div className="text-muted-foreground mt-1">{viewDetailOrder.delivery_distance_km} km away</div>}
                </div>
              )}

              {/* Items */}
              <div>
                <div className="font-semibold mb-2">Items Ordered</div>
                <div className="space-y-1.5">
                  {Array.isArray(viewDetailOrder.items) && viewDetailOrder.items.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm bg-muted/20 rounded p-2">
                      <span><span className="font-medium">{item.qty ?? item.quantity}x</span> {item.name}</span>
                      <span className="font-medium">₹{(item.price * (item.qty ?? item.quantity)).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fee Breakdown */}
              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>₹{Number(viewDetailOrder.subtotal || 0).toFixed(2)}</span></div>
                {Number(viewDetailOrder.tax_total) > 0 && <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>₹{Number(viewDetailOrder.tax_total).toFixed(2)}</span></div>}
                {Number(viewDetailOrder.delivery_fee) > 0 && <div className="flex justify-between text-muted-foreground"><span>Delivery Fee</span><span>₹{Number(viewDetailOrder.delivery_fee).toFixed(2)}</span></div>}
                {Number(viewDetailOrder.packaging_fee) > 0 && <div className="flex justify-between text-muted-foreground"><span>Packaging</span><span>₹{Number(viewDetailOrder.packaging_fee).toFixed(2)}</span></div>}
                {Number(viewDetailOrder.tip_amount) > 0 && <div className="flex justify-between text-muted-foreground"><span>Tip</span><span>₹{Number(viewDetailOrder.tip_amount).toFixed(2)}</span></div>}
                <div className="flex justify-between font-bold text-base border-t pt-1 mt-1"><span>Total</span><span>₹{Number(viewDetailOrder.total_amount).toFixed(2)}</span></div>
              </div>

              {/* Timestamps */}
              <div className="border-t pt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div><span className="font-medium">Placed:</span> {new Date(viewDetailOrder.created_at).toLocaleString()}</div>
                {viewDetailOrder.accepted_at && <div><span className="font-medium">Accepted:</span> {new Date(viewDetailOrder.accepted_at).toLocaleString()}</div>}
                {viewDetailOrder.ready_at && <div><span className="font-medium">Ready:</span> {new Date(viewDetailOrder.ready_at).toLocaleString()}</div>}
                {viewDetailOrder.completed_at && <div><span className="font-medium">Completed:</span> {new Date(viewDetailOrder.completed_at).toLocaleString()}</div>}
                <div><span className="font-medium">Payment:</span> {viewDetailOrder.payment_mode?.replace(/_/g, ' ') || 'N/A'}</div>
                {viewDetailOrder.is_scheduled && viewDetailOrder.scheduled_for && (
                  <div><span className="font-medium">Scheduled:</span> {new Date(viewDetailOrder.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                )}
              </div>

              {/* Delegate / Collector Security Audit */}
              {(viewDetailOrder.collected_by_name || viewDetailOrder.pickup_pin) && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm space-y-1">
                  <div className="font-semibold flex items-center justify-between text-amber-900 dark:text-amber-200">
                    <span className="flex items-center gap-1">🔐 Pickup Security Audit</span>
                    {viewDetailOrder.pickup_pin && <Badge variant="outline" className="font-mono font-bold">PIN: {viewDetailOrder.pickup_pin}</Badge>}
                  </div>
                  {viewDetailOrder.is_delegate_pickup && viewDetailOrder.collected_by_name ? (
                    <div className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                      ⚠️ Collected by Delegate (Friend/Relative): {viewDetailOrder.collected_by_name} ({viewDetailOrder.collected_by_phone || 'No phone'})
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Collected by customer directly</div>
                  )}
                </div>
              )}

              {/* Rejection reason */}
              {viewDetailOrder.rejection_reason && (
                <div className="bg-red-50 dark:bg-red-900/20 rounded p-3 text-sm text-red-700 dark:text-red-300">
                  <span className="font-semibold">Rejected: </span>{viewDetailOrder.rejection_reason}
                </div>
              )}

              {/* Rating */}
              {viewDetailOrder.rating > 0 && (
                <div className="flex items-center gap-1 text-yellow-500">
                  {Array.from({length: viewDetailOrder.rating}).map((_: any, i: number) => <Star key={i} className="w-4 h-4 fill-current" />)}
                  {viewDetailOrder.feedback_text && <span className="text-sm text-muted-foreground ml-2">"{viewDetailOrder.feedback_text}"</span>}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDetailOrder(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== COMPLETE PAYMENT DIALOG ====== */}
      <Dialog open={!!paymentOrder} onOpenChange={open => { if (!open) { setPaymentOrder(null); setPaymentDiscount(0); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="w-5 h-5" />
              Complete Payment — Order #{paymentOrder?.order_number}
            </DialogTitle>
            <DialogDescription>Confirm payment before marking order as completed. A bill will be created in Reports.</DialogDescription>
          </DialogHeader>
          {paymentOrder && (() => {
            const orderTotal = Number(paymentOrder.total_amount);
            const discountedTotal = Math.max(0, orderTotal - paymentDiscount);
            const payTotal = Object.values(paymentMode).reduce((s: number, v: any) => s + Number(v || 0), 0);
            const isBalanced = Math.abs(payTotal - discountedTotal) <= 0.5;
            return (
              <div className="space-y-4 py-2">
                {/* Order Summary */}
                <div className="bg-muted/30 rounded-lg p-3">
                  <div className="font-semibold mb-2">Order Summary ({Array.isArray(paymentOrder.items) ? paymentOrder.items.length : 0} items) — ₹{orderTotal.toFixed(2)}</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {Array.isArray(paymentOrder.items) && paymentOrder.items.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{item.qty ?? item.quantity}x {item.name}</span>
                        <span>₹{(item.price * (item.qty ?? item.quantity)).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  {Number(paymentOrder.delivery_fee) > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground mt-1 border-t pt-1">
                      <span>Delivery Fee</span><span>₹{Number(paymentOrder.delivery_fee).toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Handover & Pickup Verification Section */}
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                      <span>🔐 Pickup PIN Verification</span>
                      {paymentOrder.pickup_pin && (
                        <Badge variant="outline" className="font-mono font-bold bg-amber-500/20 text-amber-800 dark:text-amber-200">
                          PIN: {paymentOrder.pickup_pin}
                        </Badge>
                      )}
                    </div>
                    {enteredPin && enteredPin === paymentOrder.pickup_pin && (
                      <Badge className="bg-green-600 text-white flex items-center gap-1">
                        ✓ PIN Verified
                      </Badge>
                    )}
                  </div>

                  {paymentOrder.pickup_pin && (
                    <div className="flex gap-2 items-center">
                      <Input
                        placeholder="Enter 4-digit PIN from customer"
                        maxLength={4}
                        value={enteredPin}
                        onChange={e => setEnteredPin(e.target.value.trim())}
                        className="h-9 text-sm font-mono tracking-widest text-center max-w-[200px]"
                      />
                      {enteredPin && enteredPin === paymentOrder.pickup_pin && (
                        <span className="text-xs text-green-600 font-semibold">✓ Correct PIN</span>
                      )}
                      {enteredPin && enteredPin !== paymentOrder.pickup_pin && (
                        <span className="text-xs text-red-500 font-medium">Incorrect PIN</span>
                      )}
                    </div>
                  )}

                  {/* Delegate / Third-party Collector Toggle */}
                  <div className="border-t border-amber-500/20 pt-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="delegate-toggle" className="text-xs font-semibold cursor-pointer flex items-center gap-1.5">
                        <span>👤 Collecting on behalf of customer? (Friend / Relative)</span>
                      </Label>
                      <Switch
                        id="delegate-toggle"
                        checked={isDelegatePickup}
                        onCheckedChange={checked => {
                          setIsDelegatePickup(checked);
                          if (!checked) {
                            setCollectorName('');
                            setCollectorPhone('');
                          }
                        }}
                      />
                    </div>

                    {isDelegatePickup && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <Label className="text-[11px] text-muted-foreground mb-1 block">Collector Name *</Label>
                          <Input
                            placeholder="e.g. Rahul (Friend)"
                            value={collectorName}
                            onChange={e => setCollectorName(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground mb-1 block">Collector Mobile *</Label>
                          <Input
                            placeholder="10-digit mobile"
                            maxLength={10}
                            value={collectorPhone}
                            onChange={e => setCollectorPhone(e.target.value.replace(/\D/g, ''))}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Discount */}
                <div className="flex items-center gap-3">
                  <Label className="shrink-0 text-sm">Discount (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={orderTotal}
                    value={paymentDiscount || ''}
                    onChange={e => setPaymentDiscount(Math.min(Number(e.target.value) || 0, orderTotal))}
                    placeholder="0"
                    className="w-24"
                  />
                  <span className="text-sm font-bold text-green-700">Net: ₹{discountedTotal.toFixed(2)}</span>
                </div>

                {/* Payment Methods */}
                <div>
                  <Label className="text-sm font-semibold mb-2 block">Payment</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(paymentMode).map(([mode, amount]) => (
                      <div key={mode} className="flex flex-col gap-1">
                        <Button
                          type="button"
                          variant={Number(amount) > 0 ? 'default' : 'outline'}
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            const remaining = discountedTotal - Object.entries(paymentMode).filter(([k]) => k !== mode).reduce((s, [, v]) => s + Number(v || 0), 0);
                            setPaymentMode(prev => ({
                              ...prev,
                              [mode]: Number(prev[mode]) > 0 ? 0 : Math.max(0, remaining)
                            }));
                          }}
                        >{mode}</Button>
                        <Input
                          type="number"
                          min={0}
                          value={Number(amount) || ''}
                          onChange={e => setPaymentMode(prev => ({ ...prev, [mode]: Number(e.target.value) || 0 }))}
                          placeholder="0"
                          className="h-8 text-center text-sm"
                        />
                      </div>
                    ))}
                  </div>
                  <div className={`text-sm mt-2 font-medium ${isBalanced ? 'text-green-600' : 'text-red-500'}`}>
                    {isBalanced ? '✓ Payment balanced' : `⚠ Collected ₹${payTotal.toFixed(2)} of ₹${discountedTotal.toFixed(2)}`}
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPaymentOrder(null); setPaymentDiscount(0); }}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={isCompletingPayment || !paymentOrder}
              onClick={() => paymentOrder && completeWithPayment(paymentOrder)}
            >
              {isCompletingPayment ? '⏳ Processing...' : '✅ Complete Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
