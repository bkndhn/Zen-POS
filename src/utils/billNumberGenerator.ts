/**
 * Shared Bill Number Generator
 * Used by both Billing.tsx (POS) and TableOrderBilling.tsx (table QR orders)
 * to ensure ONE unified sequential bill number series.
 *
 * Uses localStorage counter keyed by adminId for instant (0ms) generation.
 * On mount, always syncs from the database MAX to prevent number reversion.
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * Synchronize the localStorage counter from the true maximum bill in the database.
 * Queries ALL bills for this tenant (ignores branch filter) to find the true max
 * and prevents any counter reversion across devices or branches.
 */
export const syncBillCounter = async (adminId: string | null | undefined, branchId?: string | null): Promise<void> => {
    if (!adminId) return;
    const branchKey = branchId ? `hotel_pos_continue_bill_number_${branchId}` : 'hotel_pos_continue_bill_number';
    const continueBillFromYesterday = (localStorage.getItem(branchKey) ?? localStorage.getItem('hotel_pos_continue_bill_number')) !== 'false';
    const counterKey = `bill_counter_${adminId}_${branchId || 'main'}`;
    // Also check fallback keys (legacy and branchless) to find the highest local value
    const fallbackKeys = [
        `bill_counter_${adminId}_main`,
        `bill_counter_${adminId}_`,
        `bill_counter_${adminId}`,
    ];

    try {
        let query = supabase
            .from('bills')
            .select('bill_no')
            .eq('admin_id', adminId);
            // NOTE: No branch_id filter — we query ALL bills for this tenant to find the true max.

        if (!continueBillFromYesterday) {
            // Only look at today's bills for daily reset mode
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            query = query.gte('created_at', startOfDay.toISOString());
        }

        // Fetch last 200 bills to robustly find the max number, bypassing any out-of-order created_at from offline syncs
        const { data } = await query
            .not('bill_no', 'like', 'BILL-OFF-%')
            .not('bill_no', 'like', 'BILL-ONLINE-%')
            .order('created_at', { ascending: false })
            .limit(200);

        let dbMax = 0;
        if (data && data.length > 0) {
            for (const row of data) {
                if (!row.bill_no) continue;

                let match;
                if (continueBillFromYesterday) {
                    match = row.bill_no.match(/(\d+)$/);
                } else {
                    match = row.bill_no.match(/-(\d+)$/);
                }

                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > dbMax) dbMax = num;
                }
            }
        }

        // Read current local across primary key and all fallback keys — never move backwards
        let currentLocal = parseInt(localStorage.getItem(counterKey) || '0', 10);
        for (const fk of fallbackKeys) {
            const v = parseInt(localStorage.getItem(fk) || '0', 10);
            if (v > currentLocal) currentLocal = v;
        }

        const newCounter = Math.max(dbMax, currentLocal);
        if (newCounter > currentLocal) {
            localStorage.setItem(counterKey, newCounter.toString());
        }
    } catch (e) {
        console.warn('[BillCounter] Failed to sync from DB:', e);
    }
};

/**
 * Seed the localStorage counter.
 * Always syncs from the database to ensure local counter >= database max.
 * This prevents counter reversion when a device has a stale/old cached value.
 */
export const initBillCounter = async (adminId: string | null | undefined, branchId?: string | null): Promise<void> => {
    // ALWAYS sync from DB — do not skip even if local key exists.
    // This prevents reversion if the local counter is behind the DB max.
    await syncBillCounter(adminId, branchId);
};

export const getInstantBillNumber = (adminId: string | null | undefined, branchId?: string | null): string => {
    const branchKey = branchId ? `hotel_pos_continue_bill_number_${branchId}` : 'hotel_pos_continue_bill_number';
    const continueBillFromYesterday = (localStorage.getItem(branchKey) ?? localStorage.getItem('hotel_pos_continue_bill_number')) !== 'false';
    const counterKey = `bill_counter_${adminId || 'default'}_${branchId || 'main'}`;
    const dateKey = `bill_date_${adminId || 'default'}_${branchId || 'main'}`;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const savedDate = localStorage.getItem(dateKey);

    const devicePrefixKey = branchId ? `hotel_pos_device_prefix_${branchId}` : 'hotel_pos_device_prefix';
    const devicePrefixRaw = localStorage.getItem(devicePrefixKey) || localStorage.getItem('hotel_pos_device_prefix') || '';
    const devicePrefix = devicePrefixRaw ? `${devicePrefixRaw}-` : '';

    if (continueBillFromYesterday) {
        // Sequential numbering — increment forever, never reset
        const current = parseInt(localStorage.getItem(counterKey) || '0', 10);
        const counter = current + 1;
        localStorage.setItem(counterKey, counter.toString());
        return `BILL-${devicePrefix}${String(counter).padStart(6, '0')}`;
    } else {
        // Daily reset numbering
        let counter: number;
        if (savedDate !== todayStr) {
            // New day - reset counter
            counter = 1;
            localStorage.setItem(dateKey, todayStr);
        } else {
            counter = parseInt(localStorage.getItem(counterKey) || '0', 10) + 1;
        }
        localStorage.setItem(counterKey, counter.toString());
        const datePrefix = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getFullYear()).slice(-2)}`;
        return `${datePrefix}-${devicePrefix}${String(counter).padStart(3, '0')}`;
    }
};
