import React, { useEffect, useState, useCallback } from 'react';
import { useBranchSettings } from '@/hooks/useBranchSettings';
import { useBranch } from '@/contexts/BranchContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { toast } from '@/hooks/use-toast';
import { Truck, MapPin, Package, Zap, Heart, Shield, AlertTriangle } from 'lucide-react';
import { AllBranchesReadOnlyBanner } from '@/components/AllBranchesReadOnlyBanner';
import { useDebounce } from '@/hooks/useDebounce'; // need to see if this exists, otherwise write custom debounce or just use immediate save or a simple timeout

export const RemoteOrderSettings = () => {
  const { isAllBranchesView } = useBranch();
  
  const { data, loading, saving, save } = useBranchSettings<any>('shop_settings', 
    'remote_ordering_enabled, remote_ordering_paused, remote_order_modes, table_qr_protection, delivery_fee_mode, delivery_fee_flat, delivery_fee_base, delivery_fee_per_km, delivery_fee_free_km, max_delivery_radius_km, packaging_fee_mode, packaging_fee_value, surge_fee_enabled, surge_fee_amount, tipping_enabled'
  );

  const [localSettings, setLocalSettings] = useState<any>({
    remote_ordering_enabled: false,
    remote_ordering_paused: false,
    remote_order_modes: 'both',
    table_qr_protection: 'manual',
    delivery_fee_mode: 'disabled',
    delivery_fee_flat: 0,
    delivery_fee_base: 0,
    delivery_fee_per_km: 0,
    delivery_fee_free_km: 0,
    max_delivery_radius_km: 5,
    packaging_fee_mode: 'disabled',
    packaging_fee_value: 0,
    surge_fee_enabled: false,
    surge_fee_amount: 0,
    tipping_enabled: false,
  });

  useEffect(() => {
    if (data) {
      setLocalSettings({
        remote_ordering_enabled: data.remote_ordering_enabled || false,
        remote_ordering_paused: data.remote_ordering_paused || false,
        remote_order_modes: data.remote_order_modes || 'both',
        table_qr_protection: data.table_qr_protection || 'manual',
        delivery_fee_mode: data.delivery_fee_mode || 'disabled',
        delivery_fee_flat: data.delivery_fee_flat || 0,
        delivery_fee_base: data.delivery_fee_base || 0,
        delivery_fee_per_km: data.delivery_fee_per_km || 0,
        delivery_fee_free_km: data.delivery_fee_free_km || 0,
        max_delivery_radius_km: data.max_delivery_radius_km || 5,
        packaging_fee_mode: data.packaging_fee_mode || 'disabled',
        packaging_fee_value: data.packaging_fee_value || 0,
        surge_fee_enabled: data.surge_fee_enabled || false,
        surge_fee_amount: data.surge_fee_amount || 0,
        tipping_enabled: data.tipping_enabled || false,
      });
    }
  }, [data]);

  const updateSetting = async (key: string, value: any) => {
    setLocalSettings((prev: any) => ({ ...prev, [key]: value }));
    const { error } = await save({ [key]: value });
    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save settings.",
      });
      // Revert if failed
      if (data) {
        setLocalSettings((prev: any) => ({ ...prev, [key]: data[key] }));
      }
    }
  };

  const updateMultipleSettings = async (updates: any) => {
    setLocalSettings((prev: any) => ({ ...prev, ...updates }));
    const { error } = await save(updates);
    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save settings.",
      });
      // Best effort revert
      if (data) {
        const revert: any = {};
        Object.keys(updates).forEach(k => { revert[k] = data[k] });
        setLocalSettings((prev: any) => ({ ...prev, ...revert }));
      }
    }
  };

  // Helper for numeric inputs with delayed save to prevent saving on every keystroke
  const handleNumericChange = (key: string, value: string) => {
    const num = parseFloat(value) || 0;
    setLocalSettings((prev: any) => ({ ...prev, [key]: num }));
  };

  const handleNumericBlur = (key: string) => {
    if (data && data[key] !== localSettings[key]) {
      updateSetting(key, localSettings[key]);
    }
  };

  if (isAllBranchesView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Remote Order Settings</CardTitle>
          <CardDescription>Configure remote ordering and delivery</CardDescription>
        </CardHeader>
        <CardContent>
          <AllBranchesReadOnlyBanner />
        </CardContent>
      </Card>
    );
  }

  if (loading && !data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Remote Order Settings</CardTitle>
        <CardDescription>Configure remote ordering, delivery fees, and online store options.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        
        {/* Section A: Remote Ordering Control */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium flex items-center gap-2"><MapPin className="w-5 h-5 text-primary" /> Remote Ordering Control</h3>
          
          <div className="flex flex-row items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Enable Remote Ordering</Label>
              <p className="text-sm text-muted-foreground">
                Allow customers to place orders online via QR code or link.
              </p>
            </div>
            <Switch
              checked={localSettings.remote_ordering_enabled}
              onCheckedChange={(checked) => updateSetting('remote_ordering_enabled', checked)}
            />
          </div>

          {localSettings.remote_ordering_enabled && (
            <div className="flex flex-row items-center justify-between rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-900/50 dark:bg-red-900/10">
              <div className="space-y-0.5">
                <Label className="text-base text-red-600 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Emergency Pause
                </Label>
                <p className="text-sm text-red-600/80">
                  Temporarily pause all new remote orders without disabling the system.
                </p>
              </div>
              <Switch
                checked={localSettings.remote_ordering_paused}
                onCheckedChange={(checked) => updateSetting('remote_ordering_paused', checked)}
                className="data-[state=checked]:bg-red-600"
              />
            </div>
          )}

          <div className="space-y-3 rounded-lg border p-4">
            <Label className="text-base">Fulfillment Modes</Label>
            <RadioGroup 
              value={localSettings.remote_order_modes} 
              onValueChange={(val) => updateSetting('remote_order_modes', val)}
              className="flex flex-col space-y-1"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pickup" id="mode-pickup" />
                <Label htmlFor="mode-pickup">Pickup Only</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="delivery" id="mode-delivery" />
                <Label htmlFor="mode-delivery">Delivery Only</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="both" id="mode-both" />
                <Label htmlFor="mode-both">Both Pickup & Delivery</Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        {/* Section B: Table QR Protection */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /> Table QR Protection</h3>
          <div className="space-y-3 rounded-lg border p-4">
            <Label className="text-base">Protection Mode</Label>
            <p className="text-sm text-muted-foreground mb-4">
              Prevent fake orders by requiring location verification or manual staff approval for dine-in QR orders.
            </p>
            <RadioGroup 
              value={localSettings.table_qr_protection} 
              onValueChange={(val) => updateSetting('table_qr_protection', val)}
              className="flex flex-col space-y-3"
            >
              <div className="flex items-start space-x-2">
                <RadioGroupItem value="table_lock" id="protect-lock" className="mt-1" />
                <div>
                  <Label htmlFor="protect-lock">Table Lock (Automated)</Label>
                  <p className="text-xs text-muted-foreground">Locks table to first device until order is paid or staff clears it.</p>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <RadioGroupItem value="manual" id="protect-manual" className="mt-1" />
                <div>
                  <Label htmlFor="protect-manual">Manual Approval</Label>
                  <p className="text-xs text-muted-foreground">Staff must approve incoming orders from the KDS.</p>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <RadioGroupItem value="both" id="protect-both" className="mt-1" />
                <div>
                  <Label htmlFor="protect-both">Both</Label>
                  <p className="text-xs text-muted-foreground">Apply Table Lock and require Manual Approval.</p>
                </div>
              </div>
            </RadioGroup>
          </div>
        </div>

        {/* Section C: Delivery Fees */}
        {(localSettings.remote_order_modes === 'delivery' || localSettings.remote_order_modes === 'both') && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2"><Truck className="w-5 h-5 text-primary" /> Delivery Fees</h3>
            
            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <Label className="text-base">Fee Mode</Label>
                <RadioGroup 
                  value={localSettings.delivery_fee_mode} 
                  onValueChange={(val) => updateSetting('delivery_fee_mode', val)}
                  className="flex space-x-4 mt-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="disabled" id="fee-disabled" />
                    <Label htmlFor="fee-disabled">Free Delivery</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="flat" id="fee-flat" />
                    <Label htmlFor="fee-flat">Flat Rate</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="distance" id="fee-distance" />
                    <Label htmlFor="fee-distance">Distance-Based</Label>
                  </div>
                </RadioGroup>
              </div>

              {localSettings.delivery_fee_mode === 'flat' && (
                <div className="pt-2">
                  <Label>Flat Amount</Label>
                  <Input 
                    type="number" 
                    value={localSettings.delivery_fee_flat}
                    onChange={(e) => handleNumericChange('delivery_fee_flat', e.target.value)}
                    onBlur={() => handleNumericBlur('delivery_fee_flat')}
                    className="w-full md:w-1/3 mt-1"
                  />
                </div>
              )}

              {localSettings.delivery_fee_mode === 'distance' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div>
                    <Label>Base Fee</Label>
                    <Input 
                      type="number" 
                      value={localSettings.delivery_fee_base}
                      onChange={(e) => handleNumericChange('delivery_fee_base', e.target.value)}
                      onBlur={() => handleNumericBlur('delivery_fee_base')}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Per KM Fee</Label>
                    <Input 
                      type="number" 
                      value={localSettings.delivery_fee_per_km}
                      onChange={(e) => handleNumericChange('delivery_fee_per_km', e.target.value)}
                      onBlur={() => handleNumericBlur('delivery_fee_per_km')}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Free KM Radius</Label>
                    <Input 
                      type="number" 
                      value={localSettings.delivery_fee_free_km}
                      onChange={(e) => handleNumericChange('delivery_fee_free_km', e.target.value)}
                      onBlur={() => handleNumericBlur('delivery_fee_free_km')}
                      className="mt-1"
                    />
                  </div>
                </div>
              )}

              <div className="pt-4 border-t mt-4">
                <div className="flex justify-between mb-2">
                  <Label>Max Delivery Radius</Label>
                  <span className="text-sm font-medium">{localSettings.max_delivery_radius_km} km</span>
                </div>
                <Slider 
                  min={1} 
                  max={50} 
                  step={1} 
                  value={[localSettings.max_delivery_radius_km]}
                  onValueChange={(val) => setLocalSettings((prev: any) => ({ ...prev, max_delivery_radius_km: val[0] }))}
                  onValueCommit={(val) => updateSetting('max_delivery_radius_km', val[0])}
                />
              </div>
            </div>
          </div>
        )}

        {/* Section D: Additional Charges */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium flex items-center gap-2"><Package className="w-5 h-5 text-primary" /> Additional Charges</h3>
          
          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <Label className="text-base">Packaging Fee</Label>
              <RadioGroup 
                value={localSettings.packaging_fee_mode} 
                onValueChange={(val) => updateSetting('packaging_fee_mode', val)}
                className="flex space-x-4 mt-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="disabled" id="pack-disabled" />
                  <Label htmlFor="pack-disabled">Disabled</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="flat" id="pack-flat" />
                  <Label htmlFor="pack-flat">Flat Amount</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="percentage" id="pack-percent" />
                  <Label htmlFor="pack-percent">Percentage</Label>
                </div>
              </RadioGroup>
            </div>

            {localSettings.packaging_fee_mode !== 'disabled' && (
              <div className="pt-2">
                <Label>Value</Label>
                <Input 
                  type="number" 
                  value={localSettings.packaging_fee_value}
                  onChange={(e) => handleNumericChange('packaging_fee_value', e.target.value)}
                  onBlur={() => handleNumericBlur('packaging_fee_value')}
                  className="w-full md:w-1/3 mt-1"
                />
              </div>
            )}
            
            <div className="pt-4 border-t mt-4">
              <div className="flex flex-row items-center justify-between mb-4">
                <div className="space-y-0.5">
                  <Label className="text-base flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    Surge Pricing
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Apply an extra flat fee during peak hours or bad weather.
                  </p>
                </div>
                <Switch
                  checked={localSettings.surge_fee_enabled}
                  onCheckedChange={(checked) => updateSetting('surge_fee_enabled', checked)}
                />
              </div>
              
              {localSettings.surge_fee_enabled && (
                <div>
                  <Label>Surge Amount</Label>
                  <Input 
                    type="number" 
                    value={localSettings.surge_fee_amount}
                    onChange={(e) => handleNumericChange('surge_fee_amount', e.target.value)}
                    onBlur={() => handleNumericBlur('surge_fee_amount')}
                    className="w-full md:w-1/3 mt-1"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section E: Extras */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium flex items-center gap-2"><Heart className="w-5 h-5 text-primary" /> Extras</h3>
          
          <div className="flex flex-row items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Enable Tipping</Label>
              <p className="text-sm text-muted-foreground">
                Allow customers to add a tip during checkout.
              </p>
            </div>
            <Switch
              checked={localSettings.tipping_enabled}
              onCheckedChange={(checked) => updateSetting('tipping_enabled', checked)}
            />
          </div>
        </div>

      </CardContent>
    </Card>
  );
};
