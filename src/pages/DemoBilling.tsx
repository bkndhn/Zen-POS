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
  Banknote, Smartphone, CreditCard, ChefHat,
  LayoutGrid, ClipboardList, Armchair, BookOpen, BarChart3,
  Sun, Moon, LogOut, ArrowRight
} from 'lucide-react';

// ── Sample Data ──────────────────────────────────────────────────────────────
const DEMO_CATEGORIES = ['All', 'Starters', 'Mains', 'Tandoor & Bread', 'Rice & Biryani', 'Beverages', 'Desserts'];

const DEMO_ITEMS = [
  { id: '1',  name: 'Chicken Tikka',       price: 280, category: 'Starters',       veg: false },
  { id: '2',  name: 'Paneer Tikka',        price: 240, category: 'Starters',       veg: true  },
  { id: '3',  name: 'Veg Spring Roll',     price: 160, category: 'Starters',       veg: true  },
  { id: '4',  name: 'Fish Amritsari',      price: 320, category: 'Starters',       veg: false },
  { id: '5',  name: 'Butter Chicken',      price: 320, category: 'Mains',          veg: false },
  { id: '6',  name: 'Dal Makhani',         price: 220, category: 'Mains',          veg: true  },
  { id: '7',  name: 'Paneer Butter Masala',price: 280, category: 'Mains',          veg: true  },
  { id: '8',  name: 'Mutton Rogan Josh',   price: 380, category: 'Mains',          veg: false },
  { id: '9',  name: 'Butter Naan',         price: 50,  category: 'Tandoor & Bread',veg: true  },
  { id: '10', name: 'Laccha Paratha',      price: 60,  category: 'Tandoor & Bread',veg: true  },
  { id: '11', name: 'Garlic Naan',         price: 70,  category: 'Tandoor & Bread',veg: true  },
  { id: '12', name: 'Chicken Biryani',     price: 320, category: 'Rice & Biryani', veg: false },
  { id: '13', name: 'Veg Biryani',         price: 240, category: 'Rice & Biryani', veg: true  },
  { id: '14', name: 'Mutton Biryani',      price: 400, category: 'Rice & Biryani', veg: false },
  { id: '15', name: 'Masala Chai',         price: 40,  category: 'Beverages',      veg: true  },
  { id: '16', name: 'Mango Lassi',         price: 80,  category: 'Beverages',      veg: true  },
  { id: '17', name: 'Cold Coffee',         price: 120, category: 'Beverages',      veg: true  },
  { id: '18', name: 'Fresh Lime Soda',     price: 60,  category: 'Beverages',      veg: true  },
  { id: '19', name: 'Gulab Jamun',         price: 100, category: 'Desserts',       veg: true  },
  { id: '20', name: 'Rasgulla',            price: 90,  category: 'Desserts',       veg: true  },
  { id: '21', name: 'Kulfi',              price: 80,  category: 'Desserts',       veg: true  },
];

const TABLES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];
const DISCOUNTS = [
  { label: 'No Discount', value: 0, type: 'pct' as const },
  { label: '5% OFF', value: 5, type: 'pct' as const },
  { label: '10% OFF', value: 10, type: 'pct' as const },
  { label: '₹50 Flat', value: 50, type: 'flat' as const },
];

interface CartItem { id: string; name: string; price: number; quantity: number; }

const ITEM_EMOJI: Record<string, string> = {
  '1': '🍗',
  '2': '🧀',
  '3': '🌯',
  '4': '🐟',
  '5': '🍛',
  '6': '🫘',
  '7': '🧆',
  '8': '🥩',
  '9': '🫓',
  '10': '🫓',
  '11': '🫓',
  '12': '🍚',
  '13': '🌾',
  '14': '🍚',
  '15': '🍵',
  '16': '🥤',
  '17': '☕',
  '18': '🍋',
  '19': '🍮',
  '20': '⚪',
  '21': '🍦',
};

const BESTSELLER_IDS = new Set(['1', '5', '12', '15', '19']);

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

