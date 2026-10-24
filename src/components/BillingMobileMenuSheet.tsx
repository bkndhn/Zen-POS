import React, { useState, useMemo, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, X, Plus, Minus, ShoppingCart } from 'lucide-react';
import { getCDNUrl, handleImageError } from '@/utils/imageUtils';

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
  quick_chips?: string[];
  stock_quantity?: number;
  minimum_stock_alert?: number;
  unlimited_stock?: boolean;
}

interface CartItem extends Item {
  quantity: number;
}

interface ItemCategory {
  id: string;
  name: string;
}

interface BillingMobileMenuSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Item[];
  itemCategories: ItemCategory[];
  cart: CartItem[];
  onAddToCart: (item: Item) => void;
  onUpdateQuantity: (itemId: string, delta: number) => void;
  total: number;
  quickKeys?: Record<string, string>; // shortcodeKey -> itemId
}

export const BillingMobileMenuSheet: React.FC<BillingMobileMenuSheetProps> = ({
  open, onOpenChange,
  items, itemCategories, cart,
  onAddToCart, onUpdateQuantity, total,
  quickKeys = {},
}) => {
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('all');
  const searchRef = useRef<HTMLInputElement>(null);

  // Build reverse map: itemId -> quickKey
  const itemToKey = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(quickKeys)) map[v] = k;
    return map;
  }, [quickKeys]);

  const cartMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const ci of cart) m[ci.id] = (m[ci.id] || 0) + ci.quantity;
    return m;
  }, [cart]);

  const filtered = useMemo(() => {
    let list = items.filter(i => i.is_active);
    if (selectedCat !== 'all') list = list.filter(i => i.category === selectedCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    return list;
  }, [items, selectedCat, search]);

  const cartCount = cart.reduce((s, ci) => s + ci.quantity, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col rounded-t-2xl">
        {/* Header */}
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0">
          <SheetTitle className="text-base font-bold flex items-center justify-between">
            <span>Menu</span>
            {cartCount > 0 && (
              <Badge variant="default" className="text-xs">
                {cartCount} in cart
              </Badge>
            )}
          </SheetTitle>
          {/* Search */}
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search items..."
              className="pl-9 pr-9 h-10 bg-muted/40 border-0 rounded-xl text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {/* Category pills */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1 mt-2">
            <button
              onClick={() => setSelectedCat('all')}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${selectedCat === 'all' ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-background border-border text-muted-foreground hover:border-primary/40'}`}
            >
              All <span className="opacity-70">({items.filter(i => i.is_active).length})</span>
            </button>
            {itemCategories.map(cat => {
              const count = items.filter(i => i.is_active && i.category === cat.name).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCat(cat.name)}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${selectedCat === cat.name ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-background border-border text-muted-foreground hover:border-primary/40'}`}
                >
                  {cat.name} <span className="opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
        </SheetHeader>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No items found</div>
          ) : filtered.map(item => {
            const inCart = cartMap[item.id] || 0;
            const quickKey = itemToKey[item.id];
            const imgUrl = item.image_url ? getCDNUrl(item.image_url) : null;

            return (
              <div
                key={item.id}
                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${inCart > 0 ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'}`}
              >
                {/* Thumbnail */}
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt={item.name}
                    onError={handleImageError}
                    className="w-12 h-12 rounded-lg object-cover shrink-0 bg-muted"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-muted shrink-0 flex items-center justify-center text-lg">🍽️</div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-semibold truncate">{item.name}</p>
                    {quickKey && (
                      <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                        #{quickKey}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm font-bold text-primary">₹{item.price}</span>
                    {item.unit && <span className="text-xs text-muted-foreground">/ {item.unit}</span>}
                    {inCart > 0 && <span className="text-xs text-primary font-medium">{inCart} in cart</span>}
                  </div>
                </div>

                {/* Quantity controls */}
                <div className="flex items-center gap-1 shrink-0">
                  {inCart > 0 ? (
                    <>
                      <button
                        onClick={() => onUpdateQuantity(item.id, -1)}
                        className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted active:scale-95 transition-all"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold">{inCart}</span>
                      <button
                        onClick={() => onAddToCart(item)}
                        className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => onAddToCart(item)}
                      className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1 hover:bg-primary/90 active:scale-95 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer cart bar */}
        {cartCount > 0 && (
          <div className="shrink-0 px-4 py-3 border-t border-border bg-card flex items-center justify-between gap-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
            <div>
              <p className="text-xs text-muted-foreground">{cartCount} item{cartCount !== 1 ? 's' : ''} in cart</p>
              <p className="text-base font-extrabold text-primary">₹{total.toFixed(2)}</p>
            </div>
            <Button
              onClick={() => onOpenChange(false)}
              className="gap-2 h-10 px-5 shadow-sm"
            >
              <ShoppingCart className="w-4 h-4" />
              View Cart & Pay
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
