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
      const { error } = await supabase
        .from('shop_settings')
        .update({ calci_billing_enabled: checked })
        .eq('branch_id', operatingBranchId);

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
      </CardContent>
    </Card>
  );
};
