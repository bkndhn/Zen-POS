import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { Package, Search, Plus, GripVertical, Eye, EyeOff } from 'lucide-react';
import { AddItemDialog } from '@/components/AddItemDialog';
import { BulkAddItemDialog } from '@/components/BulkAddItemDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { EditItemDialog } from '@/components/EditItemDialog';
import { ItemCategoryManagement } from '@/components/ItemCategoryManagement';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';
import { getShortUnit, formatStoredQuantity } from '@/utils/timeUtils';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { AllBranchesReadOnlyBanner } from '@/components/AllBranchesReadOnlyBanner';
import { CopyMenuToBranchDialog } from '@/components/CopyMenuToBranchDialog';
import { getCDNUrl, handleImageError } from '@/utils/imageUtils';

interface Item {
  id: string;
  name: string;
  price: number;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  image_url?: string;
  video_url?: string;
  media_type?: 'image' | 'gif' | 'video';
  description?: string;
  purchase_rate?: number;
  unit?: string;
  inventory_unit?: string;
  selling_unit?: string;
  base_value?: number;
  stock_quantity?: number;
  minimum_stock_alert?: number;
  quantity_step?: number;
  quick_chips?: string[];
  display_order?: number;
  branch_id?: string | null;
  // Aggregated meta for All-Branches view
  __branchCount?: number;
  __branchBreakdown?: Array<{ branch_id: string | null; stock: number }>;
  price_zomato?: number;
  price_swiggy?: number;
}

