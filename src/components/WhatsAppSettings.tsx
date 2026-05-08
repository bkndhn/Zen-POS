import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { MessageCircle, Settings2, Zap, Info, Image as ImageIcon, FileText } from 'lucide-react';

export const WhatsAppSettings: React.FC = () => {
  const { profile } = useAuth();
  const { operatingBranchId, branches } = useBranch();
  const mainBranchId = branches.find(b => b.is_main)?.id || null;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings state
  const [whatsappBillShareEnabled, setWhatsappBillShareEnabled] = useState(false);
  const [whatsappShareMode, setWhatsappShareMode] = useState<'text' | 'image'>('text');
  const [whatsappBusinessApiEnabled, setWhatsappBusinessApiEnabled] = useState(false);
  const [whatsappBusinessApiToken, setWhatsappBusinessApiToken] = useState('');
  const [whatsappBusinessPhoneId, setWhatsappBusinessPhoneId] = useState('');

  useEffect(() => {
    if (profile?.user_id && operatingBranchId) {
      fetchSettings();
    }
  }, [profile?.user_id, operatingBranchId]);

  const fetchSettings = async () => {
    try {
      const cols = 'whatsapp_bill_share_enabled, whatsapp_share_mode, whatsapp_business_api_enabled, whatsapp_business_api_token, whatsapp_business_phone_id';
      let { data, error } = await (supabase as any)
        .from('shop_settings')
        .select(cols)
        .eq('user_id', profile?.user_id)
        .eq('branch_id', operatingBranchId)
        .maybeSingle();

      if (!data && mainBranchId && mainBranchId !== operatingBranchId) {
        const { data: mainRow } = await (supabase as any)
          .from('shop_settings')
          .select(cols)
          .eq('user_id', profile?.user_id)
          .eq('branch_id', mainBranchId)
          .maybeSingle();
        data = mainRow;
      }

      if (error && (error as any).code !== 'PGRST116') throw error;

      if (data) {
        setWhatsappBillShareEnabled(data.whatsapp_bill_share_enabled || false);
        setWhatsappShareMode(data.whatsapp_share_mode === 'image' ? 'image' : 'text');
        setWhatsappBusinessApiEnabled(data.whatsapp_business_api_enabled || false);
        setWhatsappBusinessApiToken(data.whatsapp_business_api_token || '');
        setWhatsappBusinessPhoneId(data.whatsapp_business_phone_id || '');
      }
    } catch (error) {
      // Silent fail
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile?.user_id || !operatingBranchId) return;
    setSaving(true);

    try {
      const payload = {
        whatsapp_bill_share_enabled: whatsappBillShareEnabled,
        whatsapp_share_mode: whatsappShareMode,
        whatsapp_business_api_enabled: whatsappBusinessApiEnabled,
        whatsapp_business_api_token: whatsappBusinessApiToken || null,
        whatsapp_business_phone_id: whatsappBusinessPhoneId || null,
        updated_at: new Date().toISOString()
      };
      const { data: existing } = await (supabase as any)
        .from('shop_settings').select('id')
        .eq('user_id', profile.user_id).eq('branch_id', operatingBranchId).maybeSingle();
      const { error } = existing?.id
        ? await (supabase as any).from('shop_settings').update(payload).eq('id', existing.id)
        : await (supabase as any).from('shop_settings').insert({ ...payload, user_id: profile.user_id, branch_id: operatingBranchId });

      if (error) throw error;

      // Update local cache
      const existingCache = localStorage.getItem('hotel_pos_bill_header');
      if (existingCache) {
        const parsed = JSON.parse(existingCache);
        parsed.whatsappBillShareEnabled = whatsappBillShareEnabled;
        parsed.whatsappShareMode = whatsappShareMode;
        localStorage.setItem('hotel_pos_bill_header', JSON.stringify(parsed));
      }

      toast({
        title: "Settings Saved",
        description: "WhatsApp bill sharing settings updated successfully."
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse h-32 bg-muted rounded-lg" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-green-600" />
          WhatsApp Bill Share
        </CardTitle>
        <CardDescription>
          Send digital receipts directly to customers via WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master Toggle */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
          <div className="space-y-0.5">
            <Label htmlFor="whatsapp-enabled" className="text-sm font-medium">
              Enable WhatsApp Bill Sharing
            </Label>
            <p className="text-xs text-muted-foreground">
              Show option to send bill via WhatsApp during billing
            </p>
          </div>
          <Switch
            id="whatsapp-enabled"
            checked={whatsappBillShareEnabled}
            onCheckedChange={setWhatsappBillShareEnabled}
          />
        </div>

        {whatsappBillShareEnabled && (
          <>
            {/* Share Format Mode */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                <Label className="text-sm font-medium">Default Share Format</Label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Image Mode */}
                <div
                  onClick={() => setWhatsappShareMode('image')}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${whatsappShareMode === 'image'
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/20 shadow-md'
                      : 'border-muted hover:border-purple-200'
                    }`}
                >
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${whatsappShareMode === 'image' ? 'bg-purple-100 dark:bg-purple-900' : 'bg-muted'
                      }`}>
                      <ImageIcon className={`w-5 h-5 ${whatsappShareMode === 'image' ? 'text-purple-600' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="font-semibold text-sm">Image Bill</span>
                        {whatsappShareMode === 'image' && (
                          <Badge className="text-[9px] bg-purple-600 h-4">Active</Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Professional colorful receipt</p>
                    </div>
                  </div>
                </div>

                {/* Text Mode */}
                <div
                  onClick={() => setWhatsappShareMode('text')}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${whatsappShareMode === 'text'
                      ? 'border-green-500 bg-green-50 dark:bg-green-950/20 shadow-md'
                      : 'border-muted hover:border-green-200'
                    }`}
                >
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${whatsappShareMode === 'text' ? 'bg-green-100 dark:bg-green-900' : 'bg-muted'
                      }`}>
                      <FileText className={`w-5 h-5 ${whatsappShareMode === 'text' ? 'text-green-600' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="font-semibold text-sm">Text Bill</span>
                        {whatsappShareMode === 'text' && (
                          <Badge className="text-[9px] bg-green-600 h-4">Active</Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Quick & low data usage</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Integration Mode */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                <Label className="text-sm font-medium">Integration Mode</Label>
              </div>

              {/* Direct WhatsApp (Free) */}
              <div className={`p-4 rounded-lg border-2 transition-colors ${!whatsappBusinessApiEnabled ? 'border-primary bg-primary/5' : 'border-muted'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <MessageCircle className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Direct WhatsApp</span>
                        <Badge variant="secondary" className="text-[10px]">Free</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Opens WhatsApp with pre-filled message (manual send)</p>
                    </div>
                  </div>
                  <Switch
                    checked={!whatsappBusinessApiEnabled}
                    onCheckedChange={() => setWhatsappBusinessApiEnabled(false)}
                  />
                </div>
              </div>

              {/* WhatsApp Business API (Premium) */}
              <div className={`p-4 rounded-lg border-2 transition-colors ${whatsappBusinessApiEnabled ? 'border-primary bg-primary/5' : 'border-muted'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">WhatsApp Business API</span>
                        <Badge className="text-[10px] bg-blue-600">Premium</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Automatic bill sending (requires Business API setup)</p>
                    </div>
                  </div>
                  <Switch
                    checked={whatsappBusinessApiEnabled}
                    onCheckedChange={setWhatsappBusinessApiEnabled}
                  />
                </div>

                {whatsappBusinessApiEnabled && (
                  <div className="space-y-3 pt-3 border-t">
                    <div className="flex items-start gap-2 p-2 bg-yellow-50 rounded-md border border-yellow-200">
                      <Info className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-yellow-800">
                        WhatsApp Business API requires a Meta Business account and approved WhatsApp Business number.
                        <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noopener noreferrer" className="underline ml-1">Learn more</a>
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="api-token" className="text-xs">Access Token</Label>
                      <Input
                        id="api-token"
                        type="password"
                        placeholder="Your WhatsApp Business API Token"
                        value={whatsappBusinessApiToken}
                        onChange={(e) => setWhatsappBusinessApiToken(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone-id" className="text-xs">Phone Number ID</Label>
                      <Input
                        id="phone-id"
                        placeholder="Your WhatsApp Business Phone Number ID"
                        value={whatsappBusinessPhoneId}
                        onChange={(e) => setWhatsappBusinessPhoneId(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? "Saving..." : "Save WhatsApp Settings"}
        </Button>
      </CardContent>
    </Card>
  );
};
