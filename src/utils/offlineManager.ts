/**
 * Offline-First PWA Manager v2
 * Provides IndexedDB persistence and sync queue for offline billing
 * Features: Auto-sync on reconnect, conflict resolution, retry with backoff
 */

import * as React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { convertToInventoryUnit } from '@/utils/timeUtils';

// Database configuration
const DB_NAME = 'HotelPOS_OfflineDB';
const DB_VERSION = 2;

// Store names
const STORES = {
    ITEMS: 'items',
    BILLS: 'bills',
    CATEGORIES: 'categories',
    SYNC_QUEUE: 'syncQueue',
    SETTINGS: 'settings',
    PENDING_BILLS: 'pendingBills'
};

export interface PendingBill {
    id: string;
    bill_no: string;
    total_amount: number;
    discount: number;
    payment_mode: string;
    payment_details: any;
    additional_charges: any;
    created_by: string;
    date: string;
    created_at: string;
    items: Array<{
        item_id: string;
        name: string;
        quantity: number;
        price: number;
        total: number;
        tax_rate_snapshot?: number | null;
        hsn_code?: string | null;
        tax_amount?: number | null;
    }>;
    table_no?: string | null;
    synced: boolean;
    syncError?: string;
    retries: number;
    admin_id?: string | null;
    branch_id?: string | null;
    round_off?: number;
    order_type?: string;
    tax_summary?: string | null;
    total_tax?: number;
    customer_gstin?: string | null;
}

interface SyncQueueItem {
    id: string;
    type: 'bill' | 'expense' | 'item';
    action: 'create' | 'update' | 'delete';
    data: any;
    timestamp: number;
    retryCount: number;
}

class OfflineManager {
    private db: IDBDatabase | null = null;
    private isOnline: boolean = navigator.onLine;
    private syncInProgress: boolean = false;
    private listeners: Set<(isOnline: boolean) => void> = new Set();
    private pendingBillListeners: Set<(count: number) => void> = new Set();

    constructor() {
        this.initializeDB();
        this.setupNetworkListeners();
    }

