import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Settings as SettingsIcon, DollarSign, Monitor, Plus, Edit, Trash2, Printer, Type, UtensilsCrossed } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AddAdditionalChargeDialog } from '@/components/AddAdditionalChargeDialog';
import { EditAdditionalChargeDialog } from '@/components/EditAdditionalChargeDialog';
import { DisplaySettings } from '@/components/DisplaySettings';
import { PaymentTypesManagement } from '@/components/PaymentTypesManagement';
import { BluetoothPrinterSettings } from '@/components/BluetoothPrinterSettings';
import { ShopSettingsForm } from '@/components/ShopSettingsForm';
import { ThemeSettings } from '@/components/ThemeSettings';
import { WhatsAppSettings } from '@/components/WhatsAppSettings';
import { GSTSettings } from '@/components/GSTSettings';
import { OrderTypeSettings } from '@/components/OrderTypeSettings';
import { BranchManagement } from '@/components/BranchManagement';
import { AllBranchesReadOnlyBanner } from '@/components/AllBranchesReadOnlyBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AggregatorIntegrationSettings } from '@/components/AggregatorIntegrationSettings';
import { CalciBillingSettings } from '@/components/CalciBillingSettings';

interface AdditionalCharge {
  id: string;
  name: string;
  amount: number;
  description?: string;
  charge_type: string;
  unit?: string;
  is_active: boolean;
  is_default: boolean;
}

