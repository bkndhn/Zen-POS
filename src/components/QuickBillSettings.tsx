import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Zap } from 'lucide-react';

export const QuickBillSettings = () => {
  const { operatingBranchId, isAllBranchesView } = useBranch();
  const { profile } = useAuth();
  
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;

  useEffect(() => {
    const loadSettings = async () => {
      if (isAllBranchesView || !adminId) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        let query = supabase.from('shop_settings').select('quick_bill_enabled').eq('user_id', adminId);
        
        if (operatingBranchId) {
          query = query.eq('branch_id', operatingBranchId);
        } else {
          query = query.is('branch_id', null);
        }

        const { data, error } = await query.maybeSingle();
          
        if (error && error.code !== 'PGRST116') throw error;
        if (data) {
          setEnabled(!!data.quick_bill_enabled);
        }
      } catch (error) {
        console.error('Error loading quick bill settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [operatingBranchId, isAllBranchesView, adminId]);

  const handleToggle = async (checked: boolean) => {
    if (isAllBranchesView || !adminId) return;
    
    try {
      setEnabled(checked);
      
      let query = supabase.from('shop_settings').update({ quick_bill_enabled: checked }).eq('user_id', adminId);
      if (operatingBranchId) {
        query = query.eq('branch_id', operatingBranchId);
      } else {
        query = query.is('branch_id', null);
      }

      const { error } = await query;

      if (error) throw error;
      toast({
        title: "Settings Updated",
        description: `Quick Bill mode has been ${checked ? 'enabled' : 'disabled'} for this branch.`
      });
    } catch (error) {
      console.error('Error updating quick bill settings:', error);
      setEnabled(!checked);
      toast({
        title: "Error",
        description: "Failed to update settings. Please try again.",
        variant: "destructive"
      });
    }
  };

  if (!adminId) return null;

  return (
    <Card className="shadow-sm border-zinc-200/50 dark:border-zinc-800/50">
      <CardHeader className="pb-3 border-b border-border/40 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Quick Bill Mode</CardTitle>
            <CardDescription className="text-xs">Bypass payment selection (defaults to Cash).</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center justify-between p-3 rounded-lg border bg-background shadow-sm">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="quick-bill-toggle" className="text-sm font-medium">Enable Quick Bill</Label>
            <p className="text-xs text-muted-foreground">When enabled, completing an order will automatically assume exact cash payment and print the bill immediately.</p>
          </div>
          <Switch
            id="quick-bill-toggle"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={loading || isAllBranchesView}
          />
        </div>
      </CardContent>
    </Card>
  );
};
