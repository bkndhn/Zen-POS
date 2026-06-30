
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Edit } from 'lucide-react';
import { MediaUpload } from '@/components/MediaUpload';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { getShortUnit, validateAndNormalizeQuickChips } from '@/utils/timeUtils';

interface TaxRateOption {
  id: string;
  name: string;
  rate: number;
}

interface Category {
  id: string;
  name: string;
}

interface Item {
  id: string;
  name: string;
  price: number;
  category?: string;
  is_active: boolean;
  description?: string;
  purchase_rate?: number;
  // Legacy fields
  unit?: string;
  base_value?: number;
  quantity_step?: number;
  
  // New fields
  selling_unit?: string;
  selling_quantity?: number;
  inventory_unit?: string;
  inventory_quantity?: number;
  is_saleable?: boolean;

  stock_quantity?: number;
  minimum_stock_alert?: number;
  quick_chips?: string[];
  image_url?: string;
  video_url?: string;
  media_type?: string;
  unlimited_stock?: boolean;
  price_zomato?: number;
  price_swiggy?: number;
}

interface EditItemDialogProps {
  item: Item;
  onItemUpdated: () => void;
}

export const EditItemDialog: React.FC<EditItemDialogProps> = ({ item, onItemUpdated }) => {
  const { profile } = useAuth();
  const { operatingBranchId } = useBranch();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [hasPremiumAccess, setHasPremiumAccess] = useState(false);
  const [gstEnabled, setGstEnabled] = useState(false);
  const [taxRates, setTaxRates] = useState<TaxRateOption[]>([]);
  const [stockUpdateMode, setStockUpdateMode] = useState<'add' | 'replace'>('add');

  const handleStockUpdateModeChange = (mode: 'add' | 'replace') => {
    setStockUpdateMode(mode);
    if (mode === 'add') {
      setFormData(prev => ({ ...prev, stock_quantity: '' }));
    } else {
      setFormData(prev => ({ ...prev, stock_quantity: item.stock_quantity?.toString() || '' }));
    }
  };

  const [formData, setFormData] = useState({
    name: item.name,
    description: item.description || '',
    price: item.price.toString(),
    price_zomato: item.price_zomato?.toString() || '',
    price_swiggy: item.price_swiggy?.toString() || '',
    purchase_rate: item.purchase_rate?.toString() || '',
    selling_unit: item.selling_unit || item.unit || 'Piece (pc)',
    selling_quantity: item.selling_quantity?.toString() || '1',
    inventory_unit: item.inventory_unit || item.unit || 'Piece (pc)',
    inventory_quantity: item.inventory_quantity?.toString() || '1',
    is_saleable: item.is_saleable !== false,
    stock_quantity: item.stock_quantity?.toString() || '',
    minimum_stock_alert: item.minimum_stock_alert?.toString() || '',
    quantity_step: item.quantity_step?.toString() || '1',
    quick_chips: item.quick_chips?.join(', ') || '',
    category: item.category || '',
    image_url: item.image_url || '',
    video_url: item.video_url || '',
    media_type: (item.media_type || 'image') as 'image' | 'gif' | 'video',
    is_active: item.is_active,
    unlimited_stock: item.unlimited_stock || false,
    tax_rate_id: (item as any).tax_rate_id || '',
    is_tax_inclusive: (item as any).is_tax_inclusive !== false,
    hsn_code: (item as any).hsn_code || '',
    expiry_mode: ((item as any).expiry_mode || 'none') as 'none' | 'optional' | 'mandatory'
  });
  const [loading, setLoading] = useState(false);
  const [chipsMode, setChipsMode] = useState<'qty' | 'amount'>('qty');
  const [adminAuthId, setAdminAuthId] = useState<string | null>(null);

  useEffect(() => {
    const resolveAdminAuthId = async () => {
      if (!profile) return;
      if (profile.role === 'admin' || profile.role === 'super_admin') {
        setAdminAuthId(profile.user_id);
      } else if (profile.role === 'user' && profile.admin_id) {
        const { data } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('id', profile.admin_id)
          .single();
        if (data?.user_id) {
          setAdminAuthId(data.user_id);
        }
      }
    };
    resolveAdminAuthId();
  }, [profile]);

  useEffect(() => {
    if (open) {
      fetchCategories();
      checkPremiumAccess();
      setStockUpdateMode('add');

      const isAmt = item.quick_chips?.some(c => c.startsWith('₹') || c.startsWith('Rs')) || false;
      setChipsMode(isAmt ? 'amount' : 'qty');

      // Reset form data with current item values when dialog opens (empty stock_quantity for add mode)
      setFormData({
        name: item.name,
        description: item.description || '',
        price: item.price.toString(),
        price_zomato: item.price_zomato?.toString() || '',
        price_swiggy: item.price_swiggy?.toString() || '',
        purchase_rate: item.purchase_rate?.toString() || '',
        selling_unit: item.selling_unit || item.unit || 'Piece (pc)',
        selling_quantity: item.selling_quantity?.toString() || '1',
        inventory_unit: item.inventory_unit || item.unit || 'Piece (pc)',
        inventory_quantity: item.inventory_quantity?.toString() || '1',
        is_saleable: item.is_saleable !== false,
        stock_quantity: '',
        minimum_stock_alert: item.minimum_stock_alert?.toString() || '',
        quantity_step: item.quantity_step?.toString() || '1',
        quick_chips: item.quick_chips?.map(c => c.replace(/^(₹|Rs\.?)/, '')).join(', ') || '',
        category: item.category || '',
        image_url: item.image_url || '',
        video_url: item.video_url || '',
        media_type: (item.media_type || 'image') as 'image' | 'gif' | 'video',
        is_active: item.is_active,
        unlimited_stock: item.unlimited_stock || false,
        tax_rate_id: (item as any).tax_rate_id || '',
        is_tax_inclusive: (item as any).is_tax_inclusive !== false,
        hsn_code: (item as any).hsn_code || '',
        expiry_mode: ((item as any).expiry_mode || 'none') as 'none' | 'optional' | 'mandatory'
      });
    }
  }, [open, item]);

  useEffect(() => {
    if (open && adminAuthId) {
      fetchGstSettings();
    }
  }, [open, adminAuthId, operatingBranchId]);

  const fetchCategories = async () => {
    try {
      const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
      if (!adminId) { setCategories([]); return; }
      let q = supabase
        .from('item_categories')
        .select('id, name')
        .eq('admin_id', adminId)
        .eq('is_deleted', false);
      if (operatingBranchId) q = q.eq('branch_id', operatingBranchId);
      const { data, error } = await q.order('name');
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const checkPremiumAccess = async () => {
    // Check if current user's admin has QR Menu access
    const adminId = profile?.role === 'admin' ? profile.user_id : profile?.admin_id;
    if (!adminId) return;

    try {
      // For admin, check their own profile
      const targetUserId = profile?.role === 'admin' ? profile.user_id : null;

      if (targetUserId) {
        const { data } = await supabase
          .from('profiles')
          .select('has_qr_menu_access')
          .eq('user_id', targetUserId)
          .maybeSingle();

        setHasPremiumAccess(data?.has_qr_menu_access ?? false);
      } else {
        // For sub-users, check parent admin's access
        const { data } = await supabase
          .from('profiles')
          .select('has_qr_menu_access')
          .eq('id', profile?.admin_id)
          .maybeSingle();

        setHasPremiumAccess(data?.has_qr_menu_access ?? false);
      }
    } catch (error) {
      console.error('Error checking premium access:', error);
    }
  };

  const fetchGstSettings = async () => {
    try {
      if (!adminAuthId) return;

      let settingsQuery = (supabase as any)
        .from('shop_settings')
        .select('gst_enabled')
        .eq('user_id', adminAuthId);

      if (operatingBranchId) {
        settingsQuery = settingsQuery.eq('branch_id', operatingBranchId);
      } else {
        settingsQuery = settingsQuery.is('branch_id', null);
      }

      const { data: settings } = await settingsQuery.maybeSingle();

      const enabled = settings?.gst_enabled || false;
      setGstEnabled(enabled);

      if (enabled) {
        let query = (supabase as any)
          .from('tax_rates')
          .select('id, name, rate')
          .eq('admin_id', adminAuthId)
          .eq('is_active', true);
        if (operatingBranchId) {
          query = query.or(`branch_id.eq.${operatingBranchId},branch_id.is.null`);
        }
        const { data: rates } = await query.order('rate', { ascending: true });
        setTaxRates(rates || []);
      }
    } catch (e) { /* silent */ }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.price || !formData.purchase_rate || (!formData.unlimited_stock && stockUpdateMode === 'replace' && !formData.stock_quantity)) {
      toast({
        title: "Error",
        description: (!formData.unlimited_stock && stockUpdateMode === 'replace')
          ? "Name, selling price, purchase rate, and stock quantity are required"
          : "Name, selling price, and purchase rate are required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const rawChips = formData.quick_chips;
      const processedChips = chipsMode === 'amount'
        ? rawChips.split(',').map(c => c.trim()).map(c => c ? (c.startsWith('₹') ? c : `₹${c}`) : '').join(', ')
        : rawChips;

      // Validate and normalize quick chips based on selling unit
      const { error: chipError, normalized: parsedChips } = validateAndNormalizeQuickChips(
        processedChips,
        formData.selling_unit
      );

      if (chipError) {
        toast({
          title: "Invalid Quick Chips",
          description: chipError,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      let calculatedStock = null;
      if (!formData.unlimited_stock) {
        const enteredVal = parseFloat(formData.stock_quantity) || 0;
        if (stockUpdateMode === 'add') {
          const currentStock = item.stock_quantity || 0;
          calculatedStock = currentStock + enteredVal;
        } else {
          calculatedStock = enteredVal;
        }
      }

      const updatePayload: any = {
        name: formData.name,
        description: formData.description || null,
        price: parseFloat(formData.price),
        price_zomato: formData.price_zomato ? parseFloat(formData.price_zomato) : null,
        price_swiggy: formData.price_swiggy ? parseFloat(formData.price_swiggy) : null,
        purchase_rate: parseFloat(formData.purchase_rate),
        
        selling_unit: formData.selling_unit,
        selling_quantity: parseFloat(formData.selling_quantity) || 1,
        inventory_unit: formData.inventory_unit,
        inventory_quantity: parseFloat(formData.inventory_quantity) || 1,
        is_saleable: formData.is_saleable,
        
        // Legacy fallback
        unit: formData.selling_unit,
        base_value: parseFloat(formData.selling_quantity) || 1,

        stock_quantity: calculatedStock,
        minimum_stock_alert: formData.unlimited_stock ? null : parseFloat(formData.minimum_stock_alert) || 0,
        quantity_step: parseFloat(formData.quantity_step),
        quick_chips: parsedChips,
        category: formData.category || null,
        image_url: formData.image_url || null,
        video_url: formData.video_url || null,
        media_type: formData.media_type,
        is_active: formData.is_active,
        unlimited_stock: formData.unlimited_stock,
        expiry_mode: formData.expiry_mode
      };

      // Add GST fields if enabled
      if (gstEnabled) {
        updatePayload.tax_rate_id = formData.tax_rate_id || null;
        updatePayload.is_tax_inclusive = formData.is_tax_inclusive;
        updatePayload.hsn_code = formData.hsn_code.trim() || null;
      }

      const { error } = await supabase
        .from('items')
        .update(updatePayload)
        .eq('id', item.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Item updated successfully",
      });

      setOpen(false);
      onItemUpdated();
    } catch (error) {
      console.error('Error updating item:', error);
      toast({
        title: "Error",
        description: "Failed to update item",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Edit className="w-4 h-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <Label htmlFor="name">Item Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter item name"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter item description"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="price">Selling Price *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg border">
              <div>
                <Label htmlFor="price_zomato" className="text-red-500 font-semibold text-xs">Zomato Price</Label>
                <Input
                  id="price_zomato"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price_zomato}
                  onChange={(e) => setFormData({ ...formData, price_zomato: e.target.value })}
                  placeholder="0.00"
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="price_swiggy" className="text-orange-500 font-semibold text-xs">Swiggy Price</Label>
                <Input
                  id="price_swiggy"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price_swiggy}
                  onChange={(e) => setFormData({ ...formData, price_swiggy: e.target.value })}
                  placeholder="0.00"
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>

            {/* GST Fields - only shown when GST is enabled */}
            {gstEnabled && (
              <div className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800 space-y-3">
                <Label className="text-xs font-semibold text-orange-700 dark:text-orange-400">TAX SETTINGS</Label>
                <div>
                  <Label htmlFor="edit_tax_rate" className="text-sm">Tax Rate</Label>
                  <Select
                    value={formData.tax_rate_id || 'none'}
                    onValueChange={(value) => setFormData({ ...formData, tax_rate_id: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select tax rate" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      <SelectItem value="none">No Tax / Exempt</SelectItem>
                      {taxRates.map((rate) => (
                        <SelectItem key={rate.id} value={rate.id}>
                          {rate.name} ({rate.rate}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {formData.tax_rate_id && (
                  <>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="edit_is_tax_inclusive" className="text-sm">Selling price includes GST</Label>
                      <Switch
                        id="edit_is_tax_inclusive"
                        checked={formData.is_tax_inclusive}
                        onCheckedChange={(checked) => setFormData({ ...formData, is_tax_inclusive: checked })}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {formData.is_tax_inclusive ? 'GST is included in the selling price (back-calculated)' : 'GST will be added on top of the selling price'}
                    </p>
                    <div>
                      <Label htmlFor="edit_hsn_code" className="text-sm">HSN/SAC Code (optional)</Label>
                      <Input
                        id="edit_hsn_code"
                        value={formData.hsn_code}
                        onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                        placeholder="e.g., 9963"
                        className="font-mono"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="purchase_rate">Purchase Rate *</Label>
              <Input
                id="purchase_rate"
                type="number"
                step="0.01"
                min="0"
                value={formData.purchase_rate}
                onChange={(e) => setFormData({ ...formData, purchase_rate: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>

          {/* Product Master: Selling Details */}
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800 space-y-3">
            <Label className="text-xs font-semibold text-blue-700 dark:text-blue-400">SELLING DETAILS (What the customer sees)</Label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="selling_quantity">Selling Quantity *</Label>
                <Input
                  id="selling_quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.selling_quantity}
                  onChange={(e) => setFormData({ ...formData, selling_quantity: e.target.value })}
                  placeholder="e.g., 500"
                  required
                />
              </div>
              <div>
                <Label htmlFor="selling_unit">Selling Unit *</Label>
                <Select
                  value={formData.selling_unit}
                  onValueChange={(value) => setFormData({ ...formData, selling_unit: value })}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    <SelectItem value="Piece (pc)">Piece (pc)</SelectItem>
                    <SelectItem value="Kilogram (kg)">Kilogram (kg)</SelectItem>
                    <SelectItem value="Gram (g)">Gram (g)</SelectItem>
                    <SelectItem value="Liter (l)">Liter (l)</SelectItem>
                    <SelectItem value="Milliliter (ml)">Milliliter (ml)</SelectItem>
                    <SelectItem value="Box">Box</SelectItem>
                    <SelectItem value="Pack">Pack</SelectItem>
                    <SelectItem value="Cup">Cup</SelectItem>
                    <SelectItem value="Glass">Glass</SelectItem>
                    <SelectItem value="Plate">Plate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Product Master: Inventory Details */}
          <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800 space-y-3">
            <Label className="text-xs font-semibold text-green-700 dark:text-green-400">INVENTORY DETAILS (What you purchase/track)</Label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="inventory_quantity">Inventory Quantity *</Label>
                <Input
                  id="inventory_quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.inventory_quantity}
                  onChange={(e) => setFormData({ ...formData, inventory_quantity: e.target.value })}
                  placeholder="e.g., 1"
                  required
                />
              </div>
              <div>
                <Label htmlFor="inventory_unit">Inventory Unit *</Label>
                <Select
                  value={formData.inventory_unit}
                  onValueChange={(value) => setFormData({ ...formData, inventory_unit: value })}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    <SelectItem value="Piece (pc)">Piece (pc)</SelectItem>
                    <SelectItem value="Kilogram (kg)">Kilogram (kg)</SelectItem>
                    <SelectItem value="Gram (g)">Gram (g)</SelectItem>
                    <SelectItem value="Liter (l)">Liter (l)</SelectItem>
                    <SelectItem value="Milliliter (ml)">Milliliter (ml)</SelectItem>
                    <SelectItem value="Box">Box</SelectItem>
                    <SelectItem value="Pack">Pack</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

            <div className="flex items-center space-x-2 py-2">
              <Checkbox
                id="unlimited_stock"
                checked={formData.unlimited_stock}
                onCheckedChange={(checked) => setFormData({ ...formData, unlimited_stock: checked as boolean })}
              />
              <Label htmlFor="unlimited_stock" className="font-medium">Unlimited Stock (no tracking)</Label>
            </div>

            {!formData.unlimited_stock && (
              <>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <Label htmlFor="stock_quantity">Available Stock *</Label>
                  </div>

                  <div className="flex justify-between items-center mb-2 mt-1 bg-muted p-1 rounded-md text-xs">
                    <button
                      type="button"
                      onClick={() => handleStockUpdateModeChange('add')}
                      className={`flex-1 py-1 rounded-sm text-center font-medium transition-colors ${stockUpdateMode === 'add' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Add to Existing Stock
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStockUpdateModeChange('replace')}
                      className={`flex-1 py-1 rounded-sm text-center font-medium transition-colors ${stockUpdateMode === 'replace' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Replace Existing Stock
                    </button>
                  </div>

                  <Input
                    id="stock_quantity"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.stock_quantity}
                    onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                    placeholder={
                      stockUpdateMode === 'add'
                        ? `Qty to add (in ${getShortUnit(formData.inventory_unit)})`
                        : `New total stock (in ${getShortUnit(formData.inventory_unit)})`
                    }
                    required={!formData.unlimited_stock && stockUpdateMode === 'replace'}
                  />

                  <p className="text-[11px] text-muted-foreground mt-1 px-1">
                    Current Stock: <span className="font-semibold text-foreground">{
                      item.stock_quantity !== undefined && item.stock_quantity !== null
                        ? `${item.stock_quantity} ${getShortUnit(formData.inventory_unit)}`
                        : `0 ${getShortUnit(formData.inventory_unit)}`
                    }</span>
                    {stockUpdateMode === 'add' && formData.stock_quantity ? (
                      <span>
                        {' '}→ New Stock will be:{' '}
                        <span className="font-semibold text-primary">
                          {(item.stock_quantity || 0) + (parseFloat(formData.stock_quantity) || 0)}{' '}
                          {getShortUnit(formData.inventory_unit)}
                        </span>
                      </span>
                    ) : null}
                  </p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <Label htmlFor="minimum_stock_alert">Minimum Stock Alert</Label>
                  </div>
                  <Input
                    id="minimum_stock_alert"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.minimum_stock_alert}
                    onChange={(e) => setFormData({ ...formData, minimum_stock_alert: e.target.value })}
                    placeholder={`Alert when below (in ${getShortUnit(formData.inventory_unit)})`}
                  />
                </div>
              </>
            )}

            <div>
              <Label htmlFor="quantity_step">Quantity Step</Label>
              <Input
                id="quantity_step"
                type="number"
                step="0.01"
                min="0.01"
                value={formData.quantity_step}
                onChange={(e) => setFormData({ ...formData, quantity_step: e.target.value })}
                placeholder="1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Amount to +/- when clicking buttons in the billing page.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="chips_mode">Quick Chips Mode</Label>
                <Select
                  value={chipsMode}
                  onValueChange={(value: 'qty' | 'amount') => {
                    setChipsMode(value);
                    setFormData({ ...formData, quick_chips: '' });
                  }}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover text-popover-foreground">
                    <SelectItem value="qty">⚖️ Quantity-based (e.g. 100g, 500ml)</SelectItem>
                    <SelectItem value="amount">₹ Amount-based (e.g. 10, 20, 50)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="quick_chips">
                  {chipsMode === 'amount' ? 'Quick Chips Amounts (optional)' : 'Quick Chips (optional)'}
                </Label>
                <Input
                  id="quick_chips"
                  type="text"
                  value={formData.quick_chips}
                  onChange={(e) => setFormData({ ...formData, quick_chips: e.target.value })}
                  placeholder={chipsMode === 'amount' ? 'e.g., 10, 20, 50, 100' : 'e.g., 250 ml, 500 ml, 1 L'}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {chipsMode === 'amount' 
                    ? 'Comma-separated currency amounts (no symbols).' 
                    : 'Comma-separated quick-add quantities.'}
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category || 'none'}
                onValueChange={(value) => setFormData({ ...formData, category: value === 'none' ? '' : value })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="none">No Category</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.name}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit_expiry_mode">Expiry Tracking</Label>
              <Select
                value={formData.expiry_mode}
                onValueChange={(value) => setFormData({ ...formData, expiry_mode: value as any })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="none">No Expiry</SelectItem>
                  <SelectItem value="optional">Optional (track when entered)</SelectItem>
                  <SelectItem value="mandatory">Mandatory (required on purchase)</SelectItem>
                </SelectContent>
              </Select>
            </div>


            <div>
              <Label>Item Media {hasPremiumAccess && <span className="text-purple-600 text-xs">(Premium: GIF/Video enabled)</span>}</Label>
              <MediaUpload
                imageUrl={formData.image_url}
                videoUrl={formData.video_url}
                mediaType={formData.media_type}
                onImageChange={(url) => setFormData(prev => ({ ...prev, image_url: url }))}
                onVideoChange={(url) => setFormData(prev => ({ ...prev, video_url: url }))}
                onMediaTypeChange={(type) => setFormData(prev => ({ ...prev, media_type: type }))}
                itemId={item.id}
                hasPremiumAccess={hasPremiumAccess}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="is_active">Item is active (shown in menus)</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_saleable"
                checked={formData.is_saleable}
                onCheckedChange={(checked) => setFormData({ ...formData, is_saleable: checked })}
              />
              <Label htmlFor="is_saleable">Item is saleable (customers can buy it)</Label>
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Updating...' : 'Update Item'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

