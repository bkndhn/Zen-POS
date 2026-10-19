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

export function QuickCounterPad({ value, onChange, onCash, busy, prices }: Props) {
  return <div className="max-w-xl mx-auto space-y-3">
    <Input aria-label="Quick bill amount" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onCash(); } }} className="h-16 text-right text-3xl font-mono bg-muted" placeholder="0" disabled={busy} />
    <div className="grid grid-cols-4 gap-2">{prices.slice(0, 4).map(price => <Button key={price} variant="secondary" disabled={busy} onClick={() => onChange(value ? `${value}+${price}` : String(price))}>₹{price}</Button>)}</div>
    <div className="grid grid-cols-4 gap-2">
      {['7', '8', '9', 'clear', '4', '5', '6', 'back', '1', '2', '3', '+', '0', '.', '*'].map(key => <Button key={key} variant={key === '+' || key === '*' ? 'secondary' : 'outline'} className="h-14 text-xl" disabled={busy} aria-label={key === 'back' ? 'Delete last digit' : key === 'clear' ? 'Clear amount' : undefined} onClick={() => onChange(key === 'clear' ? '' : key === 'back' ? value.slice(0, -1) : value + key)}>{key === 'back' ? <Delete className="h-5 w-5" /> : key === 'clear' ? 'C' : key === '*' ? '×' : key}</Button>)}
      <Button disabled={busy} className="h-14" onClick={onCash}><Printer className="h-5 w-5" /></Button>
    </div>
    <Button className="h-14 w-full text-lg" disabled={busy} onClick={onCash}><Printer className="h-5 w-5 mr-2" />{busy ? 'Saving…' : 'Cash & Print'}</Button>
  </div>;
}