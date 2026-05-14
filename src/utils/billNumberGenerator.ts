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
 * Seed the localStorage counter from the last bill in the database.
 * Call this on mount in Billing.tsx / TableOrderBilling.tsx to ensure
 * the counter doesn't reset to 0 on a new device/browser.
 */
export const initBillCounter = async (adminId: string | null | undefined, branchId?: string | null): Promise<void> => {
    if (!adminId) return;
    const counterKey = `bill_counter_${adminId}_${branchId || 'main'}`;
    // If counter already exists in localStorage, we're good
    if (localStorage.getItem(counterKey) !== null) return;

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

        const { data } = await query
            .order('created_at', { ascending: false })
            .limit(1);

        if (data?.[0]?.bill_no) {
            // Extract the numeric part from the end of the bill number
            const match = data[0].bill_no.match(/(\d+)$/);
            if (match) {
                localStorage.setItem(counterKey, match[1]);
            }
        }
    } catch (e) {
        console.warn('[BillCounter] Failed to seed from DB:', e);
    }
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

