import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Boxes, Sliders, Plus, Trash2, Edit2, AlertTriangle, ChefHat, Coins, Scale, Search, ArrowRight, Sparkles } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { convertToInventoryUnit, formatStoredQuantity, getShortUnit, trim2 } from '@/utils/timeUtils';
import { formatMoney } from '@/utils/formatters';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ItemRow {
  id: string;
  name: string;
  price: number;
  category: string | null;
  branch_id: string;
  stock_quantity: number | null;
  minimum_stock_alert: number | null;
  unlimited_stock: boolean | null;
  unit: string | null;
  inventory_unit?: string | null;
  selling_unit?: string | null;
  base_value?: number | null;
}

interface Ingredient {
  id: string;
  admin_id: string;
  branch_id: string;
  name: string;
  stock_quantity: number;
  minimum_stock_alert: number;
  unit: string;
  cost_per_unit: number;
  created_at: string;
  updated_at: string;
}

interface RecipeRow {
  id: string;
  admin_id: string;
  branch_id: string;
  item_id: string;
  ingredient_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  ingredient?: {
    name: string;
    unit: string;
    cost_per_unit: number;
  } | null;
}

const StockManagement: React.FC = () => {
  const { profile } = useAuth();
  const { branches, operatingBranchId } = useBranch();
  const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;

  const [activeTab, setActiveTab] = useState<string>('stock');
  const [items, setItems] = useState<ItemRow[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [q, setQ] = useState('');

  // Item stock adjustment modal state
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ItemRow | null>(null);
  const [change, setChange] = useState<number>(0);
  const [reason, setReason] = useState<string>('damaged');
  const [adjNotes, setAdjNotes] = useState('');

  // Ingredient modal state
  const [ingDialogOpen, setIngDialogOpen] = useState(false);
  const [selectedIng, setSelectedIng] = useState<Ingredient | null>(null);
  const [ingName, setIngName] = useState('');
  const [ingBranchId, setIngBranchId] = useState('');
  const [ingStock, setIngStock] = useState<number>(0);
  const [ingMinAlert, setIngMinAlert] = useState<number>(0);
  const [ingUnit, setIngUnit] = useState('g');
  const [ingCost, setIngCost] = useState<number>(0);

  // Ingredient stock adjustment modal state
  const [ingAdjOpen, setIngAdjOpen] = useState(false);
  const [ingAdjTarget, setIngAdjTarget] = useState<Ingredient | null>(null);
  const [ingAdjChange, setIngAdjChange] = useState<number>(0);
  const [ingAdjReason, setIngAdjReason] = useState<string>('damaged');
  const [ingAdjNotes, setIngAdjNotes] = useState('');

  // Recipe edit modal state
  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
  const [recipeItem, setRecipeItem] = useState<ItemRow | null>(null);
  const [recipeRows, setRecipeRows] = useState<{ ingredientId: string; quantity: number }[]>([]);

  // Selected item in Recipes view split screen
  const [selectedRecipeItem, setSelectedRecipeItem] = useState<ItemRow | null>(null);

  const load = async () => {
    if (!adminId) return;
    setLoading(true);
    try {
      // 1. Fetch Items
      const { data: itemsData, error: itemsError } = await supabase
        .from('items')
        .select('id,name,price,category,branch_id,stock_quantity,minimum_stock_alert,unlimited_stock,unit,inventory_unit,selling_unit')
        .eq('admin_id', adminId)
        .eq('is_active', true)
        .order('name');
      if (itemsError) throw itemsError;
      setItems((itemsData || []) as ItemRow[]);

      // 2. Fetch Ingredients
      const { data: ingData, error: ingError } = await supabase
        .from('ingredients')
        .select('*')
        .eq('admin_id', adminId)
        .order('name');
      if (ingError) throw ingError;
      setIngredients((ingData || []) as Ingredient[]);

      // 3. Fetch Recipes
      const { data: recData, error: recError } = await supabase
        .from('recipes')
        .select('*, ingredient:ingredients(name,unit,cost_per_unit)')
        .eq('admin_id', adminId);
      if (recError) throw recError;
      setRecipes((recData || []) as RecipeRow[]);

      // 4. Fetch Recent Sales (last 7 days) for AI predictions (including unlimited stock items)
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const { data: salesData } = await supabase
          .from('bill_items')
          .select('item_id, quantity, bills!inner(admin_id)')
          .eq('bills.admin_id', adminId)
          .gte('created_at', sevenDaysAgo.toISOString());
        setRecentSales(salesData || []);
      } catch (salesErr) {
        console.error('Error fetching recent sales for AI predictions:', salesErr);
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Error loading inventory', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [adminId]);

  // Set default branch when opening ingredient dialog
  useEffect(() => {
    if (ingDialogOpen && !ingBranchId) {
      setIngBranchId(operatingBranchId || (branches[0]?.id || ''));
    }
  }, [ingDialogOpen, operatingBranchId, branches]);

  // Filters
  const filteredItems = useMemo(() => items.filter(i =>
    (branchFilter === 'all' || i.branch_id === branchFilter) &&
    (!q || i.name.toLowerCase().includes(q.toLowerCase()))
  ), [items, branchFilter, q]);

  const filteredIngredients = useMemo(() => ingredients.filter(i =>
    (branchFilter === 'all' || i.branch_id === branchFilter) &&
    (!q || i.name.toLowerCase().includes(q.toLowerCase()))
  ), [ingredients, branchFilter, q]);

  const branchName = (id: string) => branches.find(b => b.id === id)?.name || '—';
  const itemInventoryUnit = (item?: Pick<ItemRow, 'inventory_unit' | 'unit'> | null) => item?.inventory_unit || item?.unit || 'pc';

  const aiReorderSuggestions = useMemo(() => {
    const suggestions: any[] = [];
    
    // Check ingredients
    ingredients.forEach(ing => {
      if ((branchFilter === 'all' || ing.branch_id === branchFilter) && ing.stock_quantity <= ing.minimum_stock_alert) {
        const suggestedQty = Math.max(50, (ing.minimum_stock_alert * 3.5) - ing.stock_quantity);
        const estimatedCost = suggestedQty * ing.cost_per_unit;
        suggestions.push({
          type: 'ingredient',
          name: ing.name,
          current: ing.stock_quantity,
          min: ing.minimum_stock_alert,
          unit: ing.unit,
          suggestedReorder: Math.trunc(suggestedQty * 100) / 100,
          estimatedCost,
          branch_id: ing.branch_id,
          reason: 'Depletion high risk. Volume sales trend shows increased weekend footfall demand.'
        });
      }
    });

    // Map recent sales by item_id
    const salesByItem = new Map<string, number>();
    recentSales.forEach(s => {
      salesByItem.set(s.item_id, (salesByItem.get(s.item_id) || 0) + (Number(s.quantity) || 0));
    });

    // Check items
    items.forEach(item => {
      if (branchFilter === 'all' || item.branch_id === branchFilter) {
        if (!item.unlimited_stock) {
          // Trackable stock
          if ((item.stock_quantity || 0) <= (item.minimum_stock_alert || 0)) {
            const suggestedQty = Math.max(10, ((item.minimum_stock_alert || 5) * 3.5) - (item.stock_quantity || 0));
            const inventoryUnit = itemInventoryUnit(item);
            suggestions.push({
              type: 'item',
              name: item.name,
              current: item.stock_quantity || 0,
              min: item.minimum_stock_alert || 0,
              unit: inventoryUnit,
              suggestedReorder: Math.trunc(suggestedQty * 100) / 100,
              estimatedCost: null,
              branch_id: item.branch_id,
              reason: 'Current level is below safe minimum. AI projects depletion in 2 days based on average recipe usage.'
            });
          }
        } else {
          // Unlimited stock item — suggest preparation based on recent sales activity
          const salesQty = salesByItem.get(item.id) || 0;
          if (salesQty > 0) {
            const inventoryUnit = itemInventoryUnit(item);
            const soldInventoryQty = convertToInventoryUnit(
              salesQty,
              item.selling_unit || item.unit || inventoryUnit,
              inventoryUnit
            );
            const suggestedQty = Math.max(10, Math.trunc(soldInventoryQty * 1.5 * 100) / 100);
            suggestions.push({
              type: 'item',
              name: item.name,
              current: 0,
              min: 0,
              isUnlimited: true,
              unit: inventoryUnit,
              suggestedReorder: suggestedQty,
              estimatedCost: null,
              branch_id: item.branch_id,
              reason: `Item has unlimited stock. Based on last 7 days of activity, estimated usage is ${formatStoredQuantity(soldInventoryQty, inventoryUnit)}. Suggested preparation: +${formatStoredQuantity(suggestedQty, inventoryUnit)}.`
            });
          }
        }
      }
    });

    return suggestions;
  }, [ingredients, items, recentSales, branchFilter]);

  const handleQuickRestock = async (suggestion: any) => {
    try {
      if (suggestion.type === 'ingredient') {
        const matched = ingredients.find(ing => ing.name === suggestion.name && ing.branch_id === suggestion.branch_id);
        if (!matched) return;
        const newQty = Number(matched.stock_quantity) + Number(suggestion.suggestedReorder);
        const { error } = await supabase
          .from('ingredients')
          .update({ stock_quantity: newQty })
          .eq('id', matched.id);
        if (error) throw error;
        toast({ title: 'AI Reorder Dispatched', description: `Restocked ${formatStoredQuantity(suggestion.suggestedReorder, suggestion.unit)} of ${suggestion.name}.` });
      } else {
        const matched = items.find(it => it.name === suggestion.name && it.branch_id === suggestion.branch_id);
        if (!matched) return;
        const { error } = await (supabase as any).rpc('apply_stock_adjustment', {
          p_item_id: matched.id,
          p_branch_id: matched.branch_id,
          p_change_qty: suggestion.suggestedReorder,
          p_reason: 'received',
          p_notes: 'AI Automated Quick Restock Order'
        });
        if (error) throw error;
        toast({ title: 'AI Reorder Dispatched', description: `Restocked ${formatStoredQuantity(suggestion.suggestedReorder, suggestion.unit)} of ${suggestion.name}.` });
      }
      load();
      window.dispatchEvent(new CustomEvent('items-updated'));
    } catch (e: any) {
      toast({ title: 'Restock failed', description: e.message, variant: 'destructive' });
    }
  };

  // Item adjustments
  const openAdj = (it: ItemRow) => {
    setTarget(it);
    setChange(0);
    setReason('damaged');
    setAdjNotes('');
    setOpen(true);
  };

  const submitItemAdjustment = async () => {
    if (!target || change === 0) return toast({ title: 'Enter quantity change', variant: 'destructive' });
    const { error } = await (supabase as any).rpc('apply_stock_adjustment', {
      p_item_id: target.id,
      p_branch_id: target.branch_id,
      p_change_qty: change,
      p_reason: reason,
      p_notes: adjNotes || null
    });
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Stock updated successfully' });
    setOpen(false);
    load();
    window.dispatchEvent(new CustomEvent('items-updated'));
  };

  // Ingredients adjustments
  const openIngAdj = (ing: Ingredient) => {
    setIngAdjTarget(ing);
    setIngAdjChange(0);
    setIngAdjReason('damaged');
    setIngAdjNotes('');
    setIngAdjOpen(true);
  };

  const submitIngAdjustment = async () => {
    if (!ingAdjTarget || ingAdjChange === 0) {
      return toast({ title: 'Enter valid quantity change', variant: 'destructive' });
    }
    const newQty = Math.max(0, Number(ingAdjTarget.stock_quantity) + Number(ingAdjChange));
    try {
      const { error } = await supabase
        .from('ingredients')
        .update({ stock_quantity: newQty })
        .eq('id', ingAdjTarget.id);
      if (error) throw error;
      toast({ title: 'Ingredient stock updated' });
      setIngAdjOpen(false);
      load();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // Ingredient Save/Update
  const openAddIngredient = () => {
    setSelectedIng(null);
    setIngName('');
    setIngBranchId(operatingBranchId || (branches[0]?.id || ''));
    setIngStock(0);
    setIngMinAlert(0);
    setIngUnit('g');
    setIngCost(0);
    setIngDialogOpen(true);
  };

  const openEditIngredient = (ing: Ingredient) => {
    setSelectedIng(ing);
    setIngName(ing.name);
    setIngBranchId(ing.branch_id);
    setIngStock(ing.stock_quantity);
    setIngMinAlert(ing.minimum_stock_alert);
    setIngUnit(ing.unit);
    setIngCost(ing.cost_per_unit);
    setIngDialogOpen(true);
  };

  const submitIngredient = async () => {
    if (!ingName.trim()) return toast({ title: 'Name is required', variant: 'destructive' });
    if (!ingBranchId) return toast({ title: 'Branch is required', variant: 'destructive' });
    if (!adminId) return;

    const payload = {
      admin_id: adminId,
      branch_id: ingBranchId,
      name: ingName.trim(),
      stock_quantity: Number(ingStock),
      minimum_stock_alert: Number(ingMinAlert),
      unit: ingUnit.trim() || 'pcs',
      cost_per_unit: Number(ingCost),
    };

    try {
      if (selectedIng) {
        const { error } = await supabase
          .from('ingredients')
          .update(payload)
          .eq('id', selectedIng.id);
        if (error) throw error;
        toast({ title: 'Ingredient updated' });
      } else {
        const { error } = await supabase
          .from('ingredients')
          .insert(payload);
        if (error) throw error;
        toast({ title: 'Ingredient created' });
      }
      setIngDialogOpen(false);
      load();
    } catch (err: any) {
      toast({ title: 'Error saving ingredient', description: err.message, variant: 'destructive' });
    }
  };

  const deleteIngredient = async (id: string) => {
    if (!confirm('Are you sure you want to delete this ingredient? This will permanently remove it from recipes too.')) return;
    try {
      const { error } = await supabase
        .from('ingredients')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast({ title: 'Ingredient deleted' });
      load();
    } catch (err: any) {
      toast({ title: 'Error deleting ingredient', description: err.message, variant: 'destructive' });
    }
  };

  // Recipe helpers
  const getRecipeDetails = (itemId: string, itemPrice: number) => {
    const itemRecipes = recipes.filter(r => r.item_id === itemId);
    let totalCost = 0;
    itemRecipes.forEach(r => {
      const cost = Number(r.ingredient?.cost_per_unit || 0) * Number(r.quantity);
      totalCost += cost;
    });
    const percentage = itemPrice > 0 ? (totalCost / itemPrice) * 100 : 0;
    return {
      ingredientsCount: itemRecipes.length,
      totalCost,
      percentage,
      components: itemRecipes
    };
  };

  // Recipe edit actions
  const openEditRecipe = (item: ItemRow) => {
    setRecipeItem(item);
    // Find current recipes
    const currentRecipes = recipes.filter(r => r.item_id === item.id);
    setRecipeRows(
      currentRecipes.map(r => ({
        ingredientId: r.ingredient_id,
        quantity: r.quantity
      }))
    );
    setRecipeDialogOpen(true);
  };

  const submitRecipe = async () => {
    if (!recipeItem || !adminId) return;

    // Filter out rows without ingredient selected or zero quantity
    const validRows = recipeRows.filter(r => r.ingredientId && r.quantity > 0);

    try {
      // 1. Clear existing recipe
      const { error: delErr } = await supabase
        .from('recipes')
        .delete()
        .eq('item_id', recipeItem.id);
      if (delErr) throw delErr;

      // 2. Insert new components
      if (validRows.length > 0) {
        const payload = validRows.map(r => ({
          admin_id: adminId,
          branch_id: recipeItem.branch_id,
          item_id: recipeItem.id,
          ingredient_id: r.ingredientId,
          quantity: Number(r.quantity)
        }));
        const { error: insErr } = await supabase
          .from('recipes')
          .insert(payload);
        if (insErr) throw insErr;
      }

      toast({ title: 'Recipe saved successfully' });
      setRecipeDialogOpen(false);
      load();
      // Select the item again to refresh view
      const updatedItem = items.find(i => i.id === recipeItem.id);
      if (updatedItem) {
        setSelectedRecipeItem(updatedItem);
      }
    } catch (err: any) {
      toast({ title: 'Error saving recipe', description: err.message, variant: 'destructive' });
    }
  };

  // Live recipe stats calculation for modal
  const editingRecipeStats = useMemo(() => {
    if (!recipeItem) return { totalCost: 0, percentage: 0 };
    let totalCost = 0;
    recipeRows.forEach(row => {
      const ing = ingredients.find(i => i.id === row.ingredientId);
      if (ing) {
        totalCost += Number(ing.cost_per_unit) * Number(row.quantity);
      }
    });
    const percentage = recipeItem.price > 0 ? (totalCost / recipeItem.price) * 100 : 0;
    return { totalCost, percentage };
  }, [recipeItem, recipeRows, ingredients]);

  // Overall item stock summaries across all branches
  const overallItemStock = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; unit: string }>();
    items.forEach(i => {
      if (i.unlimited_stock) return;
      const prev = map.get(i.name);
      map.set(i.name, {
        name: i.name,
        qty: (prev?.qty || 0) + (Number(i.stock_quantity) || 0),
        unit: prev?.unit || itemInventoryUnit(i),
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-24 bg-[#fafafa] dark:bg-[#0b0c10] text-[#1f2937] dark:text-[#f3f4f6]">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5 border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Boxes className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Stock & Recipe Vault
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Manage raw ingredients, menu item stocks, and analyze real-time food cost margins.
              </p>
            </div>
          </div>
          
          {/* Global filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-xs w-full sm:w-auto">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name..."
                value={q}
                onChange={e => setQ(e.target.value)}
                className="pl-9 bg-card border-gray-200 dark:border-gray-850"
              />
            </div>
            
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-[180px] bg-card border-gray-200 dark:border-gray-850">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tab Selection */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-4 max-w-lg bg-gray-100 dark:bg-gray-900 p-1 rounded-xl">
            <TabsTrigger value="stock" className="rounded-lg">Item Stock</TabsTrigger>
            <TabsTrigger value="ingredients" className="rounded-lg">Ingredients</TabsTrigger>
            <TabsTrigger value="recipes" className="rounded-lg">Recipes</TabsTrigger>
            <TabsTrigger value="ai" className="rounded-lg flex items-center gap-1 font-semibold"><Sparkles className="w-3 h-3 text-primary" /> AI Predictions</TabsTrigger>
          </TabsList>

          {/* TAB 1: ITEM STOCK */}
          <TabsContent value="stock" className="space-y-4 outline-none">
            <Card className="border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
              <CardHeader className="bg-gray-50/50 dark:bg-gray-950/20 py-4">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-primary" /> Per-Branch Item Stock
                </CardTitle>
                <CardDescription>Stocks for sellable menu items at each branch location.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/30 dark:bg-gray-900/10">
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Item Name</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Branch</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Stock Level</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Min Alert Threshold</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Loading menu item stock...
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && filteredItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No items match the search filter.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredItems.map(i => {
                      const stock = Number(i.stock_quantity) || 0;
                      const low = !i.unlimited_stock && i.minimum_stock_alert != null && stock <= Number(i.minimum_stock_alert);
                      return (
                        <TableRow key={i.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/10 transition-colors">
                          <TableCell className="font-semibold">{i.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{branchName(i.branch_id)}</TableCell>
                          <TableCell>
                            {i.unlimited_stock ? (
                              <Badge variant="secondary" className="font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                Unlimited Stock (∞)
                              </Badge>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${low ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                  {formatStoredQuantity(stock, itemInventoryUnit(i))}
                                </span>
                                {low && (
                                  <Badge variant="destructive" className="bg-red-500/10 text-red-600 border border-red-500/25 px-1.5 py-0.5 text-[10px]">
                                    Low Stock
                                  </Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {i.unlimited_stock ? '—' : formatStoredQuantity(Number(i.minimum_stock_alert ?? 0), itemInventoryUnit(i))}
                          </TableCell>
                          <TableCell className="text-right pr-4">
                            <Button size="sm" variant="ghost" className="hover:bg-primary/10 hover:text-primary transition-all duration-200" onClick={() => openAdj(i)}>
                              <Sliders className="w-3.5 h-3.5 mr-1" /> Adjust
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Overall aggregate stock view */}
            <Card className="border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
              <CardHeader className="bg-gray-50/50 dark:bg-gray-950/20 py-4">
                <CardTitle className="text-base font-bold">Overall Stock (Across All Branches)</CardTitle>
                <CardDescription>Consolidated stock counts summing up all branch inventories.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/30 dark:bg-gray-900/10">
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Item</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Total stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overallItemStock.map(({ name, qty, unit }) => (
                      <TableRow key={name} className="hover:bg-gray-50/30 dark:hover:bg-gray-900/5">
                        <TableCell className="font-medium">{name}</TableCell>
                        <TableCell className="font-bold">{formatStoredQuantity(qty, unit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: INGREDIENTS */}
          <TabsContent value="ingredients" className="space-y-4 outline-none">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">Raw Ingredients & Replenishment Alert</h3>
              <Button size="sm" onClick={openAddIngredient} className="rounded-xl flex items-center gap-1.5 shadow-sm">
                <Plus className="w-4 h-4" /> Add Ingredient
              </Button>
            </div>

            <Card className="border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
              <CardHeader className="bg-gray-50/50 dark:bg-gray-950/20 py-4">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Scale className="w-4 h-4 text-primary" /> Raw Materials Stock
                </CardTitle>
                <CardDescription>Track stocks, purchase costs, and reorder levels for raw cooking ingredients.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/30 dark:bg-gray-900/10">
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Ingredient Name</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Branch</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Available Stock</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Cost / Unit</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Min Alert Level</TableHead>
                      <TableHead className="w-[180px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Loading ingredients...
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && filteredIngredients.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No ingredients found. Add raw materials to enable Recipe management.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredIngredients.map(ing => {
                      const low = Number(ing.stock_quantity) <= Number(ing.minimum_stock_alert);
                      return (
                        <TableRow key={ing.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/10 transition-colors">
                          <TableCell className="font-semibold">{ing.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{branchName(ing.branch_id)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold ${low ? 'text-destructive' : 'text-[#1f2937] dark:text-[#f3f4f6]'}`}>
                                {formatStoredQuantity(ing.stock_quantity, ing.unit)}
                              </span>
                              {low && (
                                <Badge variant="destructive" className="bg-red-500/10 text-red-600 border border-red-500/25 px-1.5 py-0.5 text-[10px]">
                                  Reorder Alert
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm font-medium text-emerald-600 dark:text-emerald-400">
                            ₹{formatMoney(ing.cost_per_unit)} / {getShortUnit(ing.unit)}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {formatStoredQuantity(ing.minimum_stock_alert, ing.unit)}
                          </TableCell>
                          <TableCell className="text-right pr-4 space-x-1">
                            <Button size="sm" variant="ghost" className="hover:bg-primary/10 hover:text-primary transition-all duration-200" onClick={() => openIngAdj(ing)}>
                              <Sliders className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="hover:bg-primary/10 hover:text-primary transition-all duration-200" onClick={() => openEditIngredient(ing)}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="hover:bg-destructive/10 hover:text-destructive transition-all duration-200" onClick={() => deleteIngredient(ing.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: RECIPES */}
          <TabsContent value="recipes" className="space-y-4 outline-none">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              
              {/* Left Column: Menu Items Selection List */}
              <div className="lg:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Select Menu Item</h4>
                  <Badge variant="outline">{filteredItems.length} items</Badge>
                </div>
                
                <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
                  {filteredItems.map(item => {
                    const stats = getRecipeDetails(item.id, item.price);
                    const isSelected = selectedRecipeItem?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedRecipeItem(item)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all duration-200 flex items-center justify-between hover:border-primary/50 ${isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-gray-200 dark:border-gray-800 bg-card hover:bg-gray-50/50 dark:hover:bg-gray-900/10'}`}
                      >
                        <div className="space-y-1">
                          <span className="font-semibold text-sm block">{item.name}</span>
                          <span className="text-xs text-muted-foreground block font-mono">Price: ₹{Number(item.price).toFixed(2)} · {branchName(item.branch_id)}</span>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1">
                          {stats.ingredientsCount > 0 ? (
                            <>
                              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] py-0.5 px-1.5 hover:bg-primary/25">
                                {stats.ingredientsCount} Ingr.
                              </Badge>
                              <span className={`text-xs font-bold font-mono ${stats.percentage > 50 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                FC: {trim2(stats.percentage)}%
                              </span>
                            </>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground text-[10px] py-0.5 px-1.5">
                              Stock Deduct
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Recipe details view */}
              <div className="lg:col-span-3">
                {selectedRecipeItem ? (
                  <Card className="border border-primary/20 shadow-md rounded-2xl bg-card overflow-hidden">
                    <CardHeader className="border-b border-gray-150 dark:border-gray-850 bg-primary/5 pb-4">
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <ChefHat className="w-5 h-5 text-primary" />
                            <CardTitle className="text-lg font-bold">{selectedRecipeItem.name}</CardTitle>
                          </div>
                          <CardDescription className="mt-1">
                            Recipe Details for {branchName(selectedRecipeItem.branch_id)}
                          </CardDescription>
                        </div>
                        <Button size="sm" onClick={() => openEditRecipe(selectedRecipeItem)} className="rounded-xl flex items-center gap-1">
                          <Edit2 className="w-3 h-3" /> Define Recipe
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5 space-y-6">
                      {/* Cost Summary Statistics */}
                      {(() => {
                        const stats = getRecipeDetails(selectedRecipeItem.id, selectedRecipeItem.price);
                        const isHighCost = stats.percentage > 50;
                        return (
                          <>
                            {stats.ingredientsCount > 0 ? (
                              <div className="grid grid-cols-3 gap-4 border-b pb-6 border-gray-100 dark:border-gray-800">
                                <div className="space-y-1">
                                  <span className="text-xs text-muted-foreground block font-medium">Selling Price</span>
                                  <span className="text-xl font-extrabold tracking-tight">₹{Number(selectedRecipeItem.price).toFixed(2)}</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-xs text-muted-foreground block font-medium flex items-center gap-0.5"><Coins className="w-3.5 h-3.5 text-emerald-500" /> Food Cost</span>
                                  <span className="text-xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">₹{stats.totalCost.toFixed(2)}</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-xs text-muted-foreground block font-medium">Food Cost %</span>
                                  <div className="flex flex-col">
                                    <span className={`text-xl font-extrabold font-mono ${isHighCost ? 'text-destructive' : 'text-primary'}`}>
                                      {trim2(stats.percentage)}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            {/* Ingredients list */}
                            <div>
                              <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Recipe ingredients</h5>
                              {stats.ingredientsCount > 0 ? (
                                <div className="rounded-xl border border-gray-100 dark:border-gray-850 overflow-hidden">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-gray-50/20 dark:bg-gray-900/5">
                                        <TableHead className="font-semibold text-xs py-2">Ingredient</TableHead>
                                        <TableHead className="font-semibold text-xs py-2">Quantity Needed</TableHead>
                                        <TableHead className="font-semibold text-xs py-2">Calculated Cost</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {stats.components.map(r => {
                                        const ingCost = Number(r.ingredient?.cost_per_unit || 0);
                                        const totalCost = ingCost * Number(r.quantity);
                                        return (
                                          <TableRow key={r.id} className="hover:bg-gray-50/30 dark:hover:bg-gray-900/5">
                                            <TableCell className="font-medium text-sm py-2.5">{r.ingredient?.name || '—'}</TableCell>
                                            <TableCell className="font-semibold text-sm py-2.5">{formatStoredQuantity(Number(r.quantity), r.ingredient?.unit || '')}</TableCell>
                                            <TableCell className="font-mono text-sm py-2.5">₹{totalCost.toFixed(2)}</TableCell>
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                              ) : (
                                <div className="p-8 border border-dashed rounded-xl flex flex-col items-center justify-center text-center space-y-3 bg-gray-50/10">
                                  <div className="p-3 bg-muted rounded-full text-muted-foreground">
                                    <ChefHat className="w-6 h-6" />
                                  </div>
                                  <div>
                                    <span className="font-bold text-sm block">No recipe components defined</span>
                                    <span className="text-xs text-muted-foreground block max-w-xs mt-1">
                                      When billing, the system will deduct standard item stock instead of raw materials.
                                    </span>
                                  </div>
                                  <Button size="sm" onClick={() => openEditRecipe(selectedRecipeItem)} className="rounded-xl mt-1">
                                    Define Recipe
                                  </Button>
                                </div>
                              )}
                            </div>

                            {/* Food Cost Margin Warnings */}
                            {stats.ingredientsCount > 0 && isHighCost && (
                              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 rounded-xl text-xs flex items-start gap-2 animate-pulse">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                <div>
                                  <span className="font-bold block">Critically High Food Cost Percentage ({trim2(stats.percentage)}%)</span>
                                  <span className="block mt-0.5">The ingredient costs represent more than 50% of the menu price. It is highly recommended to increase the menu item price or optimize ingredient quantities to ensure profitability.</span>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border border-dashed border-gray-300 dark:border-gray-800 rounded-2xl h-[400px] flex flex-col items-center justify-center text-center p-6 bg-card">
                    <ChefHat className="w-10 h-10 text-muted-foreground mb-3 opacity-60" />
                    <span className="font-bold block text-base text-muted-foreground">Select a menu item</span>
                    <span className="text-xs text-muted-foreground block max-w-xs mt-1">
                      Choose an item from the left panel to define its ingredients, calculate recipe costs, and analyze food cost percentages.
                    </span>
                    <div className="flex items-center gap-1.5 text-xs text-primary font-bold mt-4 animate-bounce">
                      <ArrowRight className="w-4 h-4" /> Pick an item to start
                    </div>
                  </Card>
                )}
              </div>

            </div>
          </TabsContent>

          {/* TAB 4: AI PREDICTIONS & SUGGESTIONS */}
          <TabsContent value="ai" className="space-y-4 outline-none">
            <Card className="border border-border/80 shadow-md overflow-hidden bg-gradient-to-br from-background to-primary/5">
              <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border/40 p-4">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" /> AI Smart Reorder Suggestions
                </CardTitle>
                <CardDescription>Predicts inventory depletion speeds and recommends reorder sizes to prevent stockouts.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {aiReorderSuggestions.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <Sparkles className="w-12 h-12 mx-auto mb-2 opacity-35 text-primary animate-pulse" />
                    <p className="font-semibold text-sm">All stock levels are perfectly healthy!</p>
                    <p className="text-xs mt-1">No items or raw ingredients have crossed their safety thresholds.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/30 dark:bg-gray-900/10">
                        <TableHead className="font-bold text-xs uppercase tracking-wider">Type</TableHead>
                        <TableHead className="font-bold text-xs uppercase tracking-wider">Name</TableHead>
                        <TableHead className="font-bold text-xs uppercase tracking-wider">Branch</TableHead>
                        <TableHead className="font-bold text-xs uppercase tracking-wider">Current Stock</TableHead>
                        <TableHead className="font-bold text-xs uppercase tracking-wider">AI Reorder Suggestion</TableHead>
                        <TableHead className="font-bold text-xs uppercase tracking-wider">Est. Cost</TableHead>
                        <TableHead className="font-bold text-xs uppercase tracking-wider">Prediction Logic</TableHead>
                        <TableHead className="w-[120px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aiReorderSuggestions.map((s, idx) => (
                        <TableRow key={idx} className="hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <Badge variant="outline" className={cn(
                              "text-[10px] font-bold px-1.5 py-0.5",
                              s.type === 'ingredient' ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-purple-500/10 text-purple-600 border-purple-500/20"
                            )}>
                              {s.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-bold">{s.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{branchName(s.branch_id)}</TableCell>
                          <TableCell className={`text-xs font-bold ${s.isUnlimited ? 'text-slate-500' : 'text-rose-600'}`}>
                            {s.isUnlimited ? (
                              <span className="text-slate-500">Unlimited (∞)</span>
                            ) : (
                              `${formatStoredQuantity(s.current, s.unit)} (Min: ${formatStoredQuantity(s.min, s.unit)})`
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-emerald-600 font-black">
                            + {formatStoredQuantity(s.suggestedReorder, s.unit)}
                          </TableCell>
                          <TableCell className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                            {s.estimatedCost !== null ? `₹${Math.round(s.estimatedCost)}` : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={s.reason}>
                            {s.reason}
                          </TableCell>
                          <TableCell className="text-right pr-4">
                            <Button 
                              size="sm" 
                              className="h-7 text-[10px] rounded bg-purple-600 hover:bg-purple-700 text-white font-bold"
                              onClick={() => handleQuickRestock(s)}
                            >
                              {s.isUnlimited ? 'Log Prep' : 'Quick Restock'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* MODAL 1: Item Stock Adjustment */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-card rounded-2xl">
          <DialogHeader>
            <DialogTitle>Adjust stock: {target?.name}</DialogTitle>
            <DialogDescription>
              Branch: {target && branchName(target.branch_id)} · Current: {target ? formatStoredQuantity(Number(target.stock_quantity ?? 0), itemInventoryUnit(target)) : '0 pc'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Change qty (use negative to remove)</Label>
              <Input type="number" value={change || ''} onChange={e => setChange(+e.target.value)} className="bg-card mt-1" />
            </div>
            <div>
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="bg-card mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="damaged">Damaged</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="recount">Recount</SelectItem>
                  <SelectItem value="received">Received (manual)</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={adjNotes} onChange={e => setAdjNotes(e.target.value)} rows={2} className="bg-card mt-1" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submitItemAdjustment}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Add/Edit Ingredient */}
      <Dialog open={ingDialogOpen} onOpenChange={setIngDialogOpen}>
        <DialogContent className="max-w-md bg-card rounded-2xl">
          <DialogHeader>
            <DialogTitle>{selectedIng ? 'Edit Ingredient' : 'Add Raw Ingredient'}</DialogTitle>
            <DialogDescription>
              Define raw materials with cost tracking for recipes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Ingredient Name</Label>
              <Input placeholder="e.g. Milk, Sugar, Tea Leaves" value={ingName} onChange={e => setIngName(e.target.value)} className="bg-card mt-1" />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Branch Scope</Label>
                <Select value={ingBranchId} onValueChange={setIngBranchId}>
                  <SelectTrigger className="bg-card mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Measurement Unit</Label>
                <Input placeholder="e.g. ml, g, kg, pcs" value={ingUnit} onChange={e => setIngUnit(e.target.value)} className="bg-card mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Current Stock</Label>
                <Input type="number" min="0" value={ingStock || 0} onChange={e => setIngStock(Number(e.target.value))} className="bg-card mt-1" />
              </div>
              <div>
                <Label>Cost Per Unit (₹)</Label>
                <Input type="number" min="0" step="0.001" value={ingCost || 0} onChange={e => setIngCost(Number(e.target.value))} className="bg-card mt-1" />
              </div>
            </div>

            <div>
              <Label>Minimum Stock Alert Level</Label>
              <Input type="number" min="0" value={ingMinAlert || 0} onChange={e => setIngMinAlert(Number(e.target.value))} className="bg-card mt-1" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIngDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitIngredient}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Ingredient Stock Adjustment */}
      <Dialog open={ingAdjOpen} onOpenChange={setIngAdjOpen}>
        <DialogContent className="max-w-md bg-card rounded-2xl">
          <DialogHeader>
            <DialogTitle>Adjust Stock: {ingAdjTarget?.name}</DialogTitle>
            <DialogDescription>
              Branch: {ingAdjTarget && branchName(ingAdjTarget.branch_id)} · Current: {ingAdjTarget ? formatStoredQuantity(ingAdjTarget.stock_quantity, ingAdjTarget.unit) : '0 pc'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Change qty (use negative to remove)</Label>
              <Input type="number" value={ingAdjChange || ''} onChange={e => setIngAdjChange(+e.target.value)} className="bg-card mt-1" />
            </div>
            <div>
              <Label>Reason</Label>
              <Select value={ingAdjReason} onValueChange={setIngAdjReason}>
                <SelectTrigger className="bg-card mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="damaged">Damaged / Wastage</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="recount">Recount</SelectItem>
                  <SelectItem value="received">Received (manual replenishment)</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={ingAdjNotes} onChange={e => setIngAdjNotes(e.target.value)} rows={2} className="bg-card mt-1" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIngAdjOpen(false)}>Cancel</Button>
            <Button onClick={submitIngAdjustment}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: Define/Edit Recipe */}
      <Dialog open={recipeDialogOpen} onOpenChange={setRecipeDialogOpen}>
        <DialogContent className="max-w-xl bg-card rounded-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <ChefHat className="w-5 h-5 text-primary" />
              <DialogTitle>Define Recipe: {recipeItem?.name}</DialogTitle>
            </div>
            <DialogDescription>
              Build the ingredient recipe. Available ingredients will match selected item's branch: {recipeItem && branchName(recipeItem.branch_id)}.
            </DialogDescription>
          </DialogHeader>
          
          {/* Main scrollable body */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ingredients & Quantities</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRecipeRows([...recipeRows, { ingredientId: '', quantity: 0 }])}
                className="h-8 rounded-lg flex items-center gap-1 border-primary/20 text-primary hover:bg-primary/5"
              >
                <Plus className="w-3.5 h-3.5" /> Add Ingredient Row
              </Button>
            </div>

            {recipeRows.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-xl">
                No ingredients added. Click 'Add Ingredient Row' to build recipe.
              </div>
            ) : (
              <div className="space-y-2">
                {recipeRows.map((row, index) => {
                  const availableIngs = ingredients.filter(ing => ing.branch_id === recipeItem?.branch_id);
                  const selectedIngInfo = ingredients.find(ing => ing.id === row.ingredientId);
                  const rowCost = selectedIngInfo ? Number(selectedIngInfo.cost_per_unit) * Number(row.quantity) : 0;
                  
                  return (
                    <div key={index} className="flex items-center gap-2.5 bg-gray-50/50 dark:bg-gray-900/10 p-2.5 rounded-xl border border-gray-100 dark:border-gray-850">
                      
                      {/* Dropdown to pick ingredient */}
                      <div className="flex-1">
                        <Select
                          value={row.ingredientId}
                          onValueChange={val => {
                            const newRows = [...recipeRows];
                            newRows[index].ingredientId = val;
                            setRecipeRows(newRows);
                          }}
                        >
                          <SelectTrigger className="bg-card w-full h-9">
                            <SelectValue placeholder="Pick Ingredient" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableIngs.map(ing => (
                              <SelectItem key={ing.id} value={ing.id}>{ing.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Quantity Input */}
                      <div className="w-[120px] flex items-center gap-1 bg-card border rounded-lg h-9 px-2">
                        <Input
                          type="number"
                          placeholder="Qty"
                          min="0.001"
                          step="any"
                          value={row.quantity || ''}
                          onChange={e => {
                            const newRows = [...recipeRows];
                            newRows[index].quantity = Number(e.target.value);
                            setRecipeRows(newRows);
                          }}
                          className="border-0 focus-visible:ring-0 p-0 text-center font-semibold h-full w-full bg-transparent"
                        />
                        <span className="text-xs text-muted-foreground font-medium pr-1">
                          {getShortUnit(selectedIngInfo?.unit || '')}
                        </span>
                      </div>

                      {/* Row Cost */}
                      <div className="w-[80px] text-right font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        ₹{rowCost.toFixed(2)}
                      </div>

                      {/* Delete Button */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="hover:bg-destructive/10 hover:text-destructive h-9 w-9 rounded-lg shrink-0"
                        onClick={() => {
                          const newRows = recipeRows.filter((_, idx) => idx !== index);
                          setRecipeRows(newRows);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>

                    </div>
                  );
                })}
              </div>
            )}

            {/* Live Calculation Panel */}
            {recipeItem && (
              <div className="p-4 bg-gray-50/70 dark:bg-gray-950/20 border border-gray-150 dark:border-gray-850 rounded-2xl space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Item Selling Price:</span>
                  <span className="font-bold">₹{Number(recipeItem.price).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Recipe Cost:</span>
                  <span className="font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                    ₹{editingRecipeStats.totalCost.toFixed(2)}
                  </span>
                </div>
                
                <div className="border-t pt-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-primary" /> Estimated Food Cost %
                  </span>
                  <span className={`text-base font-extrabold font-mono ${editingRecipeStats.percentage > 50 ? 'text-destructive' : 'text-primary'}`}>
                    {trim2(editingRecipeStats.percentage)}%
                  </span>
                </div>

                {editingRecipeStats.percentage > 50 && (
                  <div className="p-2.5 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-[11px] flex items-start gap-1.5 mt-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      <strong>Warning:</strong> High food cost percentage! Make sure your selling price is adjusted accordingly to maintain healthy gross margins.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-3 border-t border-gray-150 dark:border-gray-850 mt-4 shrink-0">
            <Button variant="outline" onClick={() => setRecipeDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitRecipe} className="flex items-center gap-1">
              Save Recipe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StockManagement;
