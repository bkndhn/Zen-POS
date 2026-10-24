import { useEffect, useRef } from 'react';
import { Delete, Printer, Plus as PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onCash: () => void;
  onAddToCart?: () => void;
  busy: boolean;
  prices: number[];
  mode?: 'num' | 'quick';
}

/** Maps a physical keyboard / USB numpad key to a pad action. */
export function mapPadKey(key: string): string | null {
  if (/^[0-9]$/.test(key) || key === '.' || key === '+' || key === '*') return key;
  if (key === 'Enter') return 'enter';
  if (key === 'Backspace') return 'back';
  if (key === 'Escape' || key === 'Delete') return 'clear';
  return null;
}

export function QuickCounterPad({ value, onChange, onCash, onAddToCart, busy, prices, mode = 'num' }: Props) {
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

  const keys: { k: string; hint?: string }[] = [
    { k: '7' }, { k: '8' }, { k: '9' }, { k: 'clear', hint: 'Esc' },
    { k: '4' }, { k: '5' }, { k: '6' }, { k: 'back', hint: '⌫' },
    { k: '1' }, { k: '2' }, { k: '3' }, { k: '+', hint: '+' },
    { k: '0' }, { k: '.' }, { k: '*', hint: '×' },
  ];

  return (
    <div className="max-w-xl mx-auto space-y-2">
      <Input
        aria-label="Quick bill amount"
        inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onCash(); } }}
        className="h-14 sm:h-16 text-right text-2xl sm:text-3xl font-mono bg-muted"
        placeholder="0"
        disabled={busy}
      />

      {/* Recent price chips – hidden in quick mode on mobile (codes, not prices) */}
      {mode !== 'quick' && (
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

      {/* Numpad grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {keys.map(({ k, hint }) => (
          <Button
            key={k}
            variant={k === '+' || k === '*' ? 'secondary' : 'outline'}
            className="h-11 sm:h-14 text-xl relative"
            disabled={busy}
            aria-label={k === 'back' ? 'Delete last digit' : k === 'clear' ? 'Clear amount' : undefined}
            onClick={() => onChange(k === 'clear' ? '' : k === 'back' ? value.slice(0, -1) : value + k)}
          >
            {k === 'back' ? <Delete className="h-5 w-5" /> : k === 'clear' ? 'C' : k === '*' ? '×' : k}
            {hint && <span className="absolute top-1 right-1.5 text-[10px] text-muted-foreground">{hint}</span>}
          </Button>
        ))}

        {/* ⚡ Fast Cash button occupies the last grid cell */}
        <Button
          disabled={busy}
          className="h-11 sm:h-14 relative bg-green-600 hover:bg-green-700 text-white"
          onClick={onCash}
          aria-label="Fast Cash and print"
        >
          <Printer className="h-4 w-4" />
          <span className="absolute top-1 right-1.5 text-[10px] opacity-70">↵</span>
        </Button>
      </div>

      {/* Dual action bar */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          className="h-11 text-sm font-semibold border-primary text-primary hover:bg-primary/10"
          disabled={busy || !value.trim()}
          onClick={onAddToCart}
        >
          <PlusIcon className="h-4 w-4 mr-1.5" />
          Add to Cart
        </Button>
        <Button
          type="button"
          className="h-11 text-sm font-bold bg-green-600 hover:bg-green-700 text-white"
          disabled={busy}
          onClick={onCash}
        >
          <Printer className="h-4 w-4 mr-1.5" />
          ⚡ Fast Cash
        </Button>
      </div>

      <p className="text-[11px] text-center text-muted-foreground pb-1">
        {mode === 'quick'
          ? 'QUICK MODE: Type item code (e.g. 1 for Chai, 1*3 for 3 Chais). Tap + to chain.'
          : 'NUM MODE: Type amount in ₹ (e.g. 20+50 or 20*3). Tap ⚡ Fast Cash to print.'}
      </p>
    </div>
  );
}