    private async initializeDB(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB initialized successfully');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Create object stores
                if (!db.objectStoreNames.contains(STORES.ITEMS)) {
                    const itemStore = db.createObjectStore(STORES.ITEMS, { keyPath: 'id' });
                    itemStore.createIndex('is_active', 'is_active');
                    itemStore.createIndex('category', 'category');
                }

                if (!db.objectStoreNames.contains(STORES.BILLS)) {
                    const billStore = db.createObjectStore(STORES.BILLS, { keyPath: 'id' });
                    billStore.createIndex('date', 'date');
                    billStore.createIndex('synced', 'synced');
                }

                if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
                    db.createObjectStore(STORES.CATEGORIES, { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                    const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
                    syncStore.createIndex('timestamp', 'timestamp');
                    syncStore.createIndex('type', 'type');
                }

                if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                    db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
                }

                if (!db.objectStoreNames.contains(STORES.PENDING_BILLS)) {
                    const pendingStore = db.createObjectStore(STORES.PENDING_BILLS, { keyPath: 'id' });
                    pendingStore.createIndex('created_at', 'created_at');
                    pendingStore.createIndex('synced', 'synced');
                }

                console.log('IndexedDB stores created/upgraded');
            };
        });
    }

    private setupNetworkListeners(): void {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.notifyListeners();
            console.log('Network: Online - Starting sync');
            // Auto-sync with delay to ensure stable connection
            setTimeout(() => this.processSyncQueue(), 1000);
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.notifyListeners();
            console.log('Network: Offline mode active');
        });
    }

    // Subscribe to network status changes
    onNetworkChange(callback: (isOnline: boolean) => void): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    // Subscribe to pending bills count changes
    onPendingBillsChange(callback: (count: number) => void): () => void {
        this.pendingBillListeners.add(callback);
        return () => this.pendingBillListeners.delete(callback);
    }

    private notifyListeners(): void {
        this.listeners.forEach(callback => callback(this.isOnline));
    }

    private async notifyPendingBillsListeners(): Promise<void> {
        const count = await this.getPendingBillsCount();
        this.pendingBillListeners.forEach(callback => callback(count));
    }

    getNetworkStatus(): boolean {
        return this.isOnline;
    }

    // Generic store operations
    async store<T>(storeName: string, data: T): Promise<void> {
        if (!this.db) await this.initializeDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async storeMany<T>(storeName: string, items: T[]): Promise<void> {
        if (!this.db) await this.initializeDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);

            items.forEach(item => store.put(item));

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async get<T>(storeName: string, key: string): Promise<T | null> {
        if (!this.db) await this.initializeDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    async getAll<T>(storeName: string): Promise<T[]> {
        if (!this.db) await this.initializeDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName: string, key: string): Promise<void> {
        if (!this.db) await this.initializeDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clear(storeName: string): Promise<void> {
        if (!this.db) await this.initializeDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ===== PENDING BILLS MANAGEMENT =====
    async savePendingBill(bill: Omit<PendingBill, 'synced' | 'retries'>): Promise<string> {
        const pendingBill: PendingBill = {
            ...bill,
            synced: false,
            retries: 0
        };

        await this.store(STORES.PENDING_BILLS, pendingBill);
        await this.notifyPendingBillsListeners();

        console.log('[Offline] Saved pending bill:', bill.bill_no);

        // If online, try to sync immediately
        if (this.isOnline) {
            setTimeout(() => this.processSyncQueue(), 100);
        }

        return bill.id;
    }

    async getPendingBills(): Promise<PendingBill[]> {
        const bills = await this.getAll<PendingBill>(STORES.PENDING_BILLS);
        return bills.filter(b => !b.synced).sort((a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
    }

    async markBillSynced(billId: string): Promise<void> {
        const bill = await this.get<PendingBill>(STORES.PENDING_BILLS, billId);
        if (bill) {
            bill.synced = true;
            await this.store(STORES.PENDING_BILLS, bill);
            await this.notifyPendingBillsListeners();
        }
    }

    async updateBillSyncError(billId: string, error: string): Promise<void> {
        const bill = await this.get<PendingBill>(STORES.PENDING_BILLS, billId);
        if (bill) {
            bill.syncError = error;
            bill.retries = (bill.retries || 0) + 1;
            await this.store(STORES.PENDING_BILLS, bill);
        }
    }

    // Sync queue operations
    async addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
        const queueItem: SyncQueueItem = {
            ...item,
            id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            retryCount: 0
        };

        await this.store(STORES.SYNC_QUEUE, queueItem);
        console.log('Added to sync queue:', queueItem.type, queueItem.action);
    }

    async getSyncQueue(): Promise<SyncQueueItem[]> {
        return this.getAll<SyncQueueItem>(STORES.SYNC_QUEUE);
    }

    async removeFromSyncQueue(id: string): Promise<void> {
        await this.delete(STORES.SYNC_QUEUE, id);
    }

    async processSyncQueue(): Promise<{ synced: number; failed: number }> {
        if (!this.isOnline) {
            return { synced: 0, failed: 0 };
        }

        if (navigator.locks) {
            try {
                return await navigator.locks.request('hotel_pos_offline_sync_lock', { ifAvailable: true }, async (lock) => {
                    if (!lock) {
                        console.log('[Sync] Sync already in progress in another tab. Skipping.');
                        return { synced: 0, failed: 0 };
                    }
                    return await this.executeSyncQueue();
                });
            } catch (err) {
                console.error('[Sync] Web Lock execution failed:', err);
                return { synced: 0, failed: 0 };
            }
        } else {
            // Fallback for environments without Web Locks API
            if (this.syncInProgress) {
                return { synced: 0, failed: 0 };
            }
            this.syncInProgress = true;
            try {
                return await this.executeSyncQueue();
            } finally {
                this.syncInProgress = false;
            }
        }
    }

    private async executeSyncQueue(): Promise<{ synced: number; failed: number }> {
        console.log('[Sync] Starting sync queue processing...');
        let synced = 0;
        let failed = 0;

        try {
            // Process pending bills first
            const pendingBills = await this.getPendingBills();

            for (const bill of pendingBills) {
                if (bill.retries >= 5) {
                    console.warn('[Sync] Max retries reached for bill:', bill.bill_no);
                    failed++;
                    continue;
                }

                try {
                    await this.syncBillToSupabase(bill);
                    await this.markBillSynced(bill.id);
                    synced++;
                    console.log('[Sync] Successfully synced bill:', bill.bill_no);
                } catch (error: any) {
                    console.error('[Sync] Failed to sync bill:', bill.bill_no, error);
                    await this.updateBillSyncError(bill.id, error.message);
                    failed++;
                }
            }

            // Process legacy sync queue (compatibility)
            const queue = await this.getSyncQueue();

            for (const item of queue) {
                try {
                    await this.processQueueItem(item);
                    await this.removeFromSyncQueue(item.id);
                    synced++;
                } catch (error) {
                    console.error('Failed to sync item:', item.id, error);

                    if (item.retryCount < 3) {
                        await this.store(STORES.SYNC_QUEUE, {
                            ...item,
                            retryCount: item.retryCount + 1
                        });
                    }
                    failed++;
                }
            }

            await this.notifyPendingBillsListeners();
        } catch (error) {
            console.error('[Sync] Error processing sync queue:', error);
        } finally {
            console.log(`[Sync] Complete. Synced: ${synced}, Failed: ${failed}`);
        }

        return { synced, failed };
    }

    private async generateNextBillNumberForSync(adminId: string, branchId: string | null): Promise<string> {
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
                .limit(10);

            const today = new Date();
            const dd = String(today.getDate()).padStart(2, '0');
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const yy = String(today.getFullYear()).slice(-2);
            const todayPrefix = `${dd}/${mm}/${yy}`;

            const branchKey = branchId ? `hotel_pos_continue_bill_number_${branchId}` : 'hotel_pos_continue_bill_number';
            const continueBillFromYesterday = (localStorage.getItem(branchKey) ?? localStorage.getItem('hotel_pos_continue_bill_number')) !== 'false';

            if (data && data.length > 0) {
                // Let's inspect the most recent bill number to determine format
                const lastBillNo = data[0].bill_no;
                
                // Check Daily Reset format: DD/MM/YY-XXX
                const dailyMatch = lastBillNo.match(/^(\d{2}\/\d{2}\/\d{2})-(\d+)$/);
                if (dailyMatch) {
                    const lastDatePrefix = dailyMatch[1];
                    const lastCounter = parseInt(dailyMatch[2], 10);
                    
                    if (lastDatePrefix === todayPrefix) {
                        return `${todayPrefix}-${String(lastCounter + 1).padStart(3, '0')}`;
                    } else {
                        return `${todayPrefix}-001`;
                    }
                }

                // Check Sequential format: BILL-XXXXXX
                const seqMatch = lastBillNo.match(/^BILL-(\d+)$/);
                if (seqMatch) {
                    // Find the max sequential number in the recent list (in case of out-of-order creation)
                    let maxSeq = parseInt(seqMatch[1], 10);
                    data.forEach((b: any) => {
                        const m = b.bill_no.match(/^BILL-(\d+)$/);
                        if (m) {
                            const val = parseInt(m[1], 10);
                            if (val > maxSeq) maxSeq = val;
                        }
                    });
                    return `BILL-${String(maxSeq + 1).padStart(6, '0')}`;
                }
            }

            // Fallback if no bills or unrecognized format: check localStorage settings
            if (continueBillFromYesterday) {
                let maxNumber = 0;
                if (data && data.length > 0) {
                    data.forEach((b: any) => {
                        const m = b.bill_no.match(/(\d+)$/);
                        if (m) {
                            const num = parseInt(m[1], 10);
                            if (num > maxNumber) maxNumber = num;
                        }
                    });
                }
                return `BILL-${String(maxNumber + 1).padStart(6, '0')}`;
            } else {
                return `${todayPrefix}-001`;
            }
        } catch (e) {
            console.error('[BillCounterSync] Failed to generate next bill number, using timestamp fallback:', e);
            return `BILL-SYNC-${Date.now()}`;
        }
    }

    private async syncBillToSupabase(bill: PendingBill): Promise<void> {
        // Generate proper sequential or daily reset bill number
        const properBillNumber = await this.generateNextBillNumberForSync(bill.admin_id || '', bill.branch_id || null);

        // Create the bill in Supabase with full data isolation and GST columns
        const billData: any = {
            bill_no: properBillNumber,
            total_amount: bill.total_amount,
            discount: bill.discount,
            payment_mode: bill.payment_mode as any,
            payment_details: bill.payment_details,
            additional_charges: bill.additional_charges,
            created_by: bill.created_by,
            admin_id: bill.admin_id || null,
            branch_id: bill.branch_id || null,
            date: bill.date,
            service_status: 'pending' as const,
            kitchen_status: 'pending' as const,
            table_no: bill.table_no || null,
            round_off: bill.round_off || 0,
            order_type: bill.order_type || 'dine_in'
        };

        if (bill.tax_summary) {
            billData.tax_summary = bill.tax_summary;
            billData.total_tax = bill.total_tax || 0;
            billData.customer_gstin = bill.customer_gstin || null;
        }

        const { data: createdBill, error: billError } = await supabase
            .from('bills')
            .insert([billData])
            .select()
            .single();

        if (billError) throw billError;
        if (!createdBill) throw new Error('Failed to create bill');

        // Create bill items with tax snapshots
        const billItems = bill.items.map(item => {
            const billItem: any = {
                bill_id: createdBill.id,
                item_id: item.item_id,
                quantity: item.quantity,
                price: item.price,
                total: item.total
            };
            if (item.tax_rate_snapshot !== undefined && item.tax_rate_snapshot !== null) {
                billItem.tax_rate_snapshot = item.tax_rate_snapshot;
            }
            if (item.hsn_code !== undefined && item.hsn_code !== null) {
                billItem.hsn_code = item.hsn_code;
            }
            if (item.tax_amount !== undefined && item.tax_amount !== null) {
                billItem.tax_amount = item.tax_amount;
            }
            return billItem;
        });

        const { error: itemsError } = await supabase
            .from('bill_items')
            .insert(billItems);

        if (itemsError) {
            // Rollback
            await supabase.from('bills').delete().eq('id', createdBill.id);
            throw itemsError;
        }

        // Deduct stock in Supabase (parallel requests)
        const stockUpdatePromises = bill.items.map(async (item) => {
            try {
                const { data: currentItem } = await supabase
                    .from('items')
                    .select('stock_quantity, selling_unit, inventory_unit, unit')
                    .eq('id', item.item_id)
                    .single();

                if (currentItem && currentItem.stock_quantity !== null && currentItem.stock_quantity !== undefined) {
                    const sellUnit = currentItem.selling_unit || currentItem.unit;
                    const invUnit = currentItem.inventory_unit;
                    const deductionInInvUnit = convertToInventoryUnit(item.quantity, sellUnit, invUnit);
                    await supabase
                        .from('items')
                        .update({ stock_quantity: Math.max(0, currentItem.stock_quantity - deductionInInvUnit) })
                        .eq('id', item.item_id);
                }
            } catch (err) {
                console.warn("[Sync] Stock update failed for item", item.item_id, err);
            }
        });
        await Promise.all(stockUpdatePromises);

        console.log(`[Sync] Offline bill ${bill.bill_no} → ${properBillNumber}`);

        // Delete the temporary offline bill from STORES.BILLS cache
        await this.delete(STORES.BILLS, bill.id);

        // Cache the newly created online bill with its items
        const syncedBillCached = {
            ...createdBill,
            synced: true,
            bill_items: bill.items.map(item => ({
                item_id: item.item_id,
                quantity: item.quantity,
                price: item.price,
                total: item.total,
                items: {
                    name: item.name,
                    category: 'Unknown',
                    is_active: true
                }
            }))
        };
        await this.store(STORES.BILLS, syncedBillCached);

        // Dispatch sync event
        window.dispatchEvent(new CustomEvent('bills-updated'));
    }

    private async processQueueItem(item: SyncQueueItem): Promise<void> {
        switch (item.type) {
            case 'bill':
                if (item.action === 'create') {
                    const billData = item.data.bill;
                    const itemsData = item.data.items;

                    // Generate proper sequential bill number
                    const { data: allBillNos } = await supabase
                        .from('bills')
                        .select('bill_no')
                        .order('created_at', { ascending: false })
                        .limit(100);

                    let maxNumber = 55;
                    if (allBillNos && allBillNos.length > 0) {
                        allBillNos.forEach((bill: any) => {
                            const match = bill.bill_no.match(/^BILL-(\d{6})$/);
                            if (match) {
                                const num = parseInt(match[1], 10);
                                if (num > maxNumber) {
                                    maxNumber = num;
                                }
                            }
                        });
                    }
                    const properBillNumber = `BILL-${String(maxNumber + 1).padStart(6, '0')}`;

                    const finalBillData = {
                        ...billData,
                        bill_no: properBillNumber
                    };

                    const { data: createdBill, error: billError } = await supabase
                        .from('bills')
                        .insert(finalBillData)
                        .select()
                        .single();

                    if (billError) throw billError;

                    if (createdBill && itemsData && itemsData.length > 0) {
                        const billItems = itemsData.map((billItem: any) => ({
                            bill_id: createdBill.id,
                            item_id: billItem.item_id,
                            quantity: billItem.quantity,
                            price: billItem.price,
                            total: billItem.total
                        }));

                        const { error: itemsError } = await supabase
                            .from('bill_items')
                            .insert(billItems);

                        if (itemsError) {
                            await supabase.from('bills').delete().eq('id', createdBill.id);
                            throw itemsError;
                        }
                    }

                    console.log(`Offline bill synced: ${billData.bill_no} → ${properBillNumber}`);
                }
                break;
            case 'expense':
                if (item.action === 'create') {
                    const { error } = await supabase.from('expenses').insert(item.data);
                    if (error) throw error;
                }
                break;
            default:
                console.warn('Unknown sync item type:', item.type);
        }
    }

    // Convenience methods for specific data types
    async cacheItems(items: any[]): Promise<void> {
        await this.storeMany(STORES.ITEMS, items);
    }

    async getCachedItems(): Promise<any[]> {
        return this.getAll(STORES.ITEMS);
    }

    async cacheCategories(categories: any[]): Promise<void> {
        await this.storeMany(STORES.CATEGORIES, categories);
    }

    async getCachedCategories(): Promise<any[]> {
        return this.getAll(STORES.CATEGORIES);
    }

    async cacheBill(bill: any): Promise<void> {
        await this.store(STORES.BILLS, { ...bill, synced: this.isOnline });
    }

    async getCachedBills(): Promise<any[]> {
        return this.getAll(STORES.BILLS);
    }

    async getPendingBillsCount(): Promise<number> {
        const bills = await this.getPendingBills();
        return bills.length;
    }
}

// Singleton instance
export const offlineManager = new OfflineManager();

// React hook for network status
export function useNetworkStatus() {
    const [isOnline, setIsOnline] = React.useState(navigator.onLine);

    React.useEffect(() => {
        const unsubscribe = offlineManager.onNetworkChange(setIsOnline);
        return unsubscribe;
    }, []);

    return isOnline;
}
