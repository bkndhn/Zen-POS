import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Wallet } from 'lucide-react';

export const KhataSettings = () => {
  const { operatingBranchId, isAllBranchesView } = useBranch();
  const { profile } = useAuth();
  
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminAuthUid, setAdminAuthUid] = useState<string | null>(null);

  useEffect(() => {
    const resolveAuthUid = async () => {
      if (!profile) return;
      if (profile.role === 'admin') {
        setAdminAuthUid(profile.user_id);
      } else if (profile.admin_id) {
        const { data } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('id', profile.admin_id)
          .maybeSingle();
        if (data?.user_id) setAdminAuthUid(data.user_id);
      }
    };
    resolveAuthUid();
  }, [profile]);
  
  useEffect(() => {
    const loadSettings = async () => {
      if (isAllBranchesView || !adminAuthUid) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        let query = supabase.from('shop_settings').select('khata_billing_enabled').eq('user_id', adminAuthUid);
        
        if (operatingBranchId) {
          query = query.eq('branch_id', operatingBranchId);
        } else {
          query = query.is('branch_id', null);
        }

        const { data, error } = await query.maybeSingle();
          
        if (error && error.code !== 'PGRST116') throw error;
        if (data) {
          setEnabled(!!data.khata_billing_enabled);
        }
      } catch (error) {
        console.error('Error loading khata settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [operatingBranchId, isAllBranchesView, adminAuthUid]);

  const handleToggle = async (checked: boolean) => {
    if (isAllBranchesView || !adminAuthUid) return;
    
    try {
      setEnabled(checked);
      if (!adminAuthUid) return;

      let existingQuery = supabase.from('shop_settings').select('id').eq('user_id', adminAuthUid);
      if (operatingBranchId) {
        existingQuery = existingQuery.eq('branch_id', operatingBranchId);
      } else {
        existingQuery = existingQuery.is('branch_id', null);
      }
      
      const { data: existing } = await existingQuery.maybeSingle();
      const payload = { khata_billing_enabled: checked };
      
      let error;
      if (existing?.id) {
        const { error: updateError } = await supabase.from('shop_settings').update(payload).eq('id', existing.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase.from('shop_settings').insert({
          ...payload,
          user_id: adminAuthUid,
          branch_id: operatingBranchId || null
        });
        error = insertError;
      }

      if (error) throw error;

      toast({
        title: "Settings Updated",
        description: `Khata (Credit) System has been ${checked ? 'enabled' : 'disabled'} for this branch.`
      });
      window.dispatchEvent(new Event('shop-settings-updated'));
    } catch (error) {
      console.error('Error updating khata settings:', error);
      setEnabled(!checked);
      toast({
        title: "Error",
        description: "Failed to update settings. Please try again.",
        variant: "destructive"
      });
    }
  };

  if (!adminAuthUid) return null;

  return (
    <Card className="shadow-sm border-zinc-200/50 dark:border-zinc-800/50">
      <CardHeader className="pb-3 border-b border-border/40 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Khata (Credit) System</CardTitle>
            <CardDescription className="text-xs">Allow cashiers to give credit directly from the checkout page.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center justify-between p-3 rounded-lg border bg-background shadow-sm">
          <div className="flex flex-col gap-0.5 max-w-[70%]">
            <Label htmlFor="khata-toggle" className="text-sm font-medium">Enable Khata Add-on</Label>
            <p className="text-xs text-muted-foreground">When enabled, the Khata payment option will appear during checkout to easily log customer debts. Disable this to reduce clutter if you don't offer credit.</p>
          </div>
          <Switch
            id="khata-toggle"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={loading || isAllBranchesView}
          />
        </div>
      </CardContent>
    </Card>
  );
};
