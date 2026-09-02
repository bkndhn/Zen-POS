import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invalidateRelatedData, dataCache, CACHE_KEYS } from '@/utils/cacheUtils';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';

// Global BroadcastChannel for instant same-browser sync
const localBroadcast = typeof BroadcastChannel !== 'undefined' 
  ? new BroadcastChannel('pos-instant-sync') 
  : null;

export const useRealTimeUpdates = () => {
  const broadcastChannelRef = useRef<any>(null);
  const { profile } = useAuth();
  const adminId = profile?.admin_id || profile?.id;
  const { operatingBranchId } = useBranch();

  useEffect(() => {
    if (!adminId) return;

    console.log('Setting up real-time updates with instant broadcast...');

    // ============ INSTANT BROADCAST CHANNEL (Sub-100ms cross-device) ============
    const broadcastChannel = supabase.channel(`pos-global-broadcast-${adminId}`, {
      config: { broadcast: { self: true } }
    })
      .on('broadcast', { event: 'bills-sync' }, (payload) => {
        console.log('[BROADCAST] Bills instant sync:', payload);
        invalidateRelatedData('bills');
        window.dispatchEvent(new CustomEvent('bills-updated'));
      })
      .on('broadcast', { event: 'items-sync' }, () => {
        console.log('[BROADCAST] Items instant sync');
        invalidateRelatedData('items');
        window.dispatchEvent(new CustomEvent('items-updated'));
      })
      .subscribe();

    broadcastChannelRef.current = broadcastChannel;

    // Local tab sync via BroadcastChannel (0ms for same browser)
    const handleLocalSync = (event: MessageEvent) => {
      const { type } = event.data || {};
      if (type === 'bills') {
        invalidateRelatedData('bills');
        window.dispatchEvent(new CustomEvent('bills-updated'));
      } else if (type === 'items') {
        invalidateRelatedData('items');
        window.dispatchEvent(new CustomEvent('items-updated'));
      }
    };
    localBroadcast?.addEventListener('message', handleLocalSync);

    // ============ POSTGRES CHANGES (Fallback, ~2-5s latency) ============
    const filterStr = `admin_id=eq.${adminId}`;

    const billsChannel = supabase
      .channel(`bills-changes-${adminId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills', filter: filterStr }, (payload) => {
          invalidateRelatedData('bills');
          window.dispatchEvent(new CustomEvent('bills-updated'));
          broadcastChannelRef.current?.send({ type: 'broadcast', event: 'bills-sync', payload: { source: 'postgres_changes', timestamp: Date.now() } });
          localBroadcast?.postMessage({ type: 'bills' });
      }).subscribe();

    const itemsChannel = supabase
      .channel(`items-changes=${adminId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: filterStr }, (payload) => {
          invalidateRelatedData('items');
          window.dispatchEvent(new CustomEvent('items-updated'));
          broadcastChannelRef.current?.send({ type: 'broadcast', event: 'items-sync', payload: { timestamp: Date.now() } });
          localBroadcast?.postMessage({ type: 'items' });
      }).subscribe();

    const expensesChannel = supabase
      .channel(`expenses-changes-${adminId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: filterStr }, (payload) => {
          invalidateRelatedData('expenses');
      }).subscribe();

    const paymentsChannel = supabase
      .channel(`payments-changes-${adminId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: filterStr }, (payload) => {
          invalidateRelatedData('payments');
          dataCache.invalidate(CACHE_KEYS.PAYMENT_METHODS);
          window.dispatchEvent(new CustomEvent('payment-types-updated'));
      }).subscribe();

    const categoriesChannel = supabase
      .channel(`categories-changes=${adminId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_categories', filter: filterStr }, () => {
          dataCache.invalidate(CACHE_KEYS.EXPENSE_CATEGORIES);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_categories', filter: filterStr }, () => {
          dataCache.invalidate(CACHE_KEYS.ITEM_CATEGORIES);
          window.dispatchEvent(new CustomEvent('categories-updated'));
      }).subscribe();

    const additionalChargesChannel = supabase
      .channel(`additional-charges-changes-${adminId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'additional_charges', filter: filterStr }, () => {
          window.dispatchEvent(new CustomEvent('additional-charges-updated'));
          window.dispatchEvent(new CustomEvent('settings-updated'));
      }).subscribe();

    const shopSettingsChannel = supabase
      .channel(`shop-settings-changes=${adminId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_settings', filter: `user_id=eq.${adminId}` }, () => {
          window.dispatchEvent(new CustomEvent('shop-settings-updated'));
          window.dispatchEvent(new CustomEvent('settings-updated'));
      }).subscribe();

    const displaySettingsChannel = supabase
      .channel(`display-settings-changes=${adminId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'display_settings', filter: `user_id=eq.${adminId}` }, () => {
          window.dispatchEvent(new CustomEvent('display-settings-updated'));
          window.dispatchEvent(new CustomEvent('settings-updated'));
      }).subscribe();

    return () => {
      console.log('Cleaning up real-time subscriptions...');
      supabase.removeChannel(billsChannel);
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(expensesChannel);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(categoriesChannel);
      supabase.removeChannel(additionalChargesChannel);
      supabase.removeChannel(shopSettingsChannel);
      supabase.removeChannel(displaySettingsChannel);
      supabase.removeChannel(broadcastChannel);
      localBroadcast?.removeEventListener('message', handleLocalSync);
    };
  }, [adminId]);
};

// Helper to trigger instant broadcast from anywhere in the app
export const triggerInstantSync = (type: 'bills' | 'items') => {
  localBroadcast?.postMessage({ type });
};
