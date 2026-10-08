import React, { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  adminId: string;
  adminUserId: string; // auth user_id for FCM lookup
}

// Helper: send FCM push notification
async function sendAlert(adminUserId: string, title: string, body: string) {
  try {
    await supabase.from('push_queue').insert({
      user_id: adminUserId,
      title,
      body,
      data: { url: '/reports', type: 'anti_theft' },
    });
  } catch { /* fail silently */ }
}

export const AntiTheftMonitor: React.FC<Props> = ({ adminId, adminUserId }) => {
  useEffect(() => {
    if (!adminId) return;

    // Monitor bills for high discounts and voids
    const billChannel = supabase
      .channel('anti-theft-bills')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bills',
        filter: `admin_id=eq.${adminId}`,
      }, async (payload) => {
        const bill = payload.new as any;
        const old = payload.old as any;

        // Void detection
        if (!old.is_deleted && bill.is_deleted) {
          await sendAlert(
            adminUserId,
            '🚨 Bill Voided',
            `Bill #${bill.bill_no || bill.id?.slice(-6)} was voided. Amount: ₹${bill.total_amount}`,
          );
        }

        // High discount detection (> 20%)
        const discountPct = bill.total_amount > 0
          ? ((bill.discount || 0) / (bill.subtotal || bill.total_amount)) * 100
          : 0;
        if (discountPct > 20 && (!old.discount || old.discount < bill.discount)) {
          await sendAlert(
            adminUserId,
            '⚠️ High Discount Alert',
            `${Math.round(discountPct)}% discount applied on Bill #${bill.bill_no}. Amount saved: ₹${bill.discount}`,
          );
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(billChannel);
    };
  }, [adminId, adminUserId]);

  return null; // This component renders nothing
};

export default AntiTheftMonitor;
