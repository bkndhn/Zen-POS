import { useEffect, useRef } from 'react';
import { Delete, Printer, Plus as PlusIcon, Maximize2, Minimize2, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CartSummaryItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onCash: () => void;
  onAddToCart?: () => void;
  busy: boolean;
  prices: number[];
  mode?: 'num' | 'quick';
  /** Full Screen mode: hides item grid, expands keypad */
  fullScreen?: boolean;
  onToggleFullScreen?: () => void;
  /** Cart items for live summary strip in full screen */
  cart?: CartSummaryItem[];
  total?: number;
  /** Opens the cart / payment sheet */
  onOpenCart?: () => void;
}

/** Maps a physical keyboard / USB numpad key to a pad action. */
export function mapPadKey(key: string): string | null {
  if (/^[0-9]$/.test(key) || key === '.' || key === '+' || key === '*') return key;
  if (key === 'Enter') return 'enter';
  if (key === 'Backspace') return 'back';
  if (key === 'Escape' || key === 'Delete') return 'clear';
  return null;
}

export function QuickCounterPad({
  value, onChange, onCash, onAddToCart, busy, prices,
  mode = 'num',
  fullScreen = false, onToggleFullScreen,
  cart = [], total = 0, onOpenCart,
}: Props) {
  const latest = useRef({ value, onChange, onCash, onAddToCart, busy });
  latest.current = { value, onChange, onCash, onAddToCart, busy };

  // Physical numpad works anywhere on the screen, even when the box isn't focused.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const action = mapPadKey(e.key);
      const s = latest.current;
      if (!action || s.busy) return;
      e.preventDefault();
      if (action === 'enter') s.onCash();
      else if (action === 'back') s.onChange(s.value.slice(0, -1));
      else if (action === 'clear') s.onChange('');
      else s.onChange(s.value + action);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
  const lastTwo = [...cart].reverse().slice(0, 2);

  // Scale classes based on full-screen mode
  const inputCls = fullScreen
    ? 'h-16 sm:h-20 text-right text-3xl sm:text-4xl font-mono bg-muted'
    : 'h-14 sm:h-16 text-right text-2xl sm:text-3xl font-mono bg-muted';
  const keyBtnCls = fullScreen
    ? 'h-14 sm:h-16 text-2xl sm:text-3xl font-semibold relative'
    : 'h-11 sm:h-14 text-xl relative';
  const actionBtnH = fullScreen ? 'h-12 sm:h-14 text-base' : 'h-11 text-sm';

  const keys: { k: string; hint?: string }[] = [
    { k: '7' }, { k: '8' }, { k: '9' }, { k: 'clear', hint: 'Esc' },
    { k: '4' }, { k: '5' }, { k: '6' }, { k: 'back' },
    { k: '1' }, { k: '2' }, { k: '3' }, { k: '+', hint: '+' },
    { k: '0' }, { k: '.' }, { k: '*' },
  ];

  return (
    <div className={fullScreen ? 'max-w-2xl mx-auto space-y-2' : 'max-w-xl mx-auto space-y-2'}>

      

      {/* ── Live Cart Summary Strip (Full Screen only) ── */}
      {fullScreen && (
        <button
          type="button"
          onClick={onOpenCart}
          disabled={totalQty === 0}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-default"
        >
          <div className="flex items-center gap-2 text-sm">
            <ShoppingCart className="w-4 h-4 text-primary shrink-0" />
            <span className="font-semibold text-primary">
              {totalQty > 0 ? `${totalQty} item${totalQty > 1 ? 's' : ''}` : 'Cart empty'}
            </span>
            {lastTwo.length > 0 && (
              <span className="text-muted-foreground text-xs truncate max-w-[160px]">
                — {lastTwo.map(i => `${i.name.slice(0, 12)} ×${i.quantity}`).join(' • ')}
              </span>
            )}
          </div>
          <span className="font-bold text-primary text-sm shrink-0">
            ₹{(total ?? 0).toFixed(0)}
          </span>
        </button>
      )}

      {/* ── Amount Input ── */}
      <Input
        aria-label="Quick bill amount"
        inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onCash(); } }}
        className={inputCls}
        placeholder="0"
        disabled={busy}
      />

      {/* Recent price chips – only in num mode */}
      {mode !== 'quick' && prices.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {prices.slice(0, 4).map(price => (
            <Button
              key={price}
              variant="secondary"
              className="h-8 text-xs"
              disabled={busy}
              onClick={() => onChange(value ? `${value}+${price}` : String(price))}
            >
              ₹{price}
            </Button>
          ))}
        </div>
      )}

      {/* ── Numpad Grid ── */}
      <div className="grid grid-cols-4 gap-1.5">
        {keys.map(({ k, hint }) => (
          <Button
            key={k}
            variant={k === '+' || k === '*' ? 'secondary' : 'outline'}
            className={keyBtnCls}
            disabled={busy}
            aria-label={k === 'back' ? 'Delete last digit' : k === 'clear' ? 'Clear amount' : undefined}
            onClick={() => onChange(k === 'clear' ? '' : k === 'back' ? value.slice(0, -1) : value + k)}
          >
            {k === 'back' ? <Delete className={fullScreen ? 'h-6 w-6' : 'h-5 w-5'} /> : k === 'clear' ? 'C' : k === '*' ? '×' : k}
            {hint && <span className="absolute top-1 right-1.5 text-[10px] text-muted-foreground">{hint}</span>}
          </Button>
        ))}

        {/* ⚡ Fast Cash button occupies the last grid cell */}
        <Button
          disabled={busy}
          className={`${keyBtnCls} relative bg-green-600 hover:bg-green-700 text-white`}
          onClick={onCash}
          aria-label="Fast Cash and print"
        >
          <Printer className={fullScreen ? 'h-5 w-5' : 'h-4 w-4'} />
          
        </Button>
      </div>

      {/* ── Dual Action Bar ── */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          className={`${actionBtnH} font-semibold border-primary text-primary hover:bg-primary/10`}
          disabled={busy || !value.trim()}
          onClick={onAddToCart}
        >
          <PlusIcon className={`${fullScreen ? 'h-5 w-5' : 'h-4 w-4'} mr-1.5`} />
          Add to Cart
        </Button>
        <Button
          type="button"
          className={`${actionBtnH} font-bold bg-green-600 hover:bg-green-700 text-white`}
          disabled={busy}
          onClick={onCash}
        >
          <Printer className={`${fullScreen ? 'h-5 w-5' : 'h-4 w-4'} mr-1.5`} />
          Print & Pay
        </Button>
      </div>

      <p className="text-[11px] text-center text-muted-foreground pb-1">
        {mode === 'quick'
          ? 'QUICK: Type item code (e.g. 1 for Chai, 1*3 for 3 Chais). Tap + to add more.'
          : 'NUM: Enter amount (e.g. 20+50 or 20×3). Press Print & Pay to checkout.'}
      </p>
    </div>
  );
}
