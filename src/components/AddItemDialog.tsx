
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus } from 'lucide-react';
import { MediaUpload } from '@/components/MediaUpload';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Switch } from '@/components/ui/switch';
import { getShortUnit, validateAndNormalizeQuickChips } from '@/utils/timeUtils';

interface TaxRateOption {
  id: string;
  name: string;
  rate: number;
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
  
  // New Product Master fields
  selling_unit?: string;
  selling_quantity?: number;
  inventory_unit?: string;
  inventory_quantity?: number;
  is_saleable?: boolean;
  
  stock_quantity?: number;
  minimum_stock_alert?: number;
  image_url?: string;
  price_zomato?: number;
  price_swiggy?: number;
}

interface Category {
  id: string;
  name: string;
}

interface AddItemDialogProps {
  onItemAdded: () => void;
  existingItems: Item[];
}

export const AddItemDialog: React.FC<AddItemDialogProps> = ({ onItemAdded, existingItems }) => {
  const { profile } = useAuth();
  const { operatingBranchId, isAllBranchesView } = useBranch();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [hasPremiumAccess, setHasPremiumAccess] = useState(false);
  const [itemLimit, setItemLimit] = useState<number | null>(null);
  const [currentItemCount, setCurrentItemCount] = useState(0);
  const [gstEnabled, setGstEnabled] = useState(false);
  const [taxRates, setTaxRates] = useState<TaxRateOption[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    price_zomato: '',
    price_swiggy: '',
    purchase_rate: '',
    selling_unit: 'Piece (pc)',
    selling_quantity: '1',
    inventory_unit: 'Piece (pc)',
    inventory_quantity: '1',
    is_saleable: true,
    stock_quantity: '',
    minimum_stock_alert: '',
    quick_chips: '',
    category: '',
    image_url: '',
    video_url: '',
    media_type: 'image' as 'image' | 'gif' | 'video',
    is_active: true,
    unlimited_stock: false,
    tax_rate_id: '',
    is_tax_inclusive: true,
    hsn_code: '',
    expiry_mode: 'none' as 'none' | 'optional' | 'mandatory'
  });
  const [loading, setLoading] = useState(false);

  // Check premium access
  useEffect(() => {
    const checkPremiumAccess = async () => {
      if (!profile) return;
      const adminId = profile.role === 'admin' ? profile.id : profile.admin_id;
      if (!adminId) return;

      const { data } = await supabase
        .from('profiles')
        .select('has_qr_menu_access, item_limit')
        .eq('id', adminId)
        .single();

      setHasPremiumAccess(data?.has_qr_menu_access || false);
      setItemLimit((data as any)?.item_limit ?? null);

      // Count all items for this admin
      const { count } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true })
        .eq('admin_id', adminId);
      setCurrentItemCount(count ?? 0);
    };
    checkPremiumAccess();
  }, [profile]);

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
      if (adminAuthId) {
        fetchGstSettings();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, operatingBranchId, profile?.id, profile?.admin_id, adminAuthId]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.price || !formData.purchase_rate || (!formData.unlimited_stock && !formData.stock_quantity)) {
      toast({
        title: "Error",
        description: formData.unlimited_stock
          ? "Name, selling price, and purchase rate are required"
          : "Name, selling price, purchase rate, and stock quantity are required",
        variant: "destructive",
      });
      return;
    }

    // Check for duplicate items (case-insensitive)
    const isDuplicate = existingItems.some(item =>
      item.name.toLowerCase().trim() === formData.name.toLowerCase().trim() && item.is_active
    );

    if (isDuplicate) {
      toast({
        title: "Error",
        description: "An item with this name already exists",
        variant: "destructive",
      });
      return;
    }

    // Check item limit
    if (itemLimit !== null && currentItemCount >= itemLimit) {
      toast({
        title: "Item Limit Reached",
        description: `You have reached the maximum of ${itemLimit} items. Contact your administrator to increase the limit.`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Get admin_id from the session for data isolation
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      // Fetch user's profile to get admin_id
      let adminId = null;
      if (userId) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, role, admin_id')
          .eq('user_id', userId)
          .single();

        if (profileData) {
          adminId = profileData.role === 'admin' ? profileData.id : profileData.admin_id;
        }
      }

      // Validate and normalize quick chips based on selling unit
      const { error: chipError, normalized: parsedChips } = validateAndNormalizeQuickChips(
        formData.quick_chips,
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

      const insertPayload: any = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price: parseFloat(formData.price),
        price_zomato: formData.price_zomato ? parseFloat(formData.price_zomato) : null,
        price_swiggy: formData.price_swiggy ? parseFloat(formData.price_swiggy) : null,
        purchase_rate: parseFloat(formData.purchase_rate),
        
        // New Product Master fields
        selling_unit: formData.selling_unit,
        selling_quantity: parseFloat(formData.selling_quantity) || 1,
        inventory_unit: formData.inventory_unit,
        inventory_quantity: parseFloat(formData.inventory_quantity) || 1,
        is_saleable: formData.is_saleable,
        
        // Legacy fallback
        unit: formData.selling_unit,
        base_value: parseFloat(formData.selling_quantity) || 1,
        quantity_step: 1,

        stock_quantity: formData.unlimited_stock ? null : parseFloat(formData.stock_quantity),
        minimum_stock_alert: formData.unlimited_stock ? null : (parseFloat(formData.minimum_stock_alert) || 0),
        
        quick_chips: parsedChips,
        category: formData.category === 'none' ? null : formData.category.trim(),
        image_url: formData.image_url.trim() || null,
        video_url: formData.video_url.trim() || null,
        media_type: formData.media_type,
        is_active: formData.is_active,
        unlimited_stock: formData.unlimited_stock,
        admin_id: adminId,
        branch_id: operatingBranchId || null,
        expiry_mode: formData.expiry_mode,
      };

      // Add GST fields if enabled
      if (gstEnabled) {
        insertPayload.tax_rate_id = formData.tax_rate_id || null;
        insertPayload.is_tax_inclusive = formData.is_tax_inclusive;
        insertPayload.hsn_code = formData.hsn_code.trim() || null;
      }

      const { error } = await supabase.from('items').insert(insertPayload);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Item added successfully",
      });

      setFormData({
        name: '',
        description: '',
        price: '',
        price_zomato: '',
        price_swiggy: '',
        purchase_rate: '',
        selling_unit: 'Piece (pc)',
        selling_quantity: '1',
        inventory_unit: 'Piece (pc)',
        inventory_quantity: '1',
        is_saleable: true,
        stock_quantity: '',
        minimum_stock_alert: '',
        quick_chips: '',
        category: '',
        image_url: '',
        video_url: '',
        media_type: 'image',
        is_active: true,
        unlimited_stock: false,
        tax_rate_id: '',
        is_tax_inclusive: true,
        hsn_code: '',
        expiry_mode: 'none'
      });
      setOpen(false);
      setCurrentItemCount(prev => prev + 1);
      onItemAdded();
    } catch (error) {
      console.error('Error adding item:', error);
      toast({
        title: "Error",
        description: "Failed to add item",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="flex items-center gap-2">
          {itemLimit !== null && (
            <span className={`text-xs font-medium px-2 py-1 rounded-full border ${currentItemCount >= itemLimit ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800' : 'bg-muted text-muted-foreground'}`}>
              {currentItemCount}/{itemLimit} items
            </span>
          )}
          <Button
            disabled={(itemLimit !== null && currentItemCount >= itemLimit) || isAllBranchesView}
            title={isAllBranchesView ? 'Switch to a specific branch to add items' : ''}
          >
            <Plus className="w-4 h-4 mr-2" />
            {isAllBranchesView ? 'Pick a branch' : (itemLimit !== null && currentItemCount >= itemLimit ? 'Limit Reached' : 'Add Item')}
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Item</DialogTitle>
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
                <Label htmlFor="tax_rate" className="text-sm">Tax Rate</Label>
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
                    <Label htmlFor="is_tax_inclusive" className="text-sm">Selling price includes GST</Label>
                    <Switch
                      id="is_tax_inclusive"
                      checked={formData.is_tax_inclusive}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_tax_inclusive: checked })}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {formData.is_tax_inclusive ? 'GST is included in the selling price (back-calculated)' : 'GST will be added on top of the selling price'}
                  </p>
                  <div>
                    <Label htmlFor="hsn_code" className="text-sm">HSN/SAC Code (optional)</Label>
                    <Input
                      id="hsn_code"
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
            <p className="text-[10px] text-muted-foreground mt-1">
              Example: If you sell "1 Cup" of tea, but buy "1 Kg" of tea leaves.
            </p>
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
                <Input
                  id="stock_quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.stock_quantity}
                  onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                  placeholder={`Stock available in ${getShortUnit(formData.inventory_unit)}`}
                  required={!formData.unlimited_stock}
                />
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
            <Label htmlFor="quick_chips">Quick Chips (optional)</Label>
            <Input
              id="quick_chips"
              type="text"
              value={formData.quick_chips}
              onChange={(e) => setFormData({ ...formData, quick_chips: e.target.value })}
              placeholder="e.g., 250 ml, 500 ml, 1 L"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Comma-separated quick-add buttons shown on the billing card.
            </p>
          </div>

          <div>
            <Label htmlFor="category">Category *</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value })}
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
            <Label htmlFor="expiry_mode">Expiry Tracking</Label>
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
            <p className="text-xs text-muted-foreground mt-1">
              Controls whether expiry dates must be captured for this item when purchasing stock.
            </p>
          </div>

          <div>
            <Label>
              Item Media
              {hasPremiumAccess && (
                <span className="text-xs text-purple-600 ml-1">(Premium: GIF/Video enabled)</span>
              )}
            </Label>
            <MediaUpload
              imageUrl={formData.image_url}
              videoUrl={formData.video_url}
              mediaType={formData.media_type}
              onImageChange={(url) => setFormData({ ...formData, image_url: url })}
              onVideoChange={(url) => setFormData({ ...formData, video_url: url })}
              onMediaTypeChange={(type) => setFormData({ ...formData, media_type: type })}
              itemId={`new-item-${Date.now()}`}
              hasPremiumAccess={hasPremiumAccess}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked as boolean })}
            />
            <Label htmlFor="is_active">Item is active (shown in menus)</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_saleable"
              checked={formData.is_saleable}
              onCheckedChange={(checked) => setFormData({ ...formData, is_saleable: checked as boolean })}
            />
            <Label htmlFor="is_saleable">Item is saleable (customers can buy it)</Label>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {loading ? 'Creating...' : 'Create Item'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
