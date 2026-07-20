import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Zap, ReceiptText, Bell, FileSpreadsheet } from 'lucide-react';
import { AllBranchesReadOnlyBanner } from '@/components/AllBranchesReadOnlyBanner';

export const AdvancedFeaturesSettings = () => {
  const { profile } = useAuth();
  const { operatingBranchId, isAllBranchesView } = useBranch();
  const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    quick_bill_enabled: false,
    bill_bottom_text: 'Thank you!',
    low_stock_notification_enabled: false,
    auto_report_enabled: false,
    auto_report_time: ''
  });

  useEffect(() => {
    fetchSettings();
  }, [operatingBranchId]);

  const fetchSettings = async () => {
    if (!adminId || isAllBranchesView) {
        setLoading(false);
        return;
    }
    
    setLoading(true);
    try {
      let query = supabase.from('shop_settings').select('quick_bill_enabled, bill_bottom_text, low_stock_notification_enabled, auto_report_enabled, auto_report_time').eq('user_id', adminId);
      
      if (operatingBranchId) {
          query = query.eq('branch_id', operatingBranchId);
      } else {
          query = query.is('branch_id', null);
      }
      
      const { data, error } = await query.maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setSettings({
          quick_bill_enabled: data.quick_bill_enabled || false,
          bill_bottom_text: data.bill_bottom_text || 'Thank you!',
          low_stock_notification_enabled: data.low_stock_notification_enabled || false,
          auto_report_enabled: data.auto_report_enabled || false,
          auto_report_time: data.auto_report_time || ''
        });
      }
    } catch (error) {
      console.error('Error fetching advanced settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!adminId || isAllBranchesView) return;
    
    setSaving(true);
    try {
      const matchQuery = { user_id: adminId };
      if (operatingBranchId) {
          (matchQuery as any).branch_id = operatingBranchId;
      } else {
          // This requires special handling in supabase if branch_id is null, but we'll use match
      }

      let query = supabase.from('shop_settings').update(settings as any).eq('user_id', adminId);
      if (operatingBranchId) {
          query = query.eq('branch_id', operatingBranchId);
      } else {
          query = query.is('branch_id', null);
      }
      
      const { error } = await query;
      
      if (error) throw error;
      
      toast({
        title: "Settings saved",
        description: "Your advanced settings have been updated.",
      });
    } catch (error: any) {
      console.error('Error saving advanced settings:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save settings.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (isAllBranchesView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Advanced Features</CardTitle>
          <CardDescription>Configure automation and billing behavior</CardDescription>
        </CardHeader>
        <CardContent>
          <AllBranchesReadOnlyBanner />
        </CardContent>
      </Card>
    );
  }

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Advanced Features</CardTitle>
        <CardDescription>Configure automation, alerts, and specialized billing behaviors.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        

        {/* Custom Bill Bottom Text */}
        <div className="space-y-2 rounded-lg border p-4">
            <Label className="text-base flex items-center gap-2 mb-2">
                <ReceiptText className="w-4 h-4 text-primary" />
                Receipt Footer Text
            </Label>
            <p className="text-sm text-muted-foreground mb-4">
              Custom text to print at the very bottom of the receipt.
            </p>
            <Input 
                placeholder="Thank you!" 
                value={settings.bill_bottom_text}
                onChange={(e) => setSettings({ ...settings, bill_bottom_text: e.target.value })}
            />
        </div>

        {/* Low Stock Notifications */}
        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                Low Stock Alerts (Android)
            </Label>
            <p className="text-sm text-muted-foreground">
              Receive status bar notifications when items drop below threshold.
            </p>
          </div>
          <Switch
            checked={settings.low_stock_notification_enabled}
            onCheckedChange={(checked) => setSettings({ ...settings, low_stock_notification_enabled: checked })}
          />
        </div>
        
        {/* Auto Report Download */}
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex flex-row items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-primary" />
                    Auto Download Daily Report
                </Label>
                <p className="text-sm text-muted-foreground">
                  Automatically generate and save a daily sales report.
                </p>
              </div>
              <Switch
                checked={settings.auto_report_enabled}
                onCheckedChange={(checked) => setSettings({ ...settings, auto_report_enabled: checked })}
              />
          </div>
          
          {settings.auto_report_enabled && (
              <div className="pt-2">
                  <Label>Scheduled Time</Label>
                  <Input 
                    type="time" 
                    value={settings.auto_report_time}
                    onChange={(e) => setSettings({ ...settings, auto_report_time: e.target.value })}
                    className="w-full md:w-1/3 mt-1"
                  />
              </div>
          )}
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </CardContent>
    </Card>
  );
};
