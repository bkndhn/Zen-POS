import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useBranchScopedQuery, applyBranchFilter } from '@/hooks/useBranchScopedQuery';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AllBranchesReadOnlyBanner } from '@/components/AllBranchesReadOnlyBanner';
import { Truck, Plus, Pencil, Trash2, Search, Building2, Phone, Mail, FileText, MapPin, ShoppingBag, IndianRupee, Star, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  notes: string | null;
  branch_id: string | null;
  is_active: boolean;
  total_purchases_count?: number;
  total_purchases_amount?: number;
}

const emptyForm = { name: '', phone: '', email: '', gstin: '', address: '', notes: '', branch_id: 'all' };

const Suppliers: React.FC = () => {
  const { profile, adminProfileId } = useAuth();
  const { branches, operatingBranchId } = useBranch();
  const { branchFilterId, isAllBranchesView: isAllBranches, readOnly: isReadOnly } = useBranchScopedQuery();

  const [list, setList] = useState<Supplier[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [matrix, setMatrix] = useState<Record<string, Record<string, any>>>({});
  const [itemSearch, setItemSearch] = useState('');
  const [catalogQ, setCatalogQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [q, setQ] = useState('');

  const adminId = adminProfileId;

  const branchMap = useMemo(() => {
    return new Map(branches.map(b => [b.id, b.name]));
  }, [branches]);

  const load = async () => {
    if (!adminId) return;
    let loadedFromCache = false;
    try {
      const { dataCache } = await import('@/utils/cacheUtils');
      const cacheKey = `suppliers_${adminId}_${branchFilterId || 'all'}`;
      const cached = dataCache.get<Supplier[]>(cacheKey);
      if (cached && cached.length > 0) {
        setList(cached);
        loadedFromCache = true;
        setLoading(false);
      }

      // Fetch suppliers
      let query = (supabase as any)
        .from('suppliers')
        .select('*')
        .eq('admin_id', adminId)
        .eq('is_active', true)
        .order('name');

      query = applyBranchFilter(query, branchFilterId);
      const { data: supplierData, error: supplierErr } = await query;
      if (supplierErr) throw supplierErr;

      const rawSuppliers = (supplierData || []) as Supplier[];

      // Fetch purchase stats per supplier
      let purchasesQuery = (supabase as any)
        .from('purchases')
        .select('supplier_id, total_amount')
        .eq('admin_id', adminId);

      purchasesQuery = applyBranchFilter(purchasesQuery, branchFilterId);
      const { data: purchaseData } = await purchasesQuery;

      const statsMap = new Map<string, { count: number; total: number }>();
      (purchaseData || []).forEach((p: any) => {
        if (!p.supplier_id) return;
        const prev = statsMap.get(p.supplier_id) || { count: 0, total: 0 };
        statsMap.set(p.supplier_id, {
          count: prev.count + 1,
          total: prev.total + (Number(p.total_amount) || 0)
        });
      });

      const enriched = rawSuppliers.map(s => {
        const stats = statsMap.get(s.id);
        return {
          ...s,
          total_purchases_count: stats?.count || 0,
          total_purchases_amount: stats?.total || 0
        };
      });

      setList(enriched);
      dataCache.set(cacheKey, enriched);

      const { data: itemData } = await (supabase as any)
        .from('items')
        .select('id, name')
        .eq('admin_id', adminId)
        .eq('is_active', true)
        .order('name');
      if (itemData) setItems(itemData);

    } catch (err: any) {
      console.warn('Error loading suppliers from network (offline mode active):', err);
      if (!loadedFromCache) {
        toast({ title: 'Offline Mode', description: 'Connect to internet to refresh suppliers', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (adminId) {
       try {
         const stored = localStorage.getItem(`supplier_item_matrix_${adminId}`);
         if (stored) setMatrix(JSON.parse(stored));
       } catch (e) {}
    }
  }, [adminId, branchFilterId]);

  const saveMatrix = (newMatrix: any) => {
    setMatrix(newMatrix);
    localStorage.setItem(`supplier_item_matrix_${adminId}`, JSON.stringify(newMatrix));
  };

  const togglePreferred = (supplierId: string, itemId: string) => {
    const newMatrix = { ...matrix };
    Object.keys(newMatrix).forEach(sid => {
      if (newMatrix[sid]?.[itemId]) {
        newMatrix[sid][itemId].isPreferred = false;
      }
    });
    if (!newMatrix[supplierId]) newMatrix[supplierId] = {};
    if (!newMatrix[supplierId][itemId]) newMatrix[supplierId][itemId] = { price: 0, vendorCode: '', leadTime: 0 };
    newMatrix[supplierId][itemId].isPreferred = true;
    saveMatrix(newMatrix);
  };

  const updateMapping = (supplierId: string, itemId: string, field: string, value: any) => {
    const newMatrix = { ...matrix };
    if (!newMatrix[supplierId]) newMatrix[supplierId] = {};
    if (!newMatrix[supplierId][itemId]) newMatrix[supplierId][itemId] = { price: 0, vendorCode: '', leadTime: 0, isPreferred: false };
    newMatrix[supplierId][itemId][field] = value;
    saveMatrix(newMatrix);
  };

  const toggleItemAssigned = (supplierId: string, itemId: string) => {
    const newMatrix = { ...matrix };
    if (newMatrix[supplierId]?.[itemId]) {
       delete newMatrix[supplierId][itemId];
    } else {
       if (!newMatrix[supplierId]) newMatrix[supplierId] = {};
       newMatrix[supplierId][itemId] = { price: 0, vendorCode: '', leadTime: 0, isPreferred: false };
    }
    saveMatrix(newMatrix);
  };

  const openNew = () => {
    if (isReadOnly) {
      toast({ title: 'Read-only mode', description: 'Select a specific branch to add suppliers.', variant: 'destructive' });
      return;
    }
    setEditing(null);
    setForm({
      ...emptyForm,
      branch_id: operatingBranchId || 'all'
    });
    setOpen(true);
  };

  const openEdit = (s: Supplier) => {
    if (isReadOnly) {
      toast({ title: 'Read-only mode', description: 'Select a specific branch to edit suppliers.', variant: 'destructive' });
      return;
    }
    setEditing(s);
    setForm({
      name: s.name,
      phone: s.phone || '',
      email: s.email || '',
      gstin: s.gstin || '',
      address: s.address || '',
      notes: s.notes || '',
      branch_id: s.branch_id || 'all'
    });
    setOpen(true);
  };

  const save = async () => {
    if (!adminId || !form.name.trim()) {
      toast({ title: 'Supplier name required', variant: 'destructive' });
      return;
    }

    const assignedBranchId = form.branch_id === 'all' ? (operatingBranchId || null) : form.branch_id;

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      gstin: form.gstin.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      branch_id: assignedBranchId,
      admin_id: adminId,
      created_by: profile?.user_id
    };

    try {
      if (editing) {
        const { error } = await (supabase as any).from('suppliers').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Supplier updated successfully' });
      } else {
        const { error } = await (supabase as any).from('suppliers').insert(payload);
        if (error) throw error;
        toast({ title: 'Supplier created successfully' });
      }
      setOpen(false);
      load();
    } catch (err: any) {
      toast({ title: 'Error saving supplier', description: err.message, variant: 'destructive' });
    }
  };

  const remove = async (s: Supplier) => {
    if (isReadOnly) {
      toast({ title: 'Read-only mode', description: 'Select a specific branch to delete suppliers.', variant: 'destructive' });
      return;
    }
    if (!confirm(`Are you sure you want to delete supplier "${s.name}"?`)) return;

    try {
      const { error } = await (supabase as any).from('suppliers').update({ is_active: false }).eq('id', s.id);
      if (error) throw error;
      toast({ title: 'Supplier deleted' });
      load();
    } catch (err: any) {
      toast({ title: 'Error deleting supplier', description: err.message, variant: 'destructive' });
    }
  };

  const filtered = useMemo(() => {
    return list.filter(s => {
      const matchSearch = !q ||
        s.name.toLowerCase().includes(q.toLowerCase()) ||
        (s.phone || '').includes(q) ||
        (s.email || '').toLowerCase().includes(q.toLowerCase()) ||
        (s.gstin || '').toLowerCase().includes(q.toLowerCase());
      return matchSearch;
    });
  }, [list, q]);

  const totalPurchaseVolume = useMemo(() => {
    return filtered.reduce((sum, s) => sum + (s.total_purchases_amount || 0), 0);
  }, [filtered]);

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-24 bg-[#fafafa] dark:bg-[#0b0c10] text-[#1f2937] dark:text-[#f3f4f6]">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Read-Only Banner when viewing All Branches */}
        <AllBranchesReadOnlyBanner />

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5 border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Truck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Vendor & Supplier Directory
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Manage raw material suppliers, vendor contacts, and monitor purchase order histories.
              </p>
            </div>
          </div>

          <Button onClick={openNew} disabled={isReadOnly} className="rounded-xl flex items-center gap-1.5 shrink-0 shadow-sm">
            <Plus className="w-4 h-4" /> New Supplier
          </Button>
        </div>

        <Tabs defaultValue="directory" className="w-full">
          <TabsList className="mb-6 grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="directory">Suppliers Directory</TabsTrigger>
            <TabsTrigger value="catalog">Catalog Matrix</TabsTrigger>
          </TabsList>
          
          <TabsContent value="directory" className="space-y-6 m-0">

        {/* Overview Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border border-gray-200 dark:border-gray-800 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground font-medium block">Active Vendors</span>
                <span className="text-2xl font-extrabold">{filtered.length}</span>
              </div>
              <div className="p-3 bg-primary/10 rounded-xl">
                <Truck className="w-5 h-5 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 dark:border-gray-800 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground font-medium block">Total Purchases</span>
                <span className="text-2xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                  ₹{totalPurchaseVolume.toFixed(2)}
                </span>
              </div>
              <div className="p-3 bg-emerald-500/10 rounded-xl">
                <IndianRupee className="w-5 h-5 text-emerald-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 dark:border-gray-800 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground font-medium block">Branch Context</span>
                <span className="text-sm font-bold block truncate mt-1">
                  {isAllBranches ? 'All Branches Combined' : (branchMap.get(branchFilterId) || 'Active Branch')}
                </span>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-xl">
                <Building2 className="w-5 h-5 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, email, GSTIN..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 bg-card border-gray-200 dark:border-gray-850 rounded-xl"
            />
          </div>
          <Badge variant="outline" className="text-xs font-semibold py-1 px-3">
            {filtered.length} Supplier(s) Found
          </Badge>
        </div>

        {/* Supplier Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading && (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              Loading suppliers directory...
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <Card className="col-span-full border-dashed border-gray-300 dark:border-gray-800 p-12 text-center">
              <Truck className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <h3 className="font-bold text-base">No suppliers found</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {q ? 'No vendors match your search filter.' : 'Click "New Supplier" to register your first supplier contact.'}
              </p>
              {!q && (
                <Button onClick={openNew} disabled={isReadOnly} size="sm" className="mt-4 rounded-xl">
                  <Plus className="w-4 h-4 mr-1" /> Add Supplier
                </Button>
              )}
            </Card>
          )}

          {filtered.map(s => {
            const branchLabel = s.branch_id ? branchMap.get(s.branch_id) || 'Specific Branch' : 'All Branches / Global';
            return (
              <Card key={s.id} className="border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-all rounded-2xl overflow-hidden bg-card">
                <CardHeader className="bg-gray-50/50 dark:bg-gray-950/20 pb-3 border-b border-gray-100 dark:border-gray-850">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base font-bold truncate">{s.name}</CardTitle>
                      <div className="flex items-center gap-1 mt-1">
                        <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-[11px] text-muted-foreground truncate font-medium">
                          {branchLabel}
                        </span>
                      </div>
                    </div>

                    <Badge variant={s.branch_id ? 'secondary' : 'outline'} className="text-[10px] shrink-0">
                      {s.branch_id ? 'Branch' : 'Global'}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-3">
                  {/* Contact Info */}
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {s.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="font-medium text-foreground">{s.phone}</span>
                      </div>
                    )}

                    {s.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="truncate">{s.email}</span>
                      </div>
                    )}

                    {s.gstin && (
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="font-mono">GSTIN: {s.gstin}</span>
                      </div>
                    )}

                    {s.address && (
                      <div className="flex items-start gap-2 pt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{s.address}</span>
                      </div>
                    )}
                  </div>

                  {/* Purchase History Stats */}
                  <div className="bg-gray-50/70 dark:bg-gray-900/30 p-2.5 rounded-xl border border-gray-100 dark:border-gray-850 flex justify-between items-center text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase font-bold">Total Orders</span>
                      <span className="font-bold flex items-center gap-1 mt-0.5">
                        <ShoppingBag className="w-3 h-3 text-primary" /> {s.total_purchases_count || 0} purchases
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-muted-foreground block text-[10px] uppercase font-bold">Total Spend</span>
                      <span className="font-extrabold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                        ₹{(s.total_purchases_amount || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {s.notes && (
                    <p className="text-[11px] text-muted-foreground italic bg-muted/40 p-2 rounded-lg line-clamp-2">
                      "{s.notes}"
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-850">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isReadOnly}
                      onClick={() => openEdit(s)}
                      className="flex-1 rounded-xl h-8 text-xs font-semibold"
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isReadOnly}
                      onClick={() => remove(s)}
                      className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 rounded-xl"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          </div>
          </TabsContent>
          <TabsContent value="catalog" className="space-y-6 m-0">
            <div className="flex items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search items in catalog..."
                  value={catalogQ}
                  onChange={(e) => setCatalogQ(e.target.value)}
                  className="pl-9 bg-card border-gray-200 dark:border-gray-850 rounded-xl"
                />
              </div>
            </div>
            
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px] sticky left-0 bg-card z-10 border-r border-gray-200 dark:border-gray-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Item Name</TableHead>
                    {filtered.map(s => (
                      <TableHead key={s.id} className="min-w-[150px] text-center">{s.name}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.filter(i => !catalogQ || i.name.toLowerCase().includes(catalogQ.toLowerCase())).map(item => {
                    let minPrice = Infinity;
                    let cheapestSupplierId = null;
                    filtered.forEach(s => {
                       const mapping = matrix[s.id]?.[item.id];
                       if (mapping && mapping.price > 0 && mapping.price < minPrice) {
                          minPrice = mapping.price;
                          cheapestSupplierId = s.id;
                       }
                    });

                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium sticky left-0 bg-card z-10 border-r border-gray-200 dark:border-gray-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                          {item.name}
                        </TableCell>
                        {filtered.map(s => {
                          const mapping = matrix[s.id]?.[item.id];
                          const isCheapest = s.id === cheapestSupplierId && mapping;
                          return (
                            <TableCell key={s.id} className={`text-center ${isCheapest ? 'bg-green-50/50 dark:bg-green-900/20' : ''}`}>
                              {mapping ? (
                                <div className="flex flex-col items-center gap-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`font-bold ${isCheapest ? 'text-green-600 dark:text-green-400' : ''}`}>
                                      ₹{mapping.price || 0}
                                    </span>
                                    {mapping.isPreferred && <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 shrink-0" />}
                                  </div>
                                  <div className="flex flex-col items-center text-[10px] text-muted-foreground gap-0.5">
                                    {mapping.vendorCode && <span>Code: {mapping.vendorCode}</span>}
                                    {mapping.leadTime > 0 && <span>Lead: {mapping.leadTime}d</span>}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground/30">-</span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                  {items.filter(i => !catalogQ || i.name.toLowerCase().includes(catalogQ.toLowerCase())).length === 0 && (
                    <TableRow>
                       <TableCell colSpan={filtered.length + 1} className="text-center py-8 text-muted-foreground">
                         No items found in catalog.
                       </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

      {/* Add / Edit Supplier Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-card rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Truck className="w-5 h-5 text-primary" />
              {editing ? 'Edit Supplier Details' : 'Register New Supplier'}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="details" className="w-full mt-2">
            <TabsList className="w-full grid grid-cols-2 mb-4">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="items" disabled={!editing}>Assigned Items</TabsTrigger>
            </TabsList>
            
            <TabsContent value="details" className="space-y-3.5 focus-visible:outline-none">
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Supplier / Company Name *</Label>
                <Input
                  placeholder="e.g. Fresh Produce Co."
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 bg-card rounded-xl"
                />
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Branch Allocation</Label>
                <Select
                  value={form.branch_id}
                  onValueChange={(val) => setForm({ ...form, branch_id: val })}
                >
                  <SelectTrigger className="mt-1 bg-card rounded-xl">
                    <SelectValue placeholder="Select Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches (Global Supplier)</SelectItem>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Phone Number</Label>
                  <Input
                    placeholder="+91 98765 43210"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="mt-1 bg-card rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email</Label>
                  <Input
                    placeholder="vendor@company.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="mt-1 bg-card rounded-xl"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">GSTIN Number</Label>
                <Input
                  placeholder="22AAAAA0000A1Z5"
                  value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                  className="mt-1 font-mono uppercase bg-card rounded-xl"
                />
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Address</Label>
                <Textarea
                  placeholder="Vendor office or warehouse address..."
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  rows={2}
                  className="mt-1 bg-card rounded-xl"
                />
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes / Credit Terms</Label>
                <Textarea
                  placeholder="e.g. 30-day payment terms, main dairy supplier..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="mt-1 bg-card rounded-xl"
                />
              </div>
              
              <div className="flex justify-end gap-2 pt-3 border-t mt-4">
                <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
                <Button onClick={save} className="rounded-xl">Save Supplier</Button>
              </div>
            </TabsContent>
            
            <TabsContent value="items" className="space-y-4 focus-visible:outline-none">
              {editing && (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Search items..." 
                      value={itemSearch} 
                      onChange={(e) => setItemSearch(e.target.value)} 
                      className="pl-9 bg-card rounded-xl"
                    />
                  </div>
                  <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1">
                    {items.filter(i => i.name.toLowerCase().includes(itemSearch.toLowerCase())).map(item => {
                       const isAssigned = !!matrix[editing.id]?.[item.id];
                       const mapping = matrix[editing.id]?.[item.id] || {};
                       
                       return (
                         <div key={item.id} className="p-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50/50 dark:bg-gray-900/30 flex flex-col gap-3">
                           <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2">
                               <Checkbox 
                                 checked={isAssigned} 
                                 onCheckedChange={() => toggleItemAssigned(editing.id, item.id)} 
                               />
                               <span className="font-semibold text-sm">{item.name}</span>
                             </div>
                             {isAssigned && (
                               <Button 
                                 variant="ghost" 
                                 size="sm" 
                                 onClick={() => togglePreferred(editing.id, item.id)}
                                 className={`h-7 px-2 text-xs ${mapping.isPreferred ? 'text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20 hover:text-yellow-600' : 'text-muted-foreground'}`}
                               >
                                 <Star className={`w-3.5 h-3.5 mr-1 ${mapping.isPreferred ? 'fill-yellow-500' : ''}`} />
                                 Preferred
                               </Button>
                             )}
                           </div>
                           
                           {isAssigned && (
                             <div className="grid grid-cols-3 gap-2">
                               <div>
                                 <Label className="text-[10px] uppercase text-muted-foreground">Code</Label>
                                 <Input 
                                   value={mapping.vendorCode || ''} 
                                   onChange={e => updateMapping(editing.id, item.id, 'vendorCode', e.target.value)}
                                   className="h-7 text-xs rounded-lg mt-1"
                                   placeholder="e.g. V-123"
                                 />
                               </div>
                               <div>
                                 <Label className="text-[10px] uppercase text-muted-foreground">Price (₹)</Label>
                                 <Input 
                                   type="number"
                                   value={mapping.price || ''} 
                                   onChange={e => updateMapping(editing.id, item.id, 'price', Number(e.target.value))}
                                   className="h-7 text-xs rounded-lg mt-1"
                                   placeholder="0.00"
                                 />
                               </div>
                               <div>
                                 <Label className="text-[10px] uppercase text-muted-foreground">Lead (Days)</Label>
                                 <Input 
                                   type="number"
                                   value={mapping.leadTime || ''} 
                                   onChange={e => updateMapping(editing.id, item.id, 'leadTime', Number(e.target.value))}
                                   className="h-7 text-xs rounded-lg mt-1"
                                   placeholder="e.g. 2"
                                 />
                               </div>
                             </div>
                           )}
                         </div>
                       );
                    })}
                    {items.filter(i => i.name.toLowerCase().includes(itemSearch.toLowerCase())).length === 0 && (
                      <div className="text-center py-4 text-muted-foreground text-sm">No items found.</div>
                    )}
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      </div>
    </div>
  );
};

export default Suppliers;
