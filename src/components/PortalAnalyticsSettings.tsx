import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { BarChart2, MessageSquare, Smartphone, Globe } from 'lucide-react';

export const PortalAnalyticsSettings: React.FC = () => {
  const { profile, adminProfileId } = useAuth();
  const { branches } = useBranch();
  const mainBranchId = branches.find(b => b.is_main)?.id || null;
  const adminId = adminProfileId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [gaMeasurementId, setGaMeasurementId] = useState('');
  const [metaPixelId, setMetaPixelId] = useState('');
  const [pwaEnabled, setPwaEnabled] = useState(true);
  const [chatbotEnabled, setChatbotEnabled] = useState(true);
  const [chatbotGreeting, setChatbotGreeting] = useState("Hi! What can I help you find on our menu today? 😊");

  useEffect(() => {
    if (adminId && mainBranchId) fetchSettings();
  }, [adminId, mainBranchId]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from('shop_settings')
        .select('ga_measurement_id, meta_pixel_id, pwa_enabled, chatbot_enabled, chatbot_greeting')
        .eq('admin_id', adminId)
        .eq('branch_id', mainBranchId)
        .maybeSingle();

      if (data) {
        setGaMeasurementId(data.ga_measurement_id || '');
        setMetaPixelId(data.meta_pixel_id || '');
        setPwaEnabled(data.pwa_enabled !== false);
        setChatbotEnabled(data.chatbot_enabled !== false);
        setChatbotGreeting(data.chatbot_greeting || "Hi! What can I help you find on our menu today? 😊");
      }
    } catch (err) {
      console.error('Error fetching portal analytics settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!adminId || !mainBranchId) return;
    setSaving(true);
    try {
      await (supabase as any)
        .from('shop_settings')
        .update({
          ga_measurement_id: gaMeasurementId.trim() || null,
          meta_pixel_id: metaPixelId.trim() || null,
          pwa_enabled: pwaEnabled,
          chatbot_enabled: chatbotEnabled,
          chatbot_greeting: chatbotGreeting.trim() || null,
        })
        .eq('admin_id', adminId)
        .eq('branch_id', mainBranchId);

      toast({ title: '✅ Portal settings saved', description: 'Public portal settings updated successfully.' });
    } catch (err) {
      console.error('Error saving portal analytics settings:', err);
      toast({ title: 'Error', description: 'Failed to save portal settings.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-8 bg-muted rounded" />
            <div className="h-4 bg-muted rounded w-1/4" />
            <div className="h-8 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const isAdmin = profile?.role === 'admin';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="w-5 h-5 text-primary" />
          Public Portal Settings
        </CardTitle>
        <CardDescription>
          Analytics tracking, PWA install prompt, and AI chatbot for your customer menu portal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Google Analytics */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 font-semibold text-sm">
            <BarChart2 className="w-4 h-4 text-orange-500" />
            Google Analytics Measurement ID
          </Label>
          <Input
            placeholder="G-XXXXXXXXXX"
            value={gaMeasurementId}
            onChange={e => setGaMeasurementId(e.target.value)}
            disabled={!isAdmin}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Your GA4 Measurement ID (e.g. G-ABCDE12345). Leave blank to disable tracking.
          </p>
        </div>

        {/* Meta Pixel */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 font-semibold text-sm">
            <BarChart2 className="w-4 h-4 text-blue-600" />
            Meta (Facebook) Pixel ID
          </Label>
          <Input
            placeholder="123456789012345"
            value={metaPixelId}
            onChange={e => setMetaPixelId(e.target.value)}
            disabled={!isAdmin}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Your Meta Pixel numeric ID. Tracks page views and menu interactions for Facebook/Instagram ads.
          </p>
        </div>

        {/* PWA Install Prompt */}
        <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/30">
          <div className="flex items-start gap-3">
            <Smartphone className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <Label className="font-semibold text-sm cursor-pointer">PWA "Add to Home Screen" Prompt</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Show a banner prompting customers to install your menu as an app on their phone.
              </p>
            </div>
          </div>
          <Switch
            checked={pwaEnabled}
            onCheckedChange={setPwaEnabled}
            disabled={!isAdmin}
          />
        </div>

        {/* AI Chatbot */}
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/30">
            <div className="flex items-start gap-3">
              <MessageSquare className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <Label className="font-semibold text-sm cursor-pointer">AI Menu Chatbot</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Local AI assistant that helps customers find dishes, check prices, and ask about specials.
                </p>
              </div>
            </div>
            <Switch
              checked={chatbotEnabled}
              onCheckedChange={setChatbotEnabled}
              disabled={!isAdmin}
            />
          </div>

          {chatbotEnabled && (
            <div className="space-y-1.5 pl-2">
              <Label className="text-sm font-medium">Chatbot Greeting Message</Label>
              <Input
                placeholder="Hi! What can I help you find on our menu today? 😊"
                value={chatbotGreeting}
                onChange={e => setChatbotGreeting(e.target.value)}
                disabled={!isAdmin}
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                First message customers see when they open the chat.
              </p>
            </div>
          )}
        </div>

        {isAdmin && (
          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? 'Saving…' : 'Save Portal Settings'}
          </Button>
        )}
        {!isAdmin && (
          <p className="text-xs text-muted-foreground italic">Only admins can change portal settings.</p>
        )}
      </CardContent>
    </Card>
  );
};
