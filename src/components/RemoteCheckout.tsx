import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Clock, Banknote, ShoppingBag, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface RemoteCheckoutProps {
  isOpen: boolean;
  onClose: () => void;
  cart: Array<{ id: string; name: string; price: number; quantity: number; instructions?: string; tax_rate_id?: string; is_tax_inclusive?: boolean }>;
  adminId: string;
  branchId: string;
  shopSettings: any;
  taxRates: any[];
  onOrderPlaced: (orderId: string) => void;
}

// Haversine formula
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export const RemoteCheckout: React.FC<RemoteCheckoutProps> = ({
  isOpen,
  onClose,
  cart,
  adminId,
  branchId,
  shopSettings,
  taxRates,
  onOrderPlaced
}) => {
  const { toast } = useToast();
  
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>(shopSettings.remote_order_modes === 'delivery' ? 'delivery' : 'pickup');
  const [address, setAddress] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [tipAmount, setTipAmount] = useState<number>(0);
  const [customTip, setCustomTip] = useState('');
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (shopSettings.remote_order_modes === 'delivery') setOrderType('delivery');
    else if (shopSettings.remote_order_modes === 'pickup') setOrderType('pickup');
  }, [shopSettings.remote_order_modes]);

  const handleGetLocation = () => {
    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        if (shopSettings.shop_latitude && shopSettings.shop_longitude) {
          const dist = calculateDistance(latitude, longitude, shopSettings.shop_latitude, shopSettings.shop_longitude);
          if (shopSettings.max_delivery_radius_km && dist > shopSettings.max_delivery_radius_km) {
            toast({
              title: "Out of Delivery Range",
              description: `You are ${dist.toFixed(1)}km away. Max delivery radius is ${shopSettings.max_delivery_radius_km}km.`,
              variant: "destructive"
            });
            setIsGettingLocation(false);
            return;
          }
          setDistanceKm(dist);
        }
        
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
          const data = await res.json();
          if (data && data.display_name) {
            setAddress(data.display_name);
          }
        } catch (e) {
          console.error("Geocoding failed", e);
        }
        setIsGettingLocation(false);
      },
      (error) => {
        toast({
          title: "Location Error",
          description: error.message,
          variant: "destructive"
        });
        setIsGettingLocation(false);
      },
      { enableHighAccuracy: true }
    );
  };

  // item.quantity is in raw base units (e.g. 200 for 200ml); divide by base_value to get display units
  const getDisplayQty = (item: any) => item.quantity / (item.base_value || 1);
  const subtotal = cart.reduce((acc, item) => acc + (item.price * getDisplayQty(item)), 0);
  
  const tax = cart.reduce((acc, item) => {
    const rate = taxRates.find(t => t.id === item.tax_rate_id)?.rate || 0;
    const lineTotal = item.price * getDisplayQty(item);
    if (item.is_tax_inclusive) {
      return acc + (lineTotal - (lineTotal / (1 + rate / 100)));
    } else {
      return acc + (lineTotal * (rate / 100));
    }
  }, 0);

  let deliveryFee = 0;
  if (orderType === 'delivery') {
    if (shopSettings.delivery_fee_mode === 'flat') {
      deliveryFee = shopSettings.delivery_fee_flat || 0;
    } else if (shopSettings.delivery_fee_mode === 'distance') {
      const distToUse = distanceKm || 0;
      const extraKm = Math.max(0, distToUse - (shopSettings.delivery_fee_free_km || 0));
      deliveryFee = (shopSettings.delivery_fee_base || 0) + (extraKm * (shopSettings.delivery_fee_per_km || 0));
    }
  }

  let packagingFee = 0;
  if (shopSettings.packaging_fee_mode === 'flat') {
    packagingFee = shopSettings.packaging_fee_value || 0;
  } else if (shopSettings.packaging_fee_mode === 'percentage') {
    packagingFee = subtotal * ((shopSettings.packaging_fee_value || 0) / 100);
  }

  const surgeFee = shopSettings.surge_fee_enabled ? (shopSettings.surge_fee_amount || 0) : 0;
  const tip = tipAmount === -1 ? Number(customTip || 0) : tipAmount;
  const grandTotal = subtotal + tax + deliveryFee + packagingFee + surgeFee + tip;

  const validatePhone = (p: string) => /^[6-9]\d{9}$/.test(p);

  const handlePlaceOrder = async (payMethod: 'pay_on_pickup' | 'upi') => {
    if (!name.trim()) {
      return toast({ title: "Name is required", variant: "destructive" });
    }
    if (!validatePhone(phone)) {
      return toast({ title: "Valid 10-digit phone number starting with 6-9 is required", variant: "destructive" });
    }
    if (orderType === 'delivery' && !address.trim()) {
      return toast({ title: "Delivery address is required", variant: "destructive" });
    }

    setIsSubmitting(true);
    try {
      let deviceId = localStorage.getItem('zenpos_remote_device_id');
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('zenpos_remote_device_id', deviceId);
      }

      const { data: blocked } = await (supabase as any)
        .from('blocked_devices')
        .select('*')
        .eq('device_id', deviceId)
        .eq('admin_id', adminId)
        .single();
      
      if (blocked) {
        throw new Error("Device is blocked from placing orders.");
      }

      const { data: activeOrder } = await (supabase as any)
        .from('remote_orders')
        .select('*')
        .eq('device_id', deviceId)
        .eq('admin_id', adminId)
        .not('status', 'in', '(completed,cancelled,no_show)')
        .maybeSingle();

      if (activeOrder) {
        throw new Error("You already have an active order.");
      }

      const { data: orderNumberRes, error: orderNumErr } = await supabase.rpc('get_next_remote_order_number', {
        p_admin_id: adminId,
        p_branch_id: branchId
      });
      
      if (orderNumErr) throw orderNumErr;
      const orderNumber = orderNumberRes;

      const orderData = {
        admin_id: adminId,
        branch_id: branchId,
        device_id: deviceId,
        order_number: orderNumber,
        customer_name: name,
        customer_phone: phone,
        order_type: orderType,
        customer_address: orderType === 'delivery' ? address : null,
        delivery_address: orderType === 'delivery' ? address : null,
        delivery_distance_km: distanceKm,
        is_scheduled: isScheduled,
        scheduled_for: isScheduled && scheduledTime ? scheduledTime : null,
        subtotal,
        tax_total: tax,
        delivery_fee: deliveryFee,
        packaging_fee: packagingFee,
        surge_fee: surgeFee,
        tip_amount: tip,
        total_amount: grandTotal,
        payment_mode: payMethod === 'upi' ? 'upi' : 'pay_on_pickup',
        payment_method: payMethod,
        status: 'pending',
        // Store display qty (divided by base_value) so the KDS/tracker shows correct numbers
        items: cart.map(item => ({ ...item, qty: getDisplayQty(item) })),
        is_paid: false
      };

      const { data: insertedOrder, error: insertErr } = await (supabase as any)
        .from('remote_orders')
        .insert(orderData)
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Upsert customer in customers table
      try {
        const nowIso = new Date().toISOString();
        await (supabase as any).from('customers').upsert(
          {
            admin_id: adminId,
            branch_id: branchId,
            phone: phone.trim(),
            name: name.trim(),
            last_visit: nowIso,
            updated_at: nowIso,
            created_at: nowIso
          },
          { onConflict: 'admin_id,phone' }
        );
      } catch (custErr) {
        console.warn('[RemoteCheckout] Customer upsert notice:', custErr);
      }

      toast({ title: "Order Placed successfully!" });
      onOrderPlaced(insertedOrder.id);
      
      if (payMethod === 'upi' && shopSettings.upi_id) {
        const upiUrl = `upi://pay?pa=${shopSettings.upi_id}&pn=${encodeURIComponent(shopSettings.upi_name || 'Store')}&am=${grandTotal.toFixed(2)}&tn=Order+${orderNumber}`;
        window.location.href = upiUrl;
      }
      
    } catch (e: any) {
      toast({ title: "Failed to place order", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Complete Your Order</DialogTitle>
          <DialogDescription>Fill in your details to checkout.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
          </div>

          <div className="space-y-2">
            <Label>Phone *</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" maxLength={10} />
          </div>

          {shopSettings.remote_order_modes === 'both' && (
            <div className="flex gap-2 p-1 bg-muted rounded-md">
              <Button 
                variant={orderType === 'pickup' ? 'default' : 'ghost'} 
                className="flex-1"
                onClick={() => setOrderType('pickup')}
              >
                <ShoppingBag className="w-4 h-4 mr-2" />
                Pickup
              </Button>
              <Button 
                variant={orderType === 'delivery' ? 'default' : 'ghost'} 
                className="flex-1"
                onClick={() => setOrderType('delivery')}
              >
                <MapPin className="w-4 h-4 mr-2" />
                Delivery
              </Button>
            </div>
          )}

          {orderType === 'delivery' && (
            <div className="space-y-2">
              <Label>Delivery Address *</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={handleGetLocation} disabled={isGettingLocation}>
                  <MapPin className="w-4 h-4" />
                </Button>
                <Input 
                  value={address} 
                  onChange={(e) => setAddress(e.target.value)} 
                  placeholder="Enter full address" 
                  className="flex-1"
                />
              </div>
              {distanceKm !== null && (
                <p className="text-xs text-muted-foreground">Est. Distance: {distanceKm.toFixed(1)} km</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input type="checkbox" id="sched" checked={isScheduled} onChange={(e) => setIsScheduled(e.target.checked)} className="w-4 h-4" />
            <Label htmlFor="sched">Order for Later</Label>
          </div>
          
          {isScheduled && (
            <div className="space-y-2">
              <Label>Scheduled Time</Label>
              <Input type="datetime-local" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
            </div>
          )}

          <Card>
            <CardContent className="p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              {tax > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span>₹{tax.toFixed(2)}</span>
                </div>
              )}
              {orderType === 'delivery' && deliveryFee > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Delivery Fee</span>
                  <span>₹{deliveryFee.toFixed(2)}</span>
                </div>
              )}
              {packagingFee > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Packaging</span>
                  <span>₹{packagingFee.toFixed(2)}</span>
                </div>
              )}
              {surgeFee > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Surge Fee</span>
                  <span>₹{surgeFee.toFixed(2)}</span>
                </div>
              )}
              
              {shopSettings.tipping_enabled && (
                <div className="pt-2 border-t">
                  <Label className="mb-2 block">Add Tip</Label>
                  <div className="flex flex-wrap gap-2">
                    {[0, 20, 50].map((amt) => (
                      <Badge 
                        key={amt} 
                        variant={tipAmount === amt ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => setTipAmount(amt)}
                      >
                        ₹{amt}
                      </Badge>
                    ))}
                    <Badge 
                      variant={tipAmount === -1 ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => setTipAmount(-1)}
                    >
                      Custom
                    </Badge>
                  </div>
                  {tipAmount === -1 && (
                    <Input 
                      type="number" 
                      placeholder="Enter tip amount" 
                      className="mt-2"
                      value={customTip}
                      onChange={(e) => setCustomTip(e.target.value)}
                    />
                  )}
                </div>
              )}

              <div className="flex justify-between font-bold text-lg pt-2 border-t mt-2">
                <span>Total</span>
                <span>₹{grandTotal.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2 pt-2">
            <Button 
              className="w-full" 
              onClick={() => handlePlaceOrder('pay_on_pickup')}
              disabled={isSubmitting}
            >
              <Banknote className="w-4 h-4 mr-2" />
              Pay at {orderType === 'delivery' ? 'Delivery' : 'Pickup'}
            </Button>
            
            {shopSettings.upi_id && (
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => handlePlaceOrder('upi')}
                disabled={isSubmitting}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Pay via UPI
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