const Settings = () => {
  const { profile } = useAuth();
  const { operatingBranchId, isAllBranchesView } = useBranch();
  const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);
  const [chargeDialogOpen, setChargeDialogOpen] = useState(false);
  const [editChargeDialogOpen, setEditChargeDialogOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState<AdditionalCharge | null>(null);
  const [loading, setLoading] = useState(true);

  // Branch-scoped localStorage helper
  const branchKey = (base: string) => operatingBranchId ? `${base}_${operatingBranchId}` : base;

  // Auto-print setting (branch-scoped)
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(() => {
    const saved = localStorage.getItem(branchKey('hotel_pos_auto_print'))
      ?? localStorage.getItem('hotel_pos_auto_print'); // fallback to legacy key
    return saved !== null ? saved === 'true' : true;
  });

  // Bill numbering setting (branch-scoped)
  const [continueBillFromYesterday, setContinueBillFromYesterday] = useState(() => {
    const saved = localStorage.getItem(branchKey('hotel_pos_continue_bill_number'))
      ?? localStorage.getItem('hotel_pos_continue_bill_number');
    return saved !== null ? saved === 'true' : true;
  });

  const [hideBillNumber, setHideBillNumber] = useState(() => {
    const saved = localStorage.getItem(branchKey('hotel_pos_hide_bill_number'))
      ?? localStorage.getItem('hotel_pos_hide_bill_number');
    return saved === 'true';
  });

  const handleAutoPrintToggle = (enabled: boolean) => {
    setAutoPrintEnabled(enabled);
    localStorage.setItem(branchKey('hotel_pos_auto_print'), String(enabled));
    toast({
      title: enabled ? "Auto-Print Enabled" : "Auto-Print Disabled",
      description: enabled ? "Bills will be printed automatically after saving." : "Bills will be saved without printing.",
    });
  };

  // Font scale setting (branch-scoped)
  const [fontScale, setFontScale] = useState(() => {
      return (localStorage.getItem(branchKey('hotel_pos_font_scale'))
        ?? localStorage.getItem('hotel_pos_font_scale')) || '1';
  });

  const handleFontScaleChange = (scale: string) => {
    setFontScale(scale);
    localStorage.setItem(branchKey('hotel_pos_font_scale'), scale);
    window.dispatchEvent(new CustomEvent('font-scale-changed', { detail: scale }));
    toast({
      title: "Text Size Updated",
      description: `App-wide text size set to ${Math.round(parseFloat(scale) * 100)}%`,
    });
  };

  const handleBillNumberingToggle = (continueFromYesterday: boolean) => {
    setContinueBillFromYesterday(continueFromYesterday);
    localStorage.setItem(branchKey('hotel_pos_continue_bill_number'), String(continueFromYesterday));
    toast({
      title: continueFromYesterday ? "Continue Numbering" : "Fresh Daily Numbering",
      description: continueFromYesterday
        ? "Bill numbers will continue from where they left off yesterday."
        : "Bill numbers will start from 001 each day with date prefix (e.g., 12/01/26-001).",
    });
  };

  const handleHideBillNumberToggle = (hide: boolean) => {
    setHideBillNumber(hide);
    localStorage.setItem(branchKey('hotel_pos_hide_bill_number'), String(hide));
    toast({
      title: hide ? "Bill Number Hidden" : "Bill Number Visible",
      description: hide
        ? "Bill numbers will not be printed on receipts."
        : "Bill numbers will be printed normally.",
    });
  };

  // Re-load settings when branch changes
  useEffect(() => {
    // Re-read branch-scoped localStorage values when branch switches
    const ap = localStorage.getItem(branchKey('hotel_pos_auto_print'))
      ?? localStorage.getItem('hotel_pos_auto_print');
    setAutoPrintEnabled(ap !== null ? ap === 'true' : true);

    const bn = localStorage.getItem(branchKey('hotel_pos_continue_bill_number'))
      ?? localStorage.getItem('hotel_pos_continue_bill_number');
    setContinueBillFromYesterday(bn !== null ? bn === 'true' : true);

    const hn = localStorage.getItem(branchKey('hotel_pos_hide_bill_number'))
      ?? localStorage.getItem('hotel_pos_hide_bill_number');
    setHideBillNumber(hn === 'true');

    const fs = (localStorage.getItem(branchKey('hotel_pos_font_scale'))
      ?? localStorage.getItem('hotel_pos_font_scale')) || '1';
    setFontScale(fs);
  }, [operatingBranchId]);

  useEffect(() => {
    if (profile?.role === 'admin') {
      fetchAdditionalCharges();
    } else if (profile) {
      setLoading(false);
    }
  }, [profile, operatingBranchId]);

  const fetchAdditionalCharges = async () => {
    if (!adminId) return;
    try {
      // Fetch charges scoped to admin + branch, with legacy fallback
      let query = (supabase as any)
        .from('additional_charges')
        .select('*')
        .eq('admin_id', adminId);

      if (operatingBranchId) {
        query = query.eq('branch_id', operatingBranchId);
      }

      const { data, error } = await query.order('name');

      if (error) throw error;
      setAdditionalCharges(data || []);
    } catch (error) {
      console.error('Error fetching additional charges:', error);
      toast({
        title: "Error",
        description: "Failed to fetch additional charges",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleChargeStatus = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('additional_charges')
        .update({ is_active: !isActive })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Charge ${!isActive ? 'activated' : 'deactivated'} successfully`
      });

      fetchAdditionalCharges();
    } catch (error) {
      console.error('Error updating charge status:', error);
      toast({
        title: "Error",
        description: "Failed to update charge status",
        variant: "destructive"
      });
    }
  };

  const deleteCharge = async (id: string) => {
    try {
      const { error } = await supabase
        .from('additional_charges')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Charge deleted successfully"
      });

      fetchAdditionalCharges();
    } catch (error) {
      console.error('Error deleting charge:', error);
      toast({
        title: "Error",
        description: "Failed to delete charge",
        variant: "destructive"
      });
    }
  };

  // Permission check is now handled by ProtectedRoute, so we don't need a redundant check here

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-3 sm:p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-md shadow-primary/20">
              <SettingsIcon className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">Settings</h1>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {/* All Branches Read-Only Banner */}
          <AllBranchesReadOnlyBanner message="Switch to a specific branch to modify settings." />

          {/* Shop Details */}
          <ShopSettingsForm />

          {/* Payment Types Management */}
          {profile?.role === 'admin' && <PaymentTypesManagement />}

          {/* Additional Charges Management */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="text-base sm:text-lg">Additional Charges</span>
                </div>
                <Button onClick={() => setChargeDialogOpen(true)} size="sm" disabled={isAllBranchesView}>
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  Add Charge
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6">
              {additionalCharges.length === 0 ? (
                <div className="text-center py-6 sm:py-8">
                  <DollarSign className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 text-muted-foreground" />
                  <h3 className="text-base sm:text-lg font-semibold mb-2">No Additional Charges</h3>
                  <p className="text-sm text-muted-foreground mb-3 sm:mb-4">Create your first additional charge to get started.</p>
                  <Button onClick={() => setChargeDialogOpen(true)} size="sm" disabled={isAllBranchesView}>
                    <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    Add Charge
                  </Button>
                </div>
              ) : (
                <div className="grid gap-2">
                  {additionalCharges.map((charge) => (
                    <Card key={charge.id} className="p-2 sm:p-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-1 mb-1">
                            <h3 className="font-semibold text-sm truncate">{charge.name}</h3>
                            <Badge variant={charge.is_active ? "default" : "secondary"} className="text-[10px] px-1 py-0 h-4">
                              {charge.is_active ? "Active" : "Inactive"}
                            </Badge>
                            {charge.is_default && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">Default</Badge>
                            )}
                          </div>
                          {charge.description && (
                            <p className="text-xs text-muted-foreground mb-1 line-clamp-1">{charge.description}</p>
                          )}
                          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs">
                            <span className="font-medium">₹{charge.amount}</span>
                            <span className="text-muted-foreground text-[10px]">Type: {charge.charge_type}</span>
                            {charge.unit && (
                              <span className="text-muted-foreground text-[10px]">Unit: {charge.unit}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingCharge(charge);
                              setEditChargeDialogOpen(true);
                            }}
                            className="h-7 px-2 text-xs"
                            disabled={isAllBranchesView}
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleChargeStatus(charge.id, charge.is_active)}
                            className="h-7 px-2 text-xs"
                            disabled={isAllBranchesView}
                          >
                            {charge.is_active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteCharge(charge.id)}
                            className="text-red-600 hover:text-red-700 h-7 w-7 p-0"
                            disabled={isAllBranchesView}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              <AddAdditionalChargeDialog
                open={chargeDialogOpen}
                onOpenChange={setChargeDialogOpen}
                branchId={operatingBranchId}
                onSuccess={() => {
                  setChargeDialogOpen(false);
                  fetchAdditionalCharges();
                  toast({
                    title: "Success",
                    description: "Additional charge added successfully"
                  });
                }}
              />

              <EditAdditionalChargeDialog
                open={editChargeDialogOpen}
                onOpenChange={setEditChargeDialogOpen}
                charge={editingCharge}
                onSuccess={() => {
                  setEditChargeDialogOpen(false);
                  setEditingCharge(null);
                  fetchAdditionalCharges();
                }}
              />
            </CardContent>
          </Card>



          {/* GST / Tax Settings */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">GST Settings failed to load. Try refreshing.</div>}>
            <GSTSettings />
          </ErrorBoundary>

          {/* Calci Billing Settings */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Calci Billing Settings failed to load. Try refreshing.</div>}>
            <CalciBillingSettings />
          </ErrorBoundary>

          {/* WhatsApp Bill Share Settings */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">WhatsApp Settings failed to load. Try refreshing.</div>}>
            <WhatsAppSettings />
          </ErrorBoundary>

          {/* Food Aggregator Integrations */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Aggregator Settings failed to load. Try refreshing.</div>}>
            <AggregatorIntegrationSettings />
          </ErrorBoundary>

          {/* Bluetooth Printer Settings */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Printer Settings failed to load. Try refreshing.</div>}>
            <BluetoothPrinterSettings />
          </ErrorBoundary>

          {/* Order Type (Dine In / Parcel) Settings */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Order Type Settings failed to load. Try refreshing.</div>}>
            <OrderTypeSettings />
          </ErrorBoundary>

          {/* Branch Management (admin only) */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Branch Management failed to load. Try refreshing.</div>}>
            <BranchManagement />
          </ErrorBoundary>

          {/* Print Settings */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center space-x-2">
                <Printer className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-base sm:text-lg">Print Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-print" className="text-sm font-medium">
                    Auto-Print on Bill Save
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {autoPrintEnabled
                      ? "Bill will be printed automatically when payment is completed."
                      : "Bill will be saved without printing. You can print later from Reports."}
                  </p>
                </div>
                <Switch
                  id="auto-print"
                  checked={autoPrintEnabled}
                  onCheckedChange={handleAutoPrintToggle}
                  disabled={isAllBranchesView}
                />
              </div>
            </CardContent>
          </Card>

          {/* Accessibility Settings */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center space-x-2">
                <Type className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-base sm:text-lg">Accessibility</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 space-y-4">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Text Size (Overall App)</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Normal', value: '1', percent: '100%' },
                    { label: 'Large', value: '1.15', percent: '115%' },
                    { label: 'Extra Large', value: '1.3', percent: '130%' },
                    { label: 'Maximum', value: '1.45', percent: '145%' }
                  ].map((s) => (
                    <Button
                      key={s.value}
                      variant={fontScale === s.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleFontScaleChange(s.value)}
                      className="flex-1 min-w-[100px] h-11"
                      disabled={isAllBranchesView}
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-bold">{s.label}</span>
                        <span className="text-[10px] opacity-80">{s.percent}</span>
                      </div>
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Adjusting this will scale the text size across the entire application for better visibility.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Bill Numbering Settings */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center space-x-2">
                <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-base sm:text-lg">Bill Numbering</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="bill-numbering" className="text-sm font-medium">
                    Continue Bill Numbers from Yesterday
                  </Label>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    {continueBillFromYesterday
                      ? "Bill numbers continue sequentially (e.g., BILL-000082, 000083...)."
                      : "Bill numbers start fresh daily with date prefix (e.g., 12/01/26-001, 12/01/26-002...)."}
                  </p>
                </div>
                <Switch
                  id="bill-numbering"
                  checked={continueBillFromYesterday}
                  onCheckedChange={handleBillNumberingToggle}
                  disabled={isAllBranchesView}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="hide-bill-number" className="text-sm font-medium">
                    Hide Bill Number on Print
                  </Label>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    {hideBillNumber
                      ? "Bill numbers will not be shown on printed receipts."
                      : "Bill numbers will be printed normally."}
                  </p>
                </div>
                <Switch
                  id="hide-bill-number"
                  checked={hideBillNumber}
                  onCheckedChange={handleHideBillNumberToggle}
                  disabled={isAllBranchesView}
                />
              </div>

              {/* Preview */}
              <div className="bg-muted/50 rounded-lg p-3 border">
                <p className="text-xs font-medium text-muted-foreground mb-2">Preview:</p>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-lg font-bold font-mono">
                      {continueBillFromYesterday ? "BILL-000082" : `${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '/')}-001`}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Next bill number</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Display Settings */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center space-x-2">
                <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-base sm:text-lg">Display Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6">
              <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Display Settings failed to load. Try refreshing.</div>}>
                {profile?.user_id && <DisplaySettings userId={profile.user_id} />}
              </ErrorBoundary>
            </CardContent>
          </Card>

          {/* Theme Settings */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Theme Settings failed to load. Try refreshing.</div>}>
            <ThemeSettings />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
};

export default Settings;
