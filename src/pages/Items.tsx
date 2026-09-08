import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { Package, Search, Plus, Minus, GripVertical, Eye, EyeOff, LayoutGrid, List, CheckSquare, Square, Trash2, Tag, ToggleLeft, Flame, ArrowUpDown, Copy, Download, Clock } from 'lucide-react';
import { AddItemDialog } from '@/components/AddItemDialog';
import { BulkAddItemDialog } from '@/components/BulkAddItemDialog';
import { AiMenuImportDialog } from '@/components/AiMenuImportDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { EditItemDialog } from '@/components/EditItemDialog';
import { ItemCategoryManagement } from '@/components/ItemCategoryManagement';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';
import { getShortUnit, formatQuantityWithUnit } from '@/utils/timeUtils';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { useBranchSettings } from '@/hooks/useBranchSettings';
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
  unlimited_stock?: boolean;
  quantity_step?: number;
  quick_chips?: string[];
  display_order?: number;
  branch_id?: string | null;
  // Aggregated meta for All-Branches view
  __branchCount?: number;
  __branchBreakdown?: Array<{ branch_id: string | null; stock: number }>;
  price_zomato?: number;
  price_swiggy?: number;
  is_veg?: boolean;
  available_from?: string | null;
  available_until?: string | null;
}

