
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
  unit?: string;
  base_value?: number;
  stock_quantity?: number;
  minimum_stock_alert?: number;
  quantity_step?: number;
  image_url?: string;
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
    purchase_rate: '',
    unit: 'Piece (pc)',
    base_value: '1',
    stock_quantity: '',
    minimum_stock_alert: '',
    quantity_step: '1',
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

  useEffect(() => {
    fetchCategories();
    fetchGstSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operatingBranchId, profile?.id, profile?.admin_id]);

  const fetchGstSettings = async () => {
    try {
      const adminId = profile?.role === 'admin' ? profile.user_id : profile?.admin_id;
      if (!adminId) return;

      // Check if GST is enabled
      const { data: settings } = await (supabase as any)
        .from('shop_settings')
        .select('gst_enabled')
        .eq('user_id', profile?.user_id)
        .maybeSingle();

      const enabled = settings?.gst_enabled || false;
      setGstEnabled(enabled);

      if (enabled) {
        const { data: rates } = await (supabase as any)
          .from('tax_rates')
          .select('id, name, rate')
          .eq('admin_id', adminId)
          .eq('is_active', true)
          .order('rate', { ascending: true });
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

      const insertPayload: any = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price: parseFloat(formData.price),
        purchase_rate: parseFloat(formData.purchase_rate),
        unit: formData.unit,
        base_value: parseFloat(formData.base_value),
        stock_quantity: formData.unlimited_stock ? null : parseFloat(formData.stock_quantity),
        minimum_stock_alert: formData.unlimited_stock ? null : (parseFloat(formData.minimum_stock_alert) || 0),
        quantity_step: parseFloat(formData.quantity_step),
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
        purchase_rate: '',
        unit: 'Piece (pc)',
        base_value: '1',
        stock_quantity: '',
        minimum_stock_alert: '',
        quantity_step: '1',
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

          <div>
            <Label htmlFor="unit">Unit *</Label>
            <Select
              value={formData.unit}
              onValueChange={(value) => setFormData({ ...formData, unit: value })}
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

          <div>
            <Label htmlFor="base_value">Base Value</Label>
            <Input
              id="base_value"
              type="number"
              step="0.01"
              min="0"
              value={formData.base_value}
              onChange={(e) => setFormData({ ...formData, base_value: e.target.value })}
              placeholder="1"
            />
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
                <Label htmlFor="stock_quantity">Stock Quantity *</Label>
                <Input
                  id="stock_quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.stock_quantity}
                  onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                  placeholder="Available stock"
                  required={!formData.unlimited_stock}
                />
              </div>

              <div>
                <Label htmlFor="minimum_stock_alert">Minimum Stock Alert</Label>
                <Input
                  id="minimum_stock_alert"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.minimum_stock_alert}
                  onChange={(e) => setFormData({ ...formData, minimum_stock_alert: e.target.value })}
                  placeholder="Alert when stock below"
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
            <Label htmlFor="is_active">Item is available for sale</Label>
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
