import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/hooks/use-toast';
import {
  ShoppingCart, Search, Plus, Minus, Trash2, Receipt,
  X, UtensilsCrossed, Package, Printer, MessageSquare, RefreshCw,
  Banknote, Smartphone, CreditCard, ChefHat
} from 'lucide-react';

// ── Sample Data ──────────────────────────────────────────────────────────────
const DEMO_CATEGORIES = ['All', 'Breakfast', 'Lunch', 'Snacks', 'Beverages', 'Desserts'];

const DEMO_ITEMS = [
  { id: '1', name: 'Idli (2 pcs)', price: 30, category: 'Breakfast', veg: true },
  { id: '2', name: 'Masala Dosa', price: 60, category: 'Breakfast', veg: true },
  { id: '3', name: 'Vada (2 pcs)', price: 35, category: 'Breakfast', veg: true },
  { id: '4', name: 'Pongal', price: 50, category: 'Breakfast', veg: true },
  { id: '5', name: 'Poori Set', price: 65, category: 'Breakfast', veg: true },
  { id: '6', name: 'Meals (Veg)', price: 100, category: 'Lunch', veg: true },
  { id: '7', name: 'Chicken Biryani', price: 180, category: 'Lunch', veg: false },
  { id: '8', name: 'Mutton Biryani', price: 230, category: 'Lunch', veg: false },
  { id: '9', name: 'Chapati (2 pcs)', price: 40, category: 'Lunch', veg: true },
  { id: '10', name: 'Parotta (2 pcs)', price: 50, category: 'Lunch', veg: true },
  { id: '11', name: 'Chicken 65', price: 160, category: 'Snacks', veg: false },
  { id: '12', name: 'Gobi Manchurian', price: 110, category: 'Snacks', veg: true },
  { id: '13', name: 'Samosa (2 pcs)', price: 30, category: 'Snacks', veg: true },
  { id: '14', name: 'Bajji Plate', price: 40, category: 'Snacks', veg: true },
  { id: '15', name: 'Tea', price: 15, category: 'Beverages', veg: true },
  { id: '16', name: 'Filter Coffee', price: 20, category: 'Beverages', veg: true },
  { id: '17', name: 'Fresh Lime Juice', price: 50, category: 'Beverages', veg: true },
  { id: '18', name: 'Lassi', price: 45, category: 'Beverages', veg: true },
  { id: '19', name: 'Gulab Jamun (2)', price: 40, category: 'Desserts', veg: true },
  { id: '20', name: 'Ice Cream', price: 55, category: 'Desserts', veg: true },
];

const TABLES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];
const DISCOUNTS = [
  { label: 'No Discount', value: 0, type: 'pct' as const },
  { label: '5% OFF', value: 5, type: 'pct' as const },
  { label: '10% OFF', value: 10, type: 'pct' as const },
  { label: '₹50 Flat', value: 50, type: 'flat' as const },
];

interface CartItem { id: string; name: string; price: number; quantity: number; }

// ── Receipt Modal ─────────────────────────────────────────────────────────────
const ReceiptModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onNewOrder: () => void;
  billNo: number;
  cart: CartItem[];
  orderType: 'dine' | 'parcel';
  tableNo: string;
  discount: typeof DISCOUNTS[0];
  packagingCharge: boolean;
  splitPayment: { cash: number; upi: number; card: number };
  customerPhone: string;
}> = ({ open, onClose, onNewOrder, billNo, cart, orderType, tableNo, discount, packagingCharge, splitPayment, customerPhone }) => {
  const subtotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const discountAmt = discount.type === 'pct' ? Math.round(subtotal * discount.value / 100) : discount.value;
  const packaging = packagingCharge && orderType === 'parcel' ? 10 : 0;
  const taxable = subtotal - discountAmt + packaging;
  const gst = Math.round(taxable * 0.05);
  const netTotal = taxable + gst;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[92vw] sm:max-w-md max-h-[90vh] overflow-y-auto p-0 rounded-2xl">
        <DialogHeader className="sr-only"><DialogTitle>Receipt</DialogTitle></DialogHeader>
        {/* Thermal receipt — 58mm style */}
        <div className="bg-white dark:bg-gray-50 text-gray-900 font-mono text-xs p-4 space-y-1.5 max-h-[80vh] overflow-y-auto">
          {/* Header */}
          <div className="text-center space-y-0.5 border-b border-dashed border-gray-400 pb-2 mb-2">
            <p className="font-bold text-sm tracking-widest">ZenPOS DEMO KITCHEN</p>
            <p className="text-[10px]">Tamil Nadu | FSSAI: 12345678901234</p>
            <p className="text-[10px]">GSTIN: 33AABCZ1234A1Z5</p>
            <p className="text-[10px]">Ph: +91 98944 51420</p>
          </div>

          {/* Bill Info */}
          <div className="flex justify-between text-[10px]">
            <span>Bill#: <b>{String(billNo).padStart(4, '0')}</b></span>
            <span>{orderType === 'dine' ? `Table: ${tableNo}` : 'PARCEL'}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span>{dateStr} {timeStr}</span>
            <span>Cashier: Demo</span>
          </div>
          {customerPhone && <p className="text-[10px]">Customer: {customerPhone}</p>}

          {/* Items */}
          <div className="border-t border-dashed border-gray-400 pt-1.5 mt-1.5">
            <div className="flex justify-between font-bold text-[10px] mb-1">
              <span className="flex-1">Item</span>
              <span className="w-6 text-right">Qty</span>
              <span className="w-12 text-right">Rate</span>
              <span className="w-14 text-right">Amt</span>
            </div>
            {cart.map(c => (
              <div key={c.id} className="flex justify-between text-[10px]">
                <span className="flex-1 truncate pr-1">{c.name}</span>
                <span className="w-6 text-right">{c.quantity}</span>
                <span className="w-12 text-right">{c.price}</span>
                <span className="w-14 text-right">{c.price * c.quantity}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-dashed border-gray-400 pt-1.5 mt-1.5 space-y-0.5 text-[10px]">
            <div className="flex justify-between"><span>Subtotal</span><span>₹{subtotal}</span></div>
            {discountAmt > 0 && <div className="flex justify-between text-green-700"><span>Discount ({discount.label})</span><span>-₹{discountAmt}</span></div>}
            {packaging > 0 && <div className="flex justify-between"><span>Packaging</span><span>₹{packaging}</span></div>}
            <div className="flex justify-between"><span>GST @5%</span><span>₹{gst}</span></div>
            <div className="flex justify-between font-bold text-sm border-t border-dashed border-gray-400 pt-1 mt-1">
              <span>NET TOTAL</span><span>₹{netTotal}</span>
            </div>
          </div>

          {/* Payment */}
          <div className="border-t border-dashed border-gray-400 pt-1.5 text-[10px] space-y-0.5">
            {splitPayment.cash > 0 && <div className="flex justify-between"><span>Cash</span><span>₹{splitPayment.cash.toFixed(2)}</span></div>}
            {splitPayment.upi > 0 && <div className="flex justify-between"><span>UPI / QR</span><span>₹{splitPayment.upi.toFixed(2)}</span></div>}
            {splitPayment.card > 0 && <div className="flex justify-between"><span>Card / POS</span><span>₹{splitPayment.card.toFixed(2)}</span></div>}
          </div>

          {/* Footer */}
          <div className="text-center border-t border-dashed border-gray-400 pt-2 mt-2 space-y-0.5 text-[10px] text-gray-600">
            <p>★ Thank you for dining with us! ★</p>
            <p>Powered by ZenPOS · zenpos.app</p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-3 grid grid-cols-3 gap-2 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="text-xs flex-col h-14 gap-1" onClick={() => {
            toast({ title: '🖨️ Simulated Print', description: 'ESC/POS command sent to thermal printer.' });
          }}>
            <Printer className="h-4 w-4" />
            <span>Print</span>
          </Button>
          <Button variant="outline" size="sm" className="text-xs flex-col h-14 gap-1" onClick={() => {
            const msg = encodeURIComponent(`Hi! Your bill from ZenPOS Demo Kitchen — Bill#${billNo}, Total: ₹${netTotal}. Thank you!`);
            window.open(`https://wa.me/?text=${msg}`, '_blank');
          }}>
            <MessageSquare className="h-4 w-4" />
            <span>WhatsApp</span>
          </Button>
          <Button size="sm" className="text-xs flex-col h-14 gap-1" onClick={() => { onNewOrder(); onClose(); }}>
            <RefreshCw className="h-4 w-4" />
            <span>New Order</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Split Payment Modal ───────────────────────────────────────────────────────
const SplitPaymentModal: React.FC<{
  open: boolean;
  onClose: () => void;
  total: number;
  onConfirm: (split: { cash: number; upi: number; card: number }) => void;
}> = ({ open, onClose, total, onConfirm }) => {
  const [cash, setCash] = useState(0);
  const [upi, setUpi] = useState(0);
  const [card, setCard] = useState(0);

  const paid = cash + upi + card;
  const remaining = Math.max(0, total - paid);
  const change = Math.max(0, paid - total);

  const reset = () => { setCash(0); setUpi(0); setCard(0); };

  const handleConfirm = () => {
    if (paid < total) {
      toast({ title: 'Insufficient payment', description: `Still ₹${remaining} remaining.`, variant: 'destructive' });
      return;
    }
    onConfirm({ cash, upi, card });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); reset(); }}>
      <DialogContent className="max-w-[92vw] sm:max-w-md max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" /> Collect Payment
          </DialogTitle>
        </DialogHeader>

        <div className="text-center py-2">
          <p className="text-muted-foreground text-sm">Bill Total</p>
          <p className="text-3xl font-extrabold text-primary">₹{total}</p>
        </div>

        <div className="space-y-3">
          {/* Cash */}
          <div>
            <Label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5">
              <Banknote className="h-3.5 w-3.5 text-green-600" /> Cash
            </Label>
            <div className="flex gap-1.5 mb-1.5 flex-wrap">
              {[total, 100, 200, 500].map(v => (
                <button key={v} onClick={() => setCash(v === total ? total - upi - card : v)}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold border border-green-300 bg-green-50 dark:bg-green-950/40 dark:border-green-800 text-green-800 dark:text-green-300 hover:bg-green-100 transition-colors">
                  {v === total ? 'Exact' : `₹${v}`}
                </button>
              ))}
            </div>
            <Input type="number" min={0} value={cash || ''} onChange={e => setCash(Number(e.target.value) || 0)}
              placeholder="₹0" className="h-9 text-sm" />
          </div>

          {/* UPI */}
          <div>
            <Label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5">
              <Smartphone className="h-3.5 w-3.5 text-blue-600" /> UPI / QR
            </Label>
            <div className="flex gap-1.5 mb-1.5">
              <button onClick={() => setUpi(total - cash - card)}
                className="px-2.5 py-1 rounded-full text-xs font-semibold border border-blue-300 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-800 text-blue-800 dark:text-blue-300 hover:bg-blue-100 transition-colors">
                Remaining ₹{Math.max(0, total - cash - card)}
              </button>
            </div>
            <Input type="number" min={0} value={upi || ''} onChange={e => setUpi(Number(e.target.value) || 0)}
              placeholder="₹0" className="h-9 text-sm" />
          </div>

          {/* Card */}
          <div>
            <Label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5">
              <CreditCard className="h-3.5 w-3.5 text-purple-600" /> Card / POS Machine
            </Label>
            <Input type="number" min={0} value={card || ''} onChange={e => setCard(Number(e.target.value) || 0)}
              placeholder="₹0" className="h-9 text-sm" />
          </div>
        </div>

        {/* Balance summary */}
        <div className="rounded-xl bg-muted p-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Total Paid</span><span className="font-bold">₹{paid}</span></div>
          {remaining > 0 && <div className="flex justify-between text-destructive font-semibold"><span>Remaining</span><span>₹{remaining}</span></div>}
          {change > 0 && <div className="flex justify-between text-green-600 font-semibold"><span>Change Due</span><span>₹{change}</span></div>}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => { onClose(); reset(); }}>Cancel</Button>
          <Button className="flex-1" onClick={handleConfirm} disabled={paid < total}>
            <Receipt className="h-4 w-4 mr-1" /> Confirm & Bill
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Main Demo Billing ─────────────────────────────────────────────────────────
const DemoBilling: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [billCount, setBillCount] = useState(1);

  // Order options
  const [orderType, setOrderType] = useState<'dine' | 'parcel'>('dine');
  const [tableNo, setTableNo] = useState('T1');
  const [packagingCharge, setPackagingCharge] = useState(true);
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedDiscount, setSelectedDiscount] = useState(DISCOUNTS[0]);

  // Modals
  const [showPayment, setShowPayment] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [lastSplit, setLastSplit] = useState({ cash: 0, upi: 0, card: 0 });

  const filteredItems = useMemo(() =>
    DEMO_ITEMS.filter(item =>
      (selectedCategory === 'All' || item.category === selectedCategory) &&
      item.name.toLowerCase().includes(search.toLowerCase())
    ), [search, selectedCategory]);

  const addToCart = (item: typeof DEMO_ITEMS[0]) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) =>
    setCart(prev => prev.flatMap(c => {
      if (c.id !== id) return [c];
      const q = c.quantity + delta;
      return q <= 0 ? [] : [{ ...c, quantity: q }];
    }));

  const subtotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const discountAmt = selectedDiscount.type === 'pct'
    ? Math.round(subtotal * selectedDiscount.value / 100)
    : Math.min(selectedDiscount.value, subtotal);
  const packaging = packagingCharge && orderType === 'parcel' ? 10 : 0;
  const taxable = subtotal - discountAmt + packaging;
  const gst = Math.round(taxable * 0.05);
  const total = taxable + gst;

  const handleConfirmPayment = (split: { cash: number; upi: number; card: number }) => {
    setLastSplit(split);
    setShowPayment(false);
    setShowReceipt(true);
    toast({ title: `✅ Bill #${String(billCount).padStart(4,'0')} Created!`, description: `Total ₹${total} • ${cart.length} item types` });
  };

  const handleNewOrder = () => {
    setBillCount(p => p + 1);
    setCart([]);
    setSelectedDiscount(DISCOUNTS[0]);
    setCustomerPhone('');
  };

  const exitDemo = () => { localStorage.removeItem('hotel_pos_demo_mode'); navigate('/landing'); };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Demo Header */}
      <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-950/30 text-xs font-bold">
            DEMO MODE
          </Badge>
          <span className="text-xs text-muted-foreground hidden sm:inline">Sample data — nothing is saved</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">Bill #{String(billCount).padStart(4, '0')}</span>
          <Button variant="ghost" size="sm" onClick={exitDemo} className="text-xs h-7">
            <X className="h-3 w-3 mr-1" /> Exit
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* ── LEFT: Items panel ── */}
        <div className="flex-1 flex flex-col p-3 sm:p-4 overflow-hidden min-h-0 pb-20 lg:pb-4">
          {/* Order Type Bar */}
          <div className="flex items-center gap-2 mb-3 overflow-x-auto scrollbar-hide flex-nowrap pb-1">
            <button
              onClick={() => setOrderType('dine')}
              className={`shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold border transition-all ${orderType === 'dine' ? 'bg-primary text-primary-foreground border-primary shadow' : 'bg-background border-border hover:border-primary/40'}`}
            >
              <UtensilsCrossed className="h-4 w-4" /> Dine In
            </button>
            <button
              onClick={() => setOrderType('parcel')}
              className={`shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold border transition-all ${orderType === 'parcel' ? 'bg-primary text-primary-foreground border-primary shadow' : 'bg-background border-border hover:border-primary/40'}`}
            >
              <Package className="h-4 w-4" /> Parcel
            </button>
            {orderType === 'dine' && (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide flex-nowrap pl-1">
                {TABLES.map(t => (
                  <button key={t} onClick={() => setTableNo(t)}
                    className={`shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-xs font-bold border transition-all ${tableNo === t ? 'bg-primary text-primary-foreground border-primary shadow-xs' : 'bg-background border-border hover:border-primary/40'}`}>
                    {t}
                  </button>
                ))}
              </div>
            )}
            {orderType === 'parcel' && (
              <label className="shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap bg-muted/60 px-2.5 py-1.5 rounded-lg border">
                <input type="checkbox" checked={packagingCharge} onChange={e => setPackagingCharge(e.target.checked)} className="accent-primary" />
                +₹10 Packing
              </label>
            )}
          </div>

          {/* Search & Customer Phone */}
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 w-full" />
            </div>
            <Input placeholder="Customer mobile (optional)" value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              className="h-9 text-sm w-full sm:w-48" />
          </div>

          {/* Categories */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-2 mb-2">
            {DEMO_CATEGORIES.map(cat => (
              <button key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${selectedCategory === cat ? 'bg-primary text-primary-foreground border-primary shadow' : 'bg-background border-border hover:border-primary/40'}`}>
                {cat}
              </button>
            ))}
          </div>

          {/* Items Grid */}
          <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 content-start">
            {filteredItems.map(item => {
              const inCart = cart.find(c => c.id === item.id);
              return (
                <button key={item.id} onClick={() => addToCart(item)}
                  className={`relative p-3 rounded-xl border text-left transition-all hover:shadow-md active:scale-95 ${inCart ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card hover:border-primary/40'}`}>
                  {inCart && (
                    <span className="absolute top-2 right-2 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground font-bold text-[11px] flex items-center justify-center shadow-sm pointer-events-none ring-2 ring-background">
                      {inCart.quantity}
                    </span>
                  )}
                  <div className="flex items-center gap-1 mb-1">
                    <span className={`w-2 h-2 rounded-full border ${item.veg ? 'border-green-600 bg-green-500' : 'border-red-600 bg-red-500'}`} />
                  </div>
                  <p className="font-medium text-sm leading-tight mb-1">{item.name}</p>
                  <p className="text-primary font-bold text-sm">₹{item.price}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: Cart panel ── */}
        <div className="hidden lg:flex lg:w-80 xl:w-96 border-l border-border flex-col bg-card">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2 text-sm">
              <ShoppingCart className="h-4 w-4 text-primary" />
              {orderType === 'dine' ? `Dine In — ${tableNo}` : 'Parcel / Takeaway'}
            </h3>
            <span className="text-xs text-muted-foreground">{cart.length} item{cart.length !== 1 ? 's' : ''}</span>
          </div>

          {/* KOT indicator */}
          {cart.length > 0 && (
            <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <ChefHat className="h-3 w-3" />
              <span className="font-medium">KOT auto-sent to kitchen on bill</span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[28vh] lg:max-h-none">
            {cart.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">Tap items to add to cart</p>
            ) : cart.map(item => (
              <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">₹{item.price} × {item.quantity} = ₹{item.price * item.quantity}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => updateQuantity(item.id, -1)} className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted"><Minus className="h-3 w-3" /></button>
                  <span className="text-sm w-5 text-center font-bold">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, 1)} className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted"><Plus className="h-3 w-3" /></button>
                  <button onClick={() => updateQuantity(item.id, -item.quantity)} className="h-6 w-6 rounded flex items-center justify-center text-destructive hover:bg-destructive/10"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Discount */}
          {cart.length > 0 && (
            <div className="px-3 py-2 border-t border-border">
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">Quick Discount</p>
              <div className="flex gap-1.5 flex-wrap">
                {DISCOUNTS.map(d => (
                  <button key={d.label} onClick={() => setSelectedDiscount(d)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${selectedDiscount.label === d.label ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:border-primary/40'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Summary & CTA */}
          <div className="p-3 border-t border-border space-y-2">
            {cart.length > 0 && (
              <div className="bg-muted/50 rounded-xl p-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>₹{subtotal}</span></div>
                {discountAmt > 0 && <div className="flex justify-between text-green-600"><span>Discount ({selectedDiscount.label})</span><span>-₹{discountAmt}</span></div>}
                {packaging > 0 && <div className="flex justify-between"><span>Packaging</span><span>+₹{packaging}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">GST @5%</span><span>₹{gst}</span></div>
                <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
                  <span>Total</span><span className="text-primary">₹{total}</span>
                </div>
              </div>
            )}
            <Button className="w-full" size="lg" disabled={cart.length === 0} onClick={() => setShowPayment(true)}>
              <Receipt className="mr-2 h-4 w-4" />
              {cart.length === 0 ? 'Add Items to Cart' : `Collect Payment — ₹${total}`}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Sticky Bottom Cart Bar */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border p-3 flex items-center justify-between shadow-2xl">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground font-medium">{cart.length} item{cart.length !== 1 ? 's' : ''} in cart</span>
            <span className="text-base font-extrabold text-primary">₹{total}</span>
          </div>
          <Button size="sm" onClick={() => setMobileCartOpen(true)} className="gap-1.5 px-4 h-10 shadow-md">
            <ShoppingCart className="h-4 w-4" />
            View Cart & Bill
          </Button>
        </div>
      )}

      {/* Mobile Cart Sheet */}
      <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] p-0 flex flex-col rounded-t-2xl">
          <SheetHeader className="p-4 border-b border-border">
            <SheetTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" />
                {orderType === 'dine' ? `Dine In — ${tableNo}` : 'Parcel / Takeaway'}
              </span>
              <span className="text-xs text-muted-foreground font-normal">{cart.length} item{cart.length !== 1 ? 's' : ''}</span>
            </SheetTitle>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[40vh]">
            {cart.map(item => (
              <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">₹{item.price} × {item.quantity} = ₹{item.price * item.quantity}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => updateQuantity(item.id, -1)} className="h-7 w-7 rounded border border-border flex items-center justify-center hover:bg-muted"><Minus className="h-3.5 w-3.5" /></button>
                  <span className="text-sm w-6 text-center font-bold">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, 1)} className="h-7 w-7 rounded border border-border flex items-center justify-center hover:bg-muted"><Plus className="h-3.5 w-3.5" /></button>
                  <button onClick={() => updateQuantity(item.id, -item.quantity)} className="h-7 w-7 rounded flex items-center justify-center text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="px-4 py-2 border-t border-border bg-muted/20">
            <p className="text-xs text-muted-foreground mb-1.5 font-medium">Quick Discount</p>
            <div className="flex gap-1.5 flex-wrap">
              {DISCOUNTS.map(d => (
                <button key={d.label} onClick={() => setSelectedDiscount(d)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${selectedDiscount.label === d.label ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:border-primary/40'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 border-t border-border space-y-3 bg-card">
            <div className="bg-muted/50 rounded-xl p-3 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>₹{subtotal}</span></div>
              {discountAmt > 0 && <div className="flex justify-between text-green-600"><span>Discount ({selectedDiscount.label})</span><span>-₹{discountAmt}</span></div>}
              {packaging > 0 && <div className="flex justify-between"><span>Packaging</span><span>+₹{packaging}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">GST @5%</span><span>₹{gst}</span></div>
              <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
                <span>Total</span><span className="text-primary">₹{total}</span>
              </div>
            </div>
            <Button className="w-full h-11 text-sm font-semibold" onClick={() => { setMobileCartOpen(false); setShowPayment(true); }}>
              <Receipt className="mr-2 h-4 w-4" />
              Collect Payment — ₹{total}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modals */}
      <SplitPaymentModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        total={total}
        onConfirm={handleConfirmPayment}
      />
      <ReceiptModal
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        onNewOrder={handleNewOrder}
        billNo={billCount}
        cart={cart}
        orderType={orderType}
        tableNo={tableNo}
        discount={selectedDiscount}
        packagingCharge={packagingCharge}
        splitPayment={lastSplit}
        customerPhone={customerPhone}
      />
    </div>
  );
};

export default DemoBilling;