const Items: React.FC = () => {
  const { profile , adminProfileId } = useAuth();
  const { t } = useTranslation();
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
  const [stockFilter, setStockFilter] = useState<'all' | 'limited' | 'unlimited'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'default' | 'name' | 'price_asc' | 'price_desc' | 'stock_low' | 'newest' | 'bestseller'>('default');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [vegFilter, setVegFilter] = useState<'all' | 'veg' | 'nonveg'>('all');

  // Inline price editing
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState('');

  // Bulk selection state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'category' | 'toggle' | null>(null);
  const [bulkCategory, setBulkCategory] = useState('');
  const isBulkMode = selectedItems.size > 0;

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

  // Bestseller tracking
  const [topSellerIds, setTopSellerIds] = useState<Set<string>>(new Set());

  // Enable real-time updates
  useRealTimeUpdates();

  useEffect(() => {
    if (adminId) {
      fetchItems();
      fetchCategories();
      fetchTopSellers();
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

  
  // Fetch top 5 selling items from bill_items (last 30 days)
  const fetchTopSellers = async () => {
    if (!adminId) return;
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data } = await supabase
        .from('bill_items')
        .select('item_id, quantity, bills!inner(admin_id, is_deleted, created_at)')
        .eq('bills.admin_id', adminId)
        .eq('bills.is_deleted', false)
        .gte('bills.created_at', thirtyDaysAgo.toISOString())
        .not('item_id', 'is', null);

      if (data && data.length > 0) {
        const salesMap = new Map<string, number>();
        data.forEach((row: any) => {
          if (row.item_id) {
            salesMap.set(row.item_id, (salesMap.get(row.item_id) || 0) + Number(row.quantity));
          }
        });
        const sorted = [...salesMap.entries()].sort((a, b) => b[1] - a[1]);
        setTopSellerIds(new Set(sorted.slice(0, 5).map(([id]) => id)));
      }
    } catch (e) {
      console.error('Failed to fetch top sellers:', e);
    }
  };

  const fetchItems = async () => {
    if (!adminId) return;
    let loadedFromCache = false;
    try {
      const { offlineManager } = await import('@/utils/offlineManager');
      const cachedItems = await offlineManager.getCachedItems(adminId, operatingBranchId);
      if (cachedItems && cachedItems.length > 0) {
        const sortedData = cachedItems.sort((a: any, b: any) => {
          const orderA = a.display_order ?? 9999;
          const orderB = b.display_order ?? 9999;
          if (orderA !== orderB) return orderA - orderB;
          return (a.name || '').localeCompare(b.name || '');
        });
        setItems(sortedData as Item[]);
        loadedFromCache = true;
        setLoading(false);
      }

      // Branch-scoped fetch: filter by branch_id (null = All Branches view)
      let query = supabase.from('items').select('*').eq('admin_id', adminId);
      if (branchFilterId) {
        query = query.eq('branch_id', branchFilterId);
      }

      const { data, error } = await query.order('name');

      if (!error && data) {
        const sortedData = data.sort((a: any, b: any) => {
          const orderA = a.display_order ?? 9999;
          const orderB = b.display_order ?? 9999;
          if (orderA !== orderB) return orderA - orderB;
          return (a.name || '').localeCompare(b.name || '');
        });

        const mappedItems = sortedData.map((i: any) => ({
          ...i,
          image_url: i.image_url ? getCDNUrl(i.image_url) : i.image_url
        }));

        setItems(mappedItems as Item[]);
        await offlineManager.cacheItems(mappedItems);
      }
    } catch (error) {
      console.warn('Error fetching items from network (offline fallback active):', error);
      if (!loadedFromCache) {
        toast({
          title: "Offline Mode",
          description: "Connect to internet to refresh items list",
          variant: "destructive",
        });
      }
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
    const activeItems = items.filter(i => i.is_active);
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
      const { offlineManager } = await import('@/utils/offlineManager');
      const cachedCats = await offlineManager.getCachedCategories(adminId, operatingBranchId);
      if (cachedCats && cachedCats.length > 0) {
        setCategories(cachedCats.map((c: any) => c.name));
      }

      let q = supabase
        .from('item_categories')
        .select('name')
        .eq('admin_id', adminId)
        .eq('is_deleted', false);
      if (branchFilterId) q = q.eq('branch_id', branchFilterId);
      const { data, error } = await q.order('name');

      if (!error && data) {
        let categoryNames = data.map(cat => cat.name);

        if (profile?.user_id) {
          const cachedDisplay = await offlineManager.getCachedDisplaySettings(profile.user_id);
          const categoryOrder = cachedDisplay?.category_order;
          if (categoryOrder && categoryOrder.length > 0) {
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
      }
    } catch (error) {
      console.warn('Error fetching categories (offline mode):', error);
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
    // Stock type filter
    if (stockFilter === 'unlimited') {
      filtered = filtered.filter(item => item.unlimited_stock);
    } else if (stockFilter === 'limited') {
      filtered = filtered.filter(item => !item.unlimited_stock);
    }

    // Veg / Non-Veg filter
    if (vegFilter === 'veg') {
      filtered = filtered.filter(item => item.is_veg !== false);
    } else if (vegFilter === 'nonveg') {
      filtered = filtered.filter(item => item.is_veg === false);
    }

    // Sort
    if (sortBy !== 'default') {
      filtered = [...filtered].sort((a, b) => {
        switch (sortBy) {
          case 'name': return (a.name || '').localeCompare(b.name || '');
          case 'price_asc': return (a.price || 0) - (b.price || 0);
          case 'price_desc': return (b.price || 0) - (a.price || 0);
          case 'stock_low': {
            const sa = a.unlimited_stock ? Infinity : (a.stock_quantity ?? Infinity);
            const sb = b.unlimited_stock ? Infinity : (b.stock_quantity ?? Infinity);
            return sa - sb;
          }
          case 'newest': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          case 'bestseller': {
            const aTop = topSellerIds.has(a.id) ? 0 : 1;
            const bTop = topSellerIds.has(b.id) ? 0 : 1;
            return aTop - bTop;
          }
          default: return 0;
        }
      });
    }
    
    return filtered;
  }, [items, searchTerm, selectedCategory, isAllBranchesView, operatingBranchId, stockFilter, vegFilter, sortBy, topSellerIds]);

  const handleItemAdded = () => {
    fetchItems();
  };

  // Duplicate item
  const duplicateItem = async (item: Item) => {
    try {
      const { id, created_at, updated_at, __branchCount, __branchBreakdown, ...rest } = item as any;
      const newItem = {
        ...rest,
        name: `${item.name} (Copy)`,
        display_order: null,
      };
      const { error } = await supabase.from('items').insert(newItem);
      if (error) throw error;
      toast({ title: 'Duplicated', description: `"${item.name}" copied successfully` });
      fetchItems();
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to duplicate item', variant: 'destructive' });
    }
  };

  // Export menu as CSV
  const exportMenu = () => {
    const exportItems = filteredItems.filter(i => i.is_active);
    if (exportItems.length === 0) {
      toast({ title: 'No items', description: 'No active items to export', variant: 'destructive' });
      return;
    }
    const headers = ['Name', 'Category', 'Price', 'Veg/Non-Veg', 'Stock', 'Unit', 'Purchase Rate', 'Margin %'];
    const rows = exportItems.map(item => [
      item.name,
      item.category || '',
      item.price?.toFixed(2) || '0',
      item.is_veg !== false ? 'Veg' : 'Non-Veg',
      item.unlimited_stock ? 'Unlimited' : (item.stock_quantity?.toString() || ''),
      item.unit || 'pcs',
      item.purchase_rate?.toFixed(2) || '',
      getMargin(item) !== null ? `${getMargin(item)}%` : '',
    ]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `menu_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast({ title: 'Exported', description: `${exportItems.length} items exported to CSV` });
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
      const { offlineManager } = await import('@/utils/offlineManager');
        await offlineManager.queueWrite({
          table: 'items',
          operation: 'DELETE',
          data: { id: itemToDelete.id }
        });
        const targetAdminId = profile?.role === 'admin' ? profile.id : (profile?.admin_id || '');
        const cachedItems = await offlineManager.getCachedItems(targetAdminId, operatingBranchId);
        if (cachedItems) {
          await offlineManager.cacheItems(cachedItems.filter((i: any) => i.id !== itemToDelete.id));
        }

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
        const { offlineManager } = await import('@/utils/offlineManager');
        await offlineManager.queueWrite({
          table: 'items',
          operation: 'UPDATE',
          data: { id: itemToToggle.id, is_active: newStatus }
        });
        const targetAdminId = profile?.role === 'admin' ? profile.id : (profile?.admin_id || '');
        const cachedItems = await offlineManager.getCachedItems(targetAdminId, operatingBranchId);
        if (cachedItems) {
          const newItems = cachedItems.map((i: any) => i.id === itemToToggle.id ? { ...i, is_active: newStatus } : i);
          await offlineManager.cacheItems(newItems);
        }

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

  // Bulk selection helpers
  const toggleItemSelect = (id: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllVisible = (itemsList: Item[]) => {
    const allIds = itemsList.map(i => i.id);
    const allSelected = allIds.every(id => selectedItems.has(id));
    if (allSelected) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(allIds));
    }
  };

  const clearSelection = () => setSelectedItems(new Set());

  // Bulk actions
  const handleBulkToggleActive = async (setActive: boolean) => {
    try {
      const ids = Array.from(selectedItems);
      const { error } = await supabase
        .from('items')
        .update({ is_active: setActive })
        .in('id', ids);
      if (error) throw error;
      toast({ title: 'Success', description: `${ids.length} items ${setActive ? 'activated' : 'deactivated'}` });
      setItems(prev => prev.map(item => selectedItems.has(item.id) ? { ...item, is_active: setActive } : item));
      clearSelection();
    } catch (e) {
      toast({ title: 'Error', description: 'Bulk update failed', variant: 'destructive' });
    }
  };

  const handleBulkCategoryChange = async (category: string) => {
    try {
      const ids = Array.from(selectedItems);
      const { error } = await supabase
        .from('items')
        .update({ category })
        .in('id', ids);
      if (error) throw error;
      toast({ title: 'Success', description: `${ids.length} items moved to "${category}"` });
      setItems(prev => prev.map(item => selectedItems.has(item.id) ? { ...item, category } : item));
      clearSelection();
      setBulkAction(null);
    } catch (e) {
      toast({ title: 'Error', description: 'Bulk category change failed', variant: 'destructive' });
    }
  };

  const handleBulkDelete = async () => {
    try {
      const ids = Array.from(selectedItems);
        const { offlineManager } = await import('@/utils/offlineManager');
        for (const id of ids) {
          await offlineManager.queueWrite({ table: 'items', operation: 'DELETE', data: { id } });
        }
        const targetAdminId = profile?.role === 'admin' ? profile.id : (profile?.admin_id || '');
        const cachedItems = await offlineManager.getCachedItems(targetAdminId, operatingBranchId);
        if (cachedItems) {
          await offlineManager.cacheItems(cachedItems.filter((i: any) => !ids.includes(i.id)));
        }
      toast({ title: 'Success', description: `${ids.length} items deleted permanently` });
      setItems(prev => prev.filter(item => !selectedItems.has(item.id)));
      clearSelection();
    } catch (e) {
      toast({ title: 'Error', description: 'Bulk delete failed', variant: 'destructive' });
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

  // Quick inline stock adjustment
  const quickStockAdjust = async (item: Item, delta: number) => {
    const newStock = Math.max(0, (item.stock_quantity || 0) + delta);
    try {
      const { error } = await supabase
        .from('items')
        .update({ stock_quantity: newStock })
        .eq('id', item.id);
      if (error) throw error;
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, stock_quantity: newStock } : i));
    } catch (e) {
      toast({ title: 'Error', description: 'Stock update failed', variant: 'destructive' });
    }
  };

  // Profit margin calculator
  const getMargin = (item: Item) => {
    if (!item.purchase_rate || item.purchase_rate <= 0 || !item.price) return null;
    return Math.round(((item.price - item.purchase_rate) / item.price) * 100);
  };

  // Quick inline price update
  const startPriceEdit = (item: Item) => {
    if (profile?.role !== 'admin' || isAllBranchesView) return;
    setEditingPriceId(item.id);
    setEditingPriceValue(item.price.toString());
  };

  const savePriceEdit = async (itemId: string) => {
    const newPrice = parseFloat(editingPriceValue);
    if (isNaN(newPrice) || newPrice < 0) {
      setEditingPriceId(null);
      return;
    }
    try {
      const { error } = await supabase
        .from('items')
        .update({ price: newPrice })
        .eq('id', itemId);
      if (error) throw error;
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, price: newPrice } : i));
      toast({ title: 'Price updated', description: `New price: ₹${newPrice}` });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to update price', variant: 'destructive' });
    }
    setEditingPriceId(null);
  };

  // Check if item is currently available based on schedule
  const isItemAvailableNow = (item: Item) => {
    if (!item.available_from && !item.available_until) return true; // Always available
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (item.available_from && item.available_until) {
      if (item.available_from <= item.available_until) {
        return currentTime >= item.available_from && currentTime <= item.available_until;
      } else {
        // Overnight schedule (e.g., 22:00 to 06:00)
        return currentTime >= item.available_from || currentTime <= item.available_until;
      }
    }
    if (item.available_from) return currentTime >= item.available_from;
    if (item.available_until) return currentTime <= item.available_until;
    return true;
  };

  // Format schedule for display
  const formatSchedule = (item: Item) => {
    if (!item.available_from && !item.available_until) return null;
    const fmt = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    };
    if (item.available_from && item.available_until) return `${fmt(item.available_from)} - ${fmt(item.available_until)}`;
    if (item.available_from) return `From ${fmt(item.available_from)}`;
    return `Until ${fmt(item.available_until!)}`;
  };

  const getCategoryCount = (category: string) => {
    return items.filter(item => item.category === category).length;
  };

  // Helper to check if item has low stock based on minimum_stock_alert
  const isLowStock = (item: Item) => {
    if (item.unlimited_stock) return false;
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
      className={`overflow-hidden hover:shadow-md transition-all relative ${selectedItems.has(item.id) ? 'ring-2 ring-primary' : ''} ${isLowStock(item) ? 'border-2 border-orange-500 dark:border-orange-400' : 'border-muted'} ${profile?.role === 'admin' && !isInactive ? 'cursor-grab active:cursor-grabbing' : ''} ${isReordering ? 'opacity-50' : ''} ${isInactive ? 'bg-muted/30' : ''}`}
    >
      <div className={`flex flex-col h-full ${isInactive ? 'opacity-75' : ''}`}>
        {/* Bulk Select Checkbox */}
        {profile?.role === 'admin' && (
          <div className="absolute top-1 left-1 z-10">
            <button
              onClick={(e) => { e.stopPropagation(); toggleItemSelect(item.id); }}
              className={`w-5 h-5 rounded flex items-center justify-center transition-all ${selectedItems.has(item.id) ? 'bg-primary text-primary-foreground shadow-md' : 'bg-background/80 backdrop-blur-sm border border-border/50 text-muted-foreground hover:border-primary/50'}`}
            >
              {selectedItems.has(item.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}

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
              className={`h-6 w-6 p-0 flex items-center justify-center ${item.is_active ? 'hover:bg-red-50 hover:text-red-600 hover:border-red-200' : 'bg-green-600 hover:bg-green-700 text-white'}`}
              onClick={(e) => confirmToggle(item, e)}
              title={item.is_active ? 'Hide' : 'Show'}
            >
              {item.is_active ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
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
            {topSellerIds.has(item.id) && !isInactive && (
              <Badge className={`absolute top-1 ${isLowStock(item) ? 'right-20' : 'right-1'} bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[9px] px-1.5 py-0.5 flex items-center gap-0.5`}>
                <Flame className="w-2.5 h-2.5" /> Bestseller
              </Badge>
            )}
          </div>
        )}

        <div className="p-2 sm:p-3 flex flex-col flex-1 gap-1.5">
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-sm border-2 flex-shrink-0 ${item.is_veg !== false ? 'border-green-600 bg-green-500' : 'border-red-600 bg-red-500'}`} title={item.is_veg !== false ? 'Vegetarian' : 'Non-Vegetarian'} />
              <h4 className="font-semibold text-sm leading-tight line-clamp-1" title={item.name}>{item.name}</h4>
              {topSellerIds.has(item.id) && !item.image_url && !item.video_url && (
                <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[8px] px-1 py-0 h-3.5 flex-shrink-0 flex items-center gap-0.5">
                  <Flame className="w-2 h-2" /> Top
                </Badge>
              )}
            </div>
            <div className="flex justify-between items-start mt-0.5">
              <Badge variant="outline" className="text-[10px] h-4 px-1 rounded bg-muted/50 font-normal">
                {item.category || 'No Cat'}
              </Badge>
              {getMargin(item) !== null && (
                <span className={`text-[9px] font-medium px-1 rounded ${getMargin(item)! >= 50 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20' : getMargin(item)! >= 30 ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/20' : 'text-orange-600 bg-orange-50 dark:bg-orange-950/20'}`}>
                  {getMargin(item)}% margin
                </span>
              )}
            </div>
            {formatSchedule(item) && (
              <div className={`flex items-center gap-1 mt-0.5 text-[9px] font-medium ${isItemAvailableNow(item) ? 'text-blue-600' : 'text-red-500'}`}>
                <Clock className="w-2.5 h-2.5" />
                {formatSchedule(item)}
                {!isItemAvailableNow(item) && <span className="text-red-500">(Closed)</span>}
              </div>
            )}
          </div>

          <div className="mt-auto pt-1 flex items-end justify-between">
            <div>
              {editingPriceId === item.id ? (
                <div className="flex items-center gap-1">
                  <span className="font-bold text-base text-primary">₹</span>
                  <input
                    type="number"
                    value={editingPriceValue}
                    onChange={e => setEditingPriceValue(e.target.value)}
                    onBlur={() => savePriceEdit(item.id)}
                    onKeyDown={e => { if (e.key === 'Enter') savePriceEdit(item.id); if (e.key === 'Escape') setEditingPriceId(null); }}
                    autoFocus
                    className="w-16 h-6 text-base font-bold text-primary bg-primary/5 border border-primary/30 rounded px-1 outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              ) : (
                <span
                  className={`font-bold text-base block leading-none ${isInactive ? 'text-muted-foreground' : 'text-primary'} ${profile?.role === 'admin' && !isAllBranchesView ? 'cursor-pointer hover:underline decoration-dashed underline-offset-2' : ''}`}
                  onClick={() => startPriceEdit(item)}
                  title={profile?.role === 'admin' ? 'Click to edit price' : undefined}
                >
                  ₹{item.price.toFixed(0)}
                  <span className={`text-base ${isInactive ? '' : 'text-primary'}`}>
                    /{formatQuantityWithUnit(item.base_value || 1, item.unit)}
                  </span>
                </span>
              )}
              {(item.price_zomato || item.price_swiggy) && (
                <div className="flex gap-1.5 text-[10px] text-muted-foreground mt-1">
                  {item.price_zomato && <span className="bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 px-1 rounded font-medium border border-red-100 dark:border-red-900/30">Z: ₹{item.price_zomato}</span>}
                  {item.price_swiggy && <span className="bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 px-1 rounded font-medium border border-orange-100 dark:border-orange-900/30">S: ₹{item.price_swiggy}</span>}
                </div>
              )}
              {item.unlimited_stock ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                  <span className="text-sm">∞</span> Unlimited
                </span>
              ) : item.stock_quantity !== null && item.stock_quantity !== undefined ? (
                <div className="flex items-center gap-1">
                  {profile?.role === 'admin' && !isInactive && (
                    <button onClick={(e) => { e.stopPropagation(); quickStockAdjust(item, -1); }} className="w-4 h-4 rounded bg-muted hover:bg-red-100 dark:hover:bg-red-900/30 flex items-center justify-center text-muted-foreground hover:text-red-600 transition-colors">
                      <Minus className="w-2.5 h-2.5" />
                    </button>
                  )}
                  <span className={`text-[10px] ${isLowStock(item) ? 'text-orange-500 font-semibold' : 'text-muted-foreground'}`}>
                    Stk: {formatQuantityWithUnit(item.stock_quantity || 0, item.inventory_unit || item.unit)}
                    {isAllBranchesView && item.__branchCount && item.__branchCount > 1 && (
                      <span className="ml-1 text-primary">({item.__branchCount} branches)</span>
                    )}
                  </span>
                  {profile?.role === 'admin' && !isInactive && (
                    <button onClick={(e) => { e.stopPropagation(); quickStockAdjust(item, 1); }} className="w-4 h-4 rounded bg-muted hover:bg-green-100 dark:hover:bg-green-900/30 flex items-center justify-center text-muted-foreground hover:text-green-600 transition-colors">
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              ) : null}
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
                {!isAllBranchesView && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Duplicate" onClick={() => duplicateItem(item)}>
                    <Copy className="w-3.5 h-3.5" />
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

  // Render compact list row for list view
  const renderListRow = (item: Item, isInactive = false) => (
    <div
      key={item.id}
      className={`flex items-center gap-2 px-2.5 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors ${selectedItems.has(item.id) ? 'bg-primary/5 ring-1 ring-primary/30' : ''} ${isInactive ? 'opacity-60' : ''}`}
    >
      {profile?.role === 'admin' && (
        <button
          onClick={() => toggleItemSelect(item.id)}
          className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center ${selectedItems.has(item.id) ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'}`}
        >
          {selectedItems.has(item.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
        </button>
      )}
      <span className={`w-2.5 h-2.5 rounded-sm border-2 flex-shrink-0 ${item.is_veg !== false ? 'border-green-600 bg-green-500' : 'border-red-600 bg-red-500'}`} title={item.is_veg !== false ? 'Vegetarian' : 'Non-Vegetarian'} />
      {item.image_url && (
        <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" loading="lazy" onError={(e) => handleImageError(e, item.image_url)} />
      )}
      {/* Item info — name on first line, meta on second */}
      <div className="flex-1 min-w-0 mr-1">
        <div className="flex items-center gap-1">
          <p className="font-medium text-sm truncate max-w-[120px] sm:max-w-none">{item.name}</p>
          {topSellerIds.has(item.id) && (
            <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[8px] px-1 py-0 h-3.5 flex-shrink-0 flex items-center gap-0.5">
              <Flame className="w-2 h-2" /> Top
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground">{item.category || 'No Cat'}</span>
          {getMargin(item) !== null && (
            <span className={`text-[9px] font-medium px-1 rounded ${getMargin(item)! >= 50 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20' : getMargin(item)! >= 30 ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/20' : 'text-orange-600 bg-orange-50 dark:bg-orange-950/20'}`}>
              {getMargin(item)}%
            </span>
          )}
          {item.unlimited_stock ? (
            <span className="text-[9px] text-emerald-600 font-medium">Unlimited</span>
          ) : item.stock_quantity != null ? (
            <span className={`text-[9px] ${isLowStock(item) ? 'text-orange-500 font-semibold' : 'text-muted-foreground'}`}>
              {formatQuantityWithUnit(item.stock_quantity || 0, item.inventory_unit || item.unit)}
            </span>
          ) : null}
          {formatSchedule(item) && (
            <span className={`text-[9px] font-medium flex items-center gap-0.5 ${isItemAvailableNow(item) ? 'text-blue-500' : 'text-red-500'}`}>
              <Clock className="w-2 h-2" />
              {!isItemAvailableNow(item) && 'Closed'}
            </span>
          )}
        </div>
      </div>
      {/* Price column */}
      <div className="text-right flex-shrink-0 min-w-[45px]">
        {editingPriceId === item.id ? (
          <div className="flex items-center gap-1 justify-end">
            <span className="font-bold text-sm text-primary">₹</span>
            <input
              type="number"
              value={editingPriceValue}
              onChange={e => setEditingPriceValue(e.target.value)}
              onBlur={() => savePriceEdit(item.id)}
              onKeyDown={e => { if (e.key === 'Enter') savePriceEdit(item.id); if (e.key === 'Escape') setEditingPriceId(null); }}
              autoFocus
              className="w-14 h-5 text-sm font-bold text-primary bg-primary/5 border border-primary/30 rounded px-1 outline-none"
            />
          </div>
        ) : (
          <p
            className={`font-bold text-sm text-primary ${profile?.role === 'admin' && !isAllBranchesView ? 'cursor-pointer hover:underline decoration-dashed' : ''}`}
            onClick={() => startPriceEdit(item)}
          >
            ₹{item.price.toFixed(0)}
          </p>
        )}
        {/* Stock +/- buttons moved below price */}
        {item.stock_quantity != null && !item.unlimited_stock && profile?.role === 'admin' && !isInactive && (
          <div className="flex items-center gap-1 justify-end mt-0.5">
            <button onClick={(e) => { e.stopPropagation(); quickStockAdjust(item, -1); }} className="w-4 h-4 rounded bg-muted hover:bg-red-100 dark:hover:bg-red-900/30 flex items-center justify-center text-muted-foreground hover:text-red-600 transition-colors">
              <Minus className="w-2.5 h-2.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); quickStockAdjust(item, 1); }} className="w-4 h-4 rounded bg-muted hover:bg-green-100 dark:hover:bg-green-900/30 flex items-center justify-center text-muted-foreground hover:text-green-600 transition-colors">
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>
        )}
      </div>
      {/* Action buttons */}
      {profile?.role === 'admin' && (
        <div className="flex gap-0.5 flex-shrink-0">
          <Button variant={item.is_active ? 'outline' : 'default'} size="sm" className="h-7 px-1.5 text-[10px]" onClick={(e) => confirmToggle(item, e)} title={item.is_active ? 'Hide item from menu' : 'Show item on menu'}>
            {item.is_active ? <><EyeOff className="w-3 h-3" /></> : <><Eye className="w-3 h-3" /></>}
          </Button>
          {!isAllBranchesView && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Duplicate" onClick={() => duplicateItem(item)}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          )}
          <EditItemDialog item={item} onItemUpdated={handleItemAdded} />
        </div>
      )}
    </div>
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
              {t('nav.items')}{activeBranch ? ` — ${activeBranch.name}` : ''}
            </h1>
            <p className="text-muted-foreground text-[10px] sm:text-xs">
              {isAllBranchesView ? 'Combined view (read-only)' : t('items.manageItems')}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* List/Grid Toggle */}
          <div className="flex bg-muted rounded-lg p-0.5">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <List className="w-4 h-4" />
            </button>
          </div>
          {/* Sort Dropdown */}
          <div className="relative">
            <button onClick={() => setShowSortMenu(!showSortMenu)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${sortBy !== 'default' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
              <ArrowUpDown className="w-3.5 h-3.5" />
              {sortBy === 'default' ? t('common.sort') : sortBy === 'name' ? 'A-Z' : sortBy === 'price_asc' ? 'Price ↑' : sortBy === 'price_desc' ? 'Price ↓' : sortBy === 'stock_low' ? t('items.lowStock') : sortBy === 'newest' ? t('items.sortNewest') : t('items.sortBestseller')}
            </button>
            {showSortMenu && (
              <div className="absolute top-full mt-1 right-0 bg-background border rounded-lg shadow-xl p-1 z-30 min-w-[140px]">
                {([['default', 'Default'], ['name', 'Name A-Z'], ['price_asc', 'Price ↑ Low'], ['price_desc', 'Price ↓ High'], ['stock_low', 'Low Stock First'], ['newest', 'Recently Added'], ['bestseller', 'Bestseller First']] as const).map(([val, label]) => (
                  <button key={val} onClick={() => { setSortBy(val); setShowSortMenu(false); }} className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-muted ${sortBy === val ? 'bg-primary/10 text-primary font-medium' : ''}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Export Button */}
          <button onClick={exportMenu} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Export menu as CSV">
            <Download className="w-3.5 h-3.5" />
            {t('common.export')}
          </button>
          {profile?.role === 'admin' && !isAllBranchesView && adminId && (
            <>
              <ItemCategoryManagement onCategoriesUpdated={handleCategoriesUpdated} />
              <CopyMenuToBranchDialog sourceBranchId={branchFilterId} onCopied={fetchItems} />
              <AiMenuImportDialog branchId={operatingBranchId || null} adminId={adminId} categories={categories} onItemsAdded={handleItemAdded} />
              <BulkAddItemDialog branchId={operatingBranchId || null} adminId={adminId} categories={categories} onItemsAdded={handleItemAdded} />
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
              placeholder={t('items.searchItems')}
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
              {t('common.all')} ({items.length})
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
          <div className="flex gap-1.5">
            <button
              onClick={() => setStockFilter('all')}
              className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors ${stockFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              {t('common.allStock')}
            </button>
            <button
              onClick={() => setStockFilter('unlimited')}
              className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors flex items-center gap-1 ${stockFilter === 'unlimited' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'}`}
            >
              <span className="text-xs">∞</span> {t('common.unlimited')} ({items.filter(i => i.unlimited_stock).length})
            </button>
            <button
              onClick={() => setStockFilter('limited')}
              className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors ${stockFilter === 'limited' ? 'bg-blue-600 text-white' : 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30'}`}
            >
              {t('common.limited')} ({items.filter(i => !i.unlimited_stock).length})
            </button>
          </div>
          {/* Veg / Non-Veg filter */}
          <div className="flex gap-1.5">
            <button
              onClick={() => setVegFilter('all')}
              className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors ${vegFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              {t('common.allType')}
            </button>
            <button
              onClick={() => setVegFilter('veg')}
              className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors flex items-center gap-1 ${vegFilter === 'veg' ? 'bg-green-600 text-white' : 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30'}`}
            >
              <span className="w-2 h-2 rounded-sm border border-green-600 bg-green-500 inline-block" /> {t('common.veg')} ({items.filter(i => i.is_veg !== false).length})
            </button>
            <button
              onClick={() => setVegFilter('nonveg')}
              className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors flex items-center gap-1 ${vegFilter === 'nonveg' ? 'bg-red-600 text-white' : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30'}`}
            >
              <span className="w-2 h-2 rounded-sm border border-red-600 bg-red-500 inline-block" /> {t('common.nonVeg')} ({items.filter(i => i.is_veg === false).length})
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Action Bar */}
      {isBulkMode && profile?.role === 'admin' && (
        <div className="sticky top-0 z-20 mb-4 bg-primary/10 backdrop-blur-md border border-primary/20 rounded-xl p-3 flex flex-wrap items-center gap-2 shadow-lg">
          <div className="flex items-center gap-2 mr-auto">
            <CheckSquare className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">{selectedItems.size} {t('common.selected')}</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection}>{t('common.clear')}</Button>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => handleBulkToggleActive(true)}>
            <Eye className="w-3.5 h-3.5" /> Activate
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => handleBulkToggleActive(false)}>
            <EyeOff className="w-3.5 h-3.5" /> Deactivate
          </Button>
          <div className="relative">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setBulkAction(bulkAction === 'category' ? null : 'category')}>
              <Tag className="w-3.5 h-3.5" /> Change Category
            </Button>
            {bulkAction === 'category' && (
              <div className="absolute top-full mt-1 left-0 bg-background border rounded-lg shadow-xl p-2 z-30 min-w-[160px] max-h-48 overflow-y-auto">
                {categories.map(cat => (
                  <button key={cat} onClick={() => handleBulkCategoryChange(cat)} className="w-full text-left px-3 py-1.5 text-xs rounded hover:bg-muted truncate">
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button variant="destructive" size="sm" className="h-8 text-xs gap-1" onClick={handleBulkDelete}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
        </div>
      )}

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
              ) : viewMode === 'list' ? (
                <div className="border rounded-lg overflow-hidden">
                  {profile?.role === 'admin' && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
                      <button onClick={() => selectAllVisible(activeItems)} className="text-xs text-primary font-medium hover:underline">
                        {activeItems.every(i => selectedItems.has(i.id)) ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                  )}
                  {activeItems.map(item => renderListRow(item, false))}
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
              ) : viewMode === 'list' ? (
                <div className="border rounded-lg overflow-hidden">
                  {profile?.role === 'admin' && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
                      <button onClick={() => selectAllVisible(inactiveItems)} className="text-xs text-primary font-medium hover:underline">
                        {inactiveItems.every(i => selectedItems.has(i.id)) ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                  )}
                  {inactiveItems.map(item => renderListRow(item, true))}
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
