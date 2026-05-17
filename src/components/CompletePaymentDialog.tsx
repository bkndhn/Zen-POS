import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Minus, Trash2, Percent, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react';
import { getShortUnit, formatQuantityWithUnit, isWeightOrVolumeUnit } from '@/utils/timeUtils';
import { isValidPhoneNumber } from '@/utils/whatsappBillShare';
import { toast } from '@/hooks/use-toast';


interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  unit?: string;
  base_value?: number;
  quantity_step?: number;
}

interface PaymentType {
  id: string;
  payment_type: string;
  is_disabled: boolean;
  is_default: boolean;
}

interface AdditionalCharge {
  id: string;
  name: string;
  charge_type: 'fixed' | 'per_unit' | 'percentage';
  amount: number;
  unit?: string;
  description?: string;
  is_active: boolean;
  is_default: boolean;
}

interface CompletePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartItem[];
  paymentTypes: PaymentType[];
  additionalCharges: AdditionalCharge[];
  onUpdateQuantity: (itemId: string, change: number) => void;
  onRemoveItem: (itemId: string) => void;
  onCompletePayment: (paymentData: {
    paymentMethod: string;
    paymentAmounts: Record<string, number>;
    discount: number;
    discountType: 'flat' | 'percentage';
    additionalCharges: { name: string; amount: number; enabled: boolean }[];
    finalItems?: CartItem[];
    customerMobile?: string;
    sendWhatsApp?: boolean;
    customerGstin?: string;
    orderType?: 'dine_in' | 'parcel';
  }) => void;
  whatsappEnabled?: boolean;
  whatsappShareMode?: 'text' | 'image';
  gstEnabled?: boolean;
  showOrderType?: boolean;
}

