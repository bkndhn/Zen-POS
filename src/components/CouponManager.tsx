import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Copy, Tag } from 'lucide-react';

interface Coupon {
  id: string;
  code: string;
  description?: string;
  discount_type: 'percent' | 'flat';
  discount_value: number;
  min_order_amount: number;
  max_uses: number | null;
  uses_count: number;
  is_one_use_per_customer: boolean;
  is_active: boolean;
  valid_until?: string | null;
}

interface CouponManagerProps {
  adminId: string;
}

export const CouponManager = ({ adminId }: CouponManagerProps) => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: '',
    description: '',
    discount_type: 'percent' as 'percent' | 'flat',
    discount_value: 10,
    min_order_amount: 0,
    max_uses: '',
    is_one_use_per_customer: false,
    valid_until: '',
  });

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('coupons')
      .select('*')
      .eq('admin_id', adminId)
      .order('created_at', { ascending: false });
    setCoupons(data || []);
    setLoading(false);
  }, [adminId]);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const handleCreate = async () => {
    if (!form.code.trim()) {
      toast({ title: 'Code required', variant: 'destructive' });
      return;
    }
    if (!form.discount_value || form.discount_value <= 0) {
      toast({ title: 'Discount value must be greater than 0', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from('coupons').insert({
      admin_id: adminId,
      code: form.code.trim().toUpperCase(),
      description: form.description || null,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      min_order_amount: Number(form.min_order_amount) || 0,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      is_one_use_per_customer: form.is_one_use_per_customer,
      valid_until: form.valid_until || null,
      is_active: true,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Error creating coupon', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: '✅ Coupon created!' });
    setShowForm(false);
    setForm({ code: '', description: '', discount_type: 'percent', discount_value: 10, min_order_amount: 0, max_uses: '', is_one_use_per_customer: false, valid_until: '' });
    fetchCoupons();
  };

  const toggleActive = async (id: string, val: boolean) => {
    await (supabase as any).from('coupons').update({ is_active: val }).eq('id', id);
    setCoupons(prev => prev.map(c => c.id === id ? { ...c, is_active: val } : c));
  };

  const deleteCoupon = async (id: string) => {
    if (!confirm('Delete this coupon? This cannot be undone.')) return;
    await (supabase as any).from('coupons').delete().eq('id', id);
    setCoupons(prev => prev.filter(c => c.id !== id));
    toast({ title: 'Coupon deleted' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-lg">Promo Codes</h3>
        </div>
        <Button size="sm" onClick={() => setShowForm(v => !v)}>
          <Plus className="w-4 h-4 mr-1" />
          New Coupon
        </Button>
      </div>

      {showForm && (
        <div className="border rounded-xl p-4 space-y-3 bg-gray-50 dark:bg-zinc-900">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">Code *</Label>
              <Input
                className="font-mono uppercase tracking-wider"
                value={form.code}
                onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="SAVE20"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Description</Label>
              <Input
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="20% off on all orders"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Discount Type</Label>
              <select
                className="w-full h-9 border rounded-md px-3 text-sm bg-background"
                value={form.discount_type}
                onChange={e => setForm(p => ({ ...p, discount_type: e.target.value as 'percent' | 'flat' }))}
              >
                <option value="percent">Percentage (%)</option>
                <option value="flat">Flat Amount (₹)</option>
              </select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">
                Value ({form.discount_type === 'percent' ? '%' : '₹'}) *
              </Label>
              <Input
                type="number"
                min="1"
                value={form.discount_value}
                onChange={e => setForm(p => ({ ...p, discount_value: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Min Order Amount (₹)</Label>
              <Input
                type="number"
                min="0"
                value={form.min_order_amount}
                onChange={e => setForm(p => ({ ...p, min_order_amount: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Max Uses (blank = unlimited)</Label>
              <Input
                type="number"
                min="1"
                value={form.max_uses}
                onChange={e => setForm(p => ({ ...p, max_uses: e.target.value }))}
                placeholder="Unlimited"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs mb-1 block">Valid Until (optional)</Label>
              <Input
                type="datetime-local"
                value={form.valid_until}
                onChange={e => setForm(p => ({ ...p, valid_until: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.is_one_use_per_customer}
              onCheckedChange={v => setForm(p => ({ ...p, is_one_use_per_customer: v }))}
              id="one-use-toggle"
            />
            <Label htmlFor="one-use-toggle" className="text-sm cursor-pointer">
              One use per customer
            </Label>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating...' : 'Create Coupon'}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 text-center py-8">Loading coupons...</p>
      ) : coupons.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Tag className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No promo codes yet. Create your first one above!</p>
          <p className="text-xs mt-1 opacity-70">Tip: Share codes on WhatsApp or at checkout</p>
        </div>
      ) : (
        <div className="space-y-2">
          {coupons.map(c => (
            <div key={c.id} className="flex items-center gap-3 p-3 border rounded-xl bg-white dark:bg-zinc-900">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-sm tracking-wider">{c.code}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(c.code); toast({ title: 'Code copied!' }); }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    title="Copy code"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-semibold">
                    {c.discount_type === 'percent' ? `${c.discount_value}% off` : `₹${c.discount_value} off`}
                  </span>
                  {!c.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-zinc-800">
                      Inactive
                    </span>
                  )}
                </div>
                {c.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  Used: {c.uses_count}{c.max_uses ? `/${c.max_uses}` : ''} ·{' '}
                  Min: ₹{c.min_order_amount}
                  {c.valid_until ? ` · Expires: ${new Date(c.valid_until).toLocaleDateString('en-IN')}` : ''}
                  {c.is_one_use_per_customer ? ' · 1/customer' : ''}
                </p>
              </div>
              <Switch checked={c.is_active} onCheckedChange={v => toggleActive(c.id, v)} />
              <button
                onClick={() => deleteCoupon(c.id)}
                className="text-red-400 hover:text-red-600 transition-colors"
                title="Delete coupon"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
