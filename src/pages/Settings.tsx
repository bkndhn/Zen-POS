import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { offlineManager } from '@/utils/offlineManager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Settings as SettingsIcon, DollarSign, Monitor, Plus, Edit, Trash2, Printer, Type, UtensilsCrossed, Search, ChevronRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AddAdditionalChargeDialog } from '@/components/AddAdditionalChargeDialog';
import { EditAdditionalChargeDialog } from '@/components/EditAdditionalChargeDialog';
import { DisplaySettings } from '@/components/DisplaySettings';
import { PaymentTypesManagement } from '@/components/PaymentTypesManagement';
import { BluetoothPrinterSettings } from '@/components/BluetoothPrinterSettings';
import { BillFontPicker } from '@/components/BillFontPicker';
import { ShopSettingsForm } from '@/components/ShopSettingsForm';
import { ThemeSettings } from '@/components/ThemeSettings';
import { WhatsAppSettings } from '@/components/WhatsAppSettings';
import { RemoteOrderSettings } from '@/components/RemoteOrderSettings';
import { GSTSettings } from '@/components/GSTSettings';
import { OrderTypeSettings } from '@/components/OrderTypeSettings';
import { BranchManagement } from '@/components/BranchManagement';
import { AllBranchesReadOnlyBanner } from '@/components/AllBranchesReadOnlyBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StorageUsageSettings } from '@/components/StorageUsageSettings';
import { DevicePrefixSettings } from '@/components/DevicePrefixSettings';
import { LocalBackupSettings } from '@/components/LocalBackupSettings';
import { AggregatorIntegrationSettings } from '@/components/AggregatorIntegrationSettings';
import { PaymentGatewaySettings } from '@/components/PaymentGatewaySettings';
import { CalciBillingSettings } from '@/components/CalciBillingSettings';
import { CalciQuickKeysSettings } from '@/components/CalciQuickKeysSettings';
import { QuickBillSettings } from '@/components/QuickBillSettings';
import { KhataSettings } from '@/components/KhataSettings';

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


const SearchableSection = ({ title, keywords, searchQuery, children, isTopLevel = false }: { title: string, keywords: string, searchQuery: string, children: React.ReactNode, isTopLevel?: boolean }) => {
  if (!searchQuery.trim()) return <>{children}</>;
  const lowerQ = searchQuery.toLowerCase();
  const match = title.toLowerCase().includes(lowerQ) || keywords.toLowerCase().includes(lowerQ);
  if (!match) return null;
  return (
    <div className={cn("relative animate-in fade-in slide-in-from-bottom-2", isTopLevel ? "mb-6" : "")}>
      <div className="absolute -top-3 left-4 z-10">
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 shadow-sm font-bold bg-background">{title}</Badge>
      </div>
      <div className="border-2 border-primary/20 rounded-xl p-4 bg-primary/5 pt-6 shadow-sm">
        {children}
      </div>
    </div>
  );
};

