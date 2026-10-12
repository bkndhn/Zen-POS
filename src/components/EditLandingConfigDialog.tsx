import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Globe, Save, Loader2, RefreshCw } from 'lucide-react';

interface LandingConfig {
  heroTitle: string;
  heroSubtitle: string;
  pilotDays: number;
  monthlyPrice: string;
  yearlyPrice: string;
  contactPhone: string;
  whatsappNumber: string;
  promoBannerText?: string | null;
}

const DEFAULT_CONFIG: LandingConfig = {
  heroTitle: 'Lightning POS & QR Ordering OS for Modern Food Businesses',
  heroSubtitle: 'No hardware needed. Works offline. Tamil & English. Start billing in 2 minutes — from your phone or tablet.',
  pilotDays: 7,
  monthlyPrice: '1,000',
  yearlyPrice: '10,000',
  contactPhone: '9894451420',
  whatsappNumber: '919894451420',
  promoBannerText: '',
};

interface EditLandingConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EditLandingConfigDialog: React.FC<EditLandingConfigDialogProps> = ({ open, onOpenChange }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<LandingConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.resolve(supabase
      .from('super_admin_settings')
      .select('landing_page_config')
      .eq('id', 1)
      .maybeSingle())
      .then(({ data, error }) => {
        if (!error && data?.landing_page_config) {
          setConfig({
            ...DEFAULT_CONFIG,
            ...(data.landing_page_config as Partial<LandingConfig>),
            promoBannerText: (data.landing_page_config as any)?.promoBannerText || '',
          });
        }
      })
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...config,
        pilotDays: Number(config.pilotDays) || 7,
        promoBannerText: config.promoBannerText?.trim() || null,
      };

      const { error } = await supabase
        .from('super_admin_settings')
        .upsert({
          id: 1,
          landing_page_config: payload,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      notifyLandingConfigUpdated();


      toast({
        title: 'Landing Page & Pricing Updated!',
        description: 'New rates, banners, and contacts are now live on the public landing page.',
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Failed to update',
        description: err.message || 'Check database permissions',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Globe className="w-5 h-5 text-primary" />
            Edit Landing Page & Pricing
          </DialogTitle>
          <DialogDescription className="text-xs">
            Changes apply instantly to the public SaaS landing portal (/landing) and customer onboarding modal.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-xs">Loading live configuration...</p>
          </div>
        ) : (
          <div className="space-y-4 py-2 text-sm">
            {/* Promo Banner */}
            <div className="space-y-1.5 p-3 rounded-xl bg-primary/5 border border-primary/20">
              <Label className="text-xs font-bold text-primary flex items-center justify-between">
                <span>Promotional Top Banner (Optional)</span>
                <span className="text-[10px] font-normal text-muted-foreground">Leave empty to hide</span>
              </Label>
              <Input
                placeholder="e.g. 🎉 Diwali Special: Get 2 Months Free on Yearly Plan!"
                value={config.promoBannerText || ''}
                onChange={(e) => setConfig({ ...config, promoBannerText: e.target.value })}
                className="h-8 text-xs bg-background"
              />
            </div>

            {/* Hero Copy */}
            <div className="space-y-2">
              <div>
                <Label className="text-xs font-semibold">Hero Badge / Main Title</Label>
                <Input
                  value={config.heroTitle}
                  onChange={(e) => setConfig({ ...config, heroTitle: e.target.value })}
                  placeholder="Lightning POS & QR Ordering OS..."
                  className="h-9 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Hero Subtitle</Label>
                <Textarea
                  value={config.heroSubtitle}
                  onChange={(e) => setConfig({ ...config, heroSubtitle: e.target.value })}
                  rows={2}
                  className="text-xs resize-none"
                />
              </div>
            </div>

            {/* Pricing Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl border bg-muted/30">
              <div>
                <Label className="text-xs font-semibold">Free Pilot Days</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={config.pilotDays}
                  onChange={(e) => setConfig({ ...config, pilotDays: parseInt(e.target.value) || 7 })}
                  className="h-9 text-xs bg-background"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Monthly Rate (₹)</Label>
                <Input
                  value={config.monthlyPrice}
                  onChange={(e) => setConfig({ ...config, monthlyPrice: e.target.value })}
                  placeholder="1,000"
                  className="h-9 text-xs bg-background"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Yearly Rate (₹)</Label>
                <Input
                  value={config.yearlyPrice}
                  onChange={(e) => setConfig({ ...config, yearlyPrice: e.target.value })}
                  placeholder="10,000"
                  className="h-9 text-xs bg-background"
                />
              </div>
            </div>

            {/* Contact Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Support / Sales Phone</Label>
                <Input
                  value={config.contactPhone}
                  onChange={(e) => setConfig({ ...config, contactPhone: e.target.value })}
                  placeholder="9894451420"
                  className="h-9 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">WhatsApp Number (with country code)</Label>
                <Input
                  value={config.whatsappNumber}
                  onChange={(e) => setConfig({ ...config, whatsappNumber: e.target.value })}
                  placeholder="919894451420"
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={loading || saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save & Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