const Items: React.FC = () => {
  const { profile , adminProfileId } = useAuth();
  const adminId = adminProfileId;
  const { branchFilterId, isAllBranchesView, operatingBranchId, activeBranch } = useBranchScopedQuery(() => {
    if (adminId) {
      fetchItems();
      fetchCategories();
    }
  });
  const [items, setItems] = useState<Item[]>([]);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [isReordering, setIsReordering] = useState(false);

  // Permanent delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Item | null>(null);

  // Toggle availability state
  const [toggleDialogOpen, setToggleDialogOpen] = useState(false);
  const [itemToToggle, setItemToToggle] = useState<Item | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  // Drag and drop refs
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  // Enable real-time updates
  useRealTimeUpdates();

  useEffect(() => {
    if (adminId) {
      fetchItems();
      fetchCategories();
    }
  }, [adminId, branchFilterId]);

  // Listen for real-time update events
  useEffect(() => {
    const handleItemsUpdated = () => {
      console.log('Items updated event received, refreshing...');
      fetchItems();
    };

    const handleCategoriesUpdated = () => {
      console.log('Categories updated event received, refreshing...');
      fetchCategories();
    };

    window.addEventListener('items-updated', handleItemsUpdated);
    window.addEventListener('categories-updated', handleCategoriesUpdated);

    return () => {
      window.removeEventListener('items-updated', handleItemsUpdated);
      window.removeEventListener('categories-updated', handleCategoriesUpdated);
    };
  }, []);

  

  const fetchItems = async () => {
    if (!adminId) return;
    try {
      // Branch-scoped fetch: filter by branch_id (null = All Branches view)
      let query = supabase.from('items').select('*').eq('admin_id', adminId);
      if (branchFilterId) {
        query = query.eq('branch_id', branchFilterId);
      }

      const { data, error } = await query.order('name');

      if (error) throw error;

      // Sort by display_order client-side if the field exists
      const sortedData = (data || []).sort((a: any, b: any) => {
        const orderA = a.display_order ?? 9999;
        const orderB = b.display_order ?? 9999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.name || '').localeCompare(b.name || '');
      });

      const mappedItems = (sortedData || []).map((i: any) => ({
        ...i,
        image_url: i.image_url ? getCDNUrl(i.image_url) : i.image_url
      }));

      setItems(mappedItems as Item[]);
    } catch (error) {
      console.error('Error fetching items:', error);
      toast({
        title: "Error",
        description: "Failed to fetch items",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Drag handlers
  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = async () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }

    setIsReordering(true);
    const itemsCopy = [...activeItems];
    const draggedItem = itemsCopy[dragItem.current];
    itemsCopy.splice(dragItem.current, 1);
    itemsCopy.splice(dragOverItem.current, 0, draggedItem);

    // Update display_order for all reordered items
    const updates = itemsCopy.map((item, idx) => ({
      id: item.id,
      display_order: idx + 1
    }));

    try {
      for (const update of updates) {
        const { error } = await supabase
          .from('items')
          .update({ display_order: update.display_order } as any)
          .eq('id', update.id);
        if (error) throw error;
      }

      toast({
        title: "Order Updated",
        description: "Item order saved successfully",
      });
      fetchItems();
    } catch (error) {
      console.error('Error updating order:', error);
      toast({
        title: "Error",
        description: "Failed to update item order",
        variant: "destructive",
      });
    } finally {
      setIsReordering(false);
      dragItem.current = null;
      dragOverItem.current = null;
    }
  };

  const fetchCategories = async () => {
    try {
      // Fetch categories (scoped to active branch when not All-Branches view)
      let q = supabase
        .from('item_categories')
        .select('name')
        .eq('admin_id', adminId)
        .eq('is_deleted', false);
      if (branchFilterId) q = q.eq('branch_id', branchFilterId);
      const { data, error } = await q.order('name');

      if (error) throw error;

      let categoryNames = (data || []).map(cat => cat.name);

      // Fetch display settings for category order
      if (profile?.user_id) {
        const { data: displayData } = await supabase
          .from('display_settings')
          .select('category_order')
          .eq('user_id', profile.user_id)
          .maybeSingle();

        if (displayData?.category_order && displayData.category_order.length > 0) {
          const categoryOrder = displayData.category_order;
          // Sort categories based on saved order (same logic as Billing page)
          categoryNames = [...categoryNames].sort((a, b) => {
            const indexA = categoryOrder.indexOf(a);
            const indexB = categoryOrder.indexOf(b);
            if (indexA === -1 && indexB === -1) return a.localeCompare(b);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
          });
        }
      }

      setCategories(categoryNames);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const filteredItems = useMemo(() => {
    let filtered = items;
    
    // Filter by branch view unless it's All Branches
    if (!isAllBranchesView && operatingBranchId) {
      filtered = filtered.filter(item => item.branch_id === operatingBranchId);
    }
    
    // Search
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        (item.name && item.name.toLowerCase().includes(lowerSearch)) ||
        (item.category && item.category.toLowerCase().includes(lowerSearch)) ||
        ((item as any).barcode && (item as any).barcode.toLowerCase().includes(lowerSearch))
      );
    }

    // Category filter
    if (selectedCategory && selectedCategory !== 'all') {
      filtered = filtered.filter(item => item.category === selectedCategory);
    }
    
    return filtered;
  }, [items, searchTerm, selectedCategory, isAllBranchesView, operatingBranchId]);

  const handleItemAdded = () => {
    fetchItems();
  };

  const handleCategoriesUpdated = () => {
    fetchCategories();
  };

  const confirmDelete = (item: Item) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handlePermanentDelete = async () => {
    if (!itemToDelete) return;

    try {
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', itemToDelete.id);

      if (error) throw error;

      toast({
        title: "Item Deleted",
        description: `${itemToDelete.name} has been permanently removed.`,
      });

      fetchItems();
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Error",
        description: "Failed to delete item",
        variant: "destructive"
      });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  // Quick toggle availability
  const confirmToggle = (item: Item, e: React.MouseEvent) => {
    e.stopPropagation();
    setItemToToggle(item);
    setToggleDialogOpen(true);
  };

  const handleToggleAvailability = async () => {
    if (!itemToToggle) return;

    setIsToggling(true);
    try {
      const newStatus = !itemToToggle.is_active;
      const { error } = await supabase
        .from('items')
        .update({ is_active: newStatus })
        .eq('id', itemToToggle.id);

      if (error) throw error;

      toast({
        title: newStatus ? "Item Available" : "Item Unavailable",
        description: `${itemToToggle.name} is now ${newStatus ? 'available' : 'unavailable'} on menu.`,
      });

      // Update local state immediately for instant feedback
      setItems(prev => prev.map(item =>
        item.id === itemToToggle.id ? { ...item, is_active: newStatus } : item
      ));
    } catch (error) {
      console.error("Toggle error:", error);
      toast({
        title: "Error",
        description: "Failed to update item availability",
        variant: "destructive"
      });
    } finally {
      setIsToggling(false);
      setToggleDialogOpen(false);
      setItemToToggle(null);
    }
  };

  const activeItems = filteredItems.filter(item => item.is_active);
  const inactiveItems = filteredItems.filter(item => !item.is_active);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading items...</p>
        </div>
      </div>
    );
  }

  const getCategoryCount = (category: string) => {
    return items.filter(item => item.category === category).length;
  };

  // Helper to check if item has low stock based on minimum_stock_alert
  const isLowStock = (item: Item) => {
    if (item.stock_quantity === null || item.stock_quantity === undefined) return false;
    if (item.minimum_stock_alert === null || item.minimum_stock_alert === undefined) return false;
    return item.stock_quantity <= item.minimum_stock_alert;
  };

  // Render item card with quick toggle button
  const renderItemCard = (item: Item, index: number, isInactive = false) => (
    <Card
      key={item.id}
      draggable={profile?.role === 'admin' && !isInactive}
      onDragStart={() => handleDragStart(index)}
      onDragEnter={() => handleDragEnter(index)}
      onDragEnd={handleDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className={`overflow-hidden hover:shadow-md transition-all ${isLowStock(item) ? 'border-2 border-orange-500 dark:border-orange-400' : 'border-muted'} ${profile?.role === 'admin' && !isInactive ? 'cursor-grab active:cursor-grabbing' : ''} ${isReordering ? 'opacity-50' : ''} ${isInactive ? 'bg-muted/30' : ''}`}
    >
      <div className={`flex flex-col h-full ${isInactive ? 'opacity-75' : ''}`}>
        {/* Quick Toggle Button - Always visible at top */}
        {profile?.role === 'admin' && (
          <div className="bg-muted/50 py-1.5 px-2 flex items-center justify-between gap-1">
            {!isInactive && (
              <div className="flex items-center gap-1 text-muted-foreground text-[10px]">
                <GripVertical className="w-3 h-3" />
                <span>Drag</span>
              </div>
            )}
            {isInactive && <div />}
            <Button
              variant={item.is_active ? "outline" : "default"}
              size="sm"
              className={`h-6 px-2 text-[10px] ${item.is_active ? 'hover:bg-red-50 hover:text-red-600 hover:border-red-200' : 'bg-green-600 hover:bg-green-700 text-white'}`}
              onClick={(e) => confirmToggle(item, e)}
            >
              {item.is_active ? (
                <>
                  <EyeOff className="w-3 h-3 mr-1" />
                  Hide
                </>
              ) : (
                <>
                  <Eye className="w-3 h-3 mr-1" />
                  Show
                </>
              )}
            </Button>
          </div>
        )}

        {/* Media display - supports images, GIFs, and videos */}
        {(item.image_url || item.video_url) && (
          <div className={`w-full aspect-[4/3] overflow-hidden bg-muted/20 relative ${isInactive ? 'grayscale' : ''}`}>
            {item.media_type === 'video' ? (
              <video
                src={item.video_url || item.image_url}
                className="w-full h-full object-cover pointer-events-none"
                muted
                loop
                autoPlay
                playsInline
              />
            ) : (
              <img
                src={item.media_type === 'gif' ? (item.video_url || item.image_url) : item.image_url}
                alt={item.name}
                className="w-full h-full object-cover pointer-events-none"
                loading="lazy"
                onError={(e) => handleImageError(e, item.image_url)}
              />
            )}
            {isLowStock(item) && !isInactive && (
              <Badge className="absolute top-1 right-1 bg-orange-500 text-white text-[9px] px-1.5 py-0.5">
                Low Stock
              </Badge>
            )}
          </div>
        )}

        <div className="p-2 sm:p-3 flex flex-col flex-1 gap-1.5">
          <div>
            <h4 className="font-semibold text-sm leading-tight line-clamp-1" title={item.name}>{item.name}</h4>
            <div className="flex justify-between items-start mt-0.5">
              <Badge variant="outline" className="text-[10px] h-4 px-1 rounded bg-muted/50 font-normal">
                {item.category || 'No Cat'}
              </Badge>
            </div>
          </div>

          <div className="mt-auto pt-1 flex items-end justify-between">
            <div>
              <span className={`font-bold text-base block leading-none ${isInactive ? 'text-muted-foreground' : 'text-primary'}`}>
                ₹{item.price.toFixed(0)}
                <span className={`text-base ${isInactive ? '' : 'text-primary'}`}>
                  /{item.base_value && item.base_value > 1 ? item.base_value : ''}{getShortUnit(item.unit)}
                </span>
              </span>
              {(item.price_zomato || item.price_swiggy) && (
                <div className="flex gap-1.5 text-[10px] text-muted-foreground mt-1">
                  {item.price_zomato && <span className="bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 px-1 rounded font-medium border border-red-100 dark:border-red-900/30">Z: ₹{item.price_zomato}</span>}
                  {item.price_swiggy && <span className="bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 px-1 rounded font-medium border border-orange-100 dark:border-orange-900/30">S: ₹{item.price_swiggy}</span>}
                </div>
              )}
              {item.stock_quantity !== null && item.stock_quantity !== undefined && (
                <span className={`text-[10px] ${isLowStock(item) ? 'text-orange-500 font-semibold' : 'text-muted-foreground'}`}>
                  Stk: {formatStoredQuantity(item.stock_quantity, item.inventory_unit || item.unit)}
                  {isAllBranchesView && item.__branchCount && item.__branchCount > 1 && (
                    <span className="ml-1 text-primary">({item.__branchCount} branches)</span>
                  )}
                </span>
              )}
            </div>

            {profile?.role === 'admin' && (
              <div className="flex gap-1">
                {isInactive && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => confirmDelete(item)}
                  >
                    Delete
                  </Button>
                )}
                <EditItemDialog item={item} onItemUpdated={handleItemAdded} />
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="p-3 sm:p-4 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-md shadow-primary/20">
            <Package className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">
              Items{activeBranch ? ` — ${activeBranch.name}` : ''}
            </h1>
            <p className="text-muted-foreground text-[10px] sm:text-xs">
              {isAllBranchesView ? 'Combined view (read-only)' : 'Manage menu items for this branch'}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {profile?.role === 'admin' && !isAllBranchesView && adminId && (
            <>
              <ItemCategoryManagement onCategoriesUpdated={handleCategoriesUpdated} />
              <CopyMenuToBranchDialog sourceBranchId={branchFilterId} onCopied={fetchItems} />
              <BulkAddItemDialog branchId={operatingBranchId || null} adminId={adminId} onItemsAdded={handleItemAdded} />
              <AddItemDialog onItemAdded={handleItemAdded} existingItems={items} />
            </>
          )}
        </div>
      </div>

      <AllBranchesReadOnlyBanner message="Add items by switching to a specific branch." />

      {/* Search and Filter */}
      <Card className="mb-4 bg-card/80 backdrop-blur-sm border-border/50">
        <CardContent className="p-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 h-10 text-sm rounded-xl border-border/50 bg-background/80"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <Button
              variant={selectedCategory === 'all' ? "default" : "outline"}
              onClick={() => setSelectedCategory('all')}
              size="sm"
              className="h-9 text-sm rounded-lg px-4 flex-shrink-0"
            >
              All ({items.length})
            </Button>
            {categories.map(category => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                onClick={() => setSelectedCategory(category)}
                size="sm"
                className="h-9 text-sm rounded-lg px-4 flex-shrink-0 whitespace-nowrap"
              >
                {category} ({getCategoryCount(category)})
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Items Tabs */}
      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-9 mb-4">
          <TabsTrigger value="active" className="text-xs flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
            Active ({activeItems.length})
          </TabsTrigger>
          <TabsTrigger value="inactive" className="text-xs flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
            Inactive ({inactiveItems.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-0">
          <Card className="border-0 shadow-none">
            <CardContent className="p-0">
              {activeItems.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-1">No Active Items</h3>
                  <p className="text-xs text-muted-foreground">
                    {searchTerm || selectedCategory !== 'all' ? 'No items match your search.' : 'Add items to get started.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
                  {activeItems.map((item, index) => renderItemCard(item, index, false))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inactive" className="mt-0">
          <Card className="border-0 shadow-none">
            <CardContent className="p-0">
              {inactiveItems.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-1">No Inactive Items</h3>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
                  {inactiveItems.map((item, index) => renderItemCard(item, index, true))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{itemToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePermanentDelete} className="bg-red-600 hover:bg-red-700">Delete Permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Toggle Availability Confirmation Dialog */}
      <AlertDialog open={toggleDialogOpen} onOpenChange={setToggleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {itemToToggle?.is_active ? 'Make Item Unavailable?' : 'Make Item Available?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {itemToToggle?.is_active
                ? `"${itemToToggle?.name}" will be hidden from the public menu. Customers won't see this item.`
                : `"${itemToToggle?.name}" will be shown on the public menu. Customers will be able to see this item.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isToggling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleAvailability}
              disabled={isToggling}
              className={itemToToggle?.is_active ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}
            >
              {isToggling ? 'Updating...' : (itemToToggle?.is_active ? 'Yes, Hide Item' : 'Yes, Show Item')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Items;
