import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { ShoppingCart, Plus, Minus, Search, Grid, List, X, Trash2, Edit2, Check, Package, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CompletePaymentDialog } from '@/components/CompletePaymentDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Bell, Clipboard, Calculator, AlertCircle, Delete } from 'lucide-react';
import { PrinterErrorDialog } from '@/components/PrinterErrorDialog';
import { PrinterStatusPanel } from '@/components/PrinterStatusPanel';
import { TableSelector } from '@/components/TableSelector';
import { getCachedImageUrl, cacheImageUrl, getCDNUrl, handleImageError } from '@/utils/imageUtils';
import { getInstantBillNumber, initBillCounter, syncBillCounter } from '@/utils/billNumberGenerator';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';
import { printReceipt, PrintData } from '@/utils/bluetoothPrinter';
import { printKOTs, KOTPrintStationResult } from '@/utils/kotGenerator';
import { printBrowserReceipt } from '@/utils/browserPrinter';
import { toast as sonnerToast } from 'sonner';
import { format } from 'date-fns';
import { getShortUnit, formatQuantityWithUnit, formatStoredQuantity, isWeightOrVolumeUnit, parseQuickChipQuantity, calculateSmartQtyCount, convertToInventoryUnit } from '@/utils/timeUtils';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { AllBranchesReadOnlyBanner } from '@/components/AllBranchesReadOnlyBanner';
import { useBranch } from '@/contexts/BranchContext';
import { cn } from '@/lib/utils';
import VoiceBillingButton, { VoiceIntent } from '@/components/VoiceBillingButton';
import { getStationMap } from '@/utils/stationPrinters';

// BroadcastChannel for instant cross-tab sync
const billsChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bills-updates') : null;
interface Item {
  id: string;
  name: string;
  price: number;
  image_url?: string;
  video_url?: string;
  media_type?: 'image' | 'gif' | 'video';
  is_active: boolean;
  category?: string;
  unit?: string;
  base_value?: number;
  quantity_step?: number;
  quick_chips?: string[];
  stock_quantity?: number;
  minimum_stock_alert?: number;
  unlimited_stock?: boolean;
  price_zomato?: number;
  price_swiggy?: number;
  tax_rate_id?: string | null;
  is_tax_inclusive?: boolean;
  hsn_code?: string | null;
}

// Helper to check if item has low stock
const isLowStock = (item: Item): boolean => {
  if (item.stock_quantity === null || item.stock_quantity === undefined) return false;
  if (item.minimum_stock_alert === null || item.minimum_stock_alert === undefined) return false;
  return item.stock_quantity <= item.minimum_stock_alert;
};

// Removed inline getSimplifiedUnit - now using getShortUnit from timeUtils
interface CartItem extends Item {
  quantity: number;
  store_price?: number;
  item_name_override?: string;
}
interface PaymentType {
  id: string;
  payment_type: string;
  is_disabled: boolean;
  is_default: boolean;
}
interface ItemCategory {
  id: string;
  name: string;
  is_deleted: boolean;
  print_station?: string | null;
}