// ── Shared Checkout Ledger Content (Desktop & Mobile Sheet) ───────────────────
const OrderCheckoutContent: React.FC<{
  cart: CartItem[];
  updateQuantity: (id: string, delta: number) => void;
  selectedDiscount: typeof DISCOUNTS[0];
  setSelectedDiscount: (d: typeof DISCOUNTS[0]) => void;
  subtotal: number;
  discountAmt: number;
  packaging: number;
  gst: number;
  total: number;
  paymentMethod: 'Cash' | 'UPI' | 'Card';
  setPaymentMethod: (m: 'Cash' | 'UPI' | 'Card') => void;
  onPay: () => void;
  isMobileSheet?: boolean;
}> = ({
  cart, updateQuantity, selectedDiscount, setSelectedDiscount,
  subtotal, discountAmt, packaging, gst, total,
  paymentMethod, setPaymentMethod, onPay, isMobileSheet = false,
}) => (
  <>
    {/* Order Line Items */}
    <div className={`flex-1 overflow-y-auto p-4 space-y-2.5 min-h-0 ${isMobileSheet ? 'max-h-[36vh]' : ''}`}>
      {cart.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center py-10 px-4">
          <div className="w-12 h-12 rounded-2xl bg-muted dark:bg-[#22262C] flex items-center justify-center mb-3 text-amber-600">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No items in order</p>
          <p className="text-xs text-gray-400 mt-1">Tap dishes on the left to add them here</p>
        </div>
      ) : cart.map(item => (
        <div
          key={item.id}
          className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-[#22262C] border border-border/80 dark:border-[#2C313A] shadow-2xs"
        >
          <div className="w-12 h-12 rounded-lg bg-muted/50 border border-amber-100 flex items-center justify-center text-xl shrink-0">
            {ITEM_EMOJI[item.id] ?? '🍽️'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{item.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">₹{item.price} each</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => updateQuantity(item.id, -1)}
              aria-label={`Decrease ${item.name}`}
              className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-[#2C313A] dark:hover:bg-[#373D48] text-gray-800 dark:text-gray-100 flex items-center justify-center transition-colors"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="text-sm w-5 text-center font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => updateQuantity(item.id, 1)}
              aria-label={`Increase ${item.name}`}
              className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-[#2C313A] dark:hover:bg-[#373D48] text-gray-800 dark:text-gray-100 flex items-center justify-center transition-colors"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 w-12 text-right tabular-nums">
              ₹{item.price * item.quantity}
            </span>
            <button
              type="button"
              onClick={() => updateQuantity(item.id, -item.quantity)}
              aria-label={`Remove ${item.name}`}
              className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>

    {/* Discount Pills */}
    {cart.length > 0 && (
      <div className="px-4 py-2.5 border-t border-border dark:border-border shrink-0">
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5 font-medium">Quick Discount</p>
        <div className="flex gap-1.5 flex-wrap">
          {DISCOUNTS.map(d => (
            <button
              key={d.label}
              type="button"
              onClick={() => setSelectedDiscount(d)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                selectedDiscount.label === d.label
                  ? 'bg-[hsl(var(--primary))] text-white shadow-2xs'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-amber-300 dark:bg-[#22262C] dark:text-gray-300 dark:border-[#323740]'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    )}

    {/* Summary Box, Tender Tabs & Pay CTA */}
    <div className="p-4 border-t border-border dark:border-border space-y-3 shrink-0">
      {cart.length > 0 && (
        <div className="bg-muted dark:bg-[#22262C] p-4 rounded-xl space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-600 dark:text-gray-300">
            <span>Subtotal</span>
            <span className="tabular-nums">₹{subtotal}</span>
          </div>
          {discountAmt > 0 && (
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
              <span>Discount ({selectedDiscount.label})</span>
              <span className="tabular-nums">-₹{discountAmt}</span>
            </div>
          )}
          {packaging > 0 && (
            <div className="flex justify-between text-gray-600 dark:text-gray-300">
              <span>Packaging</span>
              <span className="tabular-nums">+₹{packaging}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-600 dark:text-gray-300">
            <span>GST @5%</span>
            <span className="tabular-nums">₹{gst}</span>
          </div>
          <div className="flex justify-between items-center font-bold text-lg pt-2 border-t border-border dark:border-[#323740] text-gray-900 dark:text-white">
            <span>Total</span>
            <span className="tabular-nums">₹{total}</span>
          </div>
        </div>
      )}

      {/* Payment Tender Tabs */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { id: 'Cash', icon: <Banknote className="h-3.5 w-3.5" /> },
          { id: 'UPI',  icon: <Smartphone className="h-3.5 w-3.5" /> },
          { id: 'Card', icon: <CreditCard className="h-3.5 w-3.5" /> },
        ] as const).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setPaymentMethod(tab.id)}
            className={`py-2 text-xs flex items-center justify-center gap-1.5 transition-all ${
              paymentMethod === tab.id
                ? 'bg-[hsl(var(--primary))] text-white font-semibold rounded-lg shadow-2xs'
                : 'border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-100 dark:border-[#323740] dark:text-gray-300 dark:hover:bg-[#22262C]'
            }`}
          >
            {tab.icon}
            <span>{tab.id}</span>
          </button>
        ))}
      </div>

      {/* Pay CTA Button */}
      <button
        type="button"
        disabled={cart.length === 0}
        onClick={onPay}
        style={{ background: 'hsl(var(--primary))' }}
        className="w-full py-3.5 rounded-xl font-bold text-neutral-950 shadow-md flex items-center justify-center gap-2 transition-all hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Receipt className="h-4 w-4" />
        <span>{cart.length === 0 ? 'Add Items to Cart' : `Pay ₹${total} • ${paymentMethod}`}</span>
        {cart.length > 0 && <ArrowRight className="h-4 w-4" />}
      </button>
    </div>
  </>
);

// ── Main Demo Billing ─────────────────────────────────────────────────────────
const DemoBilling: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [billCount, setBillCount] = useState(1);

  // Order options
  const [orderType, setOrderType] = useState<'dine' | 'parcel'>('dine');
  const [tableNo, setTableNo] = useState('T4');
  const [packagingCharge, setPackagingCharge] = useState(true);
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedDiscount, setSelectedDiscount] = useState(DISCOUNTS[0]);

  // Modals
  const [showPayment, setShowPayment] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [lastSplit, setLastSplit] = useState({ cash: 0, upi: 0, card: 0 });

  // Visual-only UI state
  const [activeNav] = useState<'pos' | 'orders' | 'tables' | 'menu' | 'reports'>('pos');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [guests, setGuests] = useState(4);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  const toggleTheme = () => {
    if (typeof document !== 'undefined') {
      const next = !document.documentElement.classList.contains('dark');
      document.documentElement.classList.toggle('dark', next);
      setIsDark(next);
    }
  };

  const handleNavClick = (navId: 'pos' | 'orders' | 'tables' | 'menu' | 'reports') => {
    if (navId === 'pos') return;
    if (navId === 'tables') {
      setShowTablePicker(prev => !prev);
      toast({ title: 'Table Selector', description: 'Pick Dine In table or Parcel from the order panel.' });
      return;
    }
    toast({
      title: 'Demo Mode Preview',
      description: `${navId.charAt(0).toUpperCase() + navId.slice(1)} is available in the full ZenPOS app. Test live billing right here!`,
    });
  };

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

  const navItems: { id: 'pos' | 'orders' | 'tables' | 'menu' | 'reports'; label: string; icon: React.ReactNode }[] = [
    { id: 'pos',     label: 'POS',     icon: <LayoutGrid className="h-4 w-4" /> },
    { id: 'orders',  label: 'Orders',  icon: <ClipboardList className="h-4 w-4" /> },
    { id: 'tables',  label: 'Tables',  icon: <Armchair className="h-4 w-4" /> },
    { id: 'menu',    label: 'Menu',    icon: <BookOpen className="h-4 w-4" /> },
    { id: 'reports', label: 'Reports', icon: <BarChart3 className="h-4 w-4" /> },
  ];

  const tableDisplayLabel = orderType === 'dine'
    ? `Table ${tableNo.replace(/^T/, '')} • Dine In • ${guests} Guests`
    : 'Parcel • Takeaway';

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex flex-col md:flex-row bg-[#F6F5F2] dark:bg-[#121518]">
      {/* Mobile Obsidian Top Bar */}
      <div className="md:hidden bg-[#14171A] text-white px-4 py-2.5 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="text-lg tracking-tight leading-none">
            <span className="text-white font-black">Zen</span>
            <span style={{ color: 'hsl(var(--primary))' }} className="font-black">POS</span>
          </div>
          <Badge className="bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/40 text-[10px] font-bold px-2 py-0.5 hover:bg-[hsl(var(--primary))]/20">
            DEMO
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400 font-mono">#{String(billCount).padStart(4, '0')}</span>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="w-8 h-8 rounded-lg bg-card dark:bg-card border border-border flex items-center justify-center text-gray-300 hover:text-white"
          >
            {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={exitDemo}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white bg-card dark:bg-card border border-border"
          >
            <X className="h-3.5 w-3.5" /> Exit
          </button>
        </div>
      </div>

      {/* ── LEFT NAVIGATION RAIL ── */}
      <aside className="hidden md:flex md:w-52 lg:w-56 bg-[#14171A] text-white flex-col justify-between p-4 border-r border-border shrink-0">
        <div>
          {/* Brand */}
          <div className="px-2 pt-1 pb-5 border-b border-border/80 mb-4">
            <div className="text-2xl tracking-tight leading-none">
              <span className="text-white font-black">Zen</span>
              <span style={{ color: 'hsl(var(--primary))' }} className="font-black">POS</span>
            </div>
            <p className="text-[11px] italic text-gray-400 mt-1.5 leading-snug">
              Good food brings people together
            </p>
          </div>

          {/* Nav items */}
          <nav className="space-y-1.5">
            {navItems.map(item => {
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-[hsl(var(--primary))] text-white rounded-xl font-semibold shadow-sm'
                      : 'text-gray-400 hover:text-white rounded-xl'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Demo Exit & Online Status */}
        <div className="space-y-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={exitDemo}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white hover:bg-card dark:bg-card border border-border transition-colors"
          >
            <span>Exit Demo</span>
            <LogOut className="h-3.5 w-3.5" />
          </button>

          <div className="flex items-center gap-2 px-2 text-xs text-gray-400">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span>Online • Ver 1.2.0</span>
          </div>
        </div>
      </aside>

      {/* ── CENTER: Main POS Dish Grid ── */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#F6F5F2] dark:bg-[#121518] p-4 sm:p-5 pb-24 lg:pb-5 overflow-hidden">
        {/* Top Demo + Order Type Bar */}
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide flex-nowrap py-0.5">
            <Badge className="shrink-0 bg-[hsl(var(--primary))]/20 text-amber-800 dark:text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/50 text-[11px] font-bold hover:bg-[hsl(var(--primary))]/20">
              DEMO MODE
            </Badge>
            <button
              type="button"
              onClick={() => setOrderType('dine')}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                orderType === 'dine'
                  ? 'bg-[#14171A] text-white dark:bg-[hsl(var(--primary))] dark:text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 dark:bg-card dark:bg-card dark:text-gray-300 dark:border-border'
              }`}
            >
              <UtensilsCrossed className="h-3.5 w-3.5" /> Dine In
            </button>
            <button
              type="button"
              onClick={() => setOrderType('parcel')}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                orderType === 'parcel'
                  ? 'bg-[#14171A] text-white dark:bg-[hsl(var(--primary))] dark:text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 dark:bg-card dark:bg-card dark:text-gray-300 dark:border-border'
              }`}
            >
              <Package className="h-3.5 w-3.5" /> Parcel
            </button>
            {orderType === 'dine' && (
              <div className="flex gap-1 overflow-x-auto scrollbar-hide flex-nowrap pl-1">
                {TABLES.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTableNo(t)}
                    className={`shrink-0 w-7 h-7 rounded-full text-[11px] font-bold transition-all ${
                      tableNo === t
                        ? 'bg-[hsl(var(--primary))] text-white shadow-xs'
                        : 'bg-white text-gray-600 border border-gray-200 hover:border-amber-300 dark:bg-card dark:bg-card dark:text-gray-300 dark:border-border'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            {orderType === 'parcel' && (
              <label className="shrink-0 flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none whitespace-nowrap bg-white dark:bg-card dark:bg-card px-2.5 py-1 rounded-full border border-gray-200 dark:border-border">
                <input
                  type="checkbox"
                  checked={packagingCharge}
                  onChange={e => setPackagingCharge(e.target.checked)}
                  className="accent-[hsl(var(--primary))]"
                />
                +₹10 Packing
              </label>
            )}
          </div>

          <div className="hidden md:flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-white dark:bg-card dark:bg-card border border-gray-200 dark:border-border px-2.5 py-1 rounded-full">
              Bill #{String(billCount).padStart(4, '0')}
            </span>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
              className="w-8 h-8 rounded-full bg-white dark:bg-card dark:bg-card border border-gray-200 dark:border-border flex items-center justify-center text-gray-600 dark:text-gray-300 hover:border-amber-400 transition-colors"
            >
              {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Search Bar & Optional Customer Mobile */}
        <div className="flex flex-col sm:flex-row gap-2.5 mb-3 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search dishes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-full border border-gray-200 pl-10 pr-4 py-2 text-sm text-gray-500 placeholder:text-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/60 focus:border-[hsl(var(--primary))] dark:bg-card dark:bg-card dark:border-border dark:text-gray-200 dark:placeholder:text-gray-500"
            />
          </div>
          <input
            type="text"
            placeholder="Customer mobile (optional)"
            value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value)}
            className="w-full sm:w-52 rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-500 placeholder:text-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/60 focus:border-[hsl(var(--primary))] dark:bg-card dark:bg-card dark:border-border dark:text-gray-200 dark:placeholder:text-gray-500"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-3 shrink-0">
          {DEMO_CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 transition-all ${
                selectedCategory === cat
                  ? 'bg-[hsl(var(--primary))] text-white rounded-full px-4 py-1.5 font-semibold text-sm shadow-sm'
                  : 'bg-muted/70 text-muted-foreground rounded-full px-4 py-1.5 text-sm hover:bg-muted dark:bg-card dark:bg-card dark:text-gray-300 dark:hover:bg-[#262B31]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 3-Column Dish Grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3.5 content-start pr-0.5">
          {filteredItems.length === 0 ? (
            <div className="col-span-full py-16 text-center">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No dishes match "{search}"</p>
              <button
                type="button"
                onClick={() => { setSearch(''); setSelectedCategory('All'); }}
                className="mt-2 px-4 py-1.5 rounded-full bg-[hsl(var(--primary))] text-white text-xs font-semibold"
              >
                Show All Dishes
              </button>
            </div>
          ) : filteredItems.map(item => {
            const inCart = cart.find(c => c.id === item.id);
            const isBestseller = BESTSELLER_IDS.has(item.id);
            const emoji = ITEM_EMOJI[item.id] ?? '🍽️';
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => addToCart(item)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    addToCart(item);
                  }
                }}
                className={`relative rounded-2xl bg-card dark:bg-card overflow-hidden border transition-all cursor-pointer select-none hover:shadow-lg active:scale-[0.98] ${
                  inCart ? 'border-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/50' : 'border-border hover:border-[hsl(var(--primary))]/50'
                }`}
              >
                {/* Image / Emoji Placeholder Area */}
                <div className="relative bg-muted/50 h-32 w-full flex items-center justify-center text-4xl">
                  <span>{emoji}</span>
                  {isBestseller && (
                    <span className="absolute top-2 left-2 bg-[hsl(var(--primary))] text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                      Bestseller
                    </span>
                  )}
                  {inCart && (
                    <span className="absolute top-2 right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[hsl(var(--primary))] text-white font-bold text-xs flex items-center justify-center shadow-md ring-2 ring-[#1C2024]">
                      {inCart.quantity}
                    </span>
                  )}
                </div>

                {/* Card Footer Details */}
                <div className="p-3 flex flex-col gap-2">
                  <div className="flex items-start gap-1.5 min-h-[2.25rem]">
                    <span
                      title={item.veg ? 'Veg' : 'Non-Veg'}
                      className={`mt-1 w-2.5 h-2.5 rounded-sm border shrink-0 flex items-center justify-center ${
                        item.veg ? 'border-emerald-500' : 'border-red-500'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${item.veg ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    </span>
                    <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{item.name}</p>
                  </div>

                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-foreground font-bold text-base tabular-nums">₹{item.price}</span>
                    <button
                      type="button"
                      aria-label={`Add ${item.name}`}
                      onClick={e => {
                        e.stopPropagation();
                        addToCart(item);
                      }}
                      className="w-8 h-8 rounded-full bg-[hsl(var(--primary))] text-white flex items-center justify-center font-bold hover:scale-105 transition-transform text-lg shrink-0 shadow-sm"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* ── RIGHT ORDER PANEL (Checkout Ledger) ── */}
      <aside className="hidden lg:flex lg:w-80 xl:w-96 bg-background border-l border-border dark:bg-[#181B20] dark:border-border flex-col shrink-0 min-h-0">
        {/* Table Header */}
        <div className="p-4 border-b border-border dark:border-border flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-muted/500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Armchair className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{tableDisplayLabel}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {cart.length} item{cart.length !== 1 ? 's' : ''} • Bill #{String(billCount).padStart(4, '0')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowTablePicker(prev => !prev)}
            className="text-amber-600 font-semibold text-sm border border-amber-300 rounded-lg px-3 py-1 hover:bg-muted/50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-950/40 transition-colors shrink-0"
          >
            Change
          </button>
        </div>

        {/* Inline Table / Order-Type Picker */}
        {showTablePicker && (
          <div className="px-4 py-3 bg-muted dark:bg-[#22262C] border-b border-border dark:border-border space-y-2.5 shrink-0">
            <div className="flex items-center gap-2">
              {(['dine', 'parcel'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setOrderType(type)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    orderType === type
                      ? 'bg-[hsl(var(--primary))] text-white'
                      : 'bg-white text-gray-600 border border-gray-200 dark:bg-[#181B20] dark:text-gray-300 dark:border-[#323740]'
                  }`}
                >
                  {type === 'dine' ? 'Dine In' : 'Parcel'}
                </button>
              ))}
            </div>
            {orderType === 'dine' ? (
              <>
                <div className="grid grid-cols-4 gap-1.5">
                  {TABLES.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTableNo(t)}
                      className={`py-1 rounded-md text-xs font-bold transition-colors ${
                        tableNo === t
                          ? 'bg-[hsl(var(--primary))] text-white'
                          : 'bg-white text-gray-700 border border-gray-200 hover:border-amber-300 dark:bg-[#181B20] dark:text-gray-300 dark:border-[#323740]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-300 pt-1">
                  <span className="font-medium">Guests</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setGuests(g => Math.max(1, g - 1))}
                      className="w-6 h-6 rounded-full bg-white dark:bg-[#181B20] border border-gray-300 dark:border-[#323740] flex items-center justify-center font-bold"
                    >
                      -
                    </button>
                    <span className="w-5 text-center font-semibold">{guests}</span>
                    <button
                      type="button"
                      onClick={() => setGuests(g => Math.min(12, g + 1))}
                      className="w-6 h-6 rounded-full bg-white dark:bg-[#181B20] border border-gray-300 dark:border-[#323740] flex items-center justify-center font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <label className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <span>Add +₹10 Packaging Charge</span>
                <input
                  type="checkbox"
                  checked={packagingCharge}
                  onChange={e => setPackagingCharge(e.target.checked)}
                  className="accent-[hsl(var(--primary))]"
                />
              </label>
            )}
          </div>
        )}

        {/* KOT Indicator */}
        {cart.length > 0 && (
          <div className="px-4 py-1.5 bg-muted/50 dark:bg-amber-950/30 border-b border-amber-200/80 dark:border-amber-800/60 flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300 shrink-0">
            <ChefHat className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">KOT auto-sent to kitchen on bill</span>
          </div>
        )}

        <OrderCheckoutContent
          cart={cart}
          updateQuantity={updateQuantity}
          selectedDiscount={selectedDiscount}
          setSelectedDiscount={setSelectedDiscount}
          subtotal={subtotal}
          discountAmt={discountAmt}
          packaging={packaging}
          gst={gst}
          total={total}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          onPay={() => setShowPayment(true)}
        />
      </aside>

      {/* Mobile Sticky Bottom Cart Bar */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#14171A]/95 backdrop-blur-md border-t border-border p-3 flex items-center justify-between shadow-2xl">
          <div className="flex flex-col">
            <span className="text-xs text-gray-400 font-medium">{cart.length} item{cart.length !== 1 ? 's' : ''} in order</span>
            <span className="text-base font-extrabold text-[hsl(var(--primary))] tabular-nums">₹{total}</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            style={{ background: 'hsl(var(--primary))' }}
            className="flex items-center gap-1.5 px-4 h-10 rounded-xl font-bold text-sm text-neutral-950 shadow-md"
          >
            <ShoppingCart className="h-4 w-4" />
            View Order &amp; Bill
          </button>
        </div>
      )}

      {/* Mobile Cart Sheet */}
      <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <SheetContent side="bottom" className="max-h-[88vh] p-0 flex flex-col rounded-t-2xl bg-background dark:bg-[#181B20] border-t border-border dark:border-border">
          <SheetHeader className="p-4 border-b border-border dark:border-border">
            <SheetTitle className="flex items-center justify-between text-base text-gray-900 dark:text-white">
              <span className="flex items-center gap-2">
                <Armchair className="h-4 w-4 text-amber-600" />
                {tableDisplayLabel}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">{cart.length} item{cart.length !== 1 ? 's' : ''}</span>
            </SheetTitle>
          </SheetHeader>

          <OrderCheckoutContent
            cart={cart}
            updateQuantity={updateQuantity}
            selectedDiscount={selectedDiscount}
            setSelectedDiscount={setSelectedDiscount}
            subtotal={subtotal}
            discountAmt={discountAmt}
            packaging={packaging}
            gst={gst}
            total={total}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            onPay={() => { setMobileCartOpen(false); setShowPayment(true); }}
            isMobileSheet
          />
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
