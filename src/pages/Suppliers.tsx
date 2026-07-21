import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Truck, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
}

const emptyForm = { name: '', phone: '', email: '', gstin: '', address: '', notes: '' };

const Suppliers: React.FC = () => {
  const { profile , adminProfileId } = useAuth();
  const [list, setList] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [q, setQ] = useState('');

  const adminId = adminProfileId;

  const load = async () => {
    if (!adminId) return;
    setLoading(true);
    const { data } = await (supabase as any).from('suppliers').select('*').eq('admin_id', adminId).eq('is_active', true).order('name');
    setList((data || []) as Supplier[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [adminId]);

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, phone: s.phone || '', email: s.email || '', gstin: s.gstin || '', address: s.address || '', notes: s.notes || '' });
    setOpen(true);
  };

  const save = async () => {
    if (!adminId || !form.name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' }); return;
    }
    const payload = { ...form, admin_id: adminId, created_by: profile?.user_id };
    if (editing) {
      const { error } = await (supabase as any).from('suppliers').update(payload).eq('id', editing.id);
      if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      const { error } = await (supabase as any).from('suppliers').insert(payload);
      if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
    setOpen(false); load();
    toast({ title: 'Saved' });
  };

  const remove = async (s: Supplier) => {
    if (!confirm(`Delete supplier "${s.name}"?`)) return;
    const { error } = await (supabase as any).from('suppliers').update({ is_active: false }).eq('id', s.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    load();
  };

  const filtered = list.filter(s => !q || s.name.toLowerCase().includes(q.toLowerCase()) || (s.phone || '').includes(q));

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-24">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Truck className="w-5 h-5 text-primary" /><h1 className="text-xl sm:text-2xl font-bold">Suppliers</h1></div>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> New Supplier</Button>
        </div>

        <Input placeholder="Search suppliers..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {loading && <p className="text-muted-foreground col-span-full">Loading…</p>}
          {!loading && filtered.length === 0 && <p className="text-muted-foreground col-span-full text-center py-8">No suppliers yet. Click "New Supplier" to add one.</p>}
          {filtered.map(s => (
            <Card key={s.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{s.name}</h3>
                    {s.phone && <p className="text-xs text-muted-foreground">{s.phone}</p>}
                    {s.email && <p className="text-xs text-muted-foreground truncate">{s.email}</p>}
                    {s.gstin && <p className="text-xs text-muted-foreground">GSTIN: {s.gstin}</p>}
                    {s.address && <p className="text-xs text-muted-foreground line-clamp-2">{s.address}</p>}
                  </div>
                </div>
                <div className="flex gap-1 pt-1">
                  <Button size="sm" variant="outline" onClick={() => openEdit(s)} className="flex-1"><Pencil className="w-3 h-3 mr-1" /> Edit</Button>
                  <Button size="sm" variant="outline" onClick={() => remove(s)} className="text-destructive"><Trash2 className="w-3 h-3" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Supplier' : 'New Supplier'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div><Label>GSTIN</Label><Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></div>
            <div><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Suppliers;
