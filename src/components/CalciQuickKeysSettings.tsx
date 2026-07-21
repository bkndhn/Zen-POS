import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calculator, Plus, Trash2, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const CalciQuickKeysSettings = () => {
  const { profile , adminProfileId } = useAuth();
  const { operatingBranchId, isAllBranchesView } = useBranch();
  const [adminAuthUid, setAdminAuthUid] = useState<string | null>(null);

  useEffect(() => {
    const resolveAuthUid = async () => {
      if (!profile) return;
      if (profile.role === 'admin') {
        setAdminAuthUid(profile.user_id);
      } else if (profile.admin_id) {
        const { data } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('id', profile.admin_id)
          .maybeSingle();
        if (data?.user_id) setAdminAuthUid(data.user_id);
      }
    };
    resolveAuthUid();
  }, [profile]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [orderedItemIds, setOrderedItemIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('hotel_pos_calci_shortcodes');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Object.keys(parsed)
          .sort((a, b) => parseInt(a) - parseInt(b))
          .map(k => parsed[k]);
      }
      return [];
    } catch {
      return [];
    }
  });

  const [newItemId, setNewItemId] = useState('');

  useEffect(() => {
    if (!adminAuthUid) return;
    const fetchItemsAndSettings = async () => {
      setLoading(true);
      try {
        let settingsQuery = supabase.from('shop_settings').select('calci_shortcodes').eq('user_id', adminAuthUid);
        if (operatingBranchId) {
          settingsQuery = settingsQuery.eq('branch_id', operatingBranchId);
        } else {
          settingsQuery = settingsQuery.is('branch_id', null);
        }
        
        const { data: settingsData, error: settingsError } = await settingsQuery.maybeSingle();
        
        if (!settingsError && settingsData?.calci_shortcodes) {
            const shortcodes = settingsData.calci_shortcodes as Record<string, string>;
            const ordered = Object.keys(shortcodes)
              .sort((a, b) => parseInt(a) - parseInt(b))
              .map(k => shortcodes[k]);
            setOrderedItemIds(ordered);
            localStorage.setItem('hotel_pos_calci_shortcodes', JSON.stringify(shortcodes));
        }

        let q = supabase.from('items').select('id, name, price').eq('admin_id', adminProfileId).eq('is_active', true);
        if (operatingBranchId) q = q.eq('branch_id', operatingBranchId);
        const { data, error } = await q;
        if (error) throw error;
        if (data) setItems(data);
      } catch (err) {
        console.error('Failed to load items for quick keys:', err);
        try {
          const { offlineManager } = await import('@/utils/offlineManager');
          const cached = await offlineManager.getCachedItems(adminAuthUid || '', operatingBranchId);
          if (cached.length > 0) {
            setItems(cached.map((i: any) => ({ id: i.id, name: i.name, price: i.price })));
          }
        } catch (e) {
          console.error('Offline fallback failed:', e);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchItemsAndSettings();
  }, [adminAuthUid, operatingBranchId]);

  const saveOrder = async (ordered: string[]) => {
    const newCodes: Record<string, string> = {};
    ordered.forEach((id, index) => {
      newCodes[(index + 1).toString()] = id;
    });

    if (!adminAuthUid) return;

    try {
      localStorage.setItem('hotel_pos_calci_shortcodes', JSON.stringify(newCodes));
      
      let existingQuery = supabase.from('shop_settings').select('id').eq('user_id', adminAuthUid);
      if (operatingBranchId) {
        existingQuery = existingQuery.eq('branch_id', operatingBranchId);
      } else {
        existingQuery = existingQuery.is('branch_id', null);
      }
      
      const { data: existing } = await existingQuery.maybeSingle();
      
      let error;
      if (existing?.id) {
        const { error: updateError } = await supabase.from('shop_settings').update({ calci_shortcodes: newCodes }).eq('id', existing.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase.from('shop_settings').insert({
          calci_shortcodes: newCodes,
          user_id: adminAuthUid,
          branch_id: operatingBranchId || null
        });
        error = insertError;
      }
      if (error && error.code !== 'PGRST116') {
        console.warn('Could not save shortcodes to cloud:', error);
      } else {
        supabase.channel('pos-global-sync').send({ 
          type: 'broadcast', 
          event: 'sync-calci-keys', 
          payload: newCodes 
        });
      }
    } catch (err) {
      console.error('Error saving shortcodes:', err);
    }
  };

  const handleAdd = () => {
    if (!newItemId) {
      toast({ title: "Incomplete", description: "Please select an item.", variant: "destructive" });
      return;
    }
    const newOrdered = [...orderedItemIds, newItemId];
    setOrderedItemIds(newOrdered);
    saveOrder(newOrdered);
    setNewItemId('');
    toast({ title: "Quick Key Added", description: `Item assigned code ${newOrdered.length}.` });
  };

  const handleRemove = (indexToRemove: number) => {
    const newOrdered = orderedItemIds.filter((_, index) => index !== indexToRemove);
    setOrderedItemIds(newOrdered);
    saveOrder(newOrdered);
    toast({ title: "Quick Key Removed", description: "Codes have been updated." });
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newOrdered = [...orderedItemIds];
    [newOrdered[index - 1], newOrdered[index]] = [newOrdered[index], newOrdered[index - 1]];
    setOrderedItemIds(newOrdered);
    saveOrder(newOrdered);
  };

  const handleMoveDown = (index: number) => {
    if (index === orderedItemIds.length - 1) return;
    const newOrdered = [...orderedItemIds];
    [newOrdered[index + 1], newOrdered[index]] = [newOrdered[index], newOrdered[index + 1]];
    setOrderedItemIds(newOrdered);
    saveOrder(newOrdered);
  };

  if (isAllBranchesView) return null;

  const availableItems = items.filter(item => !orderedItemIds.includes(item.id));

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6 pb-2">
        <CardTitle className="flex items-center space-x-2">
          <Calculator className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
          <span className="text-base sm:text-lg">Calci Mode Quick Keys</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-2">
        <p className="text-xs text-muted-foreground mb-4">
          Add items to assign them sequential numbers (1, 2, 3...). In Calci mode, typing <code className="bg-muted px-1 rounded">*1</code> or <code className="bg-muted px-1 rounded">#1</code> will instantly add the first item. Use arrows to reorder.
        </p>

        <div className="flex gap-2 items-end mb-4">
          <div className="flex-1">
            <Label className="text-xs mb-1 block">Select Item</Label>
            <Select value={newItemId} onValueChange={setNewItemId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={loading ? "Loading..." : "Choose item..."} />
              </SelectTrigger>
              <SelectContent>
                {availableItems.length === 0 && !loading && (
                  <div className="px-2 py-3 text-xs text-muted-foreground flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {items.length === 0 ? "No items found. Add items in the Items page first." : "All items have been assigned."}
                  </div>
                )}
                {availableItems.map(item => (
                  <SelectItem key={item.id} value={item.id}>{item.name} (₹{item.price})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} className="h-9 px-3">
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-2">
          {orderedItemIds.map((itemId, index) => {
            const item = items.find(i => i.id === itemId);
            const code = (index + 1).toString();
            return (
              <div key={itemId} className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-900 border p-2 rounded-lg text-sm">
                <div>
                  <span className="font-mono bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-xs font-bold mr-2">
                    {code}
                  </span>
                  <span>{item ? item.name : <span className="text-muted-foreground italic">Unknown Item</span>}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleMoveUp(index)} 
                    disabled={index === 0}
                    className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-30"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleMoveDown(index)} 
                    disabled={index === orderedItemIds.length - 1}
                    className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-30"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleRemove(index)} 
                    className="h-7 w-7 p-0 text-rose-500 ml-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
          {orderedItemIds.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No quick keys configured.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

