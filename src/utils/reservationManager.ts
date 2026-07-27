/**
 * Table Reservation & Pre-Booking Manager Utility
 * Manages table reservations with IndexedDB / local storage fallback and Supabase cloud sync.
 */

import { supabase } from '@/integrations/supabase/client';

export interface TableReservation {
    id: string;
    table_number: string;
    customer_name: string;
    customer_phone: string;
    guest_count: number;
    reservation_date: string; // YYYY-MM-DD
    reservation_time: string; // HH:mm
    notes?: string;
    status: 'confirmed' | 'seated' | 'cancelled';
    created_at: string;
    admin_id?: string;
    branch_id?: string | null;
}

const RESERVATION_STORAGE_KEY = 'hotel_pos_table_reservations';

export const reservationManager = {
    /** Get all reservations from local cache */
    getLocalReservations(): TableReservation[] {
        try {
            const cached = localStorage.getItem(RESERVATION_STORAGE_KEY);
            return cached ? JSON.parse(cached) : [];
        } catch {
            return [];
        }
    },

    /** Save reservations to local cache */
    saveLocalReservations(list: TableReservation[]) {
        try {
            localStorage.setItem(RESERVATION_STORAGE_KEY, JSON.stringify(list));
        } catch (e) {
            console.warn('Failed to cache reservations locally:', e);
        }
    },

    /** Fetch today's reservations for current branch */
    async fetchReservations(adminId?: string, branchId?: string | null): Promise<TableReservation[]> {
        const local = this.getLocalReservations();
        if (!navigator.onLine || !adminId) return local;

        try {
            const todayStr = new Date().toISOString().split('T')[0];
            let query = (supabase as any)
                .from('table_reservations')
                .select('*')
                .eq('admin_id', adminId)
                .gte('reservation_date', todayStr)
                .order('reservation_time', { ascending: true });

            if (branchId) {
                query = query.eq('branch_id', branchId);
            }

            const { data, error } = await query;
            if (error) {
                console.warn('Supabase reservation table missing or error:', error.message);
                return local;
            }

            if (data && Array.isArray(data)) {
                this.saveLocalReservations(data);
                return data;
            }
            return local;
        } catch {
            return local;
        }
    },

    /** Create a new table reservation */
    async addReservation(res: Omit<TableReservation, 'id' | 'created_at' | 'status'>, adminId?: string, branchId?: string | null): Promise<TableReservation> {
        const newRes: TableReservation = {
            ...res,
            id: `res-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            status: 'confirmed',
            created_at: new Date().toISOString(),
            admin_id: adminId,
            branch_id: branchId || null,
        };

        const existing = this.getLocalReservations();
        const updated = [newRes, ...existing];
        this.saveLocalReservations(updated);

        if (navigator.onLine && adminId) {
            try {
                await (supabase as any).from('table_reservations').insert({
                    id: newRes.id,
                    table_number: newRes.table_number,
                    customer_name: newRes.customer_name,
                    customer_phone: newRes.customer_phone,
                    guest_count: newRes.guest_count,
                    reservation_date: newRes.reservation_date,
                    reservation_time: newRes.reservation_time,
                    notes: newRes.notes || null,
                    status: newRes.status,
                    admin_id: adminId,
                    branch_id: branchId || null,
                });
            } catch (err) {
                console.warn('Could not insert reservation into Supabase (saving locally):', err);
            }
        }

        return newRes;
    },

    /** Update reservation status (e.g. mark 'seated' or 'cancelled') */
    async updateStatus(id: string, status: 'confirmed' | 'seated' | 'cancelled'): Promise<void> {
        const existing = this.getLocalReservations();
        const next = existing.map(r => r.id === id ? { ...r, status } : r);
        this.saveLocalReservations(next);

        if (navigator.onLine) {
            try {
                await (supabase as any)
                    .from('table_reservations')
                    .update({ status })
                    .eq('id', id);
            } catch (err) {
                console.warn('Could not update reservation status in Supabase:', err);
            }
        }
    },

    /** Get active upcoming reservation for a specific table number */
    getUpcomingForTable(tableNumber: string, reservations: TableReservation[]): TableReservation | null {
        const todayStr = new Date().toISOString().split('T')[0];
        const match = reservations.find(r => 
            String(r.table_number) === String(tableNumber) &&
            r.status === 'confirmed' &&
            r.reservation_date >= todayStr
        );
        return match || null;
    }
};
