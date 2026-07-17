/**
 * Shared Bill Number Generator
 * Used by both Billing.tsx (POS) and TableOrderBilling.tsx (table QR orders)
 * to ensure ONE unified sequential bill number series.
 *
 * Uses localStorage counter keyed by adminId for instant (0ms) generation.
 * On first use, seeds from the latest bill in Supabase to avoid resetting.
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * Synchronize the localStorage counter from the true maximum bill in the database.
 * Call this before creating a bill to ensure perfect isolation across devices.
 */
export const syncBillCounter = async (adminId: string | null | undefined, branchId?: string | null): Promise<void> => {
    if (!adminId) return;
    const branchKey = branchId ? `hotel_pos_continue_bill_number_${branchId}` : 'hotel_pos_continue_bill_number';
    const continueBillFromYesterday = (localStorage.getItem(branchKey) ?? localStorage.getItem('hotel_pos_continue_bill_number')) !== 'false';
    const counterKey = `bill_counter_${adminId}_${branchId || 'main'}`;

    try {
        let query = supabase
            .from('bills')
            .select('bill_no')
            .eq('admin_id', adminId);
            
        if (branchId) {
            query = query.eq('branch_id', branchId);
        } else {
            query = query.is('branch_id', null);
        }

        if (!continueBillFromYesterday) {
            // Only look at today's bills for daily reset mode
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            query = query.gte('created_at', startOfDay.toISOString());
        }

        // Fetch last 100 bills to robustly find the max number, bypassing any out-of-order created_at from offline syncs
        const { data } = await query
            .not('bill_no', 'like', 'BILL-OFF-%')
            .not('bill_no', 'like', 'BILL-ONLINE-%')
            .order('created_at', { ascending: false })
            .limit(100);

        if (data && data.length > 0) {
            let maxNum = 0;
            for (const row of data) {
                if (!row.bill_no) continue;
                
                let match;
                if (continueBillFromYesterday) {
                    match = row.bill_no.match(/BILL-(\d+)$/);
                } else {
                    match = row.bill_no.match(/-(\d+)$/);
                }
                
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > maxNum) {
                        maxNum = num;
                    }
                }
            }
            
            if (maxNum > 0) {
                // Read current local to avoid moving backwards
                const currentLocal = parseInt(localStorage.getItem(counterKey) || '0', 10);
                if (maxNum > currentLocal) {
                    localStorage.setItem(counterKey, maxNum.toString());
                }
            }
        }
    } catch (e) {
        console.warn('[BillCounter] Failed to sync from DB:', e);
    }
};

/**
 * Seed the localStorage counter. 
 * Retained for backwards compatibility on mount.
 */
export const initBillCounter = async (adminId: string | null | undefined, branchId?: string | null): Promise<void> => {
    const counterKey = `bill_counter_${adminId}_${branchId || 'main'}`;
    if (localStorage.getItem(counterKey) !== null) return;
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

    if (continueBillFromYesterday) {
        // Sequential numbering - increment forever
        const counter = parseInt(localStorage.getItem(counterKey) || '0') + 1;
        localStorage.setItem(counterKey, counter.toString());
        return `BILL-${String(counter).padStart(6, '0')}`;
    } else {
        // Daily reset numbering
        let counter: number;
        if (savedDate !== todayStr) {
            // New day - reset counter
            counter = 1;
            localStorage.setItem(dateKey, todayStr);
        } else {
            counter = parseInt(localStorage.getItem(counterKey) || '0') + 1;
        }
        localStorage.setItem(counterKey, counter.toString());
        const datePrefix = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getFullYear()).slice(-2)}`;
        return `${datePrefix}-${String(counter).padStart(3, '0')}`;
    }
};

