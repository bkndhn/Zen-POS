import { useEffect, useRef } from 'react';
import { Delete, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onCash: () => void;
  busy: boolean;
  prices: number[];
}

/** Maps a physical keyboard / USB numpad key to a pad action. */
export function mapPadKey(key: string): string | null {
  if (/^[0-9]$/.test(key) || key === '.' || key === '+' || key === '*') return key;
  if (key === 'Enter') return 'enter';
  if (key === 'Backspace') return 'back';
  if (key === 'Escape' || key === 'Delete') return 'clear';
  return null;
}

export function QuickCounterPad({ value, onChange, onCash, busy, prices }: Props) {
  const latest = useRef({ value, onChange, onCash, busy });
  latest.current = { value, onChange, onCash, busy };

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
    { k: '0' }, { k: '.' }, { k: '*', hint: '*' },
  ];

  return <div className="max-w-xl mx-auto space-y-3">
    <Input aria-label="Quick bill amount" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onCash(); } }} className="h-16 text-right text-3xl font-mono bg-muted" placeholder="0" disabled={busy} />
    <div className="grid grid-cols-4 gap-2">{prices.slice(0, 4).map(price => <Button key={price} variant="secondary" disabled={busy} onClick={() => onChange(value ? `${value}+${price}` : String(price))}>₹{price}</Button>)}</div>
    <div className="grid grid-cols-4 gap-2">
      {keys.map(({ k, hint }) => <Button key={k} variant={k === '+' || k === '*' ? 'secondary' : 'outline'} className="h-14 text-xl relative" disabled={busy} aria-label={k === 'back' ? 'Delete last digit' : k === 'clear' ? 'Clear amount' : undefined} onClick={() => onChange(k === 'clear' ? '' : k === 'back' ? value.slice(0, -1) : value + k)}>
        {k === 'back' ? <Delete className="h-5 w-5" /> : k === 'clear' ? 'C' : k === '*' ? '×' : k}
        {hint && <span className="absolute top-1 right-1.5 text-[10px] text-muted-foreground">{hint}</span>}
      </Button>)}
      <Button disabled={busy} className="h-14 relative" onClick={onCash} aria-label="Cash and print"><Printer className="h-5 w-5" /><span className="absolute top-1 right-1.5 text-[10px] opacity-70">↵</span></Button>
    </div>
    <Button className="h-14 w-full text-lg" disabled={busy} onClick={onCash}><Printer className="h-5 w-5 mr-2" />{busy ? 'Saving…' : 'Cash & Print (Enter)'}</Button>
    <p className="text-xs text-center text-muted-foreground">USB numpad: type amount, + to add, Enter to cash & print, Esc to clear.</p>
  </div>;
}