export const CompletePaymentDialog: React.FC<CompletePaymentDialogProps> = ({
  open,
  onOpenChange,
  cart,
  paymentTypes,
  additionalCharges,
  onUpdateQuantity,
  onRemoveItem,
  onCompletePayment,
  whatsappEnabled = false,
  whatsappShareMode = 'text',
  gstEnabled = false,
  showOrderType = false
}) => {
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, number>>({});
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'flat' | 'percentage'>('flat');
  const [selectedCharges, setSelectedCharges] = useState<Record<string, boolean>>({});
  const [itemTotalOverrides, setItemTotalOverrides] = useState<Record<string, number>>({});
  const [chargeAmountOverrides, setChargeAmountOverrides] = useState<Record<string, number>>({});
  const [itemQuantityOverrides, setItemQuantityOverrides] = useState<Record<string, number>>({});
  const [showDiscount, setShowDiscount] = useState(false);
  const [customerMobile, setCustomerMobile] = useState('');
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [customerGstin, setCustomerGstin] = useState('');
  const [orderType, setOrderType] = useState<'dine_in' | 'parcel'>('dine_in');

  const hasInitialized = React.useRef(false);

  // Get total quantity for charges (smart count: 1 for weighted items, sum for pieces)
  const getSmartTotalQuantity = () => {
    return cart.reduce((qty, item) => {
      const effectiveQty = getEffectiveQty(item);
      if (effectiveQty <= 0) return qty;
      if (isWeightOrVolumeUnit(item.unit)) {
        return qty + 1;
      }
      return qty + effectiveQty;
    }, 0);
  };

  // Get effective quantity for an item
  const getEffectiveQty = (item: CartItem) => {
    return itemQuantityOverrides[item.id] !== undefined ? itemQuantityOverrides[item.id] : item.quantity;
  };

  // Handle +/- button clicks - update local state
  const handleQuantityChange = (itemId: string, change: number) => {
    setItemQuantityOverrides(prev => {
      const currentItem = cart.find(item => item.id === itemId);
      if (!currentItem) return prev;
      const currentQty = prev[itemId] !== undefined ? prev[itemId] : currentItem.quantity;
      const step = currentItem.quantity_step || 1;
      const actualChange = change > 0 ? step : -step;
      const newQty = Math.max(0, currentQty + actualChange);
      return { ...prev, [itemId]: newQty };
    });
  };

  // Calculate subtotal with price and quantity overrides
  const cartSubtotal = cart.reduce((sum, item) => {
    const effectiveQty = getEffectiveQty(item);
    if (itemTotalOverrides[item.id] !== undefined) {
      return sum + itemTotalOverrides[item.id];
    }
    const baseValue = item.base_value || 1;
    const itemTotal = (effectiveQty / baseValue) * item.price;
    return sum + itemTotal;
  }, 0);

  const totalAdditionalCharges = additionalCharges
    .filter(charge => selectedCharges[charge.id])
    .reduce((sum, charge) => {
      const overrideAmount = chargeAmountOverrides[charge.id];
      if (overrideAmount !== undefined) {
        return sum + overrideAmount;
      }
      if (charge.charge_type === 'fixed') {
        return sum + charge.amount;
      } else if (charge.charge_type === 'per_unit') {
        const totalQuantity = getSmartTotalQuantity();
        return sum + (charge.amount * totalQuantity);
      } else if (charge.charge_type === 'percentage') {
        return sum + (cartSubtotal * charge.amount / 100);
      }
      return sum;
    }, 0);

  const subtotal = cartSubtotal + totalAdditionalCharges;
  const discountAmount = discountType === 'percentage'
    ? (subtotal * discount) / 100
    : discount;
  const total = subtotal - discountAmount;
  const totalPaymentAmount = Object.values(paymentAmounts).reduce((sum, amount) => sum + amount, 0);
  const remaining = total - totalPaymentAmount;

  const handlePaymentAmountChange = (paymentType: string, amount: number) => {
    setPaymentAmounts(prev => ({ ...prev, [paymentType]: amount || 0 }));
  };

  const handleCompletePayment = () => {
    const totalQuantity = getSmartTotalQuantity();

    const selectedAdditionalCharges = additionalCharges
      .filter(charge => selectedCharges[charge.id])
      .map(charge => {
        const overrideAmount = chargeAmountOverrides[charge.id];
        const amount = overrideAmount !== undefined ? overrideAmount :
          charge.charge_type === 'fixed' ? charge.amount :
            charge.charge_type === 'per_unit' ? charge.amount * totalQuantity :
              cartSubtotal * charge.amount / 100;

        return { name: charge.name, amount, enabled: true };
      });

    const finalItems = cart.map(item => {
      const effectiveQty = getEffectiveQty(item);
      const baseValue = item.base_value || 1;
      let finalPrice = item.price;

      // If the total was overridden, we need to calculate what the unit price should be
      // so that (qty / base_value) * finalPrice = overriddenTotal
      if (itemTotalOverrides[item.id] !== undefined) {
        const overriddenTotal = itemTotalOverrides[item.id];
        if (effectiveQty > 0) {
          finalPrice = (overriddenTotal * baseValue) / effectiveQty;
        }
      }

      return {
        ...item,
        price: finalPrice,
        quantity: effectiveQty
      };
    });

    // Filter paymentAmounts to only include non-zero entries
    const filteredPaymentAmounts: Record<string, number> = {};
    Object.entries(paymentAmounts).forEach(([method, amount]) => {
      if (amount > 0) {
        filteredPaymentAmounts[method] = amount;
      }
    });

    // Determine primary payment method (the one with highest amount)
    const primaryPaymentMethod = Object.entries(filteredPaymentAmounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || paymentTypes[0]?.payment_type || 'cash';

    onCompletePayment({
      paymentMethod: primaryPaymentMethod,
      paymentAmounts: filteredPaymentAmounts,
      discount: discountAmount,
      discountType,
      additionalCharges: selectedAdditionalCharges,
      finalItems: finalItems,
      customerMobile: customerMobile.trim() || undefined,
      sendWhatsApp: whatsappShareMode === 'image' ? whatsappEnabled : (sendWhatsApp && customerMobile.trim().length > 0),
      customerGstin: customerGstin.trim() || undefined,
      orderType: showOrderType ? orderType : undefined
    });
  };

  const handleChargeToggle = (chargeId: string) => {
    setSelectedCharges(prev => ({ ...prev, [chargeId]: !prev[chargeId] }));
  };

  React.useEffect(() => {
    if (!open) {
      hasInitialized.current = false;
      setSelectedCharges({});
      setPaymentAmounts({});
      setDiscount(0);
      setDiscountType('flat');
      setItemTotalOverrides({});
      setChargeAmountOverrides({});
      setItemQuantityOverrides({});
      setShowDiscount(false);
      setCustomerMobile('');
      setSendWhatsApp(false);
      setOrderType('dine_in');
    }
  }, [open]);

  React.useEffect(() => {
    if (open && paymentTypes.length > 0 && !hasInitialized.current) {
      hasInitialized.current = true;

      const defaultCharges: Record<string, boolean> = {};
      additionalCharges.forEach(charge => {
        if (charge.is_active) {
          defaultCharges[charge.id] = true;
        }
      });
      setSelectedCharges(defaultCharges);

      const defaultPayment = paymentTypes.find(p => p.is_default);
      if (defaultPayment && total > 0) {
        setPaymentAmounts({ [defaultPayment.payment_type]: total });
      }
    }
  }, [open, paymentTypes, additionalCharges, total]);

  React.useEffect(() => {
    if (open && hasInitialized.current) {
      const selectedPaymentType = Object.entries(paymentAmounts).find(([_, amount]) => amount > 0)?.[0];
      if (selectedPaymentType) {
        setPaymentAmounts({ [selectedPaymentType]: total });
      }
    }
  }, [total, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md h-[100dvh] sm:h-[95vh] flex flex-col p-0 gap-0 overflow-hidden border-2 border-primary/20 sm:rounded-lg rounded-none">
        <DialogHeader className="p-2.5 pb-2 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground flex-shrink-0">
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <span className="bg-white/20 p-1 rounded text-xs">💳</span>
            Complete Payment
          </DialogTitle>
        </DialogHeader>

        {/* Payment Methods - ALWAYS AT TOP for easy access */}
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 p-2 border-b border-primary/10 flex-shrink-0">
          <h3 className="font-semibold text-sm mb-1.5 text-orange-700 dark:text-orange-400">Payment Methods *</h3>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(paymentTypes.length, 4)}, minmax(0, 1fr))` }}>
            {paymentTypes.map((payment) => (
              <div key={payment.id} className="flex flex-col items-center">
                <Button
                  variant={paymentAmounts[payment.payment_type] > 0 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPaymentAmounts({ [payment.payment_type]: total })}
                  className={`capitalize text-xs h-8 w-full font-bold rounded-lg transition-all duration-200 mb-1 ${paymentAmounts[payment.payment_type] > 0 ? 'bg-gradient-to-r from-primary to-primary/80 shadow-md' : 'bg-white dark:bg-gray-800'}`}
                >
                  {payment.payment_type}
                </Button>
                <Input
                  type="number"
                  value={paymentAmounts[payment.payment_type] || 0}
                  onChange={(e) => handlePaymentAmountChange(payment.payment_type, Number(e.target.value))}
                  className="h-8 text-sm text-center bg-white dark:bg-gray-800 font-bold border-2 border-primary/20 focus:border-primary rounded-lg w-full"
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
              </div>
            ))}
          </div>
          {remaining !== 0 && (
            <div className="text-right mt-1">
              <span className={`text-xs font-semibold ${remaining > 0 ? 'text-red-500' : 'text-green-500'}`}>
                Remaining: ₹{remaining.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Order Type - Dine In / Parcel */}
        {showOrderType && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 p-2 border-b border-primary/10 flex-shrink-0">
            <RadioGroup
              value={orderType}
              onValueChange={(v) => setOrderType(v as 'dine_in' | 'parcel')}
              className="flex gap-4"
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="dine_in" />
                <span className={`text-xs font-semibold ${orderType === 'dine_in' ? 'text-primary' : 'text-muted-foreground'}`}>🍽️ Dine In</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="parcel" />
                <span className={`text-xs font-semibold ${orderType === 'parcel' ? 'text-primary' : 'text-muted-foreground'}`}>📦 Parcel</span>
              </label>
            </RadioGroup>
          </div>
        )}

        <div className="flex-1 overflow-hidden p-2 flex flex-col gap-1.5">
          {/* Order Summary - Expanded to fill available space */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="font-bold text-sm flex items-center justify-between bg-muted/50 p-2 rounded-lg mb-1.5">
              <span>Order Summary ({cart.length} items)</span>
              <span className="text-primary font-bold text-base">₹{cartSubtotal.toFixed(2)}</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {cart.map((item, index) => {
                const effectiveQty = getEffectiveQty(item);
                const isTotalOverridden = itemTotalOverrides[item.id] !== undefined;
                const lineTotal = isTotalOverridden ? itemTotalOverrides[item.id] : (effectiveQty / (item.base_value || 1)) * item.price;


                // Pastel colors for cart items - cycling
                const colorClasses = [
                  "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800",
                  "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800",
                  "bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800",
                  "bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800",
                  "bg-pink-50 border-pink-200 dark:bg-pink-900/20 dark:border-pink-800"
                ];
                const colorClass = colorClasses[index % colorClasses.length];

                return (
                  <div key={item.id} className={`flex items-center justify-between p-1.5 rounded-lg gap-1 border ${colorClass}`}>
                    <div className="flex-1 min-w-0 mr-1">
                      <div className="font-semibold truncate text-sm">{index + 1}.{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        ₹{item.price}/{item.base_value || 1}{getShortUnit(item.unit)}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleQuantityChange(item.id, -1)}
                        className="h-6 w-6 p-0 rounded-full bg-[hsl(var(--btn-decrement))] text-white border-0 hover:opacity-80"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        value={effectiveQty}
                        onChange={(e) => {
                          const newQty = Number(e.target.value) || 0;
                          setItemQuantityOverrides(prev => ({ ...prev, [item.id]: newQty }));
                        }}
                        className="h-7 w-12 text-xs text-center p-0 border-primary/30 rounded font-bold"
                        min="0"
                        step={isWeightOrVolumeUnit(item.unit) ? "0.001" : "1"}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleQuantityChange(item.id, 1)}
                        className="h-6 w-6 p-0 rounded-full bg-[hsl(var(--btn-increment))] text-white border-0 hover:opacity-80"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <span className="text-xs text-muted-foreground mx-0.5">×</span>
                      <Input
                        type="number"
                        value={itemTotalOverrides[item.id] !== undefined ? itemTotalOverrides[item.id] : (effectiveQty / (item.base_value || 1)) * item.price}
                        onChange={(e) => {
                          const newTotal = Number(e.target.value) || 0;
                          setItemTotalOverrides(prev => ({ ...prev, [item.id]: newTotal }));
                        }}
                        className="h-7 w-16 text-xs text-center p-0 border-orange-400 bg-orange-50 dark:bg-orange-900/30 rounded font-bold"
                        min="0"
                        step="1"
                        title="Edit total price"
                      />
                      <Button size="sm" variant="ghost" onClick={() => onRemoveItem(item.id)} className="h-6 w-6 p-0 text-destructive hover:bg-red-50">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Additional Charges - Compact */}
          {additionalCharges.length > 0 && (
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 rounded-lg p-1.5 flex-shrink-0">
              <h3 className="font-semibold text-xs mb-1 text-primary">Additional Charges</h3>
              <div className="space-y-0.5">
                {additionalCharges.map((charge) => {
                  const isSelected = selectedCharges[charge.id];
                  const totalQuantity = getSmartTotalQuantity();
                  const baseAmount = charge.charge_type === 'fixed' ? charge.amount :
                    charge.charge_type === 'per_unit' ? charge.amount * totalQuantity :
                      cartSubtotal * charge.amount / 100;
                  const displayAmount = chargeAmountOverrides[charge.id] !== undefined ? chargeAmountOverrides[charge.id] : baseAmount;

                  return (
                    <div
                      key={charge.id}
                      className="flex items-center gap-1.5 p-1 rounded bg-white/50 dark:bg-gray-800/50 cursor-pointer hover:bg-white/80 dark:hover:bg-gray-800/80 transition-colors"
                      onClick={() => handleChargeToggle(charge.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleChargeToggle(charge.id)}
                        className="h-3.5 w-3.5 rounded-sm data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <span className={`text-xs font-medium flex-1 truncate ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
                        {charge.name}
                        {charge.charge_type === 'per_unit' && <span className="text-[10px] ml-0.5">(₹{charge.amount}/{charge.unit})</span>}
                        {charge.charge_type === 'percentage' && <span className="text-[10px] ml-0.5">({charge.amount}%)</span>}
                      </span>
                      <Input
                        type="number"
                        value={displayAmount}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const newAmount = Number(e.target.value) || 0;
                          setChargeAmountOverrides(prev => ({ ...prev, [charge.id]: newAmount }));
                        }}
                        className="h-6 w-14 text-xs text-center p-0 border-cyan-400 bg-cyan-50 dark:bg-cyan-900/30 rounded font-bold"
                        min="0"
                        step="1"
                        disabled={!isSelected}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Discount - Collapsible, compact */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-lg flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowDiscount(!showDiscount)}
              className="w-full p-1.5 flex items-center justify-between text-left hover:bg-green-100/50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-green-600" />
                <span className="font-semibold text-xs text-green-700 dark:text-green-400">
                  Discount {discountAmount > 0 && <span className="text-green-600">(−₹{discountAmount.toFixed(2)})</span>}
                </span>
              </div>
              {showDiscount ? <ChevronUp className="w-3.5 h-3.5 text-green-600" /> : <ChevronDown className="w-3.5 h-3.5 text-green-600" />}
            </button>
            {showDiscount && (
              <div className="px-1.5 pb-1.5">
                <div className="flex items-center gap-1">
                  <Select value={discountType} onValueChange={(value: 'flat' | 'percentage') => setDiscountType(value)}>
                    <SelectTrigger className="w-14 h-7 text-xs bg-white dark:bg-gray-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flat">₹</SelectItem>
                      <SelectItem value="percentage">%</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                    className="flex-1 h-7 text-xs bg-white dark:bg-gray-800"
                    placeholder="0"
                    min="0"
                    step={discountType === 'percentage' ? '1' : '0.01'}
                    max={discountType === 'percentage' ? '100' : undefined}
                  />
                </div>
              </div>
            )}
          </div>

          {/* WhatsApp Bill Share - Only if enabled in settings */}
          {whatsappEnabled && (
            <div className="bg-gradient-to-r from-green-50 to-teal-50 dark:from-green-950/20 dark:to-teal-950/20 rounded-lg p-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#25D366] flex-shrink-0" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                <span className="font-semibold text-xs text-green-700 dark:text-green-400 flex-1">
                  {whatsappShareMode === 'image' ? 'Share Bill Image' : 'Send Bill via WhatsApp'}
                </span>
              </div>
              {whatsappShareMode === 'text' ? (
                <div className="mt-1.5">
                  <Input
                    type="tel"
                    value={customerMobile}
                    onChange={(e) => { setCustomerMobile(e.target.value); setSendWhatsApp(true); }}
                    placeholder="Customer mobile (e.g. 9876543210)"
                    className="h-8 text-xs bg-white dark:bg-gray-800"
                  />
                  {customerMobile && !isValidPhoneNumber(customerMobile) && (
                    <p className="text-[10px] text-red-500 mt-0.5">Enter valid 10-digit number</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">Text bill will be sent after payment</p>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground mt-1">Bill image will open share dialog after payment</p>
              )}
            </div>
          )}

          {/* Customer GSTIN for B2B bills - Only if GST enabled */}
          {gstEnabled && (
            <div className="flex-shrink-0">
              <div className="flex items-center gap-2">
                <Input
                  value={customerGstin}
                  onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                  placeholder="Customer GSTIN (for B2B bills)"
                  className="flex-1 h-8 text-xs font-mono"
                  maxLength={15}
                />
              </div>
              {customerGstin && customerGstin.length > 0 && customerGstin.length !== 15 && (
                <p className="text-[10px] text-amber-500 mt-0.5">GSTIN must be 15 characters</p>
              )}
            </div>
          )}
        </div>

        {/* Summary - Fixed at bottom */}
        <div className="border-t-2 border-primary/20 p-2.5 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900 dark:to-slate-900 flex-shrink-0">
          <div className="space-y-0.5 text-xs">
            <div className="flex justify-between font-medium">
              <span>Subtotal:</span>
              <span>₹{cartSubtotal.toFixed(2)}</span>
            </div>
            {additionalCharges.filter(charge => selectedCharges[charge.id]).map((charge) => {
              const totalQuantity = getSmartTotalQuantity();
              const displayAmount = chargeAmountOverrides[charge.id] !== undefined ? chargeAmountOverrides[charge.id] :
                charge.charge_type === 'fixed' ? charge.amount :
                  charge.charge_type === 'per_unit' ? charge.amount * totalQuantity :
                    cartSubtotal * charge.amount / 100;
              return (
                <div key={charge.id} className="flex justify-between text-primary">
                  <span>{charge.name}:</span>
                  <span>+₹{displayAmount.toFixed(2)}</span>
                </div>
              );
            })}
            {discountAmount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount:</span>
                <span>-₹{discountAmount.toFixed(2)}</span>
              </div>
            )}
          </div>
          <div className="flex justify-between font-bold text-base pt-1.5 mt-1.5 border-t border-primary/20">
            <span>Total:</span>
            <span className="text-primary text-lg">₹{total.toFixed(2)}</span>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 h-10 text-sm font-semibold">
              Cancel
            </Button>
            <Button
              onClick={handleCompletePayment}
              disabled={remaining !== 0}
              className="flex-1 h-10 text-sm font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg"
            >
              Complete Payment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
