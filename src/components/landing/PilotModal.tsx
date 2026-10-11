import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

const shopTypes = ['Restaurant', 'Juice Shop', 'Food Truck', 'Bakery', 'Grocery', 'Café', 'Cloud Kitchen'];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export const PilotModal: React.FC<Props> = ({ open, onOpenChange }) => {
  const navigate = useNavigate();
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [shopType, setShopType] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setSubmitting(true);
    try {
      // Store lead — silently fail if table doesn't exist yet
      await (supabase as any).from('marketing_leads').insert({
        shop_name: shopName.trim() || null,
        phone: phone.trim(),
        shop_type: shopType || null,
        source: 'landing_pilot_modal',
        created_at: new Date().toISOString(),
      }).throwOnError().catch(() => { /* ignore if table absent */ });
    } catch { /* silently continue */ } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  };

  const reset = () => {
    setShopName(''); setPhone(''); setShopType(''); setSubmitted(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {submitted ? "🎉 You're all set!" : 'Start Your Free 7-Day Pilot'}
          </DialogTitle>
        </DialogHeader>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div>
              <Label htmlFor="pilot-shop">Shop Name</Label>
              <Input id="pilot-shop" placeholder="e.g. Murugan Idli Shop" value={shopName} onChange={e => setShopName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="pilot-phone">WhatsApp Number <span className="text-destructive">*</span></Label>
              <Input id="pilot-phone" type="tel" placeholder="+91 98765 43210" value={phone} onChange={e => setPhone(e.target.value)} className="mt-1" required />
            </div>
            <div>
              <Label>Shop Type</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {shopTypes.map(t => (
                  <button key={t} type="button" onClick={() => setShopType(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${shopType === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:border-primary/50 text-foreground'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={submitting || !phone.trim()}>
              {submitting ? 'Submitting…' : 'Get Free Pilot Access'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">No credit card. No contract. Cancel anytime.</p>
          </form>
        ) : (
          <div className="space-y-5 mt-2 text-center">
            <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
            <p className="text-muted-foreground text-sm">Your pilot is ready. Choose how to begin:</p>
            <div className="flex flex-col gap-3">
              <Button size="lg" onClick={() => { reset(); navigate('/demo'); }} className="w-full">
                Launch Instant Demo <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => { reset(); navigate('/auth'); }} className="w-full">
                Register / Login Directly
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
