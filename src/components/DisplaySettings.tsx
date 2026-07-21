import { getAppBaseUrl } from '@/utils/urlUtils';
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, X, GripVertical, MonitorSmartphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';

interface DisplaySettingsProps {
  userId: string;
}

export const DisplaySettings: React.FC<DisplaySettingsProps> = ({ userId }) => {
  const { profile , adminProfileId } = useAuth();
  const adminId = adminProfileId;
  const { operatingBranchId, branches, isAllBranchesView } = useBranch();
  const mainBranchId = branches.find(b => b.is_main)?.id || null;
  const [settings, setSettings] = useState({
    items_per_row: 3,
    category_order: [] as string[]
  });
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [alwaysOnDisplay, setAlwaysOnDisplay] = useState(true);
  const [billingLayout, setBillingLayout] = useState<'grid' | 'list'>('grid');
  const { toast } = useToast();

  useEffect(() => {
    if (userId) {
      fetchSettings();
      fetchCategories();
    }
    const savedAod = localStorage.getItem('hotel_pos_aod_enabled');
    if (savedAod !== null) setAlwaysOnDisplay(savedAod === 'true');
    const savedLayout = localStorage.getItem('billing-view-mode') as 'grid' | 'list';
    if (savedLayout) setBillingLayout(savedLayout);
  }, [userId, operatingBranchId]);

  const fetchSettings = async () => {
    try {
      let { data, error } = await supabase
        .from('display_settings')
        .select('*')
        .eq('user_id', userId)
        .eq('branch_id', operatingBranchId)
        .maybeSingle();

      if (!data && mainBranchId && mainBranchId !== operatingBranchId) {
        const { data: mainRow } = await supabase
          .from('display_settings').select('*')
          .eq('user_id', userId).eq('branch_id', mainBranchId).maybeSingle();
        data = mainRow as any;
      }

      if (error && (error as any).code !== 'PGRST116') throw error;

      setSettings(data ? {
        items_per_row: data.items_per_row ?? 3,
        category_order: data.category_order || []
      } : { items_per_row: 3, category_order: [] });
    } catch (error) {
      console.error('Error fetching display settings:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      let query = supabase
        .from('item_categories')
        .select('name')
        .eq('is_deleted', false);

      // Scope to admin's categories only — never cross-tenant
      if (adminId) query = (query as any).eq('admin_id', adminId);
      if (operatingBranchId) query = (query as any).eq('branch_id', operatingBranchId);

      const { data, error } = await (query as any).order('name');
      if (error) throw error;

      setAvailableCategories(data?.map((cat: any) => cat.name) || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      const { data: existing } = await supabase
        .from('display_settings').select('id')
        .eq('user_id', userId).eq('branch_id', operatingBranchId).maybeSingle();

      const payload = {
        items_per_row: settings.items_per_row,
        category_order: settings.category_order,
      };
      const { error } = existing?.id
        ? await supabase.from('display_settings').update(payload).eq('id', existing.id)
        : await supabase.from('display_settings').insert({ ...payload, user_id: userId, branch_id: operatingBranchId });

      if (error) throw error;

      toast({
        title: "Settings saved",
        description: "Display settings have been updated successfully"
      });
    } catch (error) {
      console.error('Error saving display settings:', error);
      toast({
        title: "Error",
        description: "Failed to save display settings",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAodChange = (checked: boolean) => {
    setAlwaysOnDisplay(checked);
    localStorage.setItem('hotel_pos_aod_enabled', String(checked));

    // Dispatch event so App.tsx can react immediately
    window.dispatchEvent(new CustomEvent('aod-changed', { detail: checked }));

    toast({
      title: checked ? "Always On Display Enabled" : "Always On Display Disabled",
      description: checked ? "Screen will stay awake while app is open" : "Screen will sleep normally",
    });
  };

  const handleLayoutChange = (mode: 'grid' | 'list') => {
    setBillingLayout(mode);
    localStorage.setItem('billing-view-mode', mode);
    toast({
      title: "Billing Layout Updated",
      description: `POS Billing will now load in ${mode === 'grid' ? 'Grid' : 'List'} View.`,
    });
  };

  const addCategoryToOrder = (category: string) => {
    if (!settings.category_order.includes(category)) {
      setSettings(prev => ({
        ...prev,
        category_order: [...prev.category_order, category]
      }));
    }
  };

  const removeCategoryFromOrder = (category: string) => {
    setSettings(prev => ({
      ...prev,
      category_order: prev.category_order.filter(cat => cat !== category)
    }));
  };

  const unorderedCategories = availableCategories.filter(
    cat => !settings.category_order.includes(cat)
  );

  // Drag and drop handlers
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }

    const newOrder = [...settings.category_order];
    const draggedItem = newOrder[dragItem.current];
    newOrder.splice(dragItem.current, 1);
    newOrder.splice(dragOverItem.current, 0, draggedItem);

    setSettings(prev => ({ ...prev, category_order: newOrder }));
    dragItem.current = null;
    dragOverItem.current = null;
  };

  return (
    <div className="space-y-6">
      {/* TV Display Link Section */}
      <Card className="border-2 border-primary/20 shadow-md bg-gradient-to-br from-background to-muted/20">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="text-lg flex items-center gap-2 text-primary">
            <MonitorSmartphone className="w-5 h-5" />
            Customer TV Display Link
          </CardTitle>
          <CardDescription>
            Use this link on your restaurant's smart TV or tablet to display live order status to customers.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-4">
            {isAllBranchesView ? (
              <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-md border border-amber-200">
                Please select a specific branch from the header to generate its TV display link.
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <div className="relative flex-1">
                  <Input
                    readOnly
                    value={`${getAppBaseUrl()}/display?admin=${adminId}&branch=${operatingBranchId || ''}`}
                    className="bg-muted/50 font-mono text-xs pr-20"
                  />
                  <Badge variant="outline" className="absolute right-2 top-1/2 -translate-y-1/2 bg-background shadow-sm">
                    Protected
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 sm:flex-none hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => {
                      navigator.clipboard.writeText(`${getAppBaseUrl()}/display?admin=${adminId}&branch=${operatingBranchId || ''}`);
                      toast({ title: "Copied!", description: "TV Display link copied to clipboard" });
                    }}
                  >
                    Copy
                  </Button>
                  <Button
                    variant="default"
                    className="flex-1 sm:flex-none shadow-md"
                    onClick={() => window.open(`/display?admin=${adminId}&branch=${operatingBranchId || ''}`, '_blank')}
                  >
                    Open
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span>🎛️</span>
            <span>Display Settings</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Always On Display */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2">
                <MonitorSmartphone className="w-4 h-4 text-primary" />
                <Label className="text-base font-medium">Always On Display</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Keep the screen awake while the application is running
              </p>
            </div>
            <Switch
              checked={alwaysOnDisplay}
              onCheckedChange={handleAodChange}
              disabled={isAllBranchesView}
            />
          </div>

          {/* POS Billing Layout Style */}
          <div className="space-y-2">
            <Label htmlFor="billing_layout">POS Billing Layout Style</Label>
            <Select
              value={billingLayout}
              onValueChange={(value: 'grid' | 'list') => handleLayoutChange(value)}
              disabled={isAllBranchesView}
            >
              <SelectTrigger id="billing_layout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="grid">Grid View (Default)</SelectItem>
                <SelectItem value="list">List View</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Choose the item layout style for the POS Quick Billing screen.
            </p>
          </div>

          {/* Items per Row Setting */}
          <div>
            <Label htmlFor="items_per_row">Items per Row in Billing Page</Label>
            <Select
              value={(settings.items_per_row ?? 3).toString()}
              onValueChange={(value) => setSettings(prev => ({
                ...prev,
                items_per_row: parseInt(value)
              }))}
              disabled={isAllBranchesView}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Item per Row</SelectItem>
                <SelectItem value="2">2 Items per Row</SelectItem>
                <SelectItem value="3">3 Items per Row (Default)</SelectItem>
                <SelectItem value="4">4 Items per Row</SelectItem>
                <SelectItem value="5">5 Items per Row</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">
              Fewer items per row = larger cards and images.
            </p>
          </div>

          {/* Category Display Order */}
          <div>
            <Label>Category Display Order</Label>
            <div className="mt-2 space-y-4">
              {/* Ordered Categories with Drag and Drop */}
              {settings.category_order.length > 0 && (
                <div className="p-4 border rounded-lg">
                  <h4 className="text-sm font-medium mb-3">Drag to reorder categories:</h4>
                  <div className="space-y-2">
                    {settings.category_order.map((category, index) => (
                      <div
                        key={category}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragEnter={() => handleDragEnter(index)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                        className="flex items-center space-x-2 p-2 bg-muted rounded cursor-grab active:cursor-grabbing hover:bg-muted/80 transition-colors"
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <Badge variant="secondary" className="flex-1">
                          {category}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCategoryFromOrder(category)}
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          disabled={isAllBranchesView}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Categories */}
              {unorderedCategories.length > 0 && (
                <div className="p-4 border rounded-lg">
                  <h4 className="text-sm font-medium mb-3">Available Categories:</h4>
                  <div className="flex flex-wrap gap-2">
                    {unorderedCategories.map(category => (
                      <Badge
                        key={category}
                        variant="outline"
                        className={`cursor-pointer ${isAllBranchesView ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={() => { if (!isAllBranchesView) addCategoryToOrder(category); }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {category}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Click to add them to the order above.
                  </p>
                </div>
              )}

              {availableCategories.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No categories found. Create some categories first.
                </p>
              )}
            </div>
          </div>

          <Button onClick={handleSave} disabled={isSaving || isAllBranchesView} className="w-full">
            {isSaving ? 'Saving...' : 'Save Display Settings'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
