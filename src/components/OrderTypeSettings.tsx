import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { UtensilsCrossed } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';

export const OrderTypeSettings: React.FC = () => {
  const { profile } = useAuth();
  const { operatingBranchId, branches } = useBranch();
  const mainBranchId = branches.find(b => b.is_main)?.id || null;
  const [showOrderType, setShowOrderType] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSetting = async () => {
      if (!profile?.user_id || !operatingBranchId) return;
      try {
        let { data } = await (supabase as any)
          .from('shop_settings')
          .select('show_order_type')
          .eq('user_id', profile.user_id)
          .eq('branch_id', operatingBranchId)
          .maybeSingle();

        if (!data && mainBranchId && mainBranchId !== operatingBranchId) {
          const { data: mainRow } = await (supabase as any)
            .from('shop_settings')
            .select('show_order_type')
            .eq('user_id', profile.user_id)
            .eq('branch_id', mainBranchId)
            .maybeSingle();
          data = mainRow;
        }

        if (data) setShowOrderType(data.show_order_type || false);
      } catch (e) {
        console.warn('Failed to fetch order type setting:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchSetting();
  }, [profile?.user_id, operatingBranchId, mainBranchId]);

  const handleToggle = async (enabled: boolean) => {
    setShowOrderType(enabled);
    try {
      if (!profile?.user_id || !operatingBranchId) return;

      const { data: existing } = await (supabase as any)
        .from('shop_settings').select('id')
        .eq('user_id', profile.user_id).eq('branch_id', operatingBranchId).maybeSingle();

      const { error } = existing?.id
        ? await (supabase as any).from('shop_settings').update({ show_order_type: enabled }).eq('id', existing.id)
        : await (supabase as any).from('shop_settings').insert({ user_id: profile.user_id, branch_id: operatingBranchId, show_order_type: enabled });

      if (error) throw error;

      // Update local cache
      const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
      const existingCache = localStorage.getItem(headerKey) ?? localStorage.getItem('hotel_pos_bill_header');
      if (existingCache) {
        const parsed = JSON.parse(existingCache);
        parsed.showOrderType = enabled;
        localStorage.setItem(headerKey, JSON.stringify(parsed));
      } else {
        localStorage.setItem(headerKey, JSON.stringify({ showOrderType: enabled }));
      }

      toast({
        title: enabled ? "Order Type Enabled" : "Order Type Disabled",
        description: enabled
          ? "Dine In / Parcel option will show in Complete Payment dialog."
          : "Order type selection is now hidden.",
      });
    } catch (e) {
      console.error('Failed to update order type setting:', e);
      setShowOrderType(!enabled); // revert
      toast({
        title: "Error",
        description: "Failed to update setting",
        variant: "destructive",
      });
    }
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center space-x-2">
          <UtensilsCrossed className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="text-base sm:text-lg">Order Type</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="order-type-toggle" className="text-sm font-medium">
              Show Dine In / Parcel Option
            </Label>
            <p className="text-xs text-muted-foreground">
              {showOrderType
                ? "Dine In / Parcel radio buttons will appear in Complete Payment. Order type is shown on bills, kitchen, and service area."
                : "Order type selection is hidden. All bills default to Dine In."}
            </p>
          </div>
          <Switch
            id="order-type-toggle"
            checked={showOrderType}
            onCheckedChange={handleToggle}
          />
        </div>
      </CardContent>
    </Card>
  );
};
