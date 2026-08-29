import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Package, Truck, Phone, MessageCircle, Map, Ban, Clock } from 'lucide-react';

interface RemoteOrdersKDSProps {
  adminId: string;
  branchId: string;
}

export const RemoteOrdersKDS: React.FC<RemoteOrdersKDSProps> = ({ adminId, branchId }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dialog states
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [prepTime, setPrepTime] = useState<string>('15');
  const [customPrepTime, setCustomPrepTime] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const audioContext = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Request notification permission
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  const { status: realtimeStatus } = useResilientChannel({
    channelName: adminId && branchId ? `kds:remote_orders:${branchId}` : null,
    table: 'remote_orders',
    filter: `admin_id=eq.${adminId}`,
    onResync: () => fetchOrders(),
    onChange: (payload: any) => {
      if (payload.eventType === 'INSERT' && payload.new?.branch_id === branchId) {
        playChime();
        showNotification(payload.new.customer_name);
        setOrders(prev => (prev.some(o => o.id === payload.new.id) ? prev : [payload.new, ...prev]));
      } else if (payload.eventType === 'UPDATE' && payload.new?.branch_id === branchId) {
        setOrders(prev => {
          const updated = prev.map(o => (o.id === payload.new.id ? payload.new : o));
          return updated.filter(o => !['completed', 'cancelled', 'no_show'].includes(o.status));
        });
      }
    },
  });


  const fetchOrders = async () => {
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

  const playChime = () => {
    try {
      if (!audioContext.current) {
        audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContext.current;
      
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
      new Notification('New Remote Order!', { body: `Order from ${customerName || 'Customer'}` });
    }
  };

  const updateOrderStatus = async (id: string, status: string, additionalFields: any = {}) => {
    try {
      const { error } = await (supabase as any)
        .from('remote_orders')
        .update({ status, ...additionalFields })
        .eq('id', id);

      if (error) throw error;
      
      if (['completed', 'cancelled', 'no_show'].includes(status)) {
        setOrders(prev => prev.filter(o => o.id !== id));
      } else {
        setOrders(prev => prev.map(o => o.id === id ? { ...o, status, ...additionalFields } : o));
      }
      
      toast({ title: `Order ${status.replace('_', ' ')}` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: err.message });
    }
  };

  
  const handleCompleteOrder = async (id: string) => {
    try {
      // 1. Fetch branch setting to check flow
      const { data: settings } = await (supabase as any)
        .from('shop_settings')
        .select('remote_order_flow')
        .eq('user_id', adminId)
        .eq('branch_id', branchId)
        .maybeSingle();

      const flow = settings?.remote_order_flow || 'manual_settle';

      if (flow === 'auto_settle') {
        const { data, error } = await (supabase as any).rpc('process_remote_order_auto_settle', {
          p_order_id: id
        });
        if (error) throw error;
        toast({ title: 'Order Completed & Auto-Settled', description: 'Bill successfully generated.' });
        setOrders(prev => prev.filter(o => o.id !== id));
      } else {
        // Manual Settle - just update the status so the cashier knows to bill it, or complete it here and assume they billed it
        await updateOrderStatus(id, 'completed', { completed_at: new Date().toISOString() });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Action failed', description: err.message });
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

  const blockDevice = async (deviceId: string) => {
    if (!deviceId) return;
    try {
      const { error } = await (supabase as any)
        .from('blocked_devices')
        .insert({ 
          admin_id: adminId, 
          branch_id: branchId, 
          device_id: deviceId,
          reason: 'Blocked from KDS'
        });
      if (error) throw error;
      toast({ title: 'Device blocked successfully' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to block device', description: err.message });
    }
  };

  const formatTimeAgo = (dateString: string) => {
    if (!dateString) return '';
    const diff = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 60000);
    if (diff < 1) return 'Just now';
    if (diff === 1) return '1 min ago';
    return `${diff} mins ago`;
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading orders...</div>;
  if (orders.length === 0) return <div className="p-8 text-center text-muted-foreground">No active remote orders.</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {orders.map((order) => (
        <Card key={order.id} className="flex flex-col border-2" style={{
          borderColor: order.status === 'pending' ? 'var(--orange-500)' : 
                       order.status === 'accepted' ? 'var(--blue-500)' :
                       order.status === 'preparing' ? 'var(--yellow-500)' :
                       order.status === 'ready' ? 'var(--green-500)' : 'var(--border)'
        }}>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl">#{order.order_number}</CardTitle>
                <div className="font-semibold mt-1">{order.customer_name || 'Guest'}</div>
                <div className="text-sm text-muted-foreground">{order.customer_phone}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge variant={order.order_type === 'delivery' ? 'default' : 'secondary'} className="flex items-center gap-1">
                  {order.order_type === 'delivery' ? <Truck className="w-3 h-3" /> : <Package className="w-3 h-3" />}
                  {order.order_type?.toUpperCase()}
                </Badge>
                <div className="text-xs font-medium flex items-center gap-1 text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {formatTimeAgo(order.created_at)}
                </div>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="flex-1 pb-2 text-sm space-y-3">
            <div className="bg-muted/50 p-2 rounded-md max-h-40 overflow-y-auto">
              {Array.isArray(order.items) && order.items.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between py-1 border-b last:border-0 border-border/50">
                  <span><span className="font-medium">{(item.qty ?? item.quantity)}x</span> {item.name}</span>
                  <span>₹{(item.price * (item.qty ?? item.quantity)).toFixed(2)}</span>
                </div>
              ))}
            </div>
            
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>₹{order.total_amount}</span>
            </div>

            {order.order_type === 'delivery' && order.delivery_address && (
              <div className="text-xs bg-blue-50 dark:bg-blue-900/20 p-2 rounded text-blue-800 dark:text-blue-200">
                <strong>Delivery to:</strong><br />
                {order.delivery_address}
              </div>
            )}
            
            <div className="flex flex-wrap gap-2 pt-2">
              {order.customer_phone && (
                <>
                  <Button size="sm" variant="outline" className="h-8 flex-1" asChild>
                    <a href={`tel:${order.customer_phone}`}><Phone className="w-3 h-3 mr-1" /> Call</a>
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 flex-1" asChild>
                    <a href={`https://wa.me/91${order.customer_phone}?text=Hi ${order.customer_name}, regarding your order ${order.order_number}...`} target="_blank" rel="noreferrer"><MessageCircle className="w-3 h-3 mr-1" /> WhatsApp</a>
                  </Button>
                </>
              )}
              {order.order_type === 'delivery' && order.customer_latitude && order.customer_longitude && (
                 <Button size="sm" variant="outline" className="h-8 flex-1" asChild>
                   <a href={`https://www.google.com/maps/dir/?api=1&destination=${order.customer_latitude},${order.customer_longitude}`} target="_blank" rel="noreferrer"><Map className="w-3 h-3 mr-1" /> Map</a>
                 </Button>
              )}
              {order.device_id && (
                <Button size="sm" variant="ghost" className="h-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => blockDevice(order.device_id)}>
                  <Ban className="w-3 h-3" />
                </Button>
              )}
            </div>
          </CardContent>
          
          <CardFooter className="pt-2 flex-col gap-2">
            {order.status === 'pending' && (
              <div className="flex gap-2 w-full">
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => { setSelectedOrder(order); setAcceptDialogOpen(true); }}>
                  Accept
                </Button>
                <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => { setSelectedOrder(order); setRejectDialogOpen(true); }}>
                  Reject
                </Button>
              </div>
            )}
            
            {(order.status === 'accepted' || order.status === 'preparing') && (
              <div className="grid grid-cols-2 gap-2 w-full">
                {order.status === 'accepted' && (
                  <Button variant="outline" onClick={() => updateOrderStatus(order.id, 'preparing')}>Mark Preparing</Button>
                )}
                <Button className="bg-green-600 hover:bg-green-700" onClick={() => updateOrderStatus(order.id, 'ready', { ready_at: new Date().toISOString() })}>
                  Mark Ready
                </Button>
                <Button variant="destructive" className={order.status === 'preparing' ? 'col-span-2' : ''} onClick={() => updateOrderStatus(order.id, 'cancelled')}>
                  Cancel
                </Button>
              </div>
            )}
            
            {order.status === 'ready' && (
              <div className="flex gap-2 w-full">
                {order.order_type === 'delivery' ? (
                  <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => updateOrderStatus(order.id, 'out_for_delivery')}>
                    Out for Delivery
                  </Button>
                ) : (
                  <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => updateOrderStatus(order.id, 'completed', { completed_at: new Date().toISOString() })}>
                    Mark Completed
                  </Button>
                )}
                <Button variant="outline" className="flex-1" onClick={() => updateOrderStatus(order.id, 'no_show')}>No Show</Button>
              </div>
            )}

            {order.status === 'out_for_delivery' && (
              <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => updateOrderStatus(order.id, 'completed', { completed_at: new Date().toISOString() })}>
                Mark Completed
              </Button>
            )}
          </CardFooter>
        </Card>
      ))}

      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept Order #{selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Label>Estimated Prep Time (Minutes)</Label>
            <Select value={prepTime} onValueChange={setPrepTime}>
              <SelectTrigger>
                <SelectValue placeholder="Select time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 minutes</SelectItem>
                <SelectItem value="10">10 minutes</SelectItem>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
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
            <Button onClick={handleAccept}>Confirm Accept</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Order #{selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Label>Rejection Reason</Label>
            <Input 
              placeholder="e.g. Items out of stock, Too busy..." 
              value={rejectReason} 
              onChange={e => setRejectReason(e.target.value)} 
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectReason.trim()}>Confirm Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
