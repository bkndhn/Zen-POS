import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calculator, Plus, Trash2, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const CalciQuickKeysSettings = () => {
  const { profile } = useAuth();
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
  
  // Format: { "1": "item-uuid" }
  const [shortcodes, setShortcodes] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('hotel_pos_calci_shortcodes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [newCode, setNewCode] = useState('');
  const [newItemId, setNewItemId] = useState('');

  useEffect(() => {
    if (!adminAuthUid) return;
    const fetchItemsAndSettings = async () => {
      setLoading(true);
      try {
        // Fetch settings first
        let settingsQuery = supabase.from('shop_settings').select('calci_shortcodes').eq('user_id', adminAuthUid);
        if (operatingBranchId) {
          settingsQuery = settingsQuery.eq('branch_id', operatingBranchId);
        } else {
          settingsQuery = settingsQuery.is('branch_id', null);
        }
        
        const { data: settingsData, error: settingsError } = await settingsQuery.maybeSingle();
        
        if (!settingsError && settingsData?.calci_shortcodes) {
            setShortcodes(settingsData.calci_shortcodes);
            // Also sync it to local storage
            localStorage.setItem('hotel_pos_calci_shortcodes', JSON.stringify(settingsData.calci_shortcodes));
        }

        let q = supabase.from('items').select('id, name, price').eq('admin_id', adminAuthUid).eq('is_active', true);
        if (operatingBranchId) q = q.eq('branch_id', operatingBranchId);
        const { data, error } = await q;
        if (error) throw error;
        if (data) setItems(data);
      } catch (err) {
        console.error('Failed to load items for quick keys:', err);
        // Try to load from cached items in IndexedDB
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

  const handleAdd = () => {
    if (!newCode.trim() || !newItemId) {
      toast({ title: "Incomplete", description: "Please enter a code and select an item.", variant: "destructive" });
      return;
    }
    const cleanCode = newCode.trim().toLowerCase();
    
    // Warn if overwriting
    if (shortcodes[cleanCode]) {
      const existingItem = items.find(i => i.id === shortcodes[cleanCode]);
      if (existingItem) {
        // Silent overwrite with notification
        toast({ title: "Quick Key Updated", description: `Code '${cleanCode}' changed from ${existingItem.name} to new item.` });
      }
    }
    
    const updated = { ...shortcodes, [cleanCode]: newItemId };
    setShortcodes(updated);
    handleSave(updated);
    setNewCode('');
    setNewItemId('');
    toast({ title: "Quick Key Added", description: `Code '${cleanCode}' is now active on this device.` });
  };

  const handleSave = async (newCodes: Record<string, string>) => {
    if (!adminAuthUid) return;

    try {
      // Save locally as a fallback
      localStorage.setItem('hotel_pos_calci_shortcodes', JSON.stringify(newCodes));
      
      // Save to Supabase shop_settings
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
        console.warn('Could not save shortcodes to cloud (schema might not be updated):', error);
      } else {
        // Broadcast to other active clients
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

  const handleRemove = (code: string) => {
    const updated = { ...shortcodes };
    delete updated[code];
    setShortcodes(updated);
    handleSave(updated);
    toast({ title: "Quick Key Removed" });
  };

  if (isAllBranchesView) return null;

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
          Map short codes (like "1" or "T") to specific items. In Calci mode, typing <code className="bg-muted px-1 rounded">*1</code> or <code className="bg-muted px-1 rounded">#1</code> will instantly add that item. (Saved only on this device).
        </p>

        <div className="flex gap-2 items-end mb-4">
          <div className="w-24">
            <Label className="text-xs mb-1 block">Code</Label>
            <Input placeholder="e.g. 1" value={newCode} onChange={e => setNewCode(e.target.value)} className="h-9" />
          </div>
          <div className="flex-1">
            <Label className="text-xs mb-1 block">Select Item</Label>
            <Select value={newItemId} onValueChange={setNewItemId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={loading ? "Loading..." : "Choose item..."} />
              </SelectTrigger>
              <SelectContent>
                {items.length === 0 && !loading && (
                  <div className="px-2 py-3 text-xs text-muted-foreground flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    No items found. Add items in the Items page first.
                  </div>
                )}
                {items.map(item => (
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
          {Object.entries(shortcodes).map(([code, itemId]) => {
            const item = items.find(i => i.id === itemId);
            return (
              <div key={code} className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-900 border p-2 rounded-lg text-sm">
                <div>
                  <span className="font-mono bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-xs font-bold mr-2">
                    {code}
                  </span>
                  <span>{item ? item.name : <span className="text-muted-foreground italic">Unknown Item</span>}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleRemove(code)} className="h-7 w-7 p-0 text-rose-500">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
          {Object.keys(shortcodes).length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No quick keys configured.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