const CategoryScrollBar = React.memo(({ categories, selectedCategory, onSelectCategory, categoryOrder, items }: {
  categories: ItemCategory[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categoryOrder: string[];
  items: Item[];
}) => {
  // Sort categories based on saved order
  const sortedCategories = useMemo(() => [...categories].sort((a, b) => {
    const indexA = categoryOrder.indexOf(a.name);
    const indexB = categoryOrder.indexOf(b.name);
    if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  }), [categories, categoryOrder]);

  // Calculate item counts per category in a single O(N) pass
  const { categoryCounts, totalActiveItems } = useMemo(() => {
    const counts: Record<string, number> = {};
    let total = 0;
    items.forEach(item => {
      if (item.is_active) {
        total++;
        if (item.category) counts[item.category] = (counts[item.category] || 0) + 1;
      }
    });
    return { categoryCounts: counts, totalActiveItems: total };
  }, [items]);

  const getCategoryCount = (categoryName: string) => categoryCounts[categoryName] || 0;

  return (
    <div className="mb-3 w-full overflow-hidden">
      <div className="flex gap-2 pb-2 overflow-x-auto scrollbar-hide" style={{ maxWidth: '100%' }}>
        <Button
          variant={selectedCategory === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSelectCategory('all')}
          className={`whitespace-nowrap flex-shrink-0 h-8 px-4 ${selectedCategory === 'all'
            ? 'bg-primary text-primary-foreground shadow-md'
            : 'hover:bg-muted'
            }`}
        >
          All ({totalActiveItems})
        </Button>
        {sortedCategories.map((category) => (
          <Button
            key={category.id}
            variant={selectedCategory === category.name ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSelectCategory(category.name)}
            className={`whitespace-nowrap flex-shrink-0 h-8 px-4 ${selectedCategory === category.name
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'hover:bg-muted'
              }`}
          >
            {category.name} ({getCategoryCount(category.name)})
          </Button>
        ))}
      </div>
    </div>
  );
});
interface Bill {
  id: string;
  bill_no: string;
  total_amount: number;
  discount: number;
  payment_mode: string;
  date: string;
  created_at: string;
}
interface BillItem {
  id: string;
  item_id: string;
  quantity: number;
  price: number;
  total: number;
  items: {
    id: string;
    name: string;
    price: number;
    image_url?: string;
    is_active: boolean;
  };
}
type PaymentMode = "cash" | "upi" | "card" | "other";

const getChannelPrice = (item: any, channel: 'store' | 'zomato' | 'swiggy') => {
  if (channel === 'zomato') return item.price_zomato !== null && item.price_zomato !== undefined && item.price_zomato !== '' ? Number(item.price_zomato) : item.store_price !== undefined ? item.store_price : item.price;
  if (channel === 'swiggy') return item.price_swiggy !== null && item.price_swiggy !== undefined && item.price_swiggy !== '' ? Number(item.price_swiggy) : item.store_price !== undefined ? item.store_price : item.price;
  return item.store_price !== undefined ? item.store_price : item.price;
};

interface BillingGridItemCardProps {
  item: Item;
  cartQuantity: number;
  orderChannel: 'store' | 'zomato' | 'swiggy';
  onAddToCart: (item: Item) => void;
  onAddToCartWithChip: (item: Item, chip: string) => void;
  onAddToCartWithAmount: (item: Item, amount: number) => void;
  onUpdateQuantity: (id: string, change: number) => void;
}

const BillingGridItemCard = React.memo(({
  item,
  cartQuantity,
  orderChannel,
  onAddToCart,
  onAddToCartWithChip,
  onAddToCartWithAmount,
  onUpdateQuantity
}: BillingGridItemCardProps) => {
  const cachedImageUrl = getCachedImageUrl(item.id);
  const imageUrl = item.image_url || cachedImageUrl;

  // Cache the image URL if it exists
  if (item.image_url && !cachedImageUrl) {
    cacheImageUrl(item.id, item.image_url);
  }
  const isInCart = cartQuantity > 0;
  const unitLabel = getShortUnit(item.unit);
  const lowStock = isLowStock(item);

  return (
    <div className={`relative bg-white dark:bg-zinc-900 rounded-2xl border-2 p-4 flex flex-col shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] dark:shadow-none hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 ${isInCart ? 'border-primary shadow-primary/25 shadow-lg' : lowStock ? 'border-orange-500 dark:border-orange-400' : 'border-zinc-200/80 dark:border-zinc-800/80 hover:border-primary/40'}`}>
      {/* Image container with quantity badge */}
      <div className="relative aspect-[4/3] mb-1 bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-lg overflow-hidden flex-shrink-0">
        {/* Media rendering - supports images, GIFs, and videos */}
        {item.media_type === 'video' ? (
          <video
            src={item.video_url || item.image_url}
            className="w-full h-full object-cover"
            muted
            loop
            autoPlay
            playsInline
          />
        ) : (item.image_url || item.video_url) ? (
          <img
            src={item.media_type === 'gif' ? (item.video_url || item.image_url) : (getCachedImageUrl(item.id) || item.image_url)}
            alt={item.name}
            className="w-full h-full object-cover"
            onError={e => handleImageError(e, item.image_url)}
          />
        ) : null}
        <div className={`${(item.image_url || item.video_url) ? 'hidden' : ''} w-full h-full flex items-center justify-center text-muted-foreground`}>
          <Package className="w-8 h-8" />
        </div>

        {/* Low stock badge - shown at top left */}
        {lowStock && (
          <div className="absolute top-1 left-1 bg-orange-500 text-white text-[11px] font-bold px-1.5 py-0.5 rounded shadow-sm">
            Low: {formatStoredQuantity(item.stock_quantity!, (item as any).inventory_unit || item.unit)}
          </div>
        )}

        {/* Small rectangle quantity badge - shown when item is in cart */}
        {isInCart && (
          <div className="absolute bottom-1 right-1 bg-[hsl(var(--qty-badge))] text-white text-[13px] font-bold px-2 py-0.5 rounded shadow-md flex items-center gap-0.5">
            <span>{formatQuantityWithUnit(cartQuantity, item.unit)}</span>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0 px-0.5">
        <h3 className="font-semibold text-sm mb-0.5 line-clamp-1 flex-shrink-0">{item.name}</h3>
        <p className="text-primary mb-1 flex-shrink-0 font-bold text-sm">
          ₹{getChannelPrice(item, orderChannel).toFixed(2)} / {item.base_value && item.base_value > 1 ? `${item.base_value}${unitLabel}` : unitLabel}
        </p>

        {isInCart ? (
          <div className="flex items-center justify-center gap-1.5 mt-auto">
            <Button size="sm" variant="outline" onClick={() => onUpdateQuantity(item.id, -1)} className="h-6 w-6 p-0 rounded-full bg-[hsl(var(--btn-decrement))] text-white border-0 hover:opacity-80">
              <Minus className="h-3 w-3" />
            </Button>
            <span className="font-bold min-w-[1.5rem] text-center text-base">{cartQuantity}</span>
            <Button size="sm" variant="outline" onClick={() => onUpdateQuantity(item.id, 1)} className="h-6 w-6 p-0 rounded-full bg-[hsl(var(--btn-increment))] text-white border-0 hover:opacity-80">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="mt-auto space-y-1.5 flex flex-col justify-end">
            {item.quick_chips && item.quick_chips.length > 0 && (
              <div className="flex flex-wrap gap-1 justify-center mb-1">
                {item.quick_chips.map((chip, idx) => {
                  const isAmt = chip.startsWith('₹');
                  return (
                    <button
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isAmt) {
                          onAddToCartWithAmount(item, parseFloat(chip.replace(/[^0-9.]/g, '')));
                        } else {
                          onAddToCartWithChip(item, chip);
                        }
                      }}
                      className="px-2 py-0.5 text-[10px] font-semibold rounded-lg border border-primary/20 bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground shadow-sm transition-all duration-200 hover:scale-105 active:scale-95"
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>
            )}
            <Button onClick={() => onAddToCart(item)} className="w-full h-9 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-sm">
              Add
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.cartQuantity === nextProps.cartQuantity &&
         prevProps.orderChannel === nextProps.orderChannel &&
         prevProps.item.price === nextProps.item.price &&
         prevProps.item.name === nextProps.item.name &&
         prevProps.item.image_url === nextProps.item.image_url &&
         prevProps.item.video_url === nextProps.item.video_url &&
         prevProps.item.stock_quantity === nextProps.item.stock_quantity;
});

interface BillingListItemCardProps {
  item: Item;
  cartQuantity: number;
  orderChannel: 'store' | 'zomato' | 'swiggy';
  onAddToCart: (item: Item) => void;
  onAddToCartWithChip: (item: Item, chip: string) => void;
  onAddToCartWithAmount: (item: Item, amount: number) => void;
  onUpdateQuantity: (id: string, change: number) => void;
}

const BillingListItemCard = React.memo(({
  item,
  cartQuantity,
  orderChannel,
  onAddToCart,
  onAddToCartWithChip,
  onAddToCartWithAmount,
  onUpdateQuantity
}: BillingListItemCardProps) => {
  const cachedImageUrl = getCachedImageUrl(item.id);
  const imageUrl = item.image_url || cachedImageUrl;
  if (item.image_url && !cachedImageUrl) {
    cacheImageUrl(item.id, item.image_url);
  }
  const isInCart = cartQuantity > 0;
  return (
    <Card className="hover:shadow-md hover:scale-[1.01] transition-all duration-200 border-zinc-200/80 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-2xl">
      <CardContent className="p-3">
        <div className={cn(
          "flex justify-between gap-3",
          (!isInCart && item.quick_chips && item.quick_chips.length > 0)
            ? "flex-col sm:flex-row sm:items-center"
            : "flex-row items-center"
        )}>
          <div className="flex items-center space-x-3 min-w-0">
            {/* Image */}
            <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
              {item.media_type === 'video' ? (
                <video
                  src={item.video_url || item.image_url}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              ) : (item.image_url || item.video_url) ? (
                <img
                  src={item.media_type === 'gif' ? (item.video_url || item.image_url) : (imageUrl || item.image_url)}
                  alt={item.name}
                  className="w-full h-full object-cover"
                  onError={e => handleImageError(e, item.image_url)}
                />

              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <Package className="w-6 h-6" />
                </div>
              )}
            </div>

            {/* Name and Price */}
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{item.name}</h3>
              <p className="text-lg font-bold text-primary">₹{getChannelPrice(item, orderChannel)}/{item.base_value && item.base_value > 1 ? `${item.base_value}${getShortUnit(item.unit)}` : getShortUnit(item.unit)}</p>
            </div>
          </div>

          {/* Controls */}
          <div className={cn(
            "flex items-center shrink-0 max-w-full",
            (!isInCart && item.quick_chips && item.quick_chips.length > 0)
              ? "justify-start sm:justify-end gap-2 flex-wrap w-full sm:w-auto"
              : "justify-end gap-1.5 w-auto"
          )}>
            {isInCart ? (
              <div className="flex items-center space-x-2 bg-primary/10 rounded-full py-1 px-3 ml-auto">
                <Button variant="ghost" size="sm" onClick={() => onUpdateQuantity(item.id, -1)} className="h-6 w-6 p-0 rounded-full">
                  <Minus className="w-3 h-3" />
                </Button>
                <span className="font-semibold min-w-[20px] text-center">
                  {cartQuantity}
                </span>
                <Button variant="ghost" size="sm" onClick={() => onUpdateQuantity(item.id, 1)} className="h-6 w-6 p-0 rounded-full">
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <div className={cn(
                "flex items-center justify-start sm:justify-end gap-1.5 max-w-full",
                (item.quick_chips && item.quick_chips.length > 0)
                  ? "flex-wrap w-full sm:w-auto ml-0 sm:ml-0"
                  : "w-auto"
              )}>
                {item.quick_chips && item.quick_chips.length > 0 && item.quick_chips.map((chip, idx) => {
                  const isAmt = chip.startsWith('₹');
                  return (
                    <button
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isAmt) {
                          onAddToCartWithAmount(item, parseFloat(chip.replace(/[^0-9.]/g, '')));
                        } else {
                          onAddToCartWithChip(item, chip);
                        }
                      }}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-primary/20 bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 whitespace-nowrap"
                    >
                      {chip}
                    </button>
                  );
                })}
                <Button onClick={() => onAddToCart(item)} className="bg-primary hover:bg-primary/90 text-white shadow-sm h-9 px-4 text-xs font-semibold rounded-lg shrink-0">
                  Add
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}, (prevProps, nextProps) => {
  return prevProps.cartQuantity === nextProps.cartQuantity &&
         prevProps.orderChannel === nextProps.orderChannel &&
         prevProps.item.price === nextProps.item.price &&
         prevProps.item.name === nextProps.item.name &&
         prevProps.item.image_url === nextProps.item.image_url &&
         prevProps.item.video_url === nextProps.item.video_url &&
         prevProps.item.stock_quantity === nextProps.item.stock_quantity;
});

const Billing = () => {
  const {
    profile
  } = useAuth();
  const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
  const { branchFilterId, isAllBranchesView, operatingBranchId, activeBranch } = useBranchScopedQuery(() => {
    fetchItems();
  });
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return localStorage.getItem('billing-view-mode') as 'grid' | 'list' || 'grid';
  });
  const [billingMode, setBillingMode] = useState<'qty' | 'amount'>('qty');
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<string>('');
  const [discount, setDiscount] = useState(0);
  const [editingQuantity, setEditingQuantity] = useState<string | null>(null);
  const [tempQuantity, setTempQuantity] = useState<string>('');
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [additionalCharges, setAdditionalCharges] = useState<any[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [displaySettings, setDisplaySettings] = useState({
    items_per_row: 3,
    category_order: [] as string[]
  });
  const [itemCategories, setItemCategories] = useState<ItemCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedTableNumber, setSelectedTableNumber] = useState<string | null>(null);

  // Food Aggregators Integration
  const [orderChannel, setOrderChannel] = useState<'store' | 'zomato' | 'swiggy'>('store');
  const [aggregatorDialogOpen, setAggregatorDialogOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [incomingOrders, setIncomingOrders] = useState<any[]>([
    {
      id: 'mock-1',
      orderId: 'ZM-4819401',
      channel: 'zomato',
      customerName: 'Aarav Sharma',
      items: [
        { name: 'Veg Biryani', quantity: 2 },
        { name: 'Butter Naan', quantity: 3 }
      ],
      total: 470,
      time: 'Just now'
    },
    {
      id: 'mock-2',
      orderId: 'SW-9810482',
      channel: 'swiggy',
      customerName: 'Priya Patel',
      items: [
        { name: 'Masala Dosa', quantity: 1 },
        { name: 'Beverages', quantity: 2 }
      ],
      total: 190,
      time: '3 mins ago'
    }
  ]);



  const handleChannelChange = (channel: 'store' | 'zomato' | 'swiggy') => {
    setOrderChannel(channel);
    setCart(prev => prev.map(item => {
      const originalPrice = (item as any).store_price !== undefined ? (item as any).store_price : item.price;
      const newPrice = getChannelPrice({ ...item, price: originalPrice }, channel);
      return {
        ...item,
        store_price: originalPrice,
        price: newPrice
      };
    }));
  };

  const parsePasteOrder = () => {
    if (!pasteText.trim()) {
      toast({
        title: 'Empty Text',
        description: 'Please paste some order text first.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const text = pasteText;
      let channel: 'zomato' | 'swiggy' = 'zomato';
      if (/swiggy/i.test(text)) {
        channel = 'swiggy';
      }

      // Extract Order ID
      let orderId = 'ONLINE-' + Math.floor(100000 + Math.random() * 900000);
      const idMatch = text.match(/(?:order\s*(?:id|#)?|#)\s*:?\s*([a-z0-9-]+)/i);
      if (idMatch && idMatch[1]) {
        orderId = idMatch[1].trim().toUpperCase();
      }

      // Set order type and channel
      setOrderChannel(channel);

      // Extract items
      const lines = text.split('\n');
      const parsedItems: Array<{ name: string; quantity: number }> = [];

      lines.forEach(line => {
        const cleaned = line.trim();
        if (!cleaned) return;

        // Pattern 1: "1 x Veg Biryani"
        let match = cleaned.match(/^(\d+(?:\.\d+)?)\s*[x*]\s*(.+)$/i);
        if (match) {
          parsedItems.push({
            name: match[2].trim(),
            quantity: parseFloat(match[1])
          });
          return;
        }

        // Pattern 2: "Veg Biryani x 2"
        match = cleaned.match(/^(.+?)\s*[x*]\s*(\d+(?:\.\d+)?)$/i);
        if (match) {
          parsedItems.push({
            name: match[1].trim(),
            quantity: parseFloat(match[2])
          });
          return;
        }

        // Pattern 3: "Veg Biryani - Qty: 2"
        match = cleaned.match(/^(.+?)\s*[-((]?\s*qty\s*(?::\s*)?(\d+(?:\.\d+)?)\s*\)?$/i);
        if (match) {
          parsedItems.push({
            name: match[1].trim(),
            quantity: parseFloat(match[2])
          });
          return;
        }

        // Pattern 4: "2 Veg Biryani"
        match = cleaned.match(/^(\d+)\s+([a-zA-Z\s]+)$/);
        if (match) {
          parsedItems.push({
            name: match[2].trim(),
            quantity: parseFloat(match[1])
          });
          return;
        }
      });

      if (parsedItems.length === 0) {
        toast({
          title: 'Parsing Failed',
          description: 'Could not find any items in the pasted text. Please check format.',
          variant: 'destructive'
        });
        return;
      }

      const matchedItems: Array<{ item: Item; qty: number }> = [];
      const unmatchedItems: string[] = [];

      parsedItems.forEach(pi => {
        const nameToMatch = pi.name.toLowerCase();
        let found = items.find(it => it.name.toLowerCase() === nameToMatch);
        if (!found) {
          found = items.find(it => 
            it.name.toLowerCase().includes(nameToMatch) || 
            nameToMatch.includes(it.name.toLowerCase())
          );
        }

        if (found) {
          matchedItems.push({ item: found, qty: pi.quantity });
        } else {
          unmatchedItems.push(`${pi.quantity}x ${pi.name}`);
        }
      });

      if (matchedItems.length === 0) {
        toast({
          title: 'No Matching Items',
          description: `Found ${parsedItems.length} items but none matched your menu items.`,
          variant: 'destructive'
        });
        return;
      }

      setCart(prev => {
        const matchedIds = matchedItems.map(m => m.item.id);
        const filtered = prev.filter(c => !matchedIds.includes(c.id));
        
        const newCartItems = matchedItems.map(mi => {
          const storePrice = mi.item.price;
          const channelPrice = getChannelPrice(mi.item, channel);
          return {
            ...mi.item,
            store_price: storePrice,
            price: channelPrice,
            quantity: mi.qty
          };
        });
        return [...filtered, ...newCartItems];
      });

      handleChannelChange(channel);

      if (unmatchedItems.length > 0) {
        toast({
          title: 'Order Imported (Partial)',
          description: `Imported ${matchedItems.length} items to cart. Unmatched items: ${unmatchedItems.join(', ')}`,
        });
      } else {
        toast({
          title: '✅ Order Imported!',
          description: `Imported ${matchedItems.length} items from ${channel.toUpperCase()} order ${orderId} successfully!`,
        });
      }

      setPasteText('');
      setAggregatorDialogOpen(false);
    } catch (e: any) {
      toast({
        title: 'Error Parsing Order',
        description: e.message || 'An error occurred during parsing.',
        variant: 'destructive'
      });
    }
  };

  const acceptOrderToKDS = async (order: any) => {
    try {
      const now = new Date();
      const billNumber = `BILL-ONLINE-${order.orderId}`;
      const validCartItems: CartItem[] = [];

      order.items.forEach((oi: any) => {
        const nameLower = oi.name.toLowerCase();
        let dbItem = items.find(it => it.name.toLowerCase() === nameLower);
        if (!dbItem) {
          dbItem = items.find(it => it.name.toLowerCase().includes(nameLower) || nameLower.includes(it.name.toLowerCase()));
        }

        if (dbItem) {
          const basePrice = getChannelPrice(dbItem, order.channel);
          validCartItems.push({
            ...dbItem,
            price: basePrice,
            store_price: dbItem.price,
            quantity: oi.quantity
          });
        }
      });

      if (validCartItems.length === 0) {
        toast({
          title: 'Order Acceptance Failed',
          description: 'None of the items in this order matched your database items.',
          variant: 'destructive'
        });
        return;
      }

      const orderSubtotal = validCartItems.reduce((sum, item) => {
        const baseValue = item.base_value || 1;
        return sum + (item.quantity / baseValue) * item.price;
      }, 0);

      const billPayload: any = {
        bill_no: billNumber,
        total_amount: orderSubtotal,
        discount: 0,
        payment_mode: 'other',
        payment_details: { online: orderSubtotal },
        additional_charges: [],
        created_by: profile?.user_id,
        admin_id: profile?.role === 'admin' ? profile.id : profile?.admin_id || null,
        branch_id: operatingBranchId || null,
        date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
        service_status: 'pending',
        kitchen_status: 'preparing',
        status_updated_at: now.toISOString(),
        table_no: null,
        round_off: 0,
        order_type: 'parcel',
        channel: order.channel
      };

      await saveBillToDatabase(billPayload, validCartItems, billNumber);

      toast({
        title: `✅ Accepted ${order.channel === 'zomato' ? 'Zomato' : 'Swiggy'} Order!`,
        description: `Order ${order.orderId} sent directly to KDS.`,
      });

      setIncomingOrders(prev => prev.filter(o => o.id !== order.id));
    } catch (err: any) {
      console.error('Accept online order error:', err);
      toast({
        title: 'Error accepting order',
        description: err.message || 'Failed to send order to KDS',
        variant: 'destructive'
      });
    }
  };

  // Real-time listener for incoming Food Aggregator Webhook orders
  useEffect(() => {
    const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
    if (!adminId) return;

    // Fetch initial pending orders
    const fetchPendingOrders = async () => {
      let query = supabase
        .from('online_orders')
        .select('*')
        .eq('admin_id', adminId)
        .eq('status', 'pending');
        
      if (operatingBranchId) {
        query = query.eq('branch_id', operatingBranchId);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      if (!error && data) {
        setIncomingOrders(data.map(d => ({
          id: d.id,
          orderId: d.order_id,
          channel: d.channel,
          customerName: d.customer_name || 'Online Customer',
          items: d.items,
          total: d.total,
          time: new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        })));
      }
    };
    
    fetchPendingOrders();

    // Subscribe to new incoming orders
    const channel = supabase.channel('online_orders_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'online_orders',
          filter: `admin_id=eq.${adminId}`
        },
        (payload) => {
          const newRow = payload.new;
          if (operatingBranchId && newRow.branch_id && newRow.branch_id !== operatingBranchId) return;
          
          const mappedOrder = {
            id: newRow.id,
            orderId: newRow.order_id,
            channel: newRow.channel,
            customerName: newRow.customer_name || 'Online Customer',
            items: newRow.items,
            total: newRow.total,
            time: 'Just now'
          };
          
          setIncomingOrders(prev => [mappedOrder, ...prev]);
          
          toast({
            title: `🔔 New ${newRow.channel.toUpperCase()} Order!`,
            description: `${mappedOrder.customerName} ordered (${mappedOrder.items.length} items) - ₹${mappedOrder.total}`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, operatingBranchId]);

  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [quickBillEnabled, setQuickBillEnabled] = useState(false);
  const [whatsappShareMode, setWhatsappShareMode] = useState<'text' | 'image'>('text');
  const [showOrderType, setShowOrderType] = useState(false);
  const [defaultOrderType, setDefaultOrderType] = useState<'dine_in' | 'parcel' | undefined>(undefined);
  const [calciEnabled, setCalciEnabled] = useState(false);
  const [appBillingMode, setAppBillingMode] = useState<'pos' | 'calci'>('pos');
  const [calciInput, setCalciInput] = useState('');
  const [isCalciStretched, setIsCalciStretched] = useState(() => {
    return localStorage.getItem('hotel_pos_calci_stretched') === 'true';
  });
  const [gstSettings, setGstSettings] = useState<{
    enabled: boolean;
    gstin: string;
    isComposition: boolean;
    taxRatesMap: Record<string, { rate: number; name: string; cess: number; hsn_code: string }>;
  }>({ enabled: false, gstin: '', isComposition: false, taxRatesMap: {} });
  const syncChannelRef = useRef<any>(null);
  const calciInputRef = useRef<HTMLInputElement>(null);
  const fastCashPendingRef = useRef(false);

  useEffect(() => {
    if (appBillingMode === 'calci') {
      // Use multiple timeouts for reliability on mobile browsers
      // Some mobile browsers need a longer delay to open the keyboard
      const t1 = setTimeout(() => calciInputRef.current?.focus(), 50);
      const t2 = setTimeout(() => {
        if (calciInputRef.current && document.activeElement !== calciInputRef.current) {
          calciInputRef.current.focus();
          calciInputRef.current.click(); // Some mobile browsers need click to open keyboard
        }
      }, 300);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [appBillingMode]);

  // Setup Global Sync Channel for Cross-Device updates
  useEffect(() => {
    const channel = supabase.channel('pos-global-sync', {
      config: { broadcast: { self: true } }
    }).subscribe();

    syncChannelRef.current = channel;

    // Seed bill counter from DB on first use (prevents 0001 on new device)
    const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;
    initBillCounter(adminId, operatingBranchId).catch(console.warn);

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Safety check: close payment dialog if cart is empty
  useEffect(() => {
    if (cart.length === 0) {
      setPaymentDialogOpen(false);
    }
    // Fast Cash: if calciInput was submitted and we're waiting for cart to update, now execute payment
    if (fastCashPendingRef.current && cart.filter(i => i.quantity > 0).length > 0) {
      fastCashPendingRef.current = false;
      // Use setTimeout(0) to let React finish rendering so getTotalAmount reads the updated cart
      setTimeout(() => executeFastCash(), 0);
    }
  }, [cart]);
  const [billSettings, setBillSettings] = useState<{
    shopName: string;
    address: string;
    contactNumber: string;
    logoUrl: string;
    facebook: string;
    showFacebook?: boolean;
    instagram: string;
    showInstagram?: boolean;
    whatsapp: string;
    showWhatsapp?: boolean;
    printerWidth: '58mm' | '80mm';
    auto_connect_printer?: boolean;
    printer_name?: string;
    qrPaymentEnabled?: boolean;
    receiptQrEnabled?: boolean;
    receiptQrType?: string;
    upiId?: string;
    upiName?: string;
    telegram?: string;
  } | null>(null);

  // Printer error dialog state
  const [printerErrorOpen, setPrinterErrorOpen] = useState(false);
  const [printerErrorMessage, setPrinterErrorMessage] = useState('');
  const [isRetryingPrint, setIsRetryingPrint] = useState(false);
  const pendingPaymentRef = useRef<{
    paymentData: any;
    billPayload: any;
    billItems: any[];
    printData: PrintData;
    validCart: CartItem[];
  } | null>(null);
  const retryKOTRef = useRef<(() => Promise<unknown>) | null>(null);

  // Enable real-time updates
  useRealTimeUpdates();

  // Listen for custom real-time events
  useEffect(() => {
    const handleItemsUpdate = () => {
      fetchItems();
    };
    const handleCategoriesUpdate = () => {
      fetchItemCategories();
      fetchDisplaySettings();
    };
    const handlePaymentsUpdate = () => {
      fetchPaymentTypes();
    };
    const handleAdditionalChargesUpdate = () => {
      console.log('Additional charges updated, refreshing...');
      fetchAdditionalCharges();
    };
    const handleShopSettingsUpdate = () => {
      console.log('Shop settings updated, refreshing...');
      fetchShopSettings();
    };
    const handleDisplaySettingsUpdate = () => {
      console.log('Display settings updated, refreshing...');
      fetchDisplaySettings();
    };

    window.addEventListener('items-updated', handleItemsUpdate);
    window.addEventListener('categories-updated', handleCategoriesUpdate);
    window.addEventListener('payment-types-updated', handlePaymentsUpdate);
    window.addEventListener('additional-charges-updated', handleAdditionalChargesUpdate);
    window.addEventListener('shop-settings-updated', handleShopSettingsUpdate);
    window.addEventListener('display-settings-updated', handleDisplaySettingsUpdate);

    return () => {
      window.removeEventListener('items-updated', handleItemsUpdate);
      window.removeEventListener('categories-updated', handleCategoriesUpdate);
      window.removeEventListener('payment-types-updated', handlePaymentsUpdate);
      window.removeEventListener('additional-charges-updated', handleAdditionalChargesUpdate);
      window.removeEventListener('shop-settings-updated', handleShopSettingsUpdate);
      window.removeEventListener('display-settings-updated', handleDisplaySettingsUpdate);
    };
  }, []);

  // Fetch functions defined before useEffect
  const fetchItems = async () => {
    if (!adminId) { setLoading(false); return; }
    try {
      // 1. FAST PATH: Load from cache instantly for zero lag
      const { offlineManager } = await import('@/utils/offlineManager');
      const cachedItems = await offlineManager.getCachedItems(adminId, operatingBranchId);
      
      let loadedFromCache = false;
      if (cachedItems && cachedItems.length > 0) {
        const sortedData = cachedItems
          .filter((i: any) => i.is_active && i.is_saleable !== false)
          .sort((a: any, b: any) => {
          const orderA = a.display_order ?? 9999;
          const orderB = b.display_order ?? 9999;
          if (orderA !== orderB) return orderA - orderB;
          return (a.name || '').localeCompare(b.name || '');
        });
        setItems(sortedData);
        loadedFromCache = true;
        // Don't toast if we're online, just silently load it to avoid lag
        if (!navigator.onLine) {
           toast({
            title: "Offline Mode",
            description: `Loaded ${sortedData.length} items from cache`,
          });
        }
      } else if (!navigator.onLine) {
        toast({
          title: "No Cached Data",
          description: "Connect to internet to load items",
          variant: "destructive"
        });
      }

      // If we got items from cache, we can hide the loading spinner immediately
      if (loadedFromCache) {
          setLoading(false);
      }

      // 2. SYNC PATH: Fetch latest from network if online
      if (navigator.onLine) {
        let q = supabase
          .from('items')
          .select('*, is_saleable')
          .eq('admin_id', adminId)
          .eq('is_active', true);
        if (branchFilterId) q = q.eq('branch_id', branchFilterId);
        
        const { data, error } = await q.order('name');
        if (error) throw error;

        // Filter saleable items client-side (default true)
        const saleableData = (data || []).filter((item: any) => item.is_saleable !== false);

        // Sort by display_order client-side if the field exists
        const sortedData = saleableData.sort((a: any, b: any) => {
          const orderA = a.display_order ?? 9999;
          const orderB = b.display_order ?? 9999;
          if (orderA !== orderB) return orderA - orderB;
          return (a.name || '').localeCompare(b.name || '');
        });

        const mappedData = sortedData.map((item: any) => ({
          ...item,
          image_url: item.image_url ? getCDNUrl(item.image_url) : item.image_url
        }));

        setItems(mappedData as Item[]);
        await offlineManager.cacheItems(mappedData);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
      // If we already loaded from cache, no need to show destructive error, just a warning
      toast({
        title: "Sync Error",
        description: "Could not sync latest items. Using cached data if available.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const fetchPaymentTypes = async () => {
    if (!adminId) return;
    try {
      let query = (supabase as any)
        .from('payments')
        .select('*')
        .eq('admin_id', adminId)
        .eq('is_disabled', false);

      if (operatingBranchId) {
        query = query.eq('branch_id', operatingBranchId);
      }

      const { data, error } = await query.order('payment_type');
      if (error) throw error;
      const types = data || [];
      setPaymentTypes(types);

      // Set default payment only if not in edit mode
      if (!isEditMode) {
        const defaultPayment = types.find(p => p.is_default);
        if (defaultPayment) {
          setSelectedPayment(defaultPayment.payment_type);
        } else if (types.length > 0) {
          setSelectedPayment(types[0].payment_type);
        }
      }
    } catch (error) {
      console.error('Error fetching payment types:', error);
      toast({
        title: "Error",
        description: "Failed to fetch payment types",
        variant: "destructive"
      });
    }
  };
  const fetchAdditionalCharges = async () => {
    if (!adminId) return;
    try {
      let query = (supabase as any)
        .from('additional_charges')
        .select('*')
        .eq('admin_id', adminId)
        .eq('is_active', true);

      if (operatingBranchId) {
        query = query.eq('branch_id', operatingBranchId);
      }

      const { data, error } = await query.order('name');
      if (error) throw error;
      setAdditionalCharges(data || []);
    } catch (error) {
      console.error('Error fetching additional charges:', error);
      toast({
        title: "Error",
        description: "Failed to fetch additional charges",
        variant: "destructive"
      });
    }
  };
  const fetchDisplaySettings = async () => {
    if (!profile?.user_id) return;
    try {
      const {
        data,
        error
      } = await supabase.from('display_settings').select('*').eq('user_id', profile.user_id).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        setDisplaySettings({
          items_per_row: data.items_per_row,
          category_order: data.category_order || []
        });
      }
    } catch (error) {
      console.error('Error fetching display settings:', error);
    }
  };

  const fetchItemCategories = async () => {
    if (!adminId) return;
    try {
      let catQ = supabase
        .from('item_categories')
        .select('*')
        .eq('admin_id', adminId)
        .eq('is_deleted', false);
      if (branchFilterId) catQ = catQ.eq('branch_id', branchFilterId);
      const { data, error } = await catQ.order('name');
      if (error) throw error;
      setItemCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  // Cache-first shop settings loading
  const loadShopSettingsFromCache = () => {
    const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
    const saved = localStorage.getItem(headerKey) ?? localStorage.getItem('hotel_pos_bill_header');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setBillSettings({
          shopName: parsed.shopName || '',
          address: parsed.address || '',
          contactNumber: parsed.contactNumber || '',
          logoUrl: parsed.logoUrl || '',
          facebook: parsed.facebook || '',
          showFacebook: parsed.showFacebook !== false,
          instagram: parsed.instagram || '',
          showInstagram: parsed.showInstagram !== false,
          whatsapp: parsed.whatsapp || '',
          showWhatsapp: parsed.showWhatsapp !== false,
          printerWidth: parsed.printerWidth || '58mm',
          qrPaymentEnabled: parsed.qrPaymentEnabled || false,
          telegram: parsed.telegram || '',
          receiptQrEnabled: parsed.receiptQrEnabled || false,
          receiptQrType: parsed.receiptQrType || 'payment',
          upiId: parsed.upiId || '',
          upiName: parsed.upiName || ''
        });
        setWhatsappEnabled(parsed.whatsappEnabled || parsed.whatsappBillShareEnabled || false);
        setQuickBillEnabled(parsed.quickBillEnabled || false);
        setWhatsappShareMode(parsed.whatsappShareMode === 'image' ? 'image' : 'text');
        setShowOrderType(parsed.showOrderType || false);
        if (parsed.defaultOrderType === 'dine_in' || parsed.defaultOrderType === 'parcel') {
          setDefaultOrderType(parsed.defaultOrderType);
        }
      } catch (e) { /* ignore */ }
    }
  };

  // Fetch shop settings from Supabase (background sync)
  const fetchShopSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // shop_settings.user_id stores the Auth UID, not the Profile UUID
      // For sub-users, resolve the parent admin's Auth UID
      let targetAuthId = user.id;
      if (profile?.role === 'user' && profile.admin_id) {
        const { data: parentProfile } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('id', profile.admin_id)
          .single();
        if (parentProfile?.user_id) {
          targetAuthId = parentProfile.user_id;
        }
      }

      let query = supabase
        .from('shop_settings')
        .select('*')
        .eq('user_id', targetAuthId);

      if (operatingBranchId) {
        query = query.eq('branch_id', operatingBranchId);
      } else {
        query = query.is('branch_id', null);
      }

      let { data, error } = await query.maybeSingle();

      // Fallback: main branch or any branch
      if (!data && !error) {
        const { data: mainBranch } = await supabase
          .from('branches')
          .select('id')
          .eq('admin_id', adminId)
          .eq('is_main', true)
          .maybeSingle();

        if (mainBranch?.id) {
          const { data: fallbackData } = await supabase
            .from('shop_settings')
            .select('*')
            .eq('user_id', targetAuthId)
            .eq('branch_id', mainBranch.id)
            .maybeSingle();
          data = fallbackData;
        }

        if (!data) {
          const { data: anyData } = await supabase
            .from('shop_settings')
            .select('*')
            .eq('user_id', targetAuthId)
            .order('branch_id', { nullsFirst: false })
            .limit(1)
            .maybeSingle();
          data = anyData;
        }
      }

      if (data) {
        const settings = {
          shopName: (activeBranch?.shop_name && activeBranch.shop_name.trim()) || data.shop_name || '',
          address: (activeBranch?.address && activeBranch.address.trim()) || data.address || '',
          contactNumber: (activeBranch?.contact_number && activeBranch.contact_number.trim()) || data.contact_number || '',
          logoUrl: (activeBranch?.logo_url && activeBranch.logo_url.trim()) || data.logo_url || '',
          facebook: data.facebook || '',
          showFacebook: data.show_facebook,
          instagram: data.instagram || '',
          showInstagram: data.show_instagram,
          whatsapp: data.whatsapp || '',
          showWhatsapp: data.show_whatsapp,
          printerWidth: data.printer_width as '58mm' | '80mm' || '58mm',
          whatsappEnabled: data.whatsapp_bill_share_enabled || false,
          whatsappShareMode: (data as any).whatsapp_share_mode || 'text',
          showOrderType: (data as any).show_order_type || false,
          defaultOrderType: (data as any).default_order_type || undefined,
          qrPaymentEnabled: data.qr_payment_enabled || false,
          telegram: data.telegram || '',
          receiptQrEnabled: data.receipt_qr_enabled || false,
          receiptQrType: data.receipt_qr_type || 'payment',
          upiId: data.upi_id || '',
          upiName: data.upi_name || '',
          quickBillEnabled: data.quick_bill_enabled || false
        };
        setBillSettings(settings);
        setWhatsappEnabled(data.whatsapp_bill_share_enabled || false);
        setQuickBillEnabled(data.quick_bill_enabled || false);
        setWhatsappShareMode((data as any).whatsapp_share_mode === 'image' ? 'image' : 'text');
        setShowOrderType((data as any).show_order_type || false);
        const dot = (data as any).default_order_type;
        if (dot === 'dine_in' || dot === 'parcel') setDefaultOrderType(dot); else setDefaultOrderType(undefined);
        const calciFromShopSettings = !!(data as any).calci_billing_enabled;
        const isCalciAvailable = calciFromShopSettings;
        setCalciEnabled(isCalciAvailable);
        if (!isCalciAvailable) setAppBillingMode('pos');
        // Update cache
        const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
        localStorage.setItem(headerKey, JSON.stringify(settings));

        // Load GST settings
        if ((data as any).gst_enabled) {
          let adminAuthId = profile?.role === 'admin' ? profile.user_id : null;
          if (profile?.role === 'user' && profile.admin_id) {
            const { data: parentProfile } = await supabase
              .from('profiles')
              .select('user_id')
              .eq('id', profile.admin_id)
              .single();
            if (parentProfile?.user_id) {
              adminAuthId = parentProfile.user_id;
            }
          }

          if (adminAuthId) {
            let ratesQuery = (supabase as any)
              .from('tax_rates')
              .select('id, name, rate, cess_rate, hsn_code')
              .eq('admin_id', adminAuthId)
              .eq('is_active', true);
            if (operatingBranchId) {
              ratesQuery = ratesQuery.or(`branch_id.eq.${operatingBranchId},branch_id.is.null`);
            }
            const { data: rates } = await ratesQuery;
            const taxRatesMap: Record<string, any> = {};
            (rates || []).forEach((r: any) => {
              taxRatesMap[r.id] = { rate: r.rate, name: r.name, cess: r.cess_rate || 0, hsn_code: r.hsn_code || '' };
            });
            setGstSettings({
              enabled: true,
              gstin: (data as any).gstin || '',
              isComposition: (data as any).is_composition_scheme || false,
              taxRatesMap
            });
          }
        } else {
          setGstSettings({ enabled: false, gstin: '', isComposition: false, taxRatesMap: {} });
        }

        return settings;
      } else {
        // No shop_settings found — still check client_permissions for calci access
        if (profile?.client_permissions?.['calci_billing'] === true) {
          setCalciEnabled(true);
        }
      }
      return null;
    } catch (error) {
      console.error('Error fetching shop settings:', error);
      // Even on error, check client_permissions for calci
      if (profile?.client_permissions?.['calci_billing'] === true) {
        setCalciEnabled(true);
      }
      return null;
    }
  };

  useEffect(() => {
    if (!adminId) return;
    fetchItems();
    fetchPaymentTypes();
    fetchAdditionalCharges();
    fetchItemCategories();
    loadShopSettingsFromCache(); // Instant load from cache
    fetchShopSettings();          // Background sync from Supabase
    if (profile?.user_id) {
      fetchDisplaySettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminId, branchFilterId]);

  // Re-fetch shop settings whenever the active branch changes so prints/share use branch header
  useEffect(() => {
    fetchShopSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranch?.id]);

  useEffect(() => {

    // Check if we're editing a bill
    const billData = location.state?.bill;
    if (billData) {
      setEditingBill(billData);
      setIsEditMode(true);
      loadBillData(billData.id);
    }

    // Load local settings
    const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
    const savedHeader = localStorage.getItem(headerKey) ?? localStorage.getItem('hotel_pos_bill_header');
    const savedWidth = localStorage.getItem('hotel_pos_printer_width') as '58mm' | '80mm';
    if (savedHeader || savedWidth) {
      setBillSettings({
        ...JSON.parse(savedHeader || '{}'),
        printerWidth: savedWidth || '58mm'
      });
    }
  }, [location.state, profile?.user_id]);

  // Reorder: load latest bill items (skip unavailable) after items catalog is ready
  const reorderConsumedRef = useRef<string | null>(null);
  useEffect(() => {
    const reorderBillId = location.state?.reorderBillId;
    if (!reorderBillId || items.length === 0 || reorderConsumedRef.current === reorderBillId) return;
    reorderConsumedRef.current = reorderBillId;
    (async () => {
      try {
        const { data: billItems, error } = await supabase
          .from('bill_items')
          .select('quantity, price, item_id, item_name_override, billing_type, items(id, name, is_active, price, unit, base_value, quantity_step, stock_quantity)')
          .eq('bill_id', reorderBillId);
        if (error) throw error;
        const catalogById = new Map(items.map(i => [i.id, i]));
        const added: string[] = [];
        const unavailable: string[] = [];
        const newCart: CartItem[] = [];
        for (const bi of (billItems || [])) {
          // Handle calci items (item_id is null)
          if (!bi.item_id || (bi as any).billing_type === 'calci') {
            const calciName = (bi as any).item_name_override || `Item`;
            const tempId = `calci-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            newCart.push({
              id: tempId,
              name: calciName,
              item_name_override: calciName,
              price: Number(bi.price),
              quantity: Number(bi.quantity) || 1,
              is_active: true,
              unit: 'pcs',
              base_value: 1,
              is_tax_inclusive: true,
              tax_rate_id: null,
              store_price: Number(bi.price)
            } as CartItem);
            added.push(calciName);
            continue;
          }
          const catalogItem = catalogById.get(bi.item_id) || (bi as any).items;
          const name = (bi as any).items?.name || 'Item';
          if (!catalogItem || !catalogItem.is_active) { unavailable.push(name); continue; }
          if (catalogItem.stock_quantity !== null && catalogItem.stock_quantity !== undefined && Number(catalogItem.stock_quantity) <= 0) {
            unavailable.push(name); continue;
          }
          newCart.push({ ...(catalogItem as any), price: catalogItem.price, quantity: Number(bi.quantity) || 1 });
          added.push(name);
        }
        if (newCart.length > 0) {
          setCart(newCart);
          toast({ title: 'Reorder loaded', description: `Added ${added.length} item(s) to cart.` });
        }
        if (unavailable.length > 0) {
          toast({
            title: 'Some items unavailable',
            description: `${unavailable.slice(0, 5).join(', ')}${unavailable.length > 5 ? '…' : ''}`,
            variant: 'destructive',
          });
        }
        if (location.state?.customerPhone) {
          try { localStorage.setItem('pending_customer_phone', location.state.customerPhone); } catch {}
        }
      } catch (e) {
        console.error('reorder load failed', e);
        toast({ title: 'Reorder failed', description: 'Could not load previous bill items.', variant: 'destructive' });
      }
    })();
  }, [location.state, items]);

  const loadBillData = async (billId: string) => {
    try {
      console.log('Loading bill data for:', billId);

      // Fetch bill items with item details
      const {
        data: billItems,
        error: billItemsError
      } = await supabase.from('bill_items').select(`
          *,
          items (
            id,
            name,
            price,
            image_url,
            is_active,
            unit,
            base_value,
            quantity_step
          )
        `).eq('bill_id', billId);
      if (billItemsError) {
        console.error('Error fetching bill items:', billItemsError);
        throw billItemsError;
      }
      console.log('Bill items loaded:', billItems);

      // Convert bill items to cart items
      if (billItems && billItems.length > 0) {
        const cartItems: CartItem[] = billItems.map((billItem: BillItem) => {
          const itemData = billItem.items as any;
          // Handle calci items (item_id is null, no joined items data)
          if (!billItem.item_id || !itemData) {
            const calciName = (billItem as any).item_name_override || `Item`;
            const tempId = `calci-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            return {
              id: tempId,
              name: calciName,
              item_name_override: calciName,
              price: billItem.price,
              quantity: billItem.quantity,
              is_active: true,
              unit: 'pcs',
              base_value: 1,
              is_tax_inclusive: true,
              tax_rate_id: null,
              store_price: billItem.price
            };
          }
          return {
            id: itemData.id,
            name: itemData.name,
            price: billItem.price, // Use price from bill item
            image_url: itemData.image_url,
            is_active: itemData.is_active,
            unit: itemData.unit,
            base_value: itemData.base_value,
            quantity_step: itemData.quantity_step,
            quantity: billItem.quantity
          };
        });
        setCart(cartItems.filter(item => item.quantity > 0));
        setDiscount(editingBill?.discount || 0);
        setSelectedPayment(editingBill?.payment_mode || '');
      }
    } catch (error) {
      console.error('Error loading bill data:', error);
      toast({
        title: "Error",
        description: "Failed to load bill data",
        variant: "destructive"
      });
    }
  };

  // Memoized Quick Keys
  const quickKeyItems = useMemo(() => {
    try {
      const shortcodesStr = localStorage.getItem('hotel_pos_calci_shortcodes');
      if (!shortcodesStr) return [];
      const shortcodes = JSON.parse(shortcodesStr);
      const qkArray = [];
      for (const [code, itemId] of Object.entries(shortcodes)) {
        const item = items.find(i => i.id === itemId);
        if (item) {
          qkArray.push({ id: item.id, shortcode: code, name: item.name });
        }
      }
      return qkArray;
    } catch {
      return [];
    }
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(query);
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      // Hide out-of-stock items (items with stock_quantity of 0 or less)
      // Items without stock tracking (null/undefined) are still shown
      const isInStock = item.stock_quantity === null || item.stock_quantity === undefined || item.stock_quantity > 0;
      return matchesSearch && matchesCategory && isInStock;
    });
  }, [items, searchQuery, selectedCategory]);
  const addToCart = (item: Item) => {
    const existing = cart.find(cartItem => cartItem.id === item.id);
    const step = item.quantity_step || 1;
    const baseValue = item.base_value || 1;
    const targetQty = existing ? existing.quantity + step : baseValue;

    if (item.stock_quantity !== null && item.stock_quantity !== undefined) {
      const invUnit = (item as any).inventory_unit;
      const sellUnit = (item as any).selling_unit || item.unit;
      const targetInInvUnit = convertToInventoryUnit(targetQty, sellUnit, invUnit);
      if (targetInInvUnit > Number(item.stock_quantity)) {
        toast({
          title: '🚫 Stock Limit Exceeded',
          description: `Cannot add more ${item.name}. Available stock: ${formatStoredQuantity(item.stock_quantity, invUnit || item.unit)}.`,
          variant: 'destructive',
        });
        return;
      }
    }

    setCart(prev => {
      if (existing) {
        return prev.map(cartItem => cartItem.id === item.id ? {
          ...cartItem,
          quantity: cartItem.quantity + step
        } : cartItem);
      }
      const storePrice = item.price;
      const channelPrice = getChannelPrice(item, orderChannel);
      return [...prev, {
        ...item,
        store_price: storePrice,
        price: channelPrice,
        quantity: baseValue
      }];
    });
    // Low-stock warning when item drops below configured threshold
    if (isLowStock(item)) {
      const invUnit = (item as any).inventory_unit;
      toast({
        title: '⚠️ Low Stock',
        description: `${item.name}: only ${formatStoredQuantity(item.stock_quantity!, invUnit || item.unit)} left`,
      });
    }
    // Clear search after adding to cart for user friendliness
    setSearchQuery('');
  };
  // Quick Chip handler: parses chip text (e.g., "500 ml") and adds with converted quantity
  const addToCartWithChip = (item: Item, chipText: string) => {
    const chipQty = parseQuickChipQuantity(chipText, item.unit);
    if (chipQty === null || chipQty <= 0) {
      toast({
        title: 'Invalid Chip',
        description: `Could not parse "${chipText}"`,
        variant: 'destructive',
      });
      return;
    }
    const existing = cart.find(cartItem => cartItem.id === item.id);
    const targetQty = existing ? existing.quantity + chipQty : chipQty;

    if (item.stock_quantity !== null && item.stock_quantity !== undefined) {
      const invUnit = (item as any).inventory_unit;
      const sellUnit = (item as any).selling_unit || item.unit;
      const targetInInvUnit = convertToInventoryUnit(targetQty, sellUnit, invUnit);
      if (targetInInvUnit > Number(item.stock_quantity)) {
        toast({
          title: '🚫 Stock Limit Exceeded',
          description: `Cannot add ${chipText} of ${item.name}. Available stock: ${formatStoredQuantity(item.stock_quantity, invUnit || item.unit)}.`,
          variant: 'destructive',
        });
        return;
      }
    }

    setCart(prev => {
      if (existing) {
        return prev.map(cartItem => cartItem.id === item.id ? {
          ...cartItem,
          quantity: cartItem.quantity + chipQty
        } : cartItem);
      }
      const storePrice = item.price;
      const channelPrice = getChannelPrice(item, orderChannel);
      return [...prev, {
        ...item,
        store_price: storePrice,
        price: channelPrice,
        quantity: chipQty
      }];
    });
    if (isLowStock(item)) {
      const invUnit = (item as any).inventory_unit;
      toast({
        title: '⚠️ Low Stock',
        description: `${item.name}: only ${formatStoredQuantity(item.stock_quantity!, invUnit || item.unit)} left`,
      });
    }
    setSearchQuery('');
  };

  const addToCartWithAmount = (item: Item, amount: number) => {
    const channelPrice = getChannelPrice(item, orderChannel);
    if (channelPrice <= 0) return;
    const baseValue = item.base_value || 1;
    const calculatedQty = parseFloat(((amount * baseValue) / channelPrice).toFixed(3));
    
    const existing = cart.find(cartItem => cartItem.id === item.id);
    const targetQty = existing ? existing.quantity + calculatedQty : calculatedQty;
    
    if (item.stock_quantity !== null && item.stock_quantity !== undefined) {
      const invUnit = (item as any).inventory_unit;
      const sellUnit = (item as any).selling_unit || item.unit;
      const targetInInvUnit = convertToInventoryUnit(targetQty, sellUnit, invUnit);
      if (targetInInvUnit > Number(item.stock_quantity)) {
        toast({
          title: '🚫 Stock Limit Exceeded',
          description: `Cannot add ₹${amount} worth of ${item.name}. Available stock: ${formatStoredQuantity(item.stock_quantity, invUnit || item.unit)}.`,
          variant: 'destructive',
        });
        return;
      }
    }
    
    setCart(prev => {
      if (existing) {
        return prev.map(cartItem => cartItem.id === item.id ? {
          ...cartItem,
          quantity: parseFloat((cartItem.quantity + calculatedQty).toFixed(3))
        } : cartItem);
      }
      return [...prev, {
        ...item,
        store_price: item.price,
        price: channelPrice,
        quantity: calculatedQty
      }];
    });
    
    if (isLowStock(item)) {
      const invUnit = (item as any).inventory_unit;
      toast({
        title: '⚠️ Low Stock',
        description: `${item.name}: only ${formatStoredQuantity(item.stock_quantity!, invUnit || item.unit)} left`,
      });
    }
    setSearchQuery('');
  };

  const updateQuantity = (id: string, change: number) => {
    const cartItem = cart.find(c => c.id === id);
    if (!cartItem) return;

    const step = cartItem.quantity_step || 1;
    const actualChange = change > 0 ? step : -step;
    const targetQty = cartItem.quantity + actualChange;

    if (actualChange > 0 && cartItem.stock_quantity !== null && cartItem.stock_quantity !== undefined) {
      const invUnit = (cartItem as any).inventory_unit;
      const sellUnit = (cartItem as any).selling_unit || cartItem.unit;
      const targetInInvUnit = convertToInventoryUnit(targetQty, sellUnit, invUnit);
      if (targetInInvUnit > Number(cartItem.stock_quantity)) {
        toast({
          title: '🚫 Stock Limit Exceeded',
          description: `Cannot increase quantity. Available stock: ${formatStoredQuantity(cartItem.stock_quantity, invUnit || cartItem.unit)}.`,
          variant: 'destructive',
        });
        return;
      }
    }

    setCart(prev => {
      return prev.map(item => {
        if (item.id === id) {
          const newQuantity = Math.max(0, item.quantity + actualChange);
          return {
            ...item,
            quantity: newQuantity
          };
        }
        return item;
      }).filter(item => item.quantity > 0);
    });
  };
  const startEditingQuantity = (id: string, currentQuantity: number) => {
    setEditingQuantity(id);
    setTempQuantity(currentQuantity.toString());
  };
  const saveQuantity = (id: string) => {
    const newQuantity = parseInt(tempQuantity);
    if (newQuantity && newQuantity > 0) {
      const cartItem = cart.find(c => c.id === id);
      if (cartItem && cartItem.stock_quantity !== null && cartItem.stock_quantity !== undefined) {
        const invUnit = (cartItem as any).inventory_unit;
        const sellUnit = (cartItem as any).selling_unit || cartItem.unit;
        const targetInInvUnit = convertToInventoryUnit(newQuantity, sellUnit, invUnit);
        if (targetInInvUnit > Number(cartItem.stock_quantity)) {
          toast({
            title: '🚫 Stock Limit Exceeded',
            description: `Only ${formatStoredQuantity(cartItem.stock_quantity, invUnit || cartItem.unit)} available in stock.`,
            variant: 'destructive',
          });
          return;
        }
      }
      setCart(prev => prev.map(item => item.id === id ? {
        ...item,
        quantity: newQuantity
      } : item).filter(item => item.quantity > 0));
    } else {
      // If quantity is 0 or invalid, remove item from cart
      setCart(prev => prev.filter(item => item.id !== id));
    }
    setEditingQuantity(null);
    setTempQuantity('');
  };
  const cancelEditQuantity = () => {
    setEditingQuantity(null);
    setTempQuantity('');
  };
  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };
  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setIsEditMode(false);
    setEditingBill(null);
    // Navigate back to billing without any state
    navigate('/billing', {
      replace: true
    });
  };

  // Voice command handler
  // --- Calci Billing Logic ---
  const handleCalciSubmit = (expression: string): boolean => {
    if (!expression.trim()) return false;
    
    try {
      // Split by +
      const parts = expression.split('+');
      const localCart = [...cart];
      
      const shortcodesStr = localStorage.getItem('hotel_pos_calci_shortcodes');
      let shortcodes: Record<string, string> = {};
      try { if (shortcodesStr) shortcodes = JSON.parse(shortcodesStr); } catch { /* corrupted data, ignore */ }
      
      let itemsAdded = 0;

      for (const part of parts) {
        let trimmed = part.trim().toLowerCase();
        if (!trimmed) continue;
        
        let qty = 1;
        
        // Extract leading quantity multiplier if it exists (e.g., "2*T1" or "3x#12")
        const multMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*[*x×]\s*(.+)$/);
        if (multMatch) {
          qty = parseFloat(multMatch[1]);
          trimmed = multMatch[2].trim();
        }
        
        // 1. Check if it's a shortcode (MUST have * or # prefix to avoid overlapping with unrated cash amounts)
        let matchedItemId: string | undefined = undefined;
        
        if (trimmed.startsWith('*') || trimmed.startsWith('#')) {
           const withoutPrefix = trimmed.substring(1);
           if (shortcodes[withoutPrefix]) {
             matchedItemId = shortcodes[withoutPrefix];
           }
        }

        if (matchedItemId) {
          const actualItem = items.find(i => i.id === matchedItemId);
          if (actualItem && !isNaN(qty) && qty > 0) {
            const safeQty = qty; // Allow decimal quantities for grams, ml, etc.
            const existingIdx = localCart.findIndex(ci => ci.id === actualItem.id);
            if (existingIdx >= 0) {
              localCart[existingIdx] = { ...localCart[existingIdx], quantity: localCart[existingIdx].quantity + safeQty };
            } else {
              localCart.push({ ...actualItem, quantity: safeQty, store_price: actualItem.price });
            }
            itemsAdded++;
            continue;
          }
        }
        
        // 2. If no shortcode matched, process as a standard price entry
        let price = 0;
        
        // If there was no leading multiplier, maybe it's in the middle (e.g., "15*2" -> qty=15, price=2 or vice versa)
        // By convention let's assume the larger number is price, smaller is qty if ambiguous, or just first is qty.
        // Actually, we'll just parse whatever is left.
        if (!multMatch && (trimmed.includes('*') || trimmed.includes('x') || trimmed.includes('×'))) {
          const splitParts = trimmed.split(/[*x×]/);
          if (splitParts.length === 2) {
            qty = parseFloat(splitParts[0]);
            price = parseFloat(splitParts[1]);
          } else {
            price = parseFloat(trimmed);
          }
        } else {
          price = parseFloat(trimmed);
        }
        
        if (isNaN(price) || isNaN(qty) || price <= 0 || qty <= 0) continue;
        
        const tempId = `calci-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newItem: CartItem = {
          id: tempId,
          name: `Item`,
          item_name_override: `Item`,
          price: price,
          quantity: qty,
          is_active: true,
          unit: 'pcs',
          base_value: 1,
          is_tax_inclusive: true,
          tax_rate_id: null,
          store_price: price
        };
        
        // Consolidate: if a calci item with the same price already exists, increase qty
        const existingIdx = localCart.findIndex(ci => String(ci.id).startsWith('calci-') && ci.price === price);
        if (existingIdx >= 0) {
          localCart[existingIdx] = { ...localCart[existingIdx], quantity: localCart[existingIdx].quantity + qty };
        } else {
          localCart.push(newItem);
        }
        itemsAdded++;
      }
      
      if (itemsAdded > 0) {
        setCart(localCart);
        setCalciInput('');
        toast({ title: "Added from Calculator", description: expression });
        return true;
      } else {
        toast({ title: "Invalid expression", description: "Please enter a valid amount or shortcode", variant: "destructive" });
        return false;
      }
    } catch (err) {
      toast({ title: "Error parsing expression", variant: "destructive" });
      return false;
    }
  };
  
  const handleCalciKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCalciSubmit(calciInput);
    }
  };

  const handleVoiceIntent = useCallback((intent: VoiceIntent) => {
    switch (intent.intent) {
      case 'add_item': {
        if (intent.itemId) {
          const item = items.find(i => i.id === intent.itemId);
          if (!item) {
            toast({ title: 'Item not found', description: intent.itemName || intent.raw, variant: 'destructive' });
            return;
          }
          const qty = Math.max(1, Math.round(intent.qty || 1));
          for (let n = 0; n < qty; n++) addToCart(item);
          toast({ title: 'Added by voice', description: `${item.name} × ${qty}` });
        } else if (intent.candidates?.length) {
          setSearchQuery(intent.candidates[0].name);
          toast({ title: 'Multiple matches', description: `Showing "${intent.candidates[0].name}" — tap to confirm.` });
        }
        break;
      }
      case 'clear_cart':
        clearCart();
        toast({ title: 'Cart cleared' });
        break;
      case 'open_pay':
      case 'complete_payment':
        if (cart.length === 0) {
          toast({ title: 'Cart is empty', variant: 'destructive' });
        } else {
          if (quickBillEnabled) {
            executeFastCash();
          } else {
            setPaymentDialogOpen(true);
          }
        }
        break;
      case 'set_payment': {
        const pm = intent.paymentMethod;
        if (pm) {
          const match = paymentTypes.find(pt => pt.payment_type?.toLowerCase() === pm);
          if (match) setSelectedPayment(match.payment_type);
          else setSelectedPayment(pm);
          toast({ title: `Payment: ${pm.toUpperCase()}${intent.amount ? ` ₹${intent.amount}` : ''}` });
        }
        break;
      }
      case 'set_discount':
        if (typeof intent.discount === 'number') {
          setDiscount(intent.discount);
          toast({ title: `Discount set: ₹${intent.discount}` });
        }
        break;
      case 'set_customer':
        if (intent.mobile) {
          try { localStorage.setItem('pending_customer_phone', intent.mobile); } catch {}
          toast({ title: `Customer: ${intent.mobile}` });
        }
        break;
      default:
        break;
    }
  }, [items, cart, paymentTypes]);

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('billing-view-mode', mode);
  };
  const getTotalAmount = () => {
    const subtotal = cart.reduce((sum, item) => {
      const baseValue = item.base_value || 1;
      const itemTotal = (item.quantity / baseValue) * item.price;
      return sum + itemTotal;
    }, 0);
    return Math.max(0, subtotal - discount);
  };
  const total = getTotalAmount();

  // Map payment types to valid enum values
  const mapPaymentMode = (paymentType: string): PaymentMode => {
    const normalizedType = paymentType.toLowerCase().trim();
    switch (normalizedType) {
      case 'cash':
        return 'cash';
      case 'upi':
      case 'phonepe':
      case 'gpay':
      case 'paytm':
        return 'upi';
      case 'card':
      case 'debit':
      case 'credit':
        return 'card';
      default:
        return 'other';
    }
  };
  const updateBill = async () => {
    if (!editingBill) return;
    if (cart.length === 0) {
      toast({
        title: "Error",
        description: "Cart is empty",
        variant: "destructive"
      });
      return;
    }
    if (!selectedPayment) {
      toast({
        title: "Error",
        description: "Please select a payment method",
        variant: "destructive"
      });
      return;
    }
    try {
      console.log('Updating bill:', editingBill.id);
      const paymentMode = mapPaymentMode(selectedPayment);

      // Calculate GST if enabled
      let taxSummary: any = null;
      let totalTax = 0;
      let totalExclusiveTax = 0;
      let itemTaxes: any[] = [];
      if (gstSettings.enabled) {
        const { calculateItemTax, calculateBillTaxSummary } = await import('@/utils/gstCalculator');
        itemTaxes = cart.map(item => {
          const itemAny = item as any;
          const taxRateId = itemAny.tax_rate_id;
          const taxRateInfo = taxRateId ? gstSettings.taxRatesMap[taxRateId] : null;
          if (!taxRateInfo) return { taxableAmount: (item.quantity / (item.base_value || 1)) * item.price, cgst: 0, sgst: 0, cess: 0, totalTax: 0, totalWithTax: (item.quantity / (item.base_value || 1)) * item.price, taxRate: 0, _cessRate: 0, _taxName: '', _isTaxInclusive: true };
          const lineTotal = (item.quantity / (item.base_value || 1)) * item.price;
          const isTaxInclusive = itemAny.is_tax_inclusive !== false;
          const cessRate = (taxRateInfo as any).cess_rate || taxRateInfo.cess || 0;
          const result = calculateItemTax(lineTotal, taxRateInfo.rate, cessRate, isTaxInclusive);
          if (!isTaxInclusive) {
            totalExclusiveTax += result.totalTax;
          }
          return { ...result, _cessRate: cessRate, _taxName: taxRateInfo.name || `GST ${taxRateInfo.rate}%`, _isTaxInclusive: isTaxInclusive };
        });
        const summary = calculateBillTaxSummary(cart.map((item, i) => ({
          price: item.price,
          quantity: item.quantity,
          total: (item.quantity / (item.base_value || 1)) * item.price,
          taxRate: itemTaxes[i].taxRate,
          taxName: (itemTaxes[i] as any)._taxName || `GST ${itemTaxes[i].taxRate}%`,
          cessRate: (itemTaxes[i] as any)._cessRate || 0,
          isTaxInclusive: (itemTaxes[i] as any)._isTaxInclusive !== false,
          hsnCode: (item as any).hsn_code || gstSettings.taxRatesMap[(item as any).tax_rate_id]?.hsn_code || ''
        })));
        taxSummary = summary;
        totalTax = itemTaxes.reduce((s, t) => s + t.totalTax, 0);
      }

      // Update bill with GST fields
      const billPayload: any = {
        total_amount: getTotalAmount() + totalExclusiveTax,
        discount: discount,
        payment_mode: paymentMode,
        is_edited: true
      };

      if (gstSettings.enabled && taxSummary) {
        billPayload.tax_summary = JSON.stringify(taxSummary);
        billPayload.total_tax = totalTax;
      }

      const {
        error: billError
      } = await supabase.from('bills').update(billPayload).eq('id', editingBill.id);
      if (billError) {
        console.error('Bill update error:', billError);
        throw billError;
      }

      // Delete existing bill items
      const {
        error: deleteError
      } = await supabase.from('bill_items').delete().eq('bill_id', editingBill.id);
      if (deleteError) {
        console.error('Error deleting old bill items:', deleteError);
        throw deleteError;
      }

      // Insert new bill items
      const billItems = cart.map(item => {
        const baseValue = item.base_value || 1;
        const lineTotal = (item.quantity / baseValue) * item.price;
        const billItem: any = {
          bill_id: editingBill.id,
          item_id: String(item.id).startsWith('calci-') ? null : item.id,
          quantity: item.quantity,
          price: item.price,
          total: lineTotal,
          billing_type: String(item.id).startsWith('calci-') ? 'calci' : 'pos',
          item_name_override: String(item.id).startsWith('calci-') ? item.name : undefined
        };

        if (gstSettings.enabled) {
          const itemAny = item as any;
          const taxRateId = itemAny.tax_rate_id;
          if (taxRateId && gstSettings.taxRatesMap) {
            const taxRateInfo = gstSettings.taxRatesMap[taxRateId];
            if (taxRateInfo) {
              billItem.tax_rate_snapshot = taxRateInfo.rate;
              billItem.tax_rate = taxRateInfo.rate;
              billItem.hsn_code = itemAny.hsn_code || taxRateInfo.hsn_code || null;
              billItem.tax_type = 'GST';

              const taxRate = taxRateInfo.rate;
              const isTaxInclusive = itemAny.is_tax_inclusive !== false;
              const cessRate = taxRateInfo.cess || 0;
              let taxableValue = lineTotal;
              let taxAmount = 0;
              if (isTaxInclusive) {
                taxableValue = lineTotal / (1 + (taxRate + cessRate) / 100);
                taxAmount = lineTotal - taxableValue;
              } else {
                taxAmount = lineTotal * (taxRate + cessRate) / 100;
              }
              billItem.taxable_amount = Math.round(taxableValue * 100) / 100;
              billItem.tax_amount = Math.round(taxAmount * 100) / 100;
            }
          }
        }
        return billItem;
      });
      const {
        error: itemsError
      } = await supabase.from('bill_items').insert(billItems);
      if (itemsError) {
        console.error('Bill items error:', itemsError);
        throw itemsError;
      }
      toast({
        title: "Success",
        description: `Bill ${editingBill.bill_no} updated successfully!`
      });

      // Clear cart and navigate back to reports
      clearCart();
      navigate('/reports');
    } catch (error) {
      console.error('Error updating bill:', error);
      toast({
        title: "Error",
        description: "Failed to update bill. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Helper function to save bill to database securely via Server RPC
  const saveBillToDatabase = async (
    billPayload: any,
    validCart: CartItem[],
    billNumber: string
  ) => {
    // 1. Invoke the secure stored procedure to calculate and insert everything server-side
    const { data: resultData, error: rpcError } = await supabase.rpc('secure_create_bill', {
      p_bill_payload: {
        bill_no: billNumber,
        total_amount: billPayload.total_amount,
        created_by: profile?.user_id,
        payment_mode: billPayload.payment_mode,
        payment_details: billPayload.payment_details,
        additional_charges: billPayload.additional_charges,
        discount: billPayload.discount || 0,
        order_type: billPayload.order_type || 'dine_in',
        table_no: billPayload.table_no || null,
        customer_mobile: billPayload.customer_mobile || null,
        customer_gstin: billPayload.customer_gstin || null,
        branch_id: operatingBranchId || null,
        admin_id: adminId || null,
        channel: billPayload.channel || 'store',
        billing_type: appBillingMode
      },
      p_cart_items: validCart.map(item => ({
        id: String(item.id).startsWith('calci-') ? null : item.id,
        name: item.name,
        item_name_override: item.item_name_override,
        price: item.price,
        quantity: item.quantity,
        billing_type: String(item.id).startsWith('calci-') ? 'calci' : 'pos'
      }))
    });

    if (rpcError) {
      console.error('Error invoking secure_create_bill RPC:', rpcError);
      throw rpcError;
    }
    if (!resultData) throw new Error('Failed to create secure bill record');

    const billData = resultData as any;

    toast({
      title: "Success",
      description: `Bill ${billNumber} generated!`,
      duration: 2000
    });

    // === INSTANT 4-LAYER SYNC ===
    // Layer 3: Window custom events - same tab (0ms)
    window.dispatchEvent(new CustomEvent('bills-updated'));

    // Layer 1: BroadcastChannel - same browser tabs (0ms) - INSTANT VOICE
    billsChannel?.postMessage({
      type: 'new-bill',
      bill_no: billNumber,
      bill_id: billData.id,
      timestamp: Date.now()
    });

    // Layer 2: Supabase Broadcast - cross-device (<100ms) - INSTANT VOICE
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

    return billData;
  };

  const printSplitKOTsWithFeedback = async (
    validCart: CartItem[],
    billNumber: string,
    orderType: 'dine_in' | 'parcel' | undefined,
    settingsToUse: typeof billSettings,
    retryStations?: string[]
  ) => {
    const catStationMap: Record<string, string> = {};
    for (const c of itemCategories) {
      catStationMap[c.name.toLowerCase()] = (c.print_station || 'kitchen').toLowerCase();
    }
    const kotItems = validCart.map((it: any) => ({
      name: it.name,
      quantity: it.quantity,
      unit: it.unit,
      selling_unit: it.selling_unit,
      category: it.category,
    }));
    const toastId = `kot-${billNumber}-${retryStations?.join('-') || 'all'}`;
    sonnerToast.loading('Printing station KOT/BOT…', {
      id: toastId,
      description: retryStations?.length ? `Retrying ${retryStations.join(', ')}` : 'Preparing Kitchen/Bar/Dessert tickets',
    });

    const result = await printKOTs(kotItems, catStationMap, {
      billNo: billNumber,
      tableNo: selectedTableNumber || undefined,
      orderType,
      printerWidth: (settingsToUse?.printerWidth || '58mm') as '58mm' | '80mm',
      shopName: settingsToUse?.shopName,
    }, {
      stationFilter: retryStations,
      onProgress: (event) => {
        const station = event.station.charAt(0).toUpperCase() + event.station.slice(1);
        if (event.status === 'printing') {
          sonnerToast.loading('Printing station KOT/BOT…', {
            id: toastId,
            description: `${event.index}/${event.total}: ${station}${event.deviceName ? ` → ${event.deviceName}` : ' → active printer'}`,
          });
        }
      }
    });

    const failedStations = result.results.filter((r: KOTPrintStationResult) => !r.ok).map(r => r.station);
    if (result.failed > 0) {
      retryKOTRef.current = () => printSplitKOTsWithFeedback(validCart, billNumber, orderType, settingsToUse, failedStations);
      sonnerToast.error(`KOT failed for ${result.failed} station${result.failed > 1 ? 's' : ''}`, {
        id: toastId,
        description: failedStations.join(', '),
        action: {
          label: 'Retry failed',
          onClick: () => retryKOTRef.current?.(),
        },
        duration: 10000,
      });
    } else if (result.ok > 0) {
      sonnerToast.success('Station KOT/BOT printed', {
        id: toastId,
        description: `${result.ok} station${result.ok > 1 ? 's' : ''} printed successfully`,
      });
    } else {
      sonnerToast.dismiss(toastId);
    }
    return result;
  };

  // Handler for retry print button in error dialog
  const handleRetryPrint = async () => {
    if (!pendingPaymentRef.current) return;

    setIsRetryingPrint(true);
    try {
      const printed = await printReceipt(pendingPaymentRef.current.printData);
      if (printed) {
        // Print successful - now save the bill
        setPrinterErrorOpen(false);
        await saveBillToDatabase(
          pendingPaymentRef.current.billPayload,
          pendingPaymentRef.current.validCart,
          pendingPaymentRef.current.printData.billNo
        );
        pendingPaymentRef.current = null;
      } else {
        // Still failed
        setPrinterErrorMessage("Printer did not respond. Check connection.");
      }
    } catch (e: any) {
      console.error("Retry print failed:", e);
      setPrinterErrorMessage(e.message || "Print failed. Try again.");
    } finally {
      setIsRetryingPrint(false);
    }
  };

  // Handler for save without printing button in error dialog
  const handleSaveWithoutPrint = async () => {
    if (!pendingPaymentRef.current) return;

    setPrinterErrorOpen(false);
    try {
      await saveBillToDatabase(
        pendingPaymentRef.current.billPayload,
        pendingPaymentRef.current.validCart,
        pendingPaymentRef.current.printData.billNo
      );

      // Fallback to browser print
      await printBrowserReceipt(pendingPaymentRef.current.printData);

      toast({
        title: "Bill Saved",
        description: "Bill saved without Bluetooth printing. Browser print opened.",
      });
    } catch (error: any) {
      console.error('Error saving bill:', error);
      toast({
        title: "Save Error",
        description: error.message || "Failed to save bill",
        variant: "destructive"
      });
    } finally {
      pendingPaymentRef.current = null;
    }
  };

  // WhatsApp Share and CRM Save
  const handleWhatsAppShare = async (
    billNo: string,
    customerMobile: string,
    cartItems: CartItem[],
    total: number,
    paymentMethod: string,
    adminId: string | null | undefined,
    paymentDetails?: Record<string, number>,
    gstData?: { taxSummary?: string; totalTax?: number; isComposition?: boolean; roundOff?: number; gstin?: string; logoUrl?: string; customerName?: string },
    orderType?: 'dine_in' | 'parcel'
  ) => {
    try {
      const { formatBillMessage, shareViaWhatsApp, isValidPhoneNumber } = await import('@/utils/whatsappBillShare');

      // Image mode: skip phone validation (uses share dialog)
      // Text mode: requires valid phone
      const isImageMode = whatsappShareMode === 'image';
      if (!isImageMode && !isValidPhoneNumber(customerMobile)) {
        toast({ title: "Invalid Phone", description: "Cannot send WhatsApp - invalid number", variant: "destructive" });
        return;
      }


      const now = new Date();
      const subtotal = cartItems.reduce((sum, item) => {
        const baseValue = item.base_value || 1;
        return sum + (item.quantity / baseValue) * item.price;
      }, 0);

      // Check share mode from settings
      if (whatsappShareMode === 'image') {
        // Image mode: generate colorful bill image
        const { shareBillImageViaWhatsApp } = await import('@/utils/billImageGenerator');
        const billData = {
          billNo,
          shopName: billSettings?.shopName || profile?.hotel_name || 'Hotel',
          address: billSettings?.address,
          phone: billSettings?.contactNumber,
          items: cartItems.map(item => ({
            name: item.name,
            quantity: item.quantity,
            total: (item.quantity / (item.base_value || 1)) * item.price,
            unit: item.unit,
            price: item.price,
            base_value: item.base_value
          })),
          subtotal,
          total,
          date: now.toLocaleDateString('en-IN'),
          time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          paymentMethod,
          totalItemsCount: cartItems.length,
          smartQtyCount: calculateSmartQtyCount(cartItems),
          paymentDetails,
          // GST fields
          gstin: gstData?.gstin,
          taxSummary: gstData?.taxSummary,
          totalTax: gstData?.totalTax,
          isComposition: gstData?.isComposition,
          roundOff: gstData?.roundOff,
          orderType: orderType,
          // Shop logo
          logoUrl: gstData?.logoUrl
        };
        const result = await shareBillImageViaWhatsApp(customerMobile, billData);
        if (result.success) {
          toast({
            title: result.method === 'share' ? 'Bill Image Shared!' : 'Bill Image Downloaded',
            description: result.method === 'share'
              ? 'Bill image shared via WhatsApp'
              : 'Bill image downloaded. Attach it in WhatsApp chat.',
          });
        } else {
          toast({ title: "Share Failed", description: result.error, variant: "destructive" });
        }
      } else {
        // Text mode: format and send text message
        const message = formatBillMessage({
          billNo,
          shopName: billSettings?.shopName || profile?.hotel_name || 'Hotel',
          items: cartItems.map(item => ({
            name: item.name,
            quantity: item.quantity,
            total: (item.quantity / (item.base_value || 1)) * item.price,
            unit: item.unit,
            price: item.price,
            base_value: item.base_value
          })),
          subtotal,
          total,
          date: now.toLocaleDateString('en-IN'),
          time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          paymentMethod,
          // GST fields
          gstin: gstData?.gstin,
          taxSummary: gstData?.taxSummary,
          totalTax: gstData?.totalTax,
          isComposition: gstData?.isComposition,
          roundOff: gstData?.roundOff,
          orderType: orderType,
          customerName: gstData?.customerName
        });

        shareViaWhatsApp(customerMobile, message);
        toast({ title: "WhatsApp", description: "Opening WhatsApp to share bill..." });
      }
    } catch (error) {
      toast({ title: "WhatsApp Error", description: "Failed to share via WhatsApp", variant: "destructive" });
    }
  };

  const handleFastCash = () => {
    const currentCart = cart.filter(i => i.quantity > 0);
    
    if (currentCart.length === 0 && !calciInput.trim()) {
      toast({ title: "Cart empty", description: "Add items first", variant: "destructive" });
      return;
    }
    
    if (calciInput.trim()) {
      // Submit calci input first, then flag that we want fast cash after the cart updates
      const success = handleCalciSubmit(calciInput);
      if (success) {
        fastCashPendingRef.current = true;
        // The useEffect will trigger executeFastCash once cart re-renders
      } else {
        // Parse failed — don't leave a dangling ref
        fastCashPendingRef.current = false;
      }
    } else {
      // Cart already has items, proceed immediately
      executeFastCash();
    }
  };
  
  const executeFastCash = () => {
    const cashType = paymentTypes.find(p => p.payment_type.toLowerCase().includes('cash'))?.payment_type || 'Cash';
    const currentTotal = getTotalAmount();
    handleCompletePayment({
      paymentMethod: cashType,
      paymentAmounts: { [cashType]: currentTotal },
      discount: 0,
      discountType: 'flat',
      additionalCharges: additionalCharges.map(c => ({
        name: c.name,
        amount: c.amount,
        enabled: c.is_default
      })),
      orderType: defaultOrderType || 'dine_in'
    });
  };

  const handleCompletePayment = async (paymentData: {
    paymentMethod: string;
    paymentAmounts: Record<string, number>;
    discount: number;
    discountType: 'flat' | 'percentage';
    additionalCharges: {
      name: string;
      amount: number;
      enabled: boolean;
    }[];
    finalItems?: CartItem[];
    customerMobile?: string;
    customerName?: string;
    sendWhatsApp?: boolean;
    customerGstin?: string;
    orderType?: 'dine_in' | 'parcel';
    printAction?: 'print' | 'no-print';
  }) => {
    setPaymentDialogOpen(false);

    const finalCart = paymentData.finalItems || cart;
    const previousCart = [...finalCart];

    try {
      console.log('Completing payment with data:', paymentData);

      const validCart = previousCart.filter(item => item.quantity > 0);
      if (validCart.length === 0) {
        toast({
          title: "Error",
          description: "Cart was empty",
          variant: "destructive"
        });
        return;
      }

      const isOffline = !navigator.onLine;

      // Get admin_id for data isolation (admin's own id if admin, or parent admin_id if sub-user)
      const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;

      // ======= ZERO-LATENCY BILL NUMBER GENERATION =======
      // Uses shared utility for unified bill numbering across POS and table orders

      if (!isOffline) {
        await syncBillCounter(adminId, operatingBranchId);
      }
      const billNumber = isOffline ? `BILL-OFF-${Date.now()}` : getInstantBillNumber(adminId, operatingBranchId);

      const now = new Date();
      const subtotal = validCart.reduce((sum, item) => {
        const baseValue = item.base_value || 1;
        return sum + (item.quantity / baseValue) * item.price;
      }, 0);

      // Calculate GST if enabled
      let taxSummary: any = null;
      let totalTax = 0;
      let totalExclusiveTax = 0;
      let itemTaxes: any[] = [];
      if (gstSettings.enabled) {
        const { calculateItemTax, calculateBillTaxSummary } = await import('@/utils/gstCalculator');
        itemTaxes = validCart.map(item => {
          const itemAny = item as any;
          const taxRateId = itemAny.tax_rate_id;
          const taxRateInfo = taxRateId ? gstSettings.taxRatesMap[taxRateId] : null;
          if (!taxRateInfo) return { taxableAmount: (item.quantity / (item.base_value || 1)) * item.price, cgst: 0, sgst: 0, cess: 0, totalTax: 0, totalWithTax: (item.quantity / (item.base_value || 1)) * item.price, taxRate: 0, _cessRate: 0, _taxName: '', _isTaxInclusive: true };
          const lineTotal = (item.quantity / (item.base_value || 1)) * item.price;
          const isTaxInclusive = itemAny.is_tax_inclusive !== false;
          const cessRate = (taxRateInfo as any).cess_rate || taxRateInfo.cess || 0;
          const result = calculateItemTax(lineTotal, taxRateInfo.rate, cessRate, isTaxInclusive);
          if (!isTaxInclusive) {
            totalExclusiveTax += result.totalTax;
          }
          return { ...result, _cessRate: cessRate, _taxName: taxRateInfo.name || `GST ${taxRateInfo.rate}%`, _isTaxInclusive: isTaxInclusive };
        });
        const summary = calculateBillTaxSummary(validCart.map((item, i) => ({
          price: item.price,
          quantity: item.quantity,
          total: (item.quantity / (item.base_value || 1)) * item.price,
          taxRate: itemTaxes[i].taxRate,
          taxName: (itemTaxes[i] as any)._taxName || `GST ${itemTaxes[i].taxRate}%`,
          cessRate: (itemTaxes[i] as any)._cessRate || 0,
          isTaxInclusive: (itemTaxes[i] as any)._isTaxInclusive !== false,
          hsnCode: (item as any).hsn_code || gstSettings.taxRatesMap[(item as any).tax_rate_id]?.hsn_code || ''
        })));
        taxSummary = summary;
        totalTax = itemTaxes.reduce((s, t) => s + t.totalTax, 0);
      }

      const totalAdditionalCharges = paymentData.additionalCharges.reduce((sum, charge) => sum + charge.amount, 0);
      let totalAmount = subtotal + totalExclusiveTax + totalAdditionalCharges - paymentData.discount;

      const mapPaymentMode = (method: string): PaymentMode => {
        const lower = method.toLowerCase();
        if (lower.includes('cash')) return 'cash';
        if (lower.includes('upi')) return 'upi';
        if (lower === 'card' || lower.includes('card')) return 'card';
        return 'other';
      };
      const paymentMode = mapPaymentMode(paymentData.paymentMethod);
      const additionalChargesArray = paymentData.additionalCharges.map(c => ({ name: c.name, amount: c.amount }));

      // Round-off: if GST makes total a decimal, round to nearest rupee
      let roundOff = 0;
      if (gstSettings.enabled && totalTax > 0) {
        const rawTotal = totalAmount;
        const roundedTotal = Math.round(rawTotal);
        roundOff = roundedTotal - rawTotal;
        // Only apply if there's actually a decimal difference
        if (Math.abs(roundOff) > 0.001) {
          totalAmount = roundedTotal;
        } else {
          roundOff = 0;
        }
      }

      const billPayload: any = {
        bill_no: billNumber,
        total_amount: totalAmount,
        discount: paymentData.discount,
        payment_mode: paymentMode,
        payment_details: paymentData.paymentAmounts,
        additional_charges: additionalChargesArray,
        created_by: profile?.user_id,
        admin_id: adminId || null,
        branch_id: operatingBranchId || null,
        date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
        // Service Area & Kitchen Display status - enables realtime updates
        service_status: 'pending',
        kitchen_status: 'pending',
        status_updated_at: now.toISOString(),
        table_no: selectedTableNumber || null,
        round_off: roundOff !== 0 ? roundOff : 0,
        order_type: paymentData.orderType || 'dine_in',
        channel: orderChannel,
        customer_mobile: paymentData.customerMobile || null,
        customer_phone: paymentData.customerMobile || null
      };

      // Add GST fields to bill if enabled
      if (gstSettings.enabled && taxSummary) {
        billPayload.tax_summary = JSON.stringify(taxSummary);
        billPayload.total_tax = totalTax;
        billPayload.customer_gstin = paymentData.customerGstin || null;
        // Pass tax rates map for bill_items snapshot (will be removed before insert)
        billPayload._taxRatesMap = gstSettings.taxRatesMap;
        billPayload._isComposition = gstSettings.isComposition;
      }

      // --- DATA PRIVACY: Check if this client should store locally only ---
      const privacyBranchKey = operatingBranchId ? `privacy_storage_mode_${operatingBranchId}` : 'privacy_storage_mode';
      const privacyMode = localStorage.getItem(privacyBranchKey) || localStorage.getItem('privacy_storage_mode') || 'cloud';
      const superAdminBlockedCloud = (profile?.client_permissions as any)?.allow_cloud_storage === false;
      const isLocalOnlyMode = superAdminBlockedCloud || privacyMode === 'local';
      
      // OFFLINE MODE or LOCAL-ONLY MODE - Use PendingBill system (IndexedDB only)
      if (isOffline || isLocalOnlyMode) {
        const { offlineManager } = await import('@/utils/offlineManager');

        const pendingBillId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const pendingBillItems = validCart.map((item, index) => {
          const baseValue = item.base_value || 1;
          const lineTotal = (item.quantity / baseValue) * item.price;
          const billItem: any = {
            item_id: String(item.id).startsWith('calci-') ? null : item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            total: lineTotal,
            billing_type: String(item.id).startsWith('calci-') ? 'calci' : 'pos',
            item_name_override: String(item.id).startsWith('calci-') ? item.name : undefined
          };

          if (gstSettings.enabled && taxSummary && itemTaxes && itemTaxes[index]) {
            const itemTax = itemTaxes[index];
            const itemAny = item as any;
            const taxRateId = itemAny.tax_rate_id;
            const taxRateInfo = taxRateId ? gstSettings.taxRatesMap[taxRateId] : null;
            if (taxRateInfo) {
              billItem.tax_rate_snapshot = taxRateInfo.rate;
              billItem.hsn_code = itemAny.hsn_code || taxRateInfo.hsn_code || null;
              billItem.tax_amount = Math.round(itemTax.totalTax * 100) / 100;
            }
          }
          return billItem;
        });

        const pendingBillPayload = {
          id: pendingBillId,
          bill_no: billNumber,
          total_amount: totalAmount,
          discount: paymentData.discount,
          payment_mode: paymentMode,
          payment_details: paymentData.paymentAmounts,
          additional_charges: additionalChargesArray,
          created_by: profile?.user_id || '',
          admin_id: adminId || null,
          branch_id: operatingBranchId || null,
          date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
          created_at: now.toISOString(),
          table_no: selectedTableNumber || null,
          round_off: roundOff,
          order_type: paymentData.orderType || 'dine_in',
          tax_summary: taxSummary ? JSON.stringify(taxSummary) : null,
          total_tax: totalTax,
          customer_gstin: paymentData.customerGstin || null,
          customer_mobile: paymentData.customerMobile || null,
          customer_phone: paymentData.customerMobile || null,
          items: pendingBillItems
        };

        // Save to pending bills queue (new system)
        await offlineManager.savePendingBill(pendingBillPayload);

        // Cache for local display (so it immediately shows in offline reports/history)
        await offlineManager.cacheBill({
          ...pendingBillPayload,
          is_deleted: false,
          created_at: now.toISOString(),
          bill_items: pendingBillItems.map(item => ({
            item_id: item.item_id,
            quantity: item.quantity,
            price: item.price,
            total: item.total,
            items: {
              name: item.name,
              category: 'Unknown',
              is_active: true
            }
          }))
        });

        // Trigger local custom event to update reports dashboard
        window.dispatchEvent(new CustomEvent('bills-updated'));

        toast({
          title: isLocalOnlyMode && !isOffline ? "🔒 Bill Saved Locally" : "📴 Bill Saved Offline",
          description: isLocalOnlyMode && !isOffline 
            ? `${billNumber} saved to this device only (Local Only mode).`
            : `${billNumber} queued. Will sync when online.`,
          duration: 3000
        });
        clearCart();

        // Try print in offline mode ONLY if auto-print is enabled
        const offlineAutoPrintEnabled = (localStorage.getItem(operatingBranchId ? `hotel_pos_auto_print_${operatingBranchId}` : 'hotel_pos_auto_print') ?? localStorage.getItem('hotel_pos_auto_print')) !== 'false';
        if (offlineAutoPrintEnabled) {
          try {
            const offlinePrintData = {
              billNo: billNumber,
              date: format(now, 'MMM dd, yyyy'),
              time: format(now, 'hh:mm a'),
              items: validCart.map(item => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                total: (item.quantity / (item.base_value || 1)) * item.price,
                unit: item.unit,
                base_value: item.base_value
              })),
              subtotal,
              discount: paymentData.discount,
              additionalCharges: additionalChargesArray,
              total: totalAmount,
              paymentMethod: paymentMode.toUpperCase(),
              paymentDetails: paymentData.paymentAmounts,
              hotelName: profile?.hotel_name || '',
              shopName: billSettings?.shopName,
              address: billSettings?.address,
              contactNumber: billSettings?.contactNumber,
              logoUrl: billSettings?.logoUrl,
              facebook: billSettings?.showFacebook !== false ? billSettings?.facebook : undefined,
              instagram: billSettings?.showInstagram !== false ? billSettings?.instagram : undefined,
              whatsapp: billSettings?.showWhatsapp !== false ? billSettings?.whatsapp : undefined,
              tableNo: selectedTableNumber || undefined,
              totalItemsCount: validCart.length,
              smartQtyCount: calculateSmartQtyCount(validCart),
              // GST fields
              gstin: gstSettings.enabled ? gstSettings.gstin : undefined,
              customerGstin: paymentData.customerGstin || undefined,
              customerMobile: paymentData.customerMobile || undefined,
              taxSummary: billPayload.tax_summary || undefined,
              totalTax: billPayload.total_tax || undefined,
              isComposition: gstSettings.enabled ? gstSettings.isComposition : undefined,
              roundOff: roundOff !== 0 ? roundOff : undefined,
              orderType: paymentData.orderType
            };
            await printReceipt(offlinePrintData as PrintData);
          } catch (printError) {
            console.log('Print skipped while offline:', printError);
          }
        }
        return;
      }

      // ONLINE MODE - Use cached settings (already loaded at page mount)
      // No blocking fetch needed - billSettings are preloaded from cache + background sync
      const settingsToUse = billSettings;

      const printData: PrintData = {
        billNo: billNumber,
        date: format(now, 'MMM dd, yyyy'),
        time: format(now, 'hh:mm a'),
        items: validCart.map(item => {
          const baseValue = item.base_value || 1;
          return {
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            total: (item.quantity / baseValue) * item.price,
            unit: item.unit,
            base_value: item.base_value,
            selling_unit: (item as any).selling_unit,
            selling_quantity: (item as any).selling_quantity
          };
        }),
        subtotal: subtotal,
        additionalCharges: additionalChargesArray,
        discount: paymentData.discount,
        total: totalAmount,
        paymentMethod: paymentData.paymentMethod.toUpperCase(),
        paymentDetails: paymentData.paymentAmounts,
        hotelName: profile?.hotel_name || '',
        shopName: settingsToUse?.shopName,
        address: settingsToUse?.address,
        contactNumber: settingsToUse?.contactNumber,
        facebook: settingsToUse?.showFacebook !== false ? settingsToUse?.facebook : undefined,
        instagram: settingsToUse?.showInstagram !== false ? settingsToUse?.instagram : undefined,
        whatsapp: settingsToUse?.showWhatsapp !== false ? settingsToUse?.whatsapp : undefined,
        printerWidth: settingsToUse?.printerWidth || '58mm',
        logoUrl: settingsToUse?.logoUrl,
        tableNo: selectedTableNumber || undefined,
        totalItemsCount: validCart.length,
        smartQtyCount: calculateSmartQtyCount(validCart),
        receiptQrEnabled: settingsToUse?.receiptQrEnabled,
        receiptQrType: settingsToUse?.receiptQrType,
        upiId: settingsToUse?.upiId,
        upiName: settingsToUse?.upiName,
        telegram: settingsToUse?.telegram,
        // GST fields
        gstin: gstSettings.enabled ? gstSettings.gstin : undefined,
        customerGstin: paymentData.customerGstin || undefined,
        customerMobile: paymentData.customerMobile || undefined,
        taxSummary: billPayload.tax_summary || undefined,
        totalTax: billPayload.total_tax || undefined,
        isComposition: gstSettings.enabled ? gstSettings.isComposition : undefined,
        roundOff: roundOff !== 0 ? roundOff : undefined,
        orderType: paymentData.orderType
      };

      // Check auto-print setting
      const autoPrintSetting = (localStorage.getItem(operatingBranchId ? `hotel_pos_auto_print_${operatingBranchId}` : 'hotel_pos_auto_print') ?? localStorage.getItem('hotel_pos_auto_print')) !== 'false';
      const shouldPrint = paymentData.printAction ? paymentData.printAction === 'print' : autoPrintSetting;

      // =========== ZERO LATENCY: FIRE-AND-FORGET ===========
      // Show success immediately, run all operations in background
      // User can start next bill INSTANTLY while print+save happens behind the scenes

      toast({
        title: "Processing Payment...",
        description: `Saving ${billNumber}...`,
        duration: 1000
      });

      // Await database save FIRST
      try {
        await saveBillToDatabase(billPayload, validCart, billNumber);

        // UI success cleanup
        clearCart();
        toast({
          title: "✓ Bill Saved",
          description: `Bill ${billNumber} created successfully.`,
          duration: 2000
        });

        // Background tasks (non-blocking after save)
        const postSaveTasks = async () => {
          // 1. Always prioritize the customer bill on the active printer.
          // Station KOTs are only needed when the owner explicitly mapped stations.
          if (shouldPrint) {
            const receiptPrinted = await printReceipt(printData).catch(err => {
              console.error('Receipt print failed:', err);
              return false;
            });

            if (!receiptPrinted) {
              sonnerToast.error('Bill print failed', {
                description: 'Reconnect the printer and use Test Print before the next bill.',
              });
            } else if (Object.keys(getStationMap()).length > 0) {
              await printSplitKOTsWithFeedback(validCart, billNumber, paymentData.orderType, settingsToUse)
                .catch(err => console.error('KOT print failed:', err));
            }
          }


          // 2. Auto-free table if one was selected
          if (selectedTableNumber && adminId) {
            try {
              await (supabase as any)
                .from('tables')
                .update({ status: 'available', current_bill_id: null })
                .eq('admin_id', adminId)
                .eq('table_number', selectedTableNumber);

              syncChannelRef.current?.send({
                type: 'broadcast',
                event: 'table-status-updated',
                payload: { table_number: selectedTableNumber, status: 'available', timestamp: Date.now() }
              });
            } catch (tableErr) {
              console.warn('[Billing] Failed to free table:', tableErr);
            }
          }

          // 3. WhatsApp share
          if (paymentData.sendWhatsApp) {
            handleWhatsAppShare(billNumber, paymentData.customerMobile || '', validCart, totalAmount, paymentData.paymentMethod, adminId, paymentData.paymentAmounts, {
              taxSummary: billPayload.tax_summary,
              totalTax: billPayload.total_tax,
              isComposition: gstSettings.isComposition,
              roundOff: roundOff !== 0 ? roundOff : undefined,
              gstin: gstSettings.gstin,
              logoUrl: settingsToUse?.logoUrl,
              customerName: paymentData.customerName
            }, paymentData.orderType).catch(err => console.error('WhatsApp share failed:', err));
          }

          // 4. Save Customer details to CRM (Auto-Save on every Checkout)
          const cleanPhone = paymentData.customerMobile?.replace(/[\s\-\(\)\+]/g, '') || '';
          if (adminId && cleanPhone.length >= 10) {
            try {
              let lookup: any = supabase
                .from('customers')
                .select('id, visit_count, total_spent')
                .eq('admin_id', adminId)
                .eq('phone', cleanPhone);
              if (operatingBranchId) lookup = lookup.eq('branch_id', operatingBranchId);
              const { data: existingCustomer } = await lookup.maybeSingle();

              if (existingCustomer) {
                const updatePayload: any = {
                  visit_count: existingCustomer.visit_count + 1,
                  total_spent: Number(existingCustomer.total_spent) + totalAmount,
                  last_visit: new Date().toISOString()
                };
                if (paymentData.customerName) {
                  updatePayload.name = paymentData.customerName;
                }
                await supabase
                  .from('customers')
                  .update(updatePayload)
                  .eq('id', existingCustomer.id);
              } else {
                await supabase
                  .from('customers')
                  .insert({
                    admin_id: adminId,
                    branch_id: operatingBranchId || null,
                    phone: cleanPhone,
                    name: paymentData.customerName || `Customer (${cleanPhone.slice(-4)})`,
                    visit_count: 1,
                    total_spent: totalAmount,
                    last_visit: new Date().toISOString()
                  });
              }
            } catch (crmErr) {
              console.warn('[CRM] Failed to save/update customer:', crmErr);
            }
          }
        };

        postSaveTasks();

      } catch (saveError: any) {
        console.error('Save failed:', saveError);
        
        // Revert local bill counter so number isn't skipped
        const counterKey = `bill_counter_${adminId || 'default'}_${operatingBranchId || 'main'}`;
        const currentCount = parseInt(localStorage.getItem(counterKey) || '1');
        if (currentCount > 0) {
          localStorage.setItem(counterKey, (currentCount - 1).toString());
        }

        toast({
          title: "Save Error",
          description: `Failed to save: ${saveError.message || 'Unknown error'}`,
          variant: "destructive",
          duration: 5000
        });
      }

    } catch (error: any) {
      console.error('Error completing payment:', error);
      toast({
        title: "Payment Error",
        description: error.message || "Failed to save bill. Check connection.",
        variant: "destructive"
      });
    }
  };




  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>;
  }
  return <div className="h-[100dvh] flex overflow-x-hidden max-w-[100vw] bg-zinc-50 dark:bg-zinc-950">
    {/* Main Items Area */}
    <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-hidden max-w-full flex flex-col pb-[72px] md:pb-6">
      <AllBranchesReadOnlyBanner message="Switch to a specific branch to create bills." />
      {/* Header & Modes */}
      <div className="flex flex-col gap-2 mb-3 w-full">
        <div className="flex flex-wrap items-center gap-2 w-full">
          <div className="flex items-center gap-2 shrink-0">
            <h1 className="text-xl md:text-2xl font-bold leading-none hidden xs:block">
              {isEditMode ? `Edit Bill - ${editingBill?.bill_no}` : 'Billing'}
            </h1>
            <TableSelector
              selectedTableId={selectedTableId}
              onSelectTable={(tableId, tableNumber) => {
                setSelectedTableId(tableId);
                setSelectedTableNumber(tableNumber);
              }}
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setAggregatorDialogOpen(true)}
            className="relative bg-gradient-to-r from-red-500/10 to-orange-500/10 border-red-500/30 text-foreground hover:from-red-500/20 hover:to-orange-500/20 rounded-xl h-8 px-2 text-xs shrink-0"
          >
            <Bell className="w-3.5 h-3.5 mr-1 text-red-500" />
            <span className="hidden sm:inline">Online Orders</span>
            <span className="sm:hidden">Online</span>
            {incomingOrders.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white animate-pulse">
                {incomingOrders.length}
              </span>
            )}
          </Button>

          {calciEnabled && (
            <div className="flex items-center p-0.5 bg-muted/30 rounded-xl border border-zinc-200 dark:border-zinc-800 shrink-0">
              <button
                onClick={() => setAppBillingMode('pos')}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200",
                  appBillingMode === 'pos' 
                    ? "bg-white dark:bg-zinc-800 text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10" 
                    : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                )}
              >
                <Grid className="w-3.5 h-3.5 inline-block mr-1" />
                POS
              </button>
              <button
                onClick={() => setAppBillingMode('calci')}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200",
                  appBillingMode === 'calci' 
                    ? "bg-white dark:bg-zinc-800 text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10" 
                    : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                )}
              >
                <Calculator className="w-3.5 h-3.5 inline-block mr-1" />
                Calci
              </button>
            </div>
          )}

          {appBillingMode !== 'calci' && (
            <div className="flex bg-muted/60 p-0.5 rounded-lg border shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleViewModeChange('grid')}
                className={`h-7 w-7 rounded p-0 transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-gray-800 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                title="Grid View"
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleViewModeChange('list')}
                className={`h-7 w-7 rounded p-0 transition-all ${viewMode === 'list' ? 'bg-white dark:bg-gray-800 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          )}

          <PrinterStatusPanel inline className="shrink-0" />
        </div>
      </div>

      {/* Search and Layout Toggle OR Calci Input */}
      {appBillingMode === 'calci' ? (
        <div className="mb-4">
          {/* Desktop: text input with keyboard */}
          <div className="hidden md:block">
            <div className="relative flex items-center">
              <Calculator className="absolute left-4 w-5 h-5 text-muted-foreground" />
              <Input 
                ref={calciInputRef}
                autoFocus
                inputMode="tel"
                placeholder="Enter amounts (e.g. 10 + 25 + 2*15)"
                value={calciInput}
                onChange={e => setCalciInput(e.target.value)}
                onKeyDown={handleCalciKeyDown}
                className="pl-12 h-14 text-lg bg-white/50 dark:bg-zinc-900/50 rounded-xl shadow-sm border-zinc-200 dark:border-zinc-800 font-mono"
              />
              <Button 
                className="absolute right-2 h-10 rounded-lg"
                onClick={() => handleCalciSubmit(calciInput)}
              >
                Add
              </Button>
            </div>
            {/* Desktop Quick Keys Strip */}
            {quickKeyItems.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {quickKeyItems.map(qk => (
                  <button 
                    key={qk.id} 
                    onClick={() => handleCalciSubmit(`*${qk.shortcode}`)}
                    className="shrink-0 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 active:bg-zinc-200 dark:active:bg-zinc-600 text-foreground px-3 py-1.5 rounded-lg text-sm font-medium shadow-sm transition-colors"
                  >
                    {qk.name}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2 px-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Press <kbd className="bg-muted px-1.5 rounded text-[10px] mx-1 border shadow-sm font-mono">Enter</kbd> to add to cart.
            </p>
          </div>

          {/* Mobile: built-in calculator numpad */}
          <div className="md:hidden">
            {/* Display */}
            <div className="bg-zinc-900 dark:bg-zinc-950 rounded-t-2xl px-4 py-3 border border-zinc-700 border-b-0 flex items-center justify-between">
              <button 
                onClick={() => {
                  const newVal = !isCalciStretched;
                  setIsCalciStretched(newVal);
                  localStorage.setItem('hotel_pos_calci_stretched', String(newVal));
                }}
                className="text-zinc-400 p-2 -ml-2 rounded-lg active:bg-white/10"
              >
                {isCalciStretched ? <span className="text-xl font-bold">⇲</span> : <span className="text-xl font-bold">⇱</span>}
              </button>
              <div className="text-right font-mono text-2xl text-white min-h-[40px] flex items-center justify-end overflow-x-auto flex-1 ml-2">
                {calciInput || <span className="text-zinc-500">0</span>}
              </div>
            </div>

            {/* Numpad Grid */}
            <div className={cn("grid grid-cols-4 gap-[1px] bg-zinc-300 dark:bg-zinc-700 rounded-b-2xl overflow-hidden border border-t-0 border-zinc-300 dark:border-zinc-700", isCalciStretched ? "h-[60vh]" : "")}>
              {/* Row 1: C, ×, +, ⌫ */}
              <button onClick={() => setCalciInput('')} className={cn("bg-zinc-200 dark:bg-zinc-800 text-red-500 font-bold active:bg-zinc-300 dark:active:bg-zinc-700 transition-colors", isCalciStretched ? "h-full text-4xl" : "py-4 text-2xl")}>C</button>
              <button onClick={() => setCalciInput(p => p + '*')} className={cn("bg-zinc-200 dark:bg-zinc-800 text-primary font-bold active:bg-zinc-300 dark:active:bg-zinc-700 transition-colors", isCalciStretched ? "h-full text-4xl" : "py-4 text-2xl")}>×</button>
              <button onClick={() => setCalciInput(p => p + '+')} className={cn("bg-zinc-200 dark:bg-zinc-800 text-primary font-bold active:bg-zinc-300 dark:active:bg-zinc-700 transition-colors", isCalciStretched ? "h-full text-4xl" : "py-4 text-2xl")}>+</button>
              <button onClick={() => setCalciInput(p => p.slice(0, -1))} className={cn("bg-zinc-200 dark:bg-zinc-800 text-foreground font-bold active:bg-zinc-300 dark:active:bg-zinc-700 transition-colors flex items-center justify-center", isCalciStretched ? "h-full" : "py-4")}><Delete className={cn(isCalciStretched ? "w-8 h-8" : "w-6 h-6")} /></button>
              {/* Row 2: 7, 8, 9 */}
              <button onClick={() => setCalciInput(p => p + '7')} className={cn("bg-white dark:bg-zinc-900 text-foreground font-semibold active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors", isCalciStretched ? "h-full text-4xl" : "py-4 text-2xl")}>7</button>
              <button onClick={() => setCalciInput(p => p + '8')} className={cn("bg-white dark:bg-zinc-900 text-foreground font-semibold active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors", isCalciStretched ? "h-full text-4xl" : "py-4 text-2xl")}>8</button>
              <button onClick={() => setCalciInput(p => p + '9')} className={cn("bg-white dark:bg-zinc-900 text-foreground font-semibold active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors", isCalciStretched ? "h-full text-4xl" : "py-4 text-2xl")}>9</button>
              {/* Add button spans 3 rows (rows 2-4) */}
              <button onClick={() => { handleCalciSubmit(calciInput); }} className={cn("bg-primary text-primary-foreground font-bold row-span-3 h-full active:bg-primary/80 transition-colors flex items-center justify-center", isCalciStretched ? "text-2xl" : "text-xl")}>Add<br/>to<br/>Cart</button>
              {/* Row 3: 4, 5, 6 */}
              <button onClick={() => setCalciInput(p => p + '4')} className={cn("bg-white dark:bg-zinc-900 text-foreground font-semibold active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors", isCalciStretched ? "h-full text-4xl" : "py-4 text-2xl")}>4</button>
              <button onClick={() => setCalciInput(p => p + '5')} className={cn("bg-white dark:bg-zinc-900 text-foreground font-semibold active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors", isCalciStretched ? "h-full text-4xl" : "py-4 text-2xl")}>5</button>
              <button onClick={() => setCalciInput(p => p + '6')} className={cn("bg-white dark:bg-zinc-900 text-foreground font-semibold active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors", isCalciStretched ? "h-full text-4xl" : "py-4 text-2xl")}>6</button>
              {/* Row 4: 1, 2, 3 */}
              <button onClick={() => setCalciInput(p => p + '1')} className={cn("bg-white dark:bg-zinc-900 text-foreground font-semibold active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors", isCalciStretched ? "h-full text-4xl" : "py-4 text-2xl")}>1</button>
              <button onClick={() => setCalciInput(p => p + '2')} className={cn("bg-white dark:bg-zinc-900 text-foreground font-semibold active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors", isCalciStretched ? "h-full text-4xl" : "py-4 text-2xl")}>2</button>
              <button onClick={() => setCalciInput(p => p + '3')} className={cn("bg-white dark:bg-zinc-900 text-foreground font-semibold active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors", isCalciStretched ? "h-full text-4xl" : "py-4 text-2xl")}>3</button>
              {/* Row 5: 0, ., Fast Cash */}
              <button onClick={() => setCalciInput(p => p + '0')} className={cn("bg-white dark:bg-zinc-900 text-foreground font-semibold active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors", isCalciStretched ? "h-full text-4xl" : "py-4 text-2xl")}>0</button>
              <button onClick={() => setCalciInput(p => p + '.')} className={cn("bg-white dark:bg-zinc-900 text-foreground font-semibold active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors", isCalciStretched ? "h-full text-4xl" : "py-4 text-2xl")}>.</button>
              <button onClick={handleFastCash} className={cn("bg-green-600 text-white font-bold h-full active:bg-green-700 transition-colors flex items-center justify-center col-span-2", isCalciStretched ? "text-2xl" : "text-xl")}>⚡ Fast Cash</button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 px-1 text-center">
              Type amounts like <span className="font-mono bg-muted px-1 rounded">10+25+2×15</span> then tap Add
            </p>
          </div>
        </div>
      ) : (
      <div className="mb-3 flex items-center relative">
        <Search className="absolute left-3 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search items or use voice…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 pr-24" />
        <div className="absolute right-1 top-1/2 -translate-y-1/2">
          <VoiceBillingButton
            items={items.map(i => ({ id: i.id, name: i.name, unit: i.unit }))}
            onIntent={handleVoiceIntent}
          />
        </div>
      </div>
      )}

      {/* Category Horizontal Scroll */}
      {!isCalciStretched && (
        <CategoryScrollBar
          categories={itemCategories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          categoryOrder={displaySettings.category_order}
          items={items}
        />
      )}

      {/* Items Grid - Scrollable */}
      {!isCalciStretched && (
      <div
        className="flex-1 overflow-y-auto scroll-smooth min-h-0 relative"
        style={{
          paddingBottom: cart.some(i => i.quantity > 0) && !paymentDialogOpen ? '140px' : '16px',
          WebkitOverflowScrolling: 'touch'  // Smooth scroll on iOS
        }}
      >
        {viewMode === 'grid' ? <div className={`grid gap-2 ${displaySettings.items_per_row === 1 ? 'grid-cols-1' : displaySettings.items_per_row === 2 ? 'grid-cols-2' : displaySettings.items_per_row === 3 ? 'grid-cols-3' : displaySettings.items_per_row === 4 ? 'grid-cols-4' : displaySettings.items_per_row === 5 ? 'grid-cols-5' : 'grid-cols-6'}`}>
          {filteredItems.map(item => {
            const cartItem = cart.find(c => c.id === item.id);
            const cartQuantity = cartItem?.quantity || 0;
            return (
              <BillingGridItemCard
                key={item.id}
                item={item}
                cartQuantity={cartQuantity}
                orderChannel={orderChannel}
                onAddToCart={addToCart}
                onAddToCartWithChip={addToCartWithChip}
                onAddToCartWithAmount={addToCartWithAmount}
                onUpdateQuantity={updateQuantity}
              />
            );
          })}
        </div> :
          // List View
          <div className="space-y-2">
            {filteredItems.map(item => {
              const cartItem = cart.find(c => c.id === item.id);
              const cartQuantity = cartItem?.quantity || 0;
              return (
                <BillingListItemCard
                  key={item.id}
                  item={item}
                  cartQuantity={cartQuantity}
                  orderChannel={orderChannel}
                  onAddToCart={addToCart}
                  onAddToCartWithChip={addToCartWithChip}
                  onAddToCartWithAmount={addToCartWithAmount}
                  onUpdateQuantity={updateQuantity}
                />
              );
            })}
          </div>}
      </div>
      )}
    </div>

    {/* Mobile Floating Cart - Rendered via Portal to bypass overflow-x-hidden parent */}
    {cart.some(i => i.quantity > 0) && !paymentDialogOpen && createPortal(
      <div className="fixed bottom-[72px] left-0 right-0 md:hidden z-[9999] px-3 pb-2 pointer-events-none">
        <div className="bg-gradient-to-r from-primary to-primary/80 rounded-xl shadow-2xl px-4 py-3 pointer-events-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-white">
              <ShoppingCart className="w-5 h-5" />
              <span className="font-bold text-lg">
                {cart.filter(i => i.quantity > 0).length} {cart.filter(i => i.quantity > 0).length === 1 ? 'item' : 'items'}
              </span>
              <span className="font-bold text-xl">₹{total.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={clearCart} className="h-9 w-9 p-0 text-white hover:bg-white/20 rounded-full">
                <Trash2 className="w-5 h-5" />
              </Button>
              <Button 
                onClick={() => {
                  setPaymentDialogOpen(false);
                  if (quickBillEnabled) {
                    setTimeout(() => executeFastCash(), 30);
                  } else {
                    setTimeout(() => setPaymentDialogOpen(true), 30);
                  }
                }} 
                className="h-9 px-5 bg-white text-primary hover:bg-gray-100 font-bold rounded-full shadow-md"
              >
                Pay
              </Button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* Desktop Cart Section */}
    <div className="hidden md:flex w-96 bg-white dark:bg-zinc-900 border-l border-zinc-200/80 dark:border-zinc-800/80 shadow-2xl flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold flex items-center">
            <ShoppingCart className="w-5 h-5 mr-2" />
            Cart ({cart.filter(i => i.quantity > 0).length})
          </h2>
          {cart.some(i => i.quantity > 0) && <Button variant="ghost" size="sm" onClick={clearCart} className="text-red-600 hover:text-red-700 hover:bg-red-50">
            <Trash2 className="w-4 h-4" />
          </Button>}
        </div>

        {cart.some(i => i.quantity > 0) && <div className="flex justify-between items-center text-sm">
          <span>Total: ₹{total.toFixed(0)}</span>
          <Button 
            onClick={() => {
              setPaymentDialogOpen(false);
              if (quickBillEnabled) {
                setTimeout(() => executeFastCash(), 30);
              } else {
                setTimeout(() => setPaymentDialogOpen(true), 30);
              }
            }} 
            className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-white" 
            size="sm"
          >
            Pay
          </Button>
        </div>}
      </div>

      {/* Channel selector (Store, Zomato, Swiggy) */}
      <div className="px-4 py-2 border-b bg-muted/30">
        <div className="flex rounded-lg bg-muted p-1 gap-1">
          <button
            onClick={() => handleChannelChange('store')}
            className={cn(
              "flex-1 text-[11px] py-1.5 rounded-md font-medium transition-all",
              orderChannel === 'store'
                ? "bg-background shadow-sm text-foreground font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            🏪 Store
          </button>
          <button
            onClick={() => handleChannelChange('zomato')}
            className={cn(
              "flex-1 text-[11px] py-1.5 rounded-md font-medium transition-all",
              orderChannel === 'zomato'
                ? "bg-red-500 shadow-sm text-white font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            🍅 Zomato
          </button>
          <button
            onClick={() => handleChannelChange('swiggy')}
            className={cn(
              "flex-1 text-[11px] py-1.5 rounded-md font-medium transition-all",
              orderChannel === 'swiggy'
                ? "bg-orange-500 shadow-sm text-white font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            🍊 Swiggy
          </button>
        </div>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto p-4">
        {cart.length === 0 ? <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
            <ShoppingCart className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">Your cart is empty</p>
          <p className="text-gray-400 text-sm mt-1">Add items to get started</p>
        </div> : <div className="space-y-3">
          {cart.map(item => <div key={item.id} className={`bg-gradient-to-r ${String(item.id).startsWith('calci-') ? 'from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800' : 'from-white to-gray-50 dark:from-gray-800 dark:to-gray-700 border-gray-100 dark:border-gray-700'} rounded-2xl p-4 shadow-sm border transition-all hover:shadow-md`}>
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-bold text-sm line-clamp-2 flex-1 text-gray-800 dark:text-white">
                {String(item.id).startsWith('calci-') && <span className="inline-flex items-center mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-200 align-middle"><Calculator className="w-2.5 h-2.5 mr-0.5" />CALCI</span>}
                {item.name}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => removeFromCart(item.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 ml-2 rounded-full h-8 w-8 p-0">
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex justify-between items-center">
              <span className="font-bold text-sm bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                ₹{item.price}/{item.base_value && item.base_value > 1 ? `${item.base_value}${getShortUnit(item.unit)}` : getShortUnit(item.unit)}
              </span>

              <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-600 rounded-full p-1">
                <Button variant="ghost" size="sm" onClick={() => updateQuantity(item.id, -1)} className="h-8 w-8 p-0 rounded-full bg-[hsl(var(--btn-decrement))] text-white hover:opacity-80 shadow-sm">
                  <Minus className="w-4 h-4" />
                </Button>

                {editingQuantity === item.id ? <div className="flex items-center space-x-1">
                  <Input 
                    type="number" 
                    value={tempQuantity} 
                    onChange={e => setTempQuantity(e.target.value)} 
                    placeholder={getShortUnit(item.unit)}
                    className="w-16 h-8 text-center px-1 rounded-lg" 
                    autoFocus 
                  />
                  <Button variant="ghost" size="sm" onClick={() => saveQuantity(item.id)} className="h-6 w-6 p-0 rounded-full bg-[hsl(var(--btn-increment))] text-white">
                    <Check className="w-3 h-3" />
                  </Button>
                </div> : <span className="font-bold min-w-[40px] text-center cursor-pointer hover:bg-white dark:hover:bg-gray-500 rounded-full px-3 py-1 transition-colors" onClick={() => startEditingQuantity(item.id, item.quantity)}>
                  {item.quantity}
                </span>}

                <Button variant="ghost" size="sm" onClick={() => updateQuantity(item.id, 1)} className="h-8 w-8 p-0 rounded-full bg-[hsl(var(--btn-increment))] text-white hover:opacity-80 shadow-sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex justify-end mt-3 pt-2 border-t border-gray-200 dark:border-gray-600">
              <span className="text-sm font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Total: ₹{((item.quantity / (item.base_value || 1)) * item.price).toFixed(0)}
              </span>
            </div>
          </div>)}
        </div>}
      </div>
    </div>

    {/* Payment Dialog */}
    <CompletePaymentDialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen} cart={cart} paymentTypes={paymentTypes} additionalCharges={additionalCharges} onUpdateQuantity={updateQuantity} onRemoveItem={removeFromCart} onCompletePayment={handleCompletePayment} whatsappEnabled={whatsappEnabled} whatsappShareMode={whatsappShareMode} gstEnabled={gstSettings.enabled} taxRatesMap={gstSettings.taxRatesMap} showOrderType={showOrderType} defaultOrderType={defaultOrderType} autoPrintEnabled={(localStorage.getItem(operatingBranchId ? `hotel_pos_auto_print_${operatingBranchId}` : 'hotel_pos_auto_print') ?? localStorage.getItem('hotel_pos_auto_print')) !== 'false'} />

    {/* Printer Error Dialog */}
    <PrinterErrorDialog
      open={printerErrorOpen}
      onOpenChange={setPrinterErrorOpen}
      errorMessage={printerErrorMessage}
      onRetry={handleRetryPrint}
      onSaveWithoutPrint={handleSaveWithoutPrint}
      isRetrying={isRetryingPrint}
    />

    {/* Floating Printer Status / Test / Diagnostics Panel Removed in favor of inline header panel */}
    {/* Food Aggregator Modal */}
    <Dialog open={aggregatorDialogOpen} onOpenChange={setAggregatorDialogOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border shadow-2xl rounded-2xl p-0">
        <DialogHeader className="p-6 bg-gradient-to-r from-red-500/10 via-orange-500/5 to-orange-500/10 border-b">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            🍕 Food Aggregators (Zomato & Swiggy)
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Accept incoming online delivery orders directly to the KDS, or parse copied receipt text to load items into the POS instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-800">
          {/* Column 1: Live Feed */}
          <div className="space-y-4 pb-6 md:pb-0">
            <h3 className="font-bold text-sm flex items-center justify-between text-gray-800 dark:text-gray-200">
              ⚡ Live Incoming Feed
              <span className="text-[10px] text-green-500 font-semibold flex items-center gap-1 animate-pulse">
                ● Live Syncing
              </span>
            </h3>
            
            {incomingOrders.length === 0 ? (
              <div className="text-center py-10 border border-dashed rounded-2xl bg-muted/20">
                <Bell className="w-8 h-8 text-gray-400 mx-auto mb-2 animate-bounce" />
                <p className="text-xs font-semibold text-muted-foreground">Waiting for new orders...</p>
                <p className="text-[10px] text-gray-400 mt-1">Orders auto-generate periodically</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {incomingOrders.map(order => (
                  <div key={order.id} className={cn(
                    "p-3 rounded-xl border transition-all duration-200 shadow-sm hover:shadow-md",
                    order.channel === 'zomato' 
                      ? "bg-red-50/50 dark:bg-red-950/10 border-red-100 dark:border-red-900/30" 
                      : "bg-orange-50/50 dark:bg-orange-950/10 border-orange-100 dark:border-orange-900/30"
                  )}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <Badge className={order.channel === 'zomato' ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'}>
                          {order.channel === 'zomato' ? '🍅 Zomato' : '🍊 Swiggy'}
                        </Badge>
                        <span className="font-mono font-bold text-xs ml-2 text-gray-700 dark:text-gray-300">{order.orderId}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{order.time}</span>
                    </div>
                    
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 mb-2">Cust: {order.customerName}</p>
                    
                    <div className="text-[11px] text-muted-foreground space-y-0.5 border-t border-b border-gray-100 dark:border-gray-800/50 py-1.5 mb-2">
                      {order.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between">
                          <span>{item.name}</span>
                          <span className="font-bold">x{item.quantity}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-primary">₹{order.total}</span>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => {
                            setCart([]);
                            order.items.forEach((oi: any) => {
                              const dbItem = items.find(it => it.name.toLowerCase() === oi.name.toLowerCase() || it.name.toLowerCase().includes(oi.name.toLowerCase()));
                              if (dbItem) {
                                const storePrice = dbItem.price;
                                const channelPrice = getChannelPrice(dbItem, order.channel);
                                setCart(prev => [...prev, {
                                  ...dbItem,
                                  store_price: storePrice,
                                  price: channelPrice,
                                  quantity: oi.quantity
                                }]);
                              }
                            });
                            handleChannelChange(order.channel);
                            setAggregatorDialogOpen(false);
                            toast({
                              title: "Loaded to POS",
                              description: `Loaded ${order.channel === 'zomato' ? 'Zomato' : 'Swiggy'} order ${order.orderId} into your cart.`
                            });
                          }}
                          className="h-7 text-[10px] px-2"
                        >
                          Load to POS
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={() => acceptOrderToKDS(order)}
                          className={cn(
                            "h-7 text-[10px] px-2 text-white border-0",
                            order.channel === 'zomato' ? 'bg-red-500 hover:bg-red-600' : 'bg-orange-500 hover:bg-orange-600'
                          )}
                        >
                          Accept & KDS
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Column 2: Order Paste Parser */}
          <div className="space-y-4 pt-6 md:pt-0 md:pl-6">
            <h3 className="font-bold text-sm flex items-center gap-1.5 text-gray-800 dark:text-gray-200">
              <Clipboard className="w-4 h-4 text-primary" />
              Manual Order Paste Parser
            </h3>
            
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground block">
                Copy receipt/order text from Swiggy or Zomato portal, paste it here, and ZenPOS will automatically parse items, quantities, and prices:
              </Label>
              <Textarea 
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Example:&#10;Order #SW-248194&#10;1 x Veg Biryani&#10;2 x Butter Naan"
                rows={7}
                className="font-mono text-xs p-3"
              />
              
              <Button 
                onClick={parsePasteOrder} 
                className="w-full bg-gradient-to-r from-primary to-primary/95 text-white font-bold h-9 text-xs"
              >
                📥 Parse & Load to POS
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
};
export default Billing;