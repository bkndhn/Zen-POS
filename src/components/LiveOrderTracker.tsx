import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Phone, MessageCircle, Star, X, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface LiveOrderTrackerProps {
  orderId: string;
  onClose: () => void;
  onOrderComplete?: () => void;
  isOpen?: boolean;
  shopSettings?: any;
}

export const LiveOrderTracker: React.FC<LiveOrderTrackerProps> = ({ orderId, onClose, onOrderComplete, shopSettings }) => {
  const { toast } = useToast();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [payingOnline, setPayingOnline] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  
  const handleCustomerCancel = async () => {
    if (!cancelReason.trim()) {
      toast({ title: 'Reason required', description: 'Please tell us why you are cancelling.', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase
        .from('online_orders')
        .update({ status: 'cancelled', reject_reason: cancelReason, rejection_reason: cancelReason })
        .eq('id', orderId);
      if (error) throw error;
      toast({ title: 'Order Cancelled', description: 'Your order has been cancelled.' });
      setIsCancelling(false);
    } catch (err) {
      toast({ title: 'Error', description: 'Could not cancel order.', variant: 'destructive' });
    }
  };

  const handlePayOnline = async () => {
    try {
      setPayingOnline(true);
      const deviceId = localStorage.getItem('zenpos_remote_device_id') || '';
      const { data, error } = await supabase.functions.invoke('payments-guest-link', {
        body: { order_id: orderId, device_id: deviceId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const url = (data as any)?.short_url || (data as any)?.redirect_url;
      if (!url) throw new Error('Payment link could not be created.');
      window.location.href = url;
    } catch (err: any) {
      toast({ title: 'Online payment unavailable', description: err.message, variant: 'destructive' });
    } finally {
      setPayingOnline(false);
    }
  };


  useEffect(() => {
    let cancelled = false;
    const deviceId = localStorage.getItem('zenpos_remote_device_id');

    const applyOrder = (newOrder: any) => {
      if (!newOrder || cancelled) return;
      setOrder(newOrder);
      if ((newOrder.status === 'completed' || newOrder.status === 'cancelled' || newOrder.status === 'no_show') && onOrderComplete) {
        setTimeout(() => onOrderComplete(), newOrder.status === 'completed' ? 5000 : 3000);
      }
    };

    const fetchOrder = async (showError = false) => {
      // Guests can only read their own order via a device-scoped secure function
      const { data, error } = await (supabase as any).rpc('get_remote_order_for_device', {
        p_order_id: orderId,
        p_device_id: deviceId,
      });

      if (error && showError) {
        toast({ title: 'Error fetching order', description: error.message, variant: 'destructive' });
      } else if (data) {
        applyOrder(data);
      }
      if (!cancelled) setLoading(false);
    };

    fetchOrder(true);

    // Poll for updates (public realtime reads are intentionally restricted)
    const interval = setInterval(() => fetchOrder(false), 5000);

    const channel = supabase
      .channel(`order_${orderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'remote_orders', filter: `id=eq.${orderId}` },
        (payload) => {
          if (payload.new && Object.keys(payload.new).length > 0) {
            applyOrder(payload.new as any);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [orderId, toast, onOrderComplete]);

  if (loading) {
    return <div className="fixed inset-0 bg-background flex items-center justify-center">Loading...</div>;
  }

  if (!order) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-4">
        <p className="mb-4">Order not found.</p>
        <Button onClick={onClose} className="hover:opacity-90" style={{ backgroundColor: shopSettings?.menu_primary_color || '#ea580c', color: '#fff' }}>Close</Button>
      </div>
    );
  }

  const getStatusIndex = (status: string) => {
    if (status === 'cancelled' || status === 'no_show') return -1;
    const stages = ['pending', 'accepted', 'preparing', 'ready', 'completed'];
    return stages.indexOf(status);
  };

  const statusIndex = getStatusIndex(order.status);
  const isCancelled = order.status === 'cancelled' || order.status === 'no_show';

  const steps = [
    { key: 'pending', label: 'Order Placed', index: 0 },
    { key: 'accepted', label: 'Accepted' + (order.estimated_wait_minutes ? ` (~${order.estimated_wait_minutes} min)` : ''), index: 1 },
    { key: 'preparing', label: 'Preparing', index: 2 },
    { key: 'ready', label: order.order_type === 'delivery' ? 'Out for Delivery' : 'Ready for Pickup', index: 3 },
    { key: 'completed', label: 'Completed', index: 4 }
  ];

  const handleFeedbackSubmit = async () => {
    setSubmittingFeedback(true);
    const deviceId = localStorage.getItem('zenpos_remote_device_id') || '';
    const { data: ok, error } = await (supabase as any).rpc('submit_remote_order_feedback', {
      p_order_id: orderId,
      p_device_id: deviceId,
      p_rating: rating || null,
      p_feedback: feedback
    });

    if (error || ok === false) {
      toast({ title: 'Error', description: 'Failed to submit feedback.', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Thank you for your feedback!' });
      setOrder({ ...order, rating, feedback_text: feedback });
    }
    setSubmittingFeedback(false);
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col overflow-y-auto w-full h-full sm:p-4">
      <div className="bg-card text-card-foreground p-4 sticky top-0 z-10 border-b flex items-center justify-between shadow-sm sm:rounded-t-lg sm:border sm:border-b-0 max-w-md mx-auto w-full">
        <div>
          <h2 className="font-bold text-lg">Order #{order.order_number}</h2>
          <p className="text-sm text-muted-foreground">{shopSettings?.shop_name || 'Store'}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
      </div>

      <div className="flex-1 max-w-md mx-auto w-full p-4 space-y-6 sm:border sm:border-t-0 sm:rounded-b-lg bg-background">
        
        {/* Pickup Security PIN Card */}
        {!isCancelled && order.pickup_pin && (
          <Card className="bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-amber-500/5 border-amber-500/30">
            <CardContent className="p-4 text-center space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center justify-center gap-1.5">
                🔐 Pickup Verification PIN
              </div>
              <div className="text-3xl font-extrabold tracking-widest text-amber-600 dark:text-amber-300 font-mono bg-background/80 py-2 px-4 rounded-xl border border-amber-500/30 inline-block shadow-sm">
                {order.pickup_pin}
              </div>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Show this 4-digit PIN at counter to claim your order, or share it with the person collecting on your behalf.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Animated Timeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Order Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative pl-4 border-l-2 border-muted space-y-6">
              {steps.map((step) => {
                const isCompleted = isCancelled ? false : statusIndex >= step.index;
                const isCurrent = isCancelled ? false : statusIndex === step.index;
                
                let dotColor = 'bg-gray-400';
                if (isCompleted) dotColor = 'bg-green-500';
                if (isCurrent) dotColor = 'bg-blue-500';
                
                return (
                  <div key={step.key} className="relative">
                    <div className={`absolute -left-[21px] w-3 h-3 rounded-full ${dotColor} ${isCurrent ? 'animate-pulse ring-4 ring-blue-500/20' : ''}`} />
                    <p className={`text-sm ${isCompleted || isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                      {step.label}
                    </p>
                  </div>
                );
              })}
              {isCancelled && (
                <div className="relative">
                  <div className="absolute -left-[21px] w-3 h-3 rounded-full bg-red-500 ring-4 ring-red-500/20" />
                  <p className="text-sm font-medium text-red-500">
                    Cancelled {order.reject_reason ? `- ${order.reject_reason}` : ''}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Order Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex justify-between">
              <span>Order Summary</span>
              <Badge variant="outline" className="capitalize">{order.order_type}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 divide-y">
              {order.items?.map((item: any, i: number) => (
                <div key={i} className="flex justify-between py-2 text-sm">
                  <span>{(item.qty ?? item.quantity)}x {item.name}</span>
                  <span>₹{(item.price * (item.qty ?? item.quantity)).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-2 space-y-1 text-sm text-muted-foreground">
              <div className="flex justify-between"><span>Subtotal</span><span>₹{order.subtotal?.toFixed(2)}</span></div>
              {order.tax_total > 0 && <div className="flex justify-between"><span>Tax</span><span>₹{order.tax_total?.toFixed(2)}</span></div>}
              {order.delivery_fee > 0 && <div className="flex justify-between"><span>Delivery</span><span>₹{order.delivery_fee?.toFixed(2)}</span></div>}
              {order.packaging_fee > 0 && <div className="flex justify-between"><span>Packaging</span><span>₹{order.packaging_fee?.toFixed(2)}</span></div>}
              {order.surge_fee > 0 && <div className="flex justify-between"><span>Surge</span><span>₹{order.surge_fee?.toFixed(2)}</span></div>}
              {order.tip_amount > 0 && <div className="flex justify-between"><span>Tip</span><span>₹{order.tip_amount?.toFixed(2)}</span></div>}
            </div>
            <div className="flex justify-between font-bold text-lg pt-2 border-t border-border">
              <span>Total</span>
              <span>₹{order.total_amount?.toFixed(2)}</span>
            </div>

            {order.is_paid ? (
              <Badge className="w-full justify-center py-2 bg-emerald-600 hover:bg-emerald-600">Payment received</Badge>
            ) : !isCancelled && order.status !== 'completed' ? (
              <div className="flex flex-col gap-2">
                <Button className="w-full h-11 gap-2 rounded-xl hover:opacity-90" onClick={handlePayOnline} disabled={payingOnline} style={{ backgroundColor: shopSettings?.menu_primary_color || '#ea580c', color: '#fff' }}>
                  <CreditCard className="w-4 h-4" />
                  {payingOnline ? 'Opening secure payment…' : `Pay ₹${order.total_amount?.toFixed(2)} Online`}
                </Button>
                {shopSettings?.upi_id && (
                  <Button 
                    variant="outline"
                    className="w-full h-11 gap-2 rounded-xl border-green-600 text-green-700 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-900/20" 
                    onClick={() => {
                      const pa = encodeURIComponent(shopSettings.upi_id);
                      const pn = encodeURIComponent(shopSettings.upi_name || shopSettings.shop_name || 'Restaurant');
                      const am = order.total_amount?.toFixed(2);
                      const tr = encodeURIComponent(order.id);
                      window.location.href = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tr=${tr}`;
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5z"/></svg>
                    Pay via UPI App
                  </Button>
                )}
              </div>
            ) : null}
          </CardContent>

        </Card>

        {/* Contact Actions */}
        {!isCancelled && order.status !== 'completed' && (
          <div className="flex gap-2">
            {shopSettings?.contact_number && (
              <Button className="flex-1" variant="outline" onClick={() => window.location.href = `tel:${shopSettings.contact_number}`}>
                <Phone className="w-4 h-4 mr-2" /> Call Shop
              </Button>
            )}
            {shopSettings?.whatsapp && (
              <Button className="flex-1 bg-[#25D366] hover:bg-[#128C7E] text-white" onClick={() => window.location.href = `https://wa.me/91${shopSettings.whatsapp}?text=Hi, I have a query about my order ${order.order_number}`}>
                <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
              </Button>
            )}
          </div>
        )}

        {/* Feedback Section */}
        {order.status === 'completed' && !order.rating && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-center">How was your experience?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star 
                    key={star} 
                    className={`w-8 h-8 cursor-pointer transition-colors ${rating >= star ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`}
                    onClick={() => setRating(star)}
                  />
                ))}
              </div>
              {rating > 0 && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                  <Textarea 
                    placeholder="Tell us what you liked or how we can improve..."
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                  />
                  <Button className="w-full hover:opacity-90" onClick={handleFeedbackSubmit} disabled={submittingFeedback} style={{ backgroundColor: shopSettings?.menu_primary_color || '#ea580c', color: '#fff' }}>
                    Submit Feedback
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        
        {order.status === 'completed' && order.rating && (
          <div className="text-center text-muted-foreground p-4 bg-muted/50 rounded-lg">
            <p>Thank you for your rating of {order.rating} stars!</p>
          </div>
        )}
      </div>
    </div>
  );
};

