import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Calculator } from 'lucide-react';

export const CalciBillingSettings = () => {
  const { hasAccess } = useUserPermissions();
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

  // If the client doesn't have the feature unlocked by Super Admin, don't show it.
  const hasCalciAccess = hasAccess('calci_billing') || profile?.client_permissions?.['calci_billing'] === true;

  useEffect(() => {
    const loadSettings = async () => {
      if (isAllBranchesView) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('shop_settings')
          .select('calci_billing_enabled')
          .eq('branch_id', operatingBranchId)
          .maybeSingle();
          
        if (error && error.code !== 'PGRST116') throw error;
        if (data) {
          setEnabled(!!data.calci_billing_enabled);
        }
      } catch (error) {
        console.error('Error loading calci billing settings:', error);
      } finally {
        setLoading(false);
      }
    };

    if (operatingBranchId && hasCalciAccess) {
      loadSettings();
    }
  }, [operatingBranchId, hasCalciAccess, isAllBranchesView]);

  const handleToggle = async (checked: boolean) => {
    if (isAllBranchesView) return;
    
    try {
      setEnabled(checked);
      
      if (!adminAuthUid) throw new Error('Could not resolve admin ID');

      let existingQuery = supabase.from('shop_settings').select('id').eq('user_id', adminAuthUid);
      if (operatingBranchId) {
        existingQuery = existingQuery.eq('branch_id', operatingBranchId);
      } else {
        existingQuery = existingQuery.is('branch_id', null);
      }
      
      const { data: existing } = await existingQuery.maybeSingle();
      
      let error;
      if (existing?.id) {
        const { error: updateError } = await supabase
          .from('shop_settings')
          .update({ calci_billing_enabled: checked })
          .eq('id', existing.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('shop_settings')
          .insert({
            calci_billing_enabled: checked,
            user_id: adminAuthUid,
            branch_id: operatingBranchId || null
          });
        error = insertError;
      }

      if (error) throw error;
      toast({
        title: "Settings Updated",
        description: `Calci Billing mode has been ${checked ? 'enabled' : 'disabled'} for this branch.`
      });
    } catch (error) {
      console.error('Error updating calci settings:', error);
      setEnabled(!checked);
      toast({
        title: "Error",
        description: "Failed to update settings. Please try again.",
        variant: "destructive"
      });
    }
  };

  if (!hasCalciAccess) return null;

  return (
    <Card className="shadow-sm border-zinc-200/50 dark:border-zinc-800/50">
      <CardHeader className="pb-3 border-b border-border/40 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
            <Calculator className="w-4 h-4" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Calci Billing Mode</CardTitle>
            <CardDescription className="text-xs">Quick counter billing using math expressions.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center justify-between p-3 rounded-lg border bg-background shadow-sm">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="calci-billing-toggle" className="text-sm font-medium">Enable Calci Billing</Label>
            <p className="text-xs text-muted-foreground">Allows cashiers to type amounts directly into the POS (e.g. 10+25+2*15) without selecting items.</p>
          </div>
          <Switch
            id="calci-billing-toggle"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={loading || isAllBranchesView}
          />
        </div>

        {enabled && (
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Default Mode</Label>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 space-y-1">
                  <p className="text-xs text-muted-foreground mb-2">Overall Default POS View</p>
                  <div className="flex bg-muted/50 p-1 rounded-lg border">
                    <button
                      onClick={() => {
                        localStorage.setItem(operatingBranchId ? `hotel_pos_default_billing_mode_${operatingBranchId}` : 'hotel_pos_default_billing_mode', 'pos');
                        toast({ title: 'Default updated', description: 'POS Mode will be the default view.' });
                      }}
                      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        (localStorage.getItem(operatingBranchId ? `hotel_pos_default_billing_mode_${operatingBranchId}` : 'hotel_pos_default_billing_mode') || 'pos') === 'pos'
                          ? 'bg-white dark:bg-zinc-800 shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Image POS
                    </button>
                    <button
                      onClick={() => {
                        localStorage.setItem(operatingBranchId ? `hotel_pos_default_billing_mode_${operatingBranchId}` : 'hotel_pos_default_billing_mode', 'calci');
                        toast({ title: 'Default updated', description: 'Calci Mode will be the default view.' });
                      }}
                      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        (localStorage.getItem(operatingBranchId ? `hotel_pos_default_billing_mode_${operatingBranchId}` : 'hotel_pos_default_billing_mode') || 'pos') === 'calci'
                          ? 'bg-white dark:bg-zinc-800 shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Calci
                    </button>
                  </div>
                </div>

                <div className="flex-1 space-y-1">
                  <p className="text-xs text-muted-foreground mb-2">Default Calci Behavior</p>
                  <div className="flex bg-muted/50 p-1 rounded-lg border">
                    <button
                      onClick={() => {
                        localStorage.setItem(operatingBranchId ? `hotel_pos_default_calci_mode_${operatingBranchId}` : 'hotel_pos_default_calci_mode', 'num');
                        toast({ title: 'Default updated', description: 'Num Mode will be default inside Calci.' });
                      }}
                      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        (localStorage.getItem(operatingBranchId ? `hotel_pos_default_calci_mode_${operatingBranchId}` : 'hotel_pos_default_calci_mode') || 'num') === 'num'
                          ? 'bg-white dark:bg-zinc-800 shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Num Mode
                    </button>
                    <button
                      onClick={() => {
                        localStorage.setItem(operatingBranchId ? `hotel_pos_default_calci_mode_${operatingBranchId}` : 'hotel_pos_default_calci_mode', 'quick');
                        toast({ title: 'Default updated', description: 'Quick Mode will be default inside Calci.' });
                      }}
                      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        (localStorage.getItem(operatingBranchId ? `hotel_pos_default_calci_mode_${operatingBranchId}` : 'hotel_pos_default_calci_mode') || 'num') === 'quick'
                          ? 'bg-white dark:bg-zinc-800 shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Quick Mode
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Auto-Stretch Mobile Calculator</Label>
                <p className="text-xs text-muted-foreground">Keep the calculator keyboard permanently expanded on mobile devices by default.</p>
              </div>
              <Switch
                checked={localStorage.getItem(operatingBranchId ? `hotel_pos_calci_stretched_${operatingBranchId}` : 'hotel_pos_calci_stretched') === 'true'}
                onCheckedChange={(checked) => {
                  localStorage.setItem(operatingBranchId ? `hotel_pos_calci_stretched_${operatingBranchId}` : 'hotel_pos_calci_stretched', String(checked));
                  // force re-render
                  setEnabled(e => !e);
                  setTimeout(() => setEnabled(e => !e), 0);
                  toast({ title: "Updated", description: "Default stretch mode updated." });
                }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