const Settings = () => {
  const { profile , adminProfileId } = useAuth();
  const { operatingBranchId, isAllBranchesView } = useBranch();
  const adminId = adminProfileId;
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);
  const [chargeDialogOpen, setChargeDialogOpen] = useState(false);
  const [editChargeDialogOpen, setEditChargeDialogOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState<AdditionalCharge | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('billing');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const SEARCH_INDEX = [
    { id: 'shop-settings', title: 'Shop Details (Name, FSSAI, Address)', tab: 'billing', keywords: 'shop name fssai address contact details' },
    { id: 'live-bill-push', title: 'Live Bill Notifications (FCM)', tab: 'billing', keywords: 'live bill push notifications fcm alerts mobile apk pwa super admin toggle' },
    { id: 'gst-settings', title: 'GST & Tax Settings', tab: 'billing', keywords: 'gst tax hsn cgst sgst igst inclusive exclusive billing' },
    { id: 'order-type-settings', title: 'Order Types & Delivery Charges', tab: 'billing', keywords: 'order types delivery parcel takeaway dine in charges fees' },
    { id: 'additional-charges', title: 'Additional Charges (Packing, Service)', tab: 'billing', keywords: 'additional charges extra fees packing service delivery' },
    { id: 'payment-types', title: 'Manage Payment Types', tab: 'billing', keywords: 'payment types methods cash card upi g pay custom split' },
    { id: 'device-prefix', title: 'Device Prefix & Bill Numbering', tab: 'billing', keywords: 'device prefix bill number sequence counter hide' },
    { id: 'bluetooth-printer', title: 'Bluetooth Thermal Printer', tab: 'hardware', keywords: 'bluetooth printer print thermal esc pos paper width receipt kot' },
    { id: 'bill-printing-size', title: 'Bill Font Size & Layout', tab: 'hardware', keywords: 'bill print font size layout text scale large small display' },
    { id: 'display-theme', title: 'Display Theme (Dark Mode)', tab: 'preferences', keywords: 'display theme dark light mode colors appearance layout grid list' },
    { id: 'whatsapp-settings', title: 'WhatsApp Integration', tab: 'integrations', keywords: 'whatsapp share text image integration chat msg message' },
    { id: 'remote-orders', title: 'Remote Ordering (QR Menu & Aggregators)', tab: 'integrations', keywords: 'remote online orders zomato swiggy qr menu aggregator webhook' },
    { id: 'payment-gateway', title: 'Payment Gateway (Auto-collection)', tab: 'integrations', keywords: 'payment gateway razorpay payu stripe upi dynamic auto collect' },
    { id: 'branches', title: 'Branch Management', tab: 'branches', keywords: 'branch locations multi stores add edit delete branches' },
    { id: 'local-backup', title: 'Local Backup & Privacy', tab: 'preferences', keywords: 'local backup privacy wipe self destruct storage pin lock' }
  ];

  const handleSearch = (q: string) => {
    setSearchQuery(q);
  };

  const handleSelectResult = (result: any) => {
    setSearchQuery('');
    setShowDropdown(false);
    setActiveTab(result.tab);
  };

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
    if (!adminId) {
      setLoading(false);
      return;
    }
    try {
      // Offline fallback
      if (!navigator.onLine) {
        try {
          const cached = await offlineManager.getCachedQueryResult('additional_charges', `settings_${adminId}`);
          if (cached?.data) setAdditionalCharges(cached.data as any[]);
        } catch (e) { /* ignore */ }
        setLoading(false);
        return;
      }

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

      // Cache for offline
      offlineManager.cacheQueryResult('additional_charges', `settings_${adminId}`, data || []).catch(() => {});
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-md shadow-primary/20">
              <SettingsIcon className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">Settings</h1>
          </div>
          
          <div className="relative w-full sm:w-auto min-w-[300px] z-50">
            <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
            <Input 
              type="text"
              placeholder="Search settings (e.g. GST, Printer, WhatsApp)..."
              className="pl-9 bg-background/50 backdrop-blur-sm shadow-sm border-primary/20 focus-visible:ring-primary/30"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {/* All Branches Read-Only Banner */}
          <AllBranchesReadOnlyBanner message="Switch to a specific branch to modify settings." />

          {/* Shop Details */}
          <SearchableSection title="Shop Details (Name, FCM, Shifts)" keywords="shop fcm live bill name fssai address shift" searchQuery={searchQuery} isTopLevel={true}><ShopSettingsForm /></SearchableSection>

          <div className="w-full">
            {!searchQuery.trim() && (
            <div className="w-full flex flex-wrap h-auto mb-4 p-1 bg-muted/50 gap-1 justify-start rounded-lg">
              <button onClick={() => setActiveTab('billing')} className={cn("flex-1 min-w-[120px] text-xs sm:text-sm inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-all", activeTab === 'billing' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>🛒 Billing & Checkout</button>
              <button onClick={() => setActiveTab('hardware')} className={cn("flex-1 min-w-[120px] text-xs sm:text-sm inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-all", activeTab === 'hardware' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>🖨️ Hardware & Print</button>
              <button onClick={() => setActiveTab('preferences')} className={cn("flex-1 min-w-[120px] text-xs sm:text-sm inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-all", activeTab === 'preferences' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>⚙️ App Preferences</button>
              <button onClick={() => setActiveTab('integrations')} className={cn("flex-1 min-w-[120px] text-xs sm:text-sm inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-all", activeTab === 'integrations' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>🔗 Integrations</button>
              {profile?.role === 'admin' && <button onClick={() => setActiveTab('branches')} className={cn("flex-1 min-w-[120px] text-xs sm:text-sm inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-all", activeTab === 'branches' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>🏢 Branches</button>}
            </div>
          )}

            <div className={cn("space-y-4 sm:space-y-6 mt-0", (!searchQuery.trim() && activeTab !== "billing") ? "hidden" : "block")}>
              {/* Device Prefix Settings */}
              <SearchableSection title="Device Prefix" keywords="device prefix bill number" searchQuery={searchQuery}><DevicePrefixSettings /></SearchableSection>

              {/* GST / Tax Settings */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">GST Settings failed to load. Try refreshing.</div>}>
            <SearchableSection title="GST & Tax Settings" keywords="gst tax hsn cgst sgst" searchQuery={searchQuery}><GSTSettings /></SearchableSection>
          </ErrorBoundary>
              {/* Order Type (Dine In / Parcel) Settings */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Order Type Settings failed to load. Try refreshing.</div>}>
            <SearchableSection title="Order Types & Delivery" keywords="order type dine in parcel delivery" searchQuery={searchQuery}><OrderTypeSettings /></SearchableSection>
          </ErrorBoundary>
              {profile?.role === 'admin' && <SearchableSection title='Payment Types' keywords='payment methods cash card upi g pay' searchQuery={searchQuery}><PaymentTypesManagement /></SearchableSection>}
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
                            title="Delete charge"
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
              {/* Calci Billing Settings */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Calci Billing Settings failed to load. Try refreshing.</div>}>
            <CalciBillingSettings />
          </ErrorBoundary>
              <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Calci Quick Keys failed to load. Try refreshing.</div>}>
            <CalciQuickKeysSettings />
          </ErrorBoundary>
              {/* Quick Bill Settings */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Quick Bill Settings failed to load. Try refreshing.</div>}>
            <QuickBillSettings />
          </ErrorBoundary>

          {/* Khata Settings */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Khata Settings failed to load. Try refreshing.</div>}>
            <KhataSettings />
          </ErrorBoundary>

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
            </div>

            <div className={cn("space-y-4 sm:space-y-6 mt-0", (!searchQuery.trim() && activeTab !== "hardware") ? "hidden" : "block")}>
              {/* Bluetooth Printer Settings */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Printer Settings failed to load. Try refreshing.</div>}>
            <SearchableSection title="Bluetooth Printer" keywords="printer bluetooth print thermal esc pos paper" searchQuery={searchQuery}><BluetoothPrinterSettings /></SearchableSection>
          </ErrorBoundary>
              {/* Print Settings */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center space-x-2">
                <Printer className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-base sm:text-lg">Print Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 space-y-6">
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

              {/* Bill & Receipt Font Picker (60+ Market Fonts) */}
              <div className="pt-2 border-t border-border">
                <BillFontPicker />
              </div>
            </CardContent>
          </Card>
            </div>

            <div className={cn("space-y-4 sm:space-y-6 mt-0", (!searchQuery.trim() && activeTab !== "preferences") ? "hidden" : "block")}>
              {/* Local Backup Settings */}
              <SearchableSection title="Local Backup & Privacy" keywords="local backup privacy wipe self destruct storage" searchQuery={searchQuery}><LocalBackupSettings /></SearchableSection>

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
            <SearchableSection title="Theme Settings (Dark Mode)" keywords="theme colors dark light mode appearance" searchQuery={searchQuery}><ThemeSettings /></SearchableSection>
          </ErrorBoundary>
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
              {/* Data Privacy & Storage */}
          <Card>
            <CardHeader className="p-4 sm:p-6 pb-2">
              <CardTitle className="flex items-center space-x-2">
                <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                <span className="text-base sm:text-lg">Data Privacy & Storage</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-2">
              <div className="flex flex-col space-y-3">
                <div className="space-y-0.5 mb-2">
                  <Label className="text-sm font-medium">
                    Bill & Report Storage Location
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Control where your sensitive sales data is stored. Master data (Items, Categories) is always stored in the cloud for multi-device sync.
                  </p>
                </div>
                
                <div className="bg-slate-50 dark:bg-zinc-900 border rounded-xl p-1 w-full max-w-sm flex">
                  <Button
                    type="button"
                    variant={
                      (profile?.client_permissions as any)?.allow_cloud_storage === false 
                        ? 'ghost' 
                        : (localStorage.getItem(branchKey('privacy_storage_mode')) !== 'local' ? 'default' : 'ghost')
                    }
                    className="flex-1 text-xs h-9 rounded-lg"
                    onClick={() => {
                      if ((profile?.client_permissions as any)?.allow_cloud_storage !== false) {
                        localStorage.setItem(branchKey('privacy_storage_mode'), 'cloud');
                        window.dispatchEvent(new Event('privacy_storage_changed'));
                        toast({ title: "Cloud Storage Enabled", description: "Bills will be synced across all devices securely." });
                      }
                    }}
                    disabled={(profile?.client_permissions as any)?.allow_cloud_storage === false || isAllBranchesView}
                  >
                    ☁️ Cloud Sync (Default)
                  </Button>
                  <Button
                    type="button"
                    variant={
                      (profile?.client_permissions as any)?.allow_cloud_storage === false || 
                      localStorage.getItem(branchKey('privacy_storage_mode')) === 'local' 
                        ? 'default' 
                        : 'ghost'
                    }
                    className="flex-1 text-xs h-9 rounded-lg"
                    onClick={() => {
                      localStorage.setItem(branchKey('privacy_storage_mode'), 'local');
                      window.dispatchEvent(new Event('privacy_storage_changed'));
                      toast({ 
                        title: "Local Only Mode Enabled", 
                        description: "Bills will ONLY be saved on this device. Do not clear browser cache!",
                        variant: "destructive"
                      });
                    }}
                    disabled={isAllBranchesView}
                  >
                    🔒 Local Only
                  </Button>
                </div>

                {(profile?.client_permissions as any)?.allow_cloud_storage === false && (
                  <div className="mt-2 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 rounded-lg text-xs flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">⚠️</span>
                    <p>
                      <strong>Cloud Storage is disabled by Super Admin.</strong> Your transactional data is strictly local.
                      If you uninstall the app or clear browser data, your billing history will be permanently lost.
                    </p>
                  </div>
                )}
                {(profile?.client_permissions as any)?.allow_cloud_storage !== false && localStorage.getItem(branchKey('privacy_storage_mode')) === 'local' && (
                  <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 rounded-lg text-xs flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">⚠️</span>
                    <p>
                      <strong>Local Only Mode Active.</strong> Bills created on this device will not be backed up or visible on other devices.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="mt-6 pt-4 border-t space-y-4">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Auto-Wipe Local Data (Self-Destruct)</Label>
                  <p className="text-xs text-muted-foreground">Only applies when "Local Only" is active. Automatically permanently deletes local bills older than the specified days to ensure ultimate privacy.</p>
                </div>
                <div className="flex items-center gap-2 max-w-sm">
                  <Input 
                    type="number" 
                    min="1" 
                    max="365"
                    inputMode="numeric"
                    placeholder="Days (e.g. 7)" 
                    defaultValue={localStorage.getItem(branchKey('hotel_pos_auto_wipe_days')) || ''}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (val && val > 0 && val <= 365) {
                        localStorage.setItem(branchKey('hotel_pos_auto_wipe_days'), String(val));
                        toast({ title: "Auto-Wipe Configured", description: `Local bills older than ${val} days will be deleted automatically.` });
                      } else if (!e.target.value || e.target.value === '0') {
                        localStorage.removeItem(branchKey('hotel_pos_auto_wipe_days'));
                      } else {
                        toast({ title: "Invalid Value", description: "Enter a number between 1 and 365.", variant: "destructive" });
                        e.target.value = '';
                        localStorage.removeItem(branchKey('hotel_pos_auto_wipe_days'));
                      }
                    }}
                    className="h-9"
                  />
                  <span className="text-sm font-medium text-muted-foreground">days</span>
                </div>

                <div className="space-y-1 pt-2">
                  <Label className="text-sm font-medium">Reports PIN Lock</Label>
                  <p className="text-xs text-muted-foreground">Protect the Reports and Dashboard screens with a 4-digit PIN so staff cannot view daily totals.</p>
                </div>
                <div className="flex items-center gap-2 max-w-sm">
                  <Input 
                    type="password" 
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    placeholder={localStorage.getItem(branchKey('hotel_pos_reports_pin')) ? '••••' : '4-digit PIN'}
                    onChange={(e) => {
                      // Only allow digits
                      e.target.value = e.target.value.replace(/[^0-9]/g, '');
                    }}
                    onBlur={async (e) => {
                      const pin = e.target.value.replace(/[^0-9]/g, '');
                      if (pin && pin.length === 4) {
                        // Hash PIN with SHA-256 before storing
                        const encoder = new TextEncoder();
                        const data = encoder.encode(`zenpos_pin_${pin}`);
                        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                        const hashArray = Array.from(new Uint8Array(hashBuffer));
                        const hashedPin = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                        localStorage.setItem(branchKey('hotel_pos_reports_pin'), hashedPin);
                        toast({ title: "PIN Set", description: "Reports and Dashboard are now protected." });
                      } else if (!pin) {
                        localStorage.removeItem(branchKey('hotel_pos_reports_pin'));
                        toast({ title: "PIN Removed", description: "Reports are now accessible to all." });
                      } else {
                        toast({ title: "Invalid PIN", description: "PIN must be exactly 4 digits.", variant: "destructive" });
                      }
                    }}
                    className="h-9 font-mono tracking-widest"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
            </div>

            <div className={cn("space-y-4 sm:space-y-6 mt-0", (!searchQuery.trim() && activeTab !== "integrations") ? "hidden" : "block")}>
              {/* Payment Gateway (auto-collection) */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Payment Gateway Settings failed to load. Try refreshing.</div>}>
            <SearchableSection title="Payment Gateway" keywords="payment gateway razorpay payu stripe upi dynamic auto collect" searchQuery={searchQuery}><PaymentGatewaySettings /></SearchableSection>
          </ErrorBoundary>
              {/* WhatsApp Bill Share Settings */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">WhatsApp Settings failed to load. Try refreshing.</div>}>
            <SearchableSection title="WhatsApp Settings" keywords="whatsapp share text image integration chat msg" searchQuery={searchQuery}><WhatsAppSettings /></SearchableSection>
          </ErrorBoundary>
              {/* Food Aggregator Integrations */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Aggregator Settings failed to load. Try refreshing.</div>}>
            <SearchableSection title="Aggregators" keywords="aggregator zomato swiggy webhook" searchQuery={searchQuery}><AggregatorIntegrationSettings /></SearchableSection>
          </ErrorBoundary>

              {/* Remote Ordering Settings */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Remote Ordering Settings failed to load. Try refreshing.</div>}>
            <SearchableSection title="Remote & QR Orders" keywords="remote online orders qr menu" searchQuery={searchQuery}><RemoteOrderSettings /></SearchableSection>
          </ErrorBoundary>
              {profile?.role === 'admin' && <StorageUsageSettings />}
            </div>

            {profile?.role === 'admin' && (
              <div className={cn("space-y-4 sm:space-y-6 mt-0", (!searchQuery.trim() && activeTab !== "branches") ? "hidden" : "block")}>
                {/* Branch Management (admin only) */}
          <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Branch Management failed to load. Try refreshing.</div>}>
            <SearchableSection title="Branch Management" keywords="branch locations multi stores" searchQuery={searchQuery}><BranchManagement /></SearchableSection>
          </ErrorBoundary>
              </div>
            )}
          </div>


          {/* Payment Types Management */}
          

          



          

          

          

          

          

          

          

          

          
          
          

          

          

          

          

          
        </div>
      </div>
    </div>
  );
};

export default Settings;
