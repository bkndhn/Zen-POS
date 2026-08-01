import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2, Tag, Layers, Building2 } from 'lucide-react';
import { MediaUpload } from '@/components/MediaUpload';
import { useAuth } from '@/contexts/AuthContext';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { Card, CardContent } from '@/components/ui/card';

interface Variant {
  id: string; // temp id for UI
  size: string;
  color: string;
  purchase_rate: number;
  mrp: number;
  rsp: number;
  barcode: string;
  stock_quantity: number;
}

export function RetailAddItemDialog({ onItemAdded }: { onItemAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Basic Info
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  
  // Hierarchy
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  
  // Pricing & Variants
  const [hasVariants, setHasVariants] = useState(false);
  const [price, setPrice] = useState(''); // RSP for non-variant
  const [purchaseRate, setPurchaseRate] = useState('');
  const [barcode, setBarcode] = useState('');
  const [stock, setStock] = useState('');
  
  const [variants, setVariants] = useState<Variant[]>([]);

  const { adminProfileId } = useAuth();
  const { operatingBranchId } = useBranchScopedQuery();

  useEffect(() => {
    if (open && adminProfileId) {
      fetchHierarchyData();
    }
  }, [open, adminProfileId, operatingBranchId]);

  const fetchHierarchyData = async () => {
    try {
      // Fetch Suppliers
      const { data: supData } = await supabase.from('suppliers').select('*').eq('admin_id', adminProfileId);
      if (supData) setSuppliers(supData);

      // Fetch Departments
      const { data: depData } = await supabase.from('departments').select('*').eq('admin_id', adminProfileId);
      if (depData) setDepartments(depData);

      // Fetch Brands
      const { data: brandData } = await supabase.from('brands').select('*').eq('admin_id', adminProfileId);
      if (brandData) setBrands(brandData);

      // Fetch Categories
      const { data: catData } = await supabase.from('item_categories').select('*').eq('admin_id', adminProfileId);
      if (catData) setCategories(catData);
    } catch (err) {
      console.error('Error fetching hierarchy data:', err);
    }
  };

  const addVariant = () => {
    setVariants([...variants, {
      id: Math.random().toString(),
      size: '',
      color: '',
      purchase_rate: 0,
      mrp: 0,
      rsp: 0,
      barcode: '',
      stock_quantity: 0
    }]);
  };

  const removeVariant = (id: string) => {
    setVariants(variants.filter(v => v.id !== id));
  };

  const updateVariant = (id: string, field: keyof Variant, value: any) => {
    setVariants(variants.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return toast({ title: "Name required", variant: "destructive" });
    if (!hasVariants && !price) return toast({ title: "Price required", variant: "destructive" });
    if (hasVariants && variants.length === 0) return toast({ title: "Add at least one variant", variant: "destructive" });

    setLoading(true);
    try {
      // 1. Insert Item
      const itemPayload = {
        name,
        description,
        image_url: imageUrl,
        admin_id: adminProfileId,
        branch_id: operatingBranchId,
        supplier_id: selectedSupplier || null,
        department_id: selectedDepartment || null,
        brand_id: selectedBrand || null,
        category: selectedCategory || null,
        has_variants: hasVariants,
        price: hasVariants ? 0 : parseFloat(price),
        purchase_rate: hasVariants ? null : parseFloat(purchaseRate || '0'),
        barcode: hasVariants ? null : barcode,
        stock_quantity: hasVariants ? null : parseFloat(stock || '0'),
        is_active: true
      };

      const { data: itemData, error: itemError } = await supabase
        .from('items')
        .insert(itemPayload)
        .select()
        .single();

      if (itemError) throw itemError;

      // 2. Insert Variants if applicable
      if (hasVariants && itemData) {
        const variantPayloads = variants.map(v => ({
          item_id: itemData.id,
          size: v.size,
          color: v.color,
          purchase_rate: v.purchase_rate,
          mrp: v.mrp,
          rsp: v.rsp,
          barcode: v.barcode,
          stock_quantity: v.stock_quantity
        }));

        const { error: varError } = await supabase
          .from('item_variants')
          .insert(variantPayloads);
        
        if (varError) throw varError;
      }

      toast({ title: "Item added successfully" });
      setOpen(false);
      onItemAdded();
      resetForm();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Failed to add item", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setImageUrl('');
    setSelectedSupplier('');
    setSelectedDepartment('');
    setSelectedCategory('');
    setSelectedBrand('');
    setHasVariants(false);
    setPrice('');
    setPurchaseRate('');
    setBarcode('');
    setStock('');
    setVariants([]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700">
          <Plus size={16} /> Retail Item
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Tag className="text-indigo-600" /> Add Retail Product
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          
          {/* Section 1: Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label>Product Name *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Levi's 501 Jeans" required />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Product description..." rows={3} />
              </div>
            </div>
            <div>
              <Label>Product Image</Label>
              <div className="mt-2">
                <MediaUpload url={imageUrl} onUpload={(url) => setImageUrl(url)} type="image" />
              </div>
            </div>
          </div>

          {/* Section 2: Hierarchy Mapping */}
          <Card className="border-indigo-100 shadow-sm">
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-gray-500 flex items-center gap-1 mb-2"><Building2 size={14}/> Supplier</Label>
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger><SelectValue placeholder="Select Supplier" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-500 flex items-center gap-1 mb-2"><Layers size={14}/> Department</Label>
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger><SelectValue placeholder="Select Dept" /></SelectTrigger>
                  <SelectContent>
                    {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-500 mb-2 block">Category</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-500 mb-2 block">Brand</Label>
                <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                  <SelectTrigger><SelectValue placeholder="Select Brand" /></SelectTrigger>
                  <SelectContent>
                    {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Variants */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <Label className="text-lg font-semibold text-gray-800">Product Variants (Sizes/Colors)</Label>
                <p className="text-sm text-gray-500">Enable this if the product has multiple sizes or colors with different barcodes/prices.</p>
              </div>
              <Switch checked={hasVariants} onCheckedChange={setHasVariants} />
            </div>

            {!hasVariants ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <Label>RSP (Selling Price) *</Label>
                  <Input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} required={!hasVariants} />
                </div>
                <div>
                  <Label>Purchase Rate</Label>
                  <Input type="number" step="0.01" value={purchaseRate} onChange={e => setPurchaseRate(e.target.value)} />
                </div>
                <div>
                  <Label>Barcode</Label>
                  <Input value={barcode} onChange={e => setBarcode(e.target.value)} />
                </div>
                <div>
                  <Label>Opening Stock</Label>
                  <Input type="number" value={stock} onChange={e => setStock(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-200">
                      <tr>
                        <th className="px-4 py-2 rounded-tl-md">Size</th>
                        <th className="px-4 py-2">Color</th>
                        <th className="px-4 py-2">Purchase ₹</th>
                        <th className="px-4 py-2">MRP ₹</th>
                        <th className="px-4 py-2">RSP ₹</th>
                        <th className="px-4 py-2">Barcode</th>
                        <th className="px-4 py-2">Stock</th>
                        <th className="px-4 py-2 rounded-tr-md"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {variants.map((v, i) => (
                        <tr key={v.id} className="border-b bg-white">
                          <td className="px-2 py-2"><Input value={v.size} onChange={e=>updateVariant(v.id, 'size', e.target.value)} placeholder="e.g. XL" className="h-8" /></td>
                          <td className="px-2 py-2"><Input value={v.color} onChange={e=>updateVariant(v.id, 'color', e.target.value)} placeholder="e.g. Red" className="h-8" /></td>
                          <td className="px-2 py-2"><Input type="number" value={v.purchase_rate || ''} onChange={e=>updateVariant(v.id, 'purchase_rate', parseFloat(e.target.value))} className="h-8 w-20" /></td>
                          <td className="px-2 py-2"><Input type="number" value={v.mrp || ''} onChange={e=>updateVariant(v.id, 'mrp', parseFloat(e.target.value))} className="h-8 w-20" /></td>
                          <td className="px-2 py-2"><Input type="number" value={v.rsp || ''} onChange={e=>updateVariant(v.id, 'rsp', parseFloat(e.target.value))} className="h-8 w-20" required /></td>
                          <td className="px-2 py-2"><Input value={v.barcode} onChange={e=>updateVariant(v.id, 'barcode', e.target.value)} className="h-8" /></td>
                          <td className="px-2 py-2"><Input type="number" value={v.stock_quantity || ''} onChange={e=>updateVariant(v.id, 'stock_quantity', parseFloat(e.target.value))} className="h-8 w-20" /></td>
                          <td className="px-2 py-2">
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => removeVariant(v.id)}>
                              <Trash2 size={14} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addVariant} className="mt-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                  <Plus size={14} className="mr-1" /> Add Variant Row
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {loading ? "Saving..." : "Save Product"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
