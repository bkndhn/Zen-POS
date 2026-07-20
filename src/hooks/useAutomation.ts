import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export const useAutomation = () => {
  const { profile } = useAuth();
  const { operatingBranchId } = useBranch();
  const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;
  
  const checkingStock = useRef(false);
  const lastReportTime = useRef<string | null>(null);

  useEffect(() => {
    if (!adminId) return;

    // Check permissions
    if (Capacitor.isNativePlatform()) {
      LocalNotifications.requestPermissions().then((result) => {
        if (result.display !== 'granted') {
          console.warn('LocalNotifications permission not granted');
        }
      });
    }

    const interval = setInterval(() => {
      runAutomationTasks();
    }, 60000); // Check every minute

    // Run once on startup
    setTimeout(runAutomationTasks, 5000);

    // KDS and Order global listeners for Android push notifications
    let channel: any;
    if (Capacitor.isNativePlatform()) {
      channel = supabase.channel('pos-global-sync', {
          config: { broadcast: { self: false } }
      })
      .on('broadcast', { event: 'new-bill' }, (payload: any) => {
          triggerLocalNotification('New Order', `Bill #${payload.payload?.bill_no || ''} received.`);
      })
      .on('broadcast', { event: 'bills-updated' }, (payload: any) => {
          if (payload.payload?.status) {
             triggerLocalNotification('Order Updated', `Bill #${payload.payload?.bill_id?.slice(-4) || ''} is ${payload.payload.status}.`);
          }
      })
      .on('broadcast', { event: 'new-table-order' }, () => {
          triggerLocalNotification('New Table Order', `A new table order was placed.`);
      })
      .subscribe();
    }

    return () => {
        clearInterval(interval);
        if (channel) supabase.removeChannel(channel);
    };
  }, [adminId, operatingBranchId]);

  const triggerLocalNotification = async (title: string, body: string) => {
      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: new Date().getTime(),
            schedule: { at: new Date(Date.now() + 100) },
            smallIcon: 'ic_stat_icon_config_sample'
          }
        ]
      });
  };

  const runAutomationTasks = async () => {
    if (!adminId) return;

    try {
      // 1. Fetch Advanced Settings
      let query = supabase.from('shop_settings').select('low_stock_notification_enabled, auto_report_enabled, auto_report_time').eq('user_id', adminId);
      
      if (operatingBranchId) {
          query = query.eq('branch_id', operatingBranchId);
      } else {
          query = query.is('branch_id', null);
      }
      
      const { data: settings } = await query.maybeSingle();
      
      if (!settings) return;

      // 2. Check Low Stock
      if (settings.low_stock_notification_enabled && !checkingStock.current) {
        checkingStock.current = true;
        try {
          await checkLowStock();
        } finally {
          checkingStock.current = false;
        }
      }

      // 3. Check Auto Report
      if (settings.auto_report_enabled && settings.auto_report_time) {
        checkAutoReport(settings.auto_report_time);
      }

    } catch (error) {
      console.error('Error in automation tasks:', error);
    }
  };

  const checkLowStock = async () => {
    let query = (supabase as any)
      .from('items')
      .select('name, stock_quantity, minimum_stock_alert')
      .eq('admin_id', adminId)
      .eq('unlimited_stock', false);
      
    if (operatingBranchId) {
        query = query.eq('branch_id', operatingBranchId);
    }

    const { data: items } = await query;
    if (!items) return;

    const lowItems = (items as any[]).filter((item: any) => 
      item.stock_quantity !== null && 
      item.minimum_stock_alert !== null && 
      Number(item.stock_quantity) <= Number(item.minimum_stock_alert)
    );

    if (lowItems.length > 0 && Capacitor.isNativePlatform()) {
      const names = lowItems.map((i: any) => i.name).slice(0, 3).join(', ');
      const more = lowItems.length > 3 ? ` +${lowItems.length - 3} more` : '';
      
      await LocalNotifications.schedule({
        notifications: [
          {
            title: 'Low Stock Alert',
            body: `${names}${more} are running low on stock.`,
            id: new Date().getTime(),
            schedule: { at: new Date(Date.now() + 1000 * 1) },
            sound: 'beep.wav',
            smallIcon: 'ic_stat_icon_config_sample'
          }
        ]
      });
    }
  };

  const checkAutoReport = async (targetTime: string) => {
    const now = new Date();
    const currentHour = now.getHours().toString().padStart(2, '0');
    const currentMinute = now.getMinutes().toString().padStart(2, '0');
    const currentTimeStr = `${currentHour}:${currentMinute}`;
    
    // Only trigger once per day for that specific minute
    const todayStr = now.toDateString();
    const reportKey = `${todayStr}-${targetTime}`;

    if (currentTimeStr === targetTime && lastReportTime.current !== reportKey) {
      lastReportTime.current = reportKey;
      console.log('Triggering Auto Daily Report for', targetTime);
      
      // Dispatch a custom event that the Reports page or a central generator can listen to
      const event = new CustomEvent('zenpos:trigger-auto-report', {
        detail: { branchId: operatingBranchId }
      });
      window.dispatchEvent(event);
    }
  };
};
