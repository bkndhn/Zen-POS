import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { BookOpen, Plus, IndianRupee, History } from 'lucide-react';

interface Cust { id: string; name: string | null; phone: string; current_balance: number | null }
interface Entry { id: string; created_at: string; transaction_type: string; amount: number; balance_after: number; notes: string | null; payment_mode: string | null }

type Filter = 'all' | 'due' | 'settled' | 'advance';
type Mode = 'opening' | 'collect';

const inr = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Customer credit ledger. Every change writes a customer_ledger row and updates current_balance (admin-scoped by RLS). */
const Khata: React.FC = () => {
  const { profile, adminProfileId } = useAuth();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Cust[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('due');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<{ mode: Mode; cust: Cust | null } | null>(null);
  const [phone, setPhone] = useState(''); const [name, setName] = useState('');
  const [amount, setAmount] = useState(''); const [payMode, setPayMode] = useState('Cash'); const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<{ cust: Cust; rows: Entry[] } | null>(null);

  const load = useCallback(async () => {
    if (!adminProfileId) return;
    setLoading(true);
    const { data, error } = await supabase.from('customers').select('id, name, phone, current_balance').eq('admin_id', adminProfileId).order('name');
    if (error) toast({ title: 'Could not load customers', description: error.message, variant: 'destructive' });
    setCustomers((data as Cust[]) || []);
    setLoading(false);
  }, [adminProfileId, toast]);
  useEffect(() => { load(); }, [load]);

  const bal = (c: Cust) => Number(c.current_balance || 0);
  const totals = useMemo(() => ({
    due: customers.filter(c => bal(c) > 0).reduce((s, c) => s + bal(c), 0),
    advance: customers.filter(c => bal(c) < 0).reduce((s, c) => s - bal(c), 0),
    dueCount: customers.filter(c => bal(c) > 0).length,
  }), [customers]);

  const shown = customers.filter(c => {
    const b = bal(c);
    if (filter === 'due' && b <= 0) return false;
    if (filter === 'settled' && b !== 0) return false;
    if (filter === 'advance' && b >= 0) return false;
    const q = search.trim().toLowerCase();
    return !q || (c.name || '').toLowerCase().includes(q) || c.phone.includes(q);
  });

  const open = (mode: Mode, cust: Cust | null) => {
    setDialog({ mode, cust }); setPhone(cust?.phone || ''); setName(cust?.name || '');
    setAmount(''); setNote(''); setPayMode('Cash');
  };

  const save = async () => {
    if (!dialog || !adminProfileId) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast({ title: 'Enter an amount above 0', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      let cust = dialog.cust;
      if (!cust) {
        const digits = phone.replace(/\D/g, '').slice(-10);
        if (digits.length !== 10) throw new Error('Enter a 10-digit mobile number');
        const existing = customers.find(c => c.phone.replace(/\D/g, '').slice(-10) === digits);
        if (existing) cust = existing;
        else {
          const { data, error } = await supabase.from('customers')
            .insert({ phone: digits, name: name.trim() || null, admin_id: adminProfileId, current_balance: 0 })
            .select('id, name, phone, current_balance').single();
          if (error) throw error;
          cust = data as Cust;
        }
      }
      // Re-read the balance so two devices don't overwrite each other's change.
      const { data: fresh } = await supabase.from('customers').select('current_balance').eq('id', cust.id).single();
      const prev = Number(fresh?.current_balance || 0);
      const isOpening = dialog.mode === 'opening';
      const next = Number((isOpening ? prev + amt : prev - amt).toFixed(2));
      const { error: le } = await supabase.from('customer_ledger').insert({
        customer_id: cust.id, admin_id: adminProfileId,
        transaction_type: isOpening ? 'debit' : 'credit', amount: amt,
        payment_mode: isOpening ? 'Opening Balance' : payMode,
        notes: note.trim() || (isOpening ? 'Opening balance' : 'Payment collected'),
        balance_after: next, created_by: profile?.user_id || adminProfileId,
      });
      if (le) throw le;
      const { error: ue } = await supabase.from('customers').update({ current_balance: next }).eq('id', cust.id);
      if (ue) throw ue;
      toast({ title: isOpening ? 'Opening balance saved' : 'Payment recorded', description: `New balance ${inr(next)}${next < 0 ? ' advance' : ''}` });
      setDialog(null);
      load();
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const openHistory = async (cust: Cust) => {
    const { data } = await supabase.from('customer_ledger')
      .select('id, created_at, transaction_type, amount, balance_after, notes, payment_mode')
      .eq('customer_id', cust.id).order('created_at', { ascending: false }).limit(200);
    setHistory({ cust, rows: (data as Entry[]) || [] });
  };

  const shareWa = (c: Cust) => {
    const msg = `Hi ${c.name || ''}, your pending balance with us is ${inr(bal(c))}. Thank you!`;
    window.open(`https://wa.me/91${c.phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="p-3 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2"><BookOpen className="h-5 w-5" /> Khata</h1>
        <Button size="sm" onClick={() => open('opening', null)}><Plus className="h-4 w-4 mr-1" /> Opening balance</Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3"><div className="text-xs text-muted-foreground">To collect</div><div className="text-lg font-bold text-destructive">{inr(totals.due)}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Customers owing</div><div className="text-lg font-bold">{totals.dueCount}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Advance held</div><div className="text-lg font-bold text-success">{inr(totals.advance)}</div></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['due', 'all', 'settled', 'advance'] as Filter[]).map(f => (
          <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)} className="capitalize">{f === 'due' ? 'Pending dues' : f}</Button>
        ))}
        <Input placeholder="Search name or phone" value={search} onChange={e => setSearch(e.target.value)} className="h-9 flex-1 min-w-[160px]" />
      </div>

      {loading ? <div className="h-24 rounded-md bg-muted animate-pulse" /> : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No customers here.</p>
      ) : (
        <div className="space-y-2">
          {shown.map(c => {
            const b = bal(c);
            return (
              <Card key={c.id} className="p-3 flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[140px]">
                  <div className="font-medium">{c.name || 'Unnamed'}</div>
                  <div className="text-xs text-muted-foreground">{c.phone}</div>
                </div>
                <div className={`font-bold ${b > 0 ? 'text-destructive' : b < 0 ? 'text-success' : 'text-muted-foreground'}`}>
                  {b === 0 ? 'Settled' : `${inr(b)}${b < 0 ? ' adv' : ''}`}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => open('collect', c)}><IndianRupee className="h-3.5 w-3.5 mr-1" />Collect</Button>
                  <Button size="sm" variant="outline" onClick={() => open('opening', c)}>+ Due</Button>
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => openHistory(c)} aria-label="History"><History className="h-4 w-4" /></Button>
                  {b > 0 && <Button size="sm" variant="ghost" onClick={() => shareWa(c)}>WhatsApp</Button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog?.mode === 'collect' ? 'Collect payment' : 'Add opening / due balance'}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {dialog?.cust ? (
              <p className="text-sm">{dialog.cust.name || dialog.cust.phone} — current {inr(bal(dialog.cust))}</p>
            ) : (
              <>
                <Input placeholder="Mobile (10 digits)" inputMode="numeric" value={phone} onChange={e => setPhone(e.target.value)} />
                <Input placeholder="Customer name" value={name} onChange={e => setName(e.target.value)} />
              </>
            )}
            <Input placeholder="Amount ₹" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
            {dialog?.mode === 'collect' && (
              <div className="flex gap-2">
                {['Cash', 'UPI', 'Bank'].map(m => <Button key={m} size="sm" variant={payMode === m ? 'default' : 'outline'} onClick={() => setPayMode(m)}>{m}</Button>)}
              </div>
            )}
            <Input placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} maxLength={200} />
          </div>
          <DialogFooter><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!history} onOpenChange={o => !o && setHistory(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{history?.cust.name || history?.cust.phone} — ledger</DialogTitle></DialogHeader>
          {history?.rows.length === 0 ? <p className="text-sm text-muted-foreground">No entries yet.</p> : (
            <div className="space-y-1 text-sm">
              {history?.rows.map(r => (
                <div key={r.id} className="flex justify-between gap-2 border-b border-border py-1.5">
                  <div>
                    <div>{r.notes || r.payment_mode}</div>
                    <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="text-right">
                    <div className={r.transaction_type === 'debit' ? 'text-destructive' : 'text-success'}>{r.transaction_type === 'debit' ? '+' : '−'}{inr(Number(r.amount))}</div>
                    <div className="text-xs text-muted-foreground">bal {inr(Number(r.balance_after))}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Khata;
