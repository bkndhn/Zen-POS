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
import { useTranslation } from 'react-i18next';
import { UpiPrePaymentDialog } from '@/components/UpiPrePaymentDialog';


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
  const { t } = useTranslation();
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
  const [showUpiDialog, setShowUpiDialog] = useState(false);

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

  const validateCheckoutForm = () => {
    if (!name.trim()) {
      toast({ title: t('menu.nameRequired') || 'Name is required', variant: 'destructive' });
      return false;
    }
    if (!validatePhone(phone)) {
      toast({ title: t('menu.phoneRequired') || 'Valid 10-digit phone required (starts with 6-9)', variant: 'destructive' });
      return false;
    }
    if (orderType === 'delivery' && !address.trim()) {
      toast({ title: 'Delivery address is required', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handlePlaceOrder = async (payMethod: 'pay_on_pickup' | 'upi', utr = '') => {
    setIsSubmitting(true);
    try {
      let deviceId = localStorage.getItem('zenpos_remote_device_id');
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('zenpos_remote_device_id', deviceId);
      }
      const { data: blocked } = await (supabase as any).rpc('is_device_blocked', { p_admin_id: adminId, p_device_id: deviceId });
      if (blocked) throw new Error('Device is blocked from placing orders.');
      const { data: activeOrder } = await (supabase as any).rpc('get_active_remote_order_for_device', { p_admin_id: adminId, p_branch_id: branchId ?? null, p_device_id: deviceId });
      if (activeOrder) throw new Error('You already have an active order.');
      let orderNumber = 1;
      let insertedOrderId = '';
      const orderPayload: any = {
        admin_id: adminId, branch_id: branchId, device_id: deviceId,
        customer_name: name, customer_phone: phone, order_type: orderType,
        customer_address: orderType === 'delivery' ? address : null,
        delivery_address: orderType === 'delivery' ? address : null,
        delivery_distance_km: distanceKm, is_scheduled: isScheduled,
        scheduled_for: isScheduled && scheduledTime ? scheduledTime : null,
        subtotal, tax_total: tax, delivery_fee: deliveryFee, packaging_fee: packagingFee,
        surge_fee: surgeFee, tip_amount: tip, total_amount: grandTotal,
        payment_mode: payMethod === 'upi' ? 'upi' : 'pay_on_pickup', payment_method: payMethod,
        pickup_pin: Math.floor(1000 + Math.random() * 9000).toString(),
        items: cart.map(item => ({ ...item, qty: getDisplayQty(item) })),
      };
      if (utr) orderPayload.payment_reference = utr;
      const { data: rpcRes, error: rpcErr } = await (supabase as any).rpc('public_place_remote_order', { p_order: orderPayload });
      if (!rpcErr && rpcRes?.id) {
        insertedOrderId = rpcRes.id;
        orderNumber = rpcRes.order_number || 1;
      } else {
        const { data: orderNumberRes } = await supabase.rpc('get_next_remote_order_number', { p_admin_id: adminId, p_branch_id: branchId });
        orderNumber = Number(orderNumberRes) || 1;
        const { data: insertedOrder, error: insertErr } = await (supabase as any)
          .from('remote_orders')
          .insert({ ...orderPayload, order_number: orderNumber, status: 'pending', is_paid: false })
          .select('id, order_number').maybeSingle();
        if (insertErr) throw insertErr;
        insertedOrderId = insertedOrder?.id;
        if (!insertedOrderId) {
          const { data: aO } = await (supabase as any).rpc('get_active_remote_order_for_device', { p_admin_id: adminId, p_branch_id: branchId, p_device_id: deviceId });
          if (aO?.id) insertedOrderId = aO.id;
          else throw new Error('Order was placed but could not be retrieved. Please check with the shop.');
        }
      }
      try {
        await (supabase as any).rpc('public_upsert_customer', { p_admin_id: adminId, p_branch_id: branchId, p_phone: phone.trim(), p_name: name.trim() });
      } catch (custErr) { console.warn('[RemoteCheckout] Customer upsert notice:', custErr); }
      toast({ title: 'Order Placed!', description: utr ? `Payment ref: ${utr}` : "We'll notify you when it's ready." });
      onOrderPlaced(insertedOrderId);
    } catch (e: any) {
      toast({ title: 'Failed to place order', description: e.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpiClick = () => {
    if (!validateCheckoutForm()) return;
    if (shopSettings.upi_id) { setShowUpiDialog(true); }
    else { handlePlaceOrder('pay_on_pickup'); }
  };

  const handlePayOnPickupClick = () => {
    if (!validateCheckoutForm()) return;
    handlePlaceOrder('pay_on_pickup');
  };

  const handleUpiConfirm = (utr: string) => {
    setShowUpiDialog(false);
    handlePlaceOrder('upi', utr);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('menu.completeYourOrder') || 'Complete Your Order'}</DialogTitle>
            <DialogDescription>{t('menu.fillDetails') || 'Fill in your details to checkout.'}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('menu.nameStar') || 'Name *'}</Label>
              <Input style={{ '--tw-ring-color': shopSettings?.menu_primary_color || '#ea580c' } as React.CSSProperties} className="focus-visible:ring-1" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('menu.namePlaceholder') || 'John Doe'} />
            </div>

            <div className="space-y-2">
              <Label>{t('menu.phoneStar') || 'Phone *'}</Label>
              <Input style={{ '--tw-ring-color': shopSettings?.menu_primary_color || '#ea580c' } as React.CSSProperties} className="focus-visible:ring-1" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" maxLength={10} />
            </div>

            {shopSettings.remote_order_modes === 'both' && (
              <div className="flex gap-2 p-1 bg-muted rounded-md">
                <Button variant={orderType === 'pickup' ? 'default' : 'ghost'} className="flex-1" onClick={() => setOrderType('pickup')} style={orderType === 'pickup' ? { backgroundColor: shopSettings?.menu_primary_color || '#ea580c', color: '#fff' } : {}}>
                  <ShoppingBag className="w-4 h-4 mr-2" />
                  Pickup
                </Button>
                <Button variant={orderType === 'delivery' ? 'default' : 'ghost'} className="flex-1" onClick={() => setOrderType('delivery')} style={orderType === 'delivery' ? { backgroundColor: shopSettings?.menu_primary_color || '#ea580c', color: '#fff' } : {}}>
                  <MapPin className="w-4 h-4 mr-2" />
                  Delivery
                </Button>
              </div>
            )}

            {orderType === 'delivery' && (
              <div className="space-y-2">
                <Label>{t('menu.deliveryAddressStar') || 'Delivery Address *'}</Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={handleGetLocation} disabled={isGettingLocation}>
                    <MapPin className="w-4 h-4" />
                  </Button>
                  <Input style={{ '--tw-ring-color': shopSettings?.menu_primary_color || '#ea580c' } as React.CSSProperties} className="flex-1 focus-visible:ring-1" value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={t('menu.addressPlaceholder') || 'Enter full address'}
                  />
                </div>
                {distanceKm !== null && (
                  <p className="text-xs text-muted-foreground">{t('menu.estDistance') || 'Est. Distance:'} {distanceKm.toFixed(1)} km</p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input type="checkbox" id="sched" checked={isScheduled} onChange={(e) => setIsScheduled(e.target.checked)} className="w-4 h-4" />
              <Label htmlFor="sched">{t('menu.orderForLater') || 'Order for Later'}</Label>
            </div>

            {isScheduled && (
              <div className="space-y-2">
                <Label>{t('menu.scheduledTime') || 'Scheduled Time'}</Label>
                <Input style={{ '--tw-ring-color': shopSettings?.menu_primary_color || '#ea580c' } as React.CSSProperties} className="focus-visible:ring-1" type="datetime-local" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
              </div>
            )}

            <Card>
              <CardContent className="p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>{t('menu.subtotal') || 'Subtotal'}</span>
                  <span>&#8377;{subtotal.toFixed(2)}</span>
                </div>
                {tax > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t('menu.tax') || 'Tax'}</span>
                    <span>&#8377;{tax.toFixed(2)}</span>
                  </div>
                )}
                {orderType === 'delivery' && deliveryFee > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t('menu.deliveryFee') || 'Delivery Fee'}</span>
                    <span>&#8377;{deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                {packagingFee > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t('menu.packaging') || 'Packaging'}</span>
                    <span>&#8377;{packagingFee.toFixed(2)}</span>
                  </div>
                )}
                {surgeFee > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t('menu.surgeFee') || 'Surge Fee'}</span>
                    <span>&#8377;{surgeFee.toFixed(2)}</span>
                  </div>
                )}

                {shopSettings.tipping_enabled && (
                  <div className="pt-2 border-t">
                    <Label className="mb-2 block">{t('menu.addTip') || 'Add Tip'}</Label>
                    <div className="flex flex-wrap gap-2">
                      {[0, 20, 50].map((amt) => (
                        <Badge key={amt} variant={tipAmount === amt ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setTipAmount(amt)} style={tipAmount === amt ? { backgroundColor: shopSettings?.menu_primary_color || '#ea580c', color: '#fff' } : {}}>
                          &#8377;{amt}
                        </Badge>
                      ))}
                      <Badge variant={tipAmount === -1 ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setTipAmount(-1)} style={tipAmount === -1 ? { backgroundColor: shopSettings?.menu_primary_color || '#ea580c', color: '#fff' } : {}}>
                        Custom
                      </Badge>
                    </div>
                    {tipAmount === -1 && (
                      <Input style={{ '--tw-ring-color': shopSettings?.menu_primary_color || '#ea580c' } as React.CSSProperties} className="mt-2 focus-visible:ring-1" type="number"
                        placeholder={t('menu.enterTip') || 'Enter tip amount'}
                        value={customTip}
                        onChange={(e) => setCustomTip(e.target.value)}
                      />
                    )}
                  </div>
                )}

                <div className="flex justify-between font-bold text-lg pt-2 border-t mt-2">
                  <span>{t('menu.total', 'Total')}</span>
                  <span>&#8377;{grandTotal.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2 pt-2">
              {shopSettings?.require_payment_before_order && (
                <p className="text-xs text-amber-600 font-medium text-center py-1">
                  Payment required — please pay via UPI to confirm your order
                </p>
              )}
              {!shopSettings?.require_payment_before_order && (
                <Button className="w-full hover:opacity-90 transition-opacity" onClick={handlePayOnPickupClick} disabled={isSubmitting} style={{ backgroundColor: shopSettings?.menu_primary_color || '#ea580c', color: '#fff' }}>
                  <Banknote className="w-4 h-4 mr-2" />
                  {t('menu.payAt', 'Pay at')} {orderType === 'delivery' ? (t('menu.delivery') || 'Delivery') : (t('menu.pickup') || 'Pickup')}
                </Button>
              )}

              {shopSettings.upi_id && (
                <Button
                  variant={shopSettings?.require_payment_before_order ? 'default' : 'outline'}
                  className="w-full"
                  onClick={handleUpiClick}
                  disabled={isSubmitting}
                  style={shopSettings?.require_payment_before_order ? { backgroundColor: shopSettings?.menu_primary_color || '#ea580c', color: '#fff' } : {}}
                >
                  <CreditCard className="w-4 h-4 mr-2" />{t('menu.payViaUPI') || 'Pay via UPI'}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* UPI Pre-Payment Dialog */}
      {shopSettings.upi_id && (
        <UpiPrePaymentDialog
          isOpen={showUpiDialog}
          onClose={() => setShowUpiDialog(false)}
          onConfirm={handleUpiConfirm}
          amount={grandTotal}
          upiId={shopSettings.upi_id}
          upiName={shopSettings.upi_name || shopSettings.shop_name || 'Store'}
          orderLabel={${orderType === 'delivery' ? 'Delivery' : 'Pickup'} Order}
          requirePayment={!!shopSettings?.require_payment_before_order}
          shopPrimaryColor={shopSettings?.menu_primary_color || '#ea580c'}
        />
      )}
    </>
  );
};
