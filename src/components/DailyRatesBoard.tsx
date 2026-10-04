import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface RateItem {
  id: string;
  name: string;
  price: number;
  category: string | null;
  purchase_rate?: number | null;
}

interface Props {
  items: RateItem[];
  canEdit: boolean;
  onItemsUpdated: () => void;
}

/** Pure helpers (exported for tests). */
export const shiftPrice = (price: number, delta: number, pct = false) =>
  Math.max(0, Math.round((pct ? price * (1 + delta / 100) : price + delta) * 100) / 100);
export const marginPct = (price: number, cost?: number | null) =>
  !cost || !price ? null : Math.round(((price - cost) / price) * 100);

const CHIPS: { label: string; delta: number; pct?: boolean }[] = [
  { label: '−₹5', delta: -5 }, { label: '−₹2', delta: -2 },
  { label: '+₹2', delta: 2 }, { label: '+₹5', delta: 5 }, { label: '+10%', delta: 10, pct: true },
];

const DailyRatesBoard: React.FC<Props> = ({ items, canEdit, onItemsUpdated }) => {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [cat, setCat] = useState('all');
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState('');
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  const cats = useMemo(() => Array.from(new Set(items.map(i => i.category || 'Other'))).sort(), [items]);
  const shown = useMemo(
    () => items.filter(i => cat === 'all' || (i.category || 'Other') === cat).sort((a, b) => a.name.localeCompare(b.name)),
    [items, cat],
  );

  // Drop drafts that now match the saved price
  useEffect(() => {
    setDrafts(d => {
      const n = { ...d };
      for (const it of items) if (n[it.id] !== undefined && Number(n[it.id]) === Number(it.price)) delete n[it.id];
      return n;
    });
  }, [items]);

  const valueOf = (it: RateItem) => drafts[it.id] ?? String(it.price ?? 0);
  const dirtyIds = Object.keys(drafts).filter(id => {
    const it = items.find(i => i.id === id);
    return it && Number(drafts[id]) !== Number(it.price) && drafts[id] !== '';
  });

  const saveIds = async (ids: string[]) => {
    if (!ids.length) return;
    setSavingIds(new Set(ids));
    try {
      for (const id of ids) {
        const price = Number(drafts[id]);
        if (!Number.isFinite(price) || price < 0) throw new Error('Enter a valid rate');
        const { error } = await supabase.from('items').update({ price }).eq('id', id);
        if (error) throw error;
      }
      setSaved(new Set(ids));
      setTimeout(() => setSaved(new Set()), 1500);
      toast.success(ids.length === 1 ? 'Rate saved' : `${ids.length} rates saved`);
      onItemsUpdated();
    } catch (e: any) {
      toast.error('Could not save rate', { description: e?.message });
    } finally {
      setSavingIds(new Set());
    }
  };

  const onKey = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const it = shown[idx];
    if (dirtyIds.includes(it.id)) void saveIds([it.id]);
    const next = shown[idx + 1];
    if (next) { refs.current[next.id]?.focus(); refs.current[next.id]?.select(); }
  };

  const applyBulk = () => {
    const raw = bulk.trim();
    const pct = raw.endsWith('%');
    const n = Number(raw.replace('%', ''));
    if (!Number.isFinite(n) || n === 0) return toast.error('Type an amount like 5, -3 or 10%');
    setDrafts(d => {
      const out = { ...d };
      for (const it of shown) out[it.id] = String(shiftPrice(Number(valueOf(it)), n, pct));
      return out;
    });
  };

  if (!canEdit) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Pick a single branch (and sign in as the owner) to update daily rates.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={cat === 'all' ? 'default' : 'outline'} onClick={() => setCat('all')}>All ({items.length})</Button>
        {cats.map(c => (
          <Button key={c} size="sm" variant={cat === c ? 'default' : 'outline'} onClick={() => setCat(c)}>
            {c} ({items.filter(i => (i.category || 'Other') === c).length})
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-8 w-40" placeholder="Bulk: 5, -3, 10%" value={bulk} onChange={e => setBulk(e.target.value)} />
        <Button size="sm" variant="outline" onClick={applyBulk}>Apply to shown</Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" disabled={!dirtyIds.length} onClick={() => setDrafts({})}>
          <RotateCcw className="h-4 w-4 mr-1" /> Reset
        </Button>
        <Button size="sm" disabled={!dirtyIds.length || savingIds.size > 0} onClick={() => void saveIds(dirtyIds)}>
          {savingIds.size > 0 ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Save all rates ({dirtyIds.length})
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Type today's rate and press Enter — it saves and jumps to the next item.</p>

      <div className="border rounded-lg divide-y">
        {shown.map((it, idx) => {
          const dirty = dirtyIds.includes(it.id);
          const m = marginPct(Number(valueOf(it)), it.purchase_rate);
          return (
            <div key={it.id} className={`flex flex-wrap items-center gap-2 p-2 transition-colors ${saved.has(it.id) ? 'bg-success/10' : dirty ? 'bg-warning/10' : ''}`}>
              <div className="min-w-[8rem] flex-1">
                <div className="font-medium text-sm">{it.name}</div>
                <div className="text-xs text-muted-foreground">Was ₹{it.price}{it.purchase_rate ? ` · Cost ₹${it.purchase_rate}` : ''}</div>
              </div>
              <div className="flex gap-1">
                {CHIPS.map(c => (
                  <Button key={c.label} size="sm" variant="outline" className="h-7 px-2 text-xs"
                    onClick={() => setDrafts(d => ({ ...d, [it.id]: String(shiftPrice(Number(valueOf(it)), c.delta, c.pct)) }))}>
                    {c.label}
                  </Button>
                ))}
              </div>
              <Input
                ref={el => { refs.current[it.id] = el; }}
                type="number" inputMode="decimal" className="h-8 w-24 text-right"
                value={valueOf(it)}
                onChange={e => setDrafts(d => ({ ...d, [it.id]: e.target.value }))}
                onKeyDown={e => onKey(e, idx)}
              />
              {m !== null && <Badge variant={m >= 20 ? 'secondary' : 'destructive'} className="w-14 justify-center">{m}%</Badge>}
              {savingIds.has(it.id) && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DailyRatesBoard;
