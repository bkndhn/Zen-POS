/**
 * Offline-First PWA Manager v2
 * Provides IndexedDB persistence and sync queue for offline billing
 * Features: Auto-sync on reconnect, conflict resolution, retry with backoff
 */

import * as React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { convertToInventoryUnit, toStoredQuantity2 } from '@/utils/timeUtils';

import { initStoragePersistence, secondaryVault } from './nativeStorage';
import type { StorageBackend } from './storage/StorageBackend';

// Database configuration
const DB_NAME = 'HotelPOS_OfflineDB';
const DB_VERSION = 5;

// Store names
const STORES = {
    ITEMS: 'items',
    BILLS: 'bills',
    CATEGORIES: 'categories',
    SYNC_QUEUE: 'syncQueue',
    SETTINGS: 'settings',
    PENDING_BILLS: 'pendingBills',
    EXPENSES: 'expenses',
    TABLES: 'tables',
    TABLE_ORDERS: 'tableOrders',
    CUSTOMERS: 'customers',
    ADDITIONAL_CHARGES: 'additionalCharges',
    PAYMENTS: 'payments',
    TAX_RATES: 'taxRates',
    DISPLAY_SETTINGS: 'displaySettings',
    BRANCHES: 'branches',
    OFFLINE_CACHE: 'offlineCache',
    WRITE_QUEUE: 'writeQueue'
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
    customer_mobile?: string | null;
    customer_phone?: string | null;
    service_status?: string;
    kitchen_status?: string;
}

interface SyncQueueItem {
    id: string;
    type: 'bill' | 'expense' | 'item' | 'table_order' | 'table';
    action: 'create' | 'update' | 'delete' | 'update_status';
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

    /**
     * Optional StorageBackend delegate.
     * When set (on native Capacitor), storage operations use SQLite.
     * When null (on web), the existing IndexedDB code path is used.
     */
    private backend: StorageBackend | null = null;

    constructor() {
        this.initializeDB();
        this.setupNetworkListeners();
        this.setupAuthListeners();
    }

    /**
     * Set the storage backend (called from initStorage after platform detection).
     * On native: SQLiteBackend. On web: null (keeps using IndexedDB directly).
     */
    setBackend(backend: StorageBackend): void {
        this.backend = backend;
        console.log(`[OfflineManager] Storage backend set: ${backend.constructor.name}`);
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

                // Perform cold boot vault recovery if needed
                this.verifyAndRestoreVaultMirror().catch(err => console.warn('[Vault] Cold boot recovery check error:', err));

                if (this.isOnline) {
                    this.processSyncQueue().catch(err => {
                        console.error('[Sync] Auto-sync on startup failed:', err);
                    });
                }
                
                // Run privacy auto-wipe on startup
                this.performAutoWipe().catch(err => console.error('[Privacy] Auto-wipe failed:', err));
                
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

                if (!db.objectStoreNames.contains(STORES.EXPENSES)) {
                    const expenseStore = db.createObjectStore(STORES.EXPENSES, { keyPath: 'id' });
                    expenseStore.createIndex('date', 'date');
                }

                if (!db.objectStoreNames.contains(STORES.TABLES)) {
                    db.createObjectStore(STORES.TABLES, { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains(STORES.TABLE_ORDERS)) {
                    db.createObjectStore(STORES.TABLE_ORDERS, { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains(STORES.CUSTOMERS)) {
                    const custStore = db.createObjectStore(STORES.CUSTOMERS, { keyPath: 'id' });
                    custStore.createIndex('phone', 'phone');
                }

                if (!db.objectStoreNames.contains(STORES.ADDITIONAL_CHARGES)) {
                    db.createObjectStore(STORES.ADDITIONAL_CHARGES, { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains(STORES.PAYMENTS)) {
                    db.createObjectStore(STORES.PAYMENTS, { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains(STORES.TAX_RATES)) {
                    db.createObjectStore(STORES.TAX_RATES, { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains(STORES.DISPLAY_SETTINGS)) {
                    db.createObjectStore(STORES.DISPLAY_SETTINGS, { keyPath: 'user_id' });
                }

                if (!db.objectStoreNames.contains(STORES.BRANCHES)) {
                    db.createObjectStore(STORES.BRANCHES, { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains(STORES.OFFLINE_CACHE)) {
                    const cacheStore = db.createObjectStore(STORES.OFFLINE_CACHE, { keyPath: 'cacheKey' });
                    cacheStore.createIndex('table', 'table');
                    cacheStore.createIndex('updatedAt', 'updatedAt');
                }

                if (!db.objectStoreNames.contains(STORES.WRITE_QUEUE)) {
                    const writeStore = db.createObjectStore(STORES.WRITE_QUEUE, { keyPath: 'id' });
                    writeStore.createIndex('table', 'table');
                    writeStore.createIndex('status', 'status');
                    writeStore.createIndex('timestamp', 'timestamp');
                }

                console.log('IndexedDB stores created/upgraded to v5');
            };
        });
        
        // Request OS-level storage persistence to prevent auto-eviction
        initStoragePersistence().catch(err => console.warn('[Storage] Persist init error:', err));
    }

    private async performAutoWipe(): Promise<void> {
        if (!this.db) return;
        
        try {
            // Snapshot keys first to avoid issues with iteration during modification
            const keys: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.includes('hotel_pos_auto_wipe_days')) keys.push(k);
            }
            
            for (const key of keys) {
                const days = parseInt(localStorage.getItem(key) || '0', 10);
                if (!days || days <= 0 || isNaN(days)) continue;
                
                const isGlobal = key === 'hotel_pos_auto_wipe_days';
                const branchId = isGlobal ? '' : key.replace('hotel_pos_auto_wipe_days_', '');
                const storageModeKey = isGlobal ? 'privacy_storage_mode' : `privacy_storage_mode_${branchId}`;
                const isLocal = localStorage.getItem(storageModeKey) === 'local';
                
                if (!isLocal) continue;
                
                const cutoffTime = new Date();
                cutoffTime.setDate(cutoffTime.getDate() - days);
                const cutoffString = cutoffTime.toISOString();
                
                try {
                    const transaction = this.db!.transaction([STORES.BILLS], 'readwrite');
                    const store = transaction.objectStore(STORES.BILLS);
                    const request = store.getAll();
                    
                    request.onsuccess = () => {
                        const bills = request.result;
                        let deletedCount = 0;
                        for (const bill of bills) {
                            if ((isGlobal || bill.branch_id === branchId) && bill.created_at && bill.created_at < cutoffString) {
                                try {
                                    store.delete(bill.id);
                                    deletedCount++;
                                } catch (delErr) {
                                    console.warn('[Privacy] Failed to delete bill:', bill.id, delErr);
                                }
                            }
                        }
                        if (deletedCount > 0) {
                            console.log(`[Privacy] Auto-wiped ${deletedCount} local bills older than ${days} days.`);
                        }
                    };
                    
                    request.onerror = () => {
                        console.error('[Privacy] Failed to read bills for auto-wipe:', request.error);
                    };
                    
                    transaction.onerror = () => {
                        console.error('[Privacy] Auto-wipe transaction error:', transaction.error);
                    };
                } catch (txErr) {
                    console.error('[Privacy] Failed to create auto-wipe transaction:', txErr);
                }
            }
        } catch (err) {
            console.error('Error during auto-wipe:', err);
        }
    }

    private setupNetworkListeners(): void {
        window.addEventListener('online', async () => {
            this.isOnline = true;
            this.notifyListeners();
            console.log('Network: Online - Starting sync');
            
            try {
                await this.resetSyncRetries();
            } catch (err) {
                console.error('Failed to reset retries on network status change:', err);
            }
            
            // Auto-sync with delay to ensure stable connection
            setTimeout(() => {
                this.processSyncQueue();
                this.processWriteQueue();
            }, 1000);
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.notifyListeners();
            console.log('Network: Offline mode active');
        });
    }

    
    private setupAuthListeners(): void {
        supabase.auth.onAuthStateChange(async (event, session) => {
            if (!session?.user) {
                console.log('[Sync] User logged out. Wiping offline cache...');
                await this.clearCache().catch(console.error);
            } else if (session?.user) {
                console.log(`[Sync] Auth state changed: ${event}. Resetting retries and syncing...`);
                try {
                    await this.resetSyncRetries();
                    // Sync after a brief delay to let session state settle
                    setTimeout(() => this.processSyncQueue(), 500);
                } catch (err) {
                    console.error('[Sync] Failed to reset retries on auth state change:', err);
                }
            }
        });
    }

    async clearCache(): Promise<void> {
        const wipeStores = [STORES.ITEMS, STORES.BILLS, STORES.CATEGORIES, STORES.SYNC_QUEUE, STORES.SETTINGS, STORES.PENDING_BILLS];

        // Wipe the active storage backend (SQLite/WASM) first — live data lives there.
        if (this.backend?.isReady()) {
            for (const store of wipeStores) {
                try {
                    await this.backend.clearTable(store);
                } catch (e) {
                    console.warn(`[OfflineManager] Failed clearing backend table ${store}:`, e);
                }
            }
        }

        // Also wipe the legacy IndexedDB stores so nothing lingers from before migration.
        await new Promise<void>((resolve, reject) => {
            if (!this.db) { resolve(); return; }
            const tx = this.db.transaction(wipeStores, 'readwrite');
            tx.oncomplete = () => { console.log('Offline cache cleared successfully'); resolve(); };
            tx.onerror = () => { console.error('Error clearing offline cache'); reject(tx.error); };

            wipeStores.forEach(store => tx.objectStore(store).clear());
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
        // Delegate to SQLite backend if available
        if (this.backend?.isReady()) {
            return this.backend.put(storeName, data);
        }

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
        // Delegate to SQLite backend if available
        if (this.backend?.isReady()) {
            return this.backend.putMany(storeName, items);
        }

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
        // Delegate to SQLite backend if available
        if (this.backend?.isReady()) {
            return this.backend.get(storeName, key);
        }

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
        // Delegate to SQLite backend if available
        if (this.backend?.isReady()) {
            return this.backend.getAll(storeName);
        }

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
        // Delegate to SQLite backend if available
        if (this.backend?.isReady()) {
            return this.backend.remove(storeName, key);
        }

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
        // Delegate to SQLite backend if available
        if (this.backend?.isReady()) {
            return this.backend.clearTable(storeName);
        }

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
        
        // Fail-safe secondary vault mirror for Android cold reboot protection
        try {
            const allPending = await this.getPendingBills();
            await secondaryVault.saveMirror('pending_bills', allPending);
        } catch (err) {
            console.warn('[Vault] Failed to mirror pending bill:', err);
        }

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
        
        // Attempt Background Sync Registration
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            try {
                const registration = await navigator.serviceWorker.ready;
                // @ts-expect-error - TS doesn't know about sync property sometimes
                if (registration.sync) {
                    // @ts-expect-error - sync property might be missing in TS types
                    await registration.sync.register('hotel_pos_sync');
                    console.log('[Background Sync] Registered sync event.');
                }
            } catch (err) {
                console.warn('[Background Sync] Could not register sync:', err);
            }
        }

    }

    async getSyncQueue(): Promise<SyncQueueItem[]> {
        return this.getAll<SyncQueueItem>(STORES.SYNC_QUEUE);
    }

    async removeFromSyncQueue(id: string): Promise<void> {
        await this.delete(STORES.SYNC_QUEUE, id);
    }

    async resetSyncRetries(): Promise<void> {
        // Backend path (SQLite/WASM) — this is where live data resides.
        if (this.backend?.isReady()) {
            const bills = await this.backend.getAll<any>(STORES.PENDING_BILLS);
            const toReset = bills.filter(b => !b.synced && (b.retries > 0 || b.syncError));
            if (toReset.length > 0) {
                await this.backend.putMany(STORES.PENDING_BILLS, toReset.map(b => ({
                    ...b,
                    retries: 0,
                    syncError: undefined,
                })));
            }
            console.log('[Sync] Reset retries and error flags for all pending bills');
            return;
        }

        if (!this.db) await this.initializeDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(STORES.PENDING_BILLS, 'readwrite');
            const store = transaction.objectStore(STORES.PENDING_BILLS);
            const request = store.getAll();
            
            request.onsuccess = async () => {
                const bills = request.result || [];
                const updatePromises = bills.map(bill => {
                    if (!bill.synced && (bill.retries > 0 || bill.syncError)) {
                        bill.retries = 0;
                        bill.syncError = undefined;
                        return new Promise<void>((res, rej) => {
                            const putReq = store.put(bill);
                            putReq.onsuccess = () => res();
                            putReq.onerror = () => rej(putReq.error);
                        });
                    }
                    return Promise.resolve();
                });
                
                try {
                    await Promise.all(updatePromises);
                    console.log('[Sync] Reset retries and error flags for all pending bills');
                    resolve();
                } catch (err) {
                    reject(err);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async processSyncQueue(forceRetry: boolean = false): Promise<{ synced: number; failed: number }> {
        if (!this.isOnline) {
            return { synced: 0, failed: 0 };
        }

        if (forceRetry) {
            try {
                await this.resetSyncRetries();
            } catch (err) {
                console.error('[Sync] Failed to reset retries:', err);
            }
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
            // Check active session first
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                console.log('[Sync] No active session. Skipping sync queue processing.');
                return { synced: 0, failed: 0 };
            }

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
            // Fire and forget pruning
            this.pruneSyncedBills(30).catch(e => console.warn('[Cloud Pruning] Failed:', e));
        }

        return { synced, failed };
    }

    /**
     * Automatically deletes old synced bills from local storage (IndexedDB)
     * to prevent browser storage quota bloat. Keeps local-only bills untouched.
     */
    async pruneSyncedBills(retentionDays: number = 30): Promise<void> {
        const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

        // Backend path (SQLite/WASM) — this is where live data resides.
        if (this.backend?.isReady()) {
            try {
                const bills = await this.backend.getAll<any>(STORES.BILLS);
                let prunedCount = 0;
                for (const bill of bills) {
                    if (bill.synced === true && bill.created_at && new Date(bill.created_at).getTime() < cutoffMs) {
                        await this.backend.remove(STORES.BILLS, bill.id);
                        prunedCount++;
                    }
                }
                if (prunedCount > 0) {
                    console.log(`[Cloud Pruning] Deleted ${prunedCount} old synced bills from local cache.`);
                }
            } catch (error) {
                console.error('[Cloud Pruning] Error pruning bills:', error);
            }
            return;
        }

        try {
            if (!this.db) await this.initializeDB();
            if (!this.db) return;
            const transaction = this.db.transaction(STORES.BILLS, 'readwrite');
            const store = transaction.objectStore(STORES.BILLS);
            const request = store.getAll();

            request.onsuccess = () => {
                const bills = request.result;
                const cutoffTime = new Date();
                cutoffTime.setDate(cutoffTime.getDate() - retentionDays);
                const cutoffMs = cutoffTime.getTime();

                let prunedCount = 0;
                for (const bill of bills) {
                    if (bill.synced === true && bill.created_at) {
                        const billTime = new Date(bill.created_at).getTime();
                        if (billTime < cutoffMs) {
                            store.delete(bill.id);
                            prunedCount++;
                        }
                    }
                }
                if (prunedCount > 0) {
                    console.log(`[Cloud Pruning] Deleted ${prunedCount} old synced bills from local cache.`);
                }
            };
        } catch (error) {
            console.error('[Cloud Pruning] Error pruning bills:', error);
        }
    }

    private async generateNextBillNumberForSync(adminId: string, branchId: string | null): Promise<string> {
        if (!adminId || adminId === '') {
            throw new Error('Cannot generate bill number: adminId is required');
        }

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

            const { data, error } = await query
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) {
                console.error('[BillCounterSync] Error fetching recent bills:', error);
                throw error;
            }

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
            console.error('[BillCounterSync] Failed to generate next bill number:', e);
            throw e;
        }
    }

    private async syncBillToSupabase(bill: PendingBill): Promise<void> {
        // Resolve active session details as fallback for data integrity
        const { data: { session } } = await supabase.auth.getSession();
        const currentUserId = session?.user?.id;
        
        let finalCreatedBy = bill.created_by;
        if (!finalCreatedBy || finalCreatedBy === '' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalCreatedBy)) {
            finalCreatedBy = currentUserId || '';
        }
        
        let finalAdminId = bill.admin_id;
        if (!finalAdminId || finalAdminId === '' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalAdminId)) {
            if (currentUserId) {
                const cachedProfileStr = localStorage.getItem(`profile_${currentUserId}`);
                if (cachedProfileStr) {
                    try {
                        const prof = JSON.parse(cachedProfileStr);
                        finalAdminId = prof.admin_id || prof.id;
                    } catch {}
                }
            }
        }
        
        let finalBranchId = bill.branch_id;
        if (finalBranchId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalBranchId)) {
            finalBranchId = null;
        }

        // --- Data Privacy Check ---
        let allowCloudStorage = true;
        let privacyMode = 'cloud';
        
        if (currentUserId) {
            const cachedProfileStr = localStorage.getItem(`profile_${currentUserId}`);
            if (cachedProfileStr) {
                try {
                    const prof = JSON.parse(cachedProfileStr);
                    if (prof.client_permissions && prof.client_permissions.allow_cloud_storage === false) {
                        allowCloudStorage = false;
                    }
                } catch {}
            }
        }
        
        const branchKey = finalBranchId ? `privacy_storage_mode_${finalBranchId}` : 'privacy_storage_mode';
        privacyMode = localStorage.getItem(branchKey) || localStorage.getItem('privacy_storage_mode') || 'cloud';

        if (!allowCloudStorage || privacyMode === 'local') {
            console.log(`[Sync] Local Only mode active for bill ${bill.bill_no}. Skipping Supabase upload.`);
            
            // Delete from pending bills cache
            await this.delete(STORES.PENDING_BILLS, bill.id);
            
            // Cache the local-only bill so it appears in reports locally
            const localBillCached = {
                id: bill.id,
                bill_no: bill.bill_no,
                total_amount: bill.total_amount,
                discount: bill.discount,
                payment_mode: bill.payment_mode,
                payment_details: bill.payment_details,
                additional_charges: bill.additional_charges,
                created_by: finalCreatedBy,
                admin_id: finalAdminId || null,
                branch_id: finalBranchId || null,
                date: bill.date,
                created_at: bill.created_at,
                status_updated_at: bill.created_at,
                service_status: bill.service_status || 'pending',
                kitchen_status: bill.kitchen_status || 'pending',
                table_no: bill.table_no || null,
                round_off: bill.round_off || 0,
                order_type: bill.order_type || 'dine_in',
                customer_mobile: bill.customer_mobile || null,
                customer_phone: bill.customer_phone || null,
                tax_summary: bill.tax_summary || null,
                total_tax: bill.total_tax || 0,
                customer_gstin: bill.customer_gstin || null,
                synced: true, // Marked as synced so it doesn't trigger pending indicators
                is_local_only: true, // Custom flag to identify local bills
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
            await this.store(STORES.BILLS, localBillCached);
            window.dispatchEvent(new CustomEvent('bills-updated'));
            const bc = new BroadcastChannel('zenpos-events');
            bc.postMessage({ type: 'bills-updated' });
            setTimeout(() => bc.close(), 100);
            return; // Exit early, no upload to Supabase!
        }
        // --- End Data Privacy Check ---

        // Sanitize payment mode to match Supabase payment_method enum: cash, card, upi, other
        let finalPaymentMode = bill.payment_mode ? bill.payment_mode.toLowerCase() : 'cash';
        if (!['cash', 'card', 'upi', 'other'].includes(finalPaymentMode)) {
            if (finalPaymentMode.includes('online')) {
                finalPaymentMode = 'other';
            } else if (finalPaymentMode === 'split') {
                finalPaymentMode = 'other';
            } else {
                finalPaymentMode = 'cash';
            }
        }

        // Generate proper sequential or daily reset bill number
        const properBillNumber = await this.generateNextBillNumberForSync(finalAdminId || '', finalBranchId);

        // Create the bill in Supabase with full data isolation and GST columns
        const billData: any = {
            bill_no: properBillNumber,
            total_amount: bill.total_amount,
            discount: bill.discount,
            payment_mode: finalPaymentMode as any,
            payment_details: bill.payment_details,
            additional_charges: bill.additional_charges,
            created_by: finalCreatedBy,
            admin_id: finalAdminId || null,
            branch_id: finalBranchId || null,
            date: bill.date,
            created_at: bill.created_at,
            status_updated_at: bill.created_at,
            service_status: 'pending' as const,
            kitchen_status: 'pending' as const,
            table_no: bill.table_no || null,
            round_off: bill.round_off || 0,
            order_type: bill.order_type || 'dine_in',
            customer_mobile: bill.customer_mobile || null,
            customer_phone: bill.customer_phone || null
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

        // Sync CRM Customer details
        const cleanPhone = bill.customer_mobile?.replace(/[\s\-\(\)\+]/g, '') || '';
        if (finalAdminId && cleanPhone.length >= 10) {
            try {
                let lookup: any = supabase
                    .from('customers')
                    .select('id, visit_count, total_spent')
                    .eq('admin_id', finalAdminId)
                    .eq('phone', cleanPhone);
                if (finalBranchId) lookup = lookup.eq('branch_id', finalBranchId);
                const { data: existingCustomer } = await lookup.maybeSingle();

                if (existingCustomer) {
                    await supabase
                        .from('customers')
                        .update({
                            visit_count: existingCustomer.visit_count + 1,
                            total_spent: Number(existingCustomer.total_spent) + Number(bill.total_amount),
                            last_visit: new Date().toISOString()
                        })
                        .eq('id', existingCustomer.id);
                } else {
                    await supabase
                        .from('customers')
                        .insert({
                            admin_id: finalAdminId,
                            branch_id: finalBranchId || null,
                            phone: cleanPhone,
                            name: `Customer (${cleanPhone.slice(-4)})`,
                            visit_count: 1,
                            total_spent: bill.total_amount,
                            last_visit: new Date().toISOString()
                        });
                }
            } catch (crmErr) {
                console.warn('[Sync] Failed to sync customer to CRM:', crmErr);
            }
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
                        .update({ stock_quantity: toStoredQuantity2(Math.max(0, currentItem.stock_quantity - deductionInInvUnit)) })
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
        const bc = new BroadcastChannel('zenpos-events');
        bc.postMessage({ type: 'bills-updated' });
        setTimeout(() => bc.close(), 100);
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
            case 'table_order':
                if (item.action === 'create') {
                    const { error } = await supabase.from('table_orders').insert(item.data);
                    if (error) throw error;
                }
                break;
            case 'table':
                if (item.action === 'update_status') {
                    const { error } = await supabase
                        .from('tables')
                        .update({ status: item.data.status })
                        .eq('id', item.data.id);
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

    async getCachedItems(adminId?: string, branchId?: string | null): Promise<any[]> {
        const items = await this.getAll<any>(STORES.ITEMS);
        if (!items || items.length === 0) return [];
        if (!adminId) return items;
        return items.filter(item => 
            (!item.admin_id || item.admin_id === adminId) && 
            (!branchId || item.branch_id === branchId)
        );
    }

    async cacheCategories(categories: any[]): Promise<void> {
        await this.storeMany(STORES.CATEGORIES, categories);
    }

    async getCachedCategories(adminId?: string, branchId?: string | null): Promise<any[]> {
        const categories = await this.getAll<any>(STORES.CATEGORIES);
        if (!categories || categories.length === 0) return [];
        if (!adminId) return categories;
        return categories.filter(cat => 
            (!cat.admin_id || cat.admin_id === adminId) && 
            (!branchId || !cat.branch_id || cat.branch_id === branchId)
        );
    }

    async cacheAdditionalCharges(charges: any[]): Promise<void> {
        await this.storeMany(STORES.ADDITIONAL_CHARGES, charges);
    }

    async getCachedAdditionalCharges(adminId?: string, branchId?: string | null): Promise<any[]> {
        const charges = await this.getAll<any>(STORES.ADDITIONAL_CHARGES);
        if (!charges || charges.length === 0) return [];
        if (!adminId) return charges;
        return charges.filter(c => 
            (!c.admin_id || c.admin_id === adminId) && 
            (!branchId || !c.branch_id || c.branch_id === branchId)
        );
    }

    async cachePaymentTypes(types: any[]): Promise<void> {
        await this.storeMany(STORES.PAYMENTS, types);
    }

    async getCachedPaymentTypes(adminId?: string, branchId?: string | null): Promise<any[]> {
        const types = await this.getAll<any>(STORES.PAYMENTS);
        if (!types || types.length === 0) return [];
        if (!adminId) return types;
        return types.filter(t => 
            (!t.admin_id || t.admin_id === adminId) && 
            (!branchId || !t.branch_id || t.branch_id === branchId)
        );
    }

    async cacheTaxRates(rates: any[]): Promise<void> {
        await this.storeMany(STORES.TAX_RATES, rates);
    }

    async getCachedTaxRates(adminId?: string): Promise<any[]> {
        const rates = await this.getAll<any>(STORES.TAX_RATES);
        if (!rates || rates.length === 0) return [];
        if (!adminId) return rates;
        return rates.filter(r => !r.admin_id || r.admin_id === adminId);
    }

    async cacheDisplaySettings(userId: string, settings: any): Promise<void> {
        if (!userId) return;
        await this.store(STORES.DISPLAY_SETTINGS, { user_id: userId, ...settings });
    }

    async getCachedDisplaySettings(userId?: string): Promise<any | null> {
        if (!userId) return null;
        return await this.get<any>(STORES.DISPLAY_SETTINGS, userId);
    }

    async cacheBranches(branches: any[]): Promise<void> {
        await this.storeMany(STORES.BRANCHES, branches);
    }

    async getCachedBranches(adminId?: string): Promise<any[]> {
        const branches = await this.getAll<any>(STORES.BRANCHES);
        if (!branches || branches.length === 0) return [];
        if (!adminId) return branches;
        return branches.filter(b => !b.admin_id || b.admin_id === adminId);
    }

    async cacheBill(bill: any): Promise<void> {
        await this.store(STORES.BILLS, { ...bill, synced: this.isOnline });
    }

    /**
     * Batch-caches bills in a single IDB transaction for performance.
     * Preserves the original synced status from the backup data.
     */
    async cacheBillsBatch(bills: any[]): Promise<void> {
        await this.storeMany(STORES.BILLS, bills);
    }

    /**
     * Batch-caches pending bills in a single IDB transaction for performance.
     */
    async cachePendingBillsBatch(pendingBills: any[]): Promise<void> {
        await this.storeMany(STORES.PENDING_BILLS, pendingBills);
    }

    
    async getCachedBills(adminId?: string, branchId?: string | null): Promise<any[]> {
        const bills = await this.getAll<any>(STORES.BILLS);
        if (!bills || bills.length === 0) return [];
        if (!adminId) return bills;
        return bills.filter(bill => 
            (!bill.admin_id || bill.admin_id === adminId) && 
            (!branchId || !bill.branch_id || bill.branch_id === branchId)
        );
    }

    /**
     * Merges online Supabase bills with offline pending & local-only bills from IndexedDB.
     * Deduplicates by id and bill_no so offline bills appear across Dashboard, Analytics, and Reports.
    async markBillDeleted(billId: string): Promise<void> {
        try {
            await this.delete(STORES.BILLS, billId);
            await this.delete(STORES.PENDING_BILLS, billId);
        } catch (err) {
            console.warn('[OfflineManager] Failed to purge deleted bill locally:', err);
        }
    }

    /**
     * Merge offline/pending bills into Supabase bills list for local display.
     * Deduplicates by id and bill_no so offline bills appear across Dashboard, Analytics, and Reports.
     */
    async mergeOfflineBills(supabaseBills: any[], adminId?: string, branchId?: string | null): Promise<any[]> {
        try {
            const [cachedBills, pendingBills] = await Promise.all([
                this.getCachedBills(adminId, branchId),
                this.getPendingBills()
            ]);

            const existingIds = new Set((supabaseBills || []).map((b: any) => b.id));
            const existingBillNos = new Set((supabaseBills || []).map((b: any) => b.bill_no));
            const deletedIds = new Set((supabaseBills || []).filter((b: any) => b.is_deleted).map((b: any) => b.id));
            const deletedBillNos = new Set((supabaseBills || []).filter((b: any) => b.is_deleted).map((b: any) => b.bill_no));

            const offlineMerged: any[] = [];

            const matchesScope = (b: any) => {
                if (!b || b.is_deleted) return false;
                if (b.id && deletedIds.has(b.id)) return false;
                if (b.bill_no && deletedBillNos.has(b.bill_no)) return false;
                const bAdminId = b.admin_id;
                const bBranchId = b.branch_id;
                const adminMatch = !adminId || !bAdminId || bAdminId === adminId;
                const branchMatch = !branchId || !bBranchId || bBranchId === branchId;
                return adminMatch && branchMatch;
            };

            // Pending bills (created while offline)
            (pendingBills || []).forEach((pb: any) => {
                if (matchesScope(pb) && !existingIds.has(pb.id) && (!pb.bill_no || !existingBillNos.has(pb.bill_no))) {
                    existingIds.add(pb.id);
                    if (pb.bill_no) existingBillNos.add(pb.bill_no);
                    offlineMerged.push({
                        ...pb,
                        is_offline_pending: true
                    });
                }
            });

            // Local-only/cached bills - ONLY merge if offline, because if online, supabase is the source of truth
            if (!this.isOnline || (supabaseBills && supabaseBills.length === 0 && !this.isOnline)) {
                (cachedBills || []).forEach((cb: any) => {
                    if (matchesScope(cb) && !existingIds.has(cb.id) && (!cb.bill_no || !existingBillNos.has(cb.bill_no))) {
                        existingIds.add(cb.id);
                        if (cb.bill_no) existingBillNos.add(cb.bill_no);
                        offlineMerged.push(cb);
                    }
                });
            }

            return [...(supabaseBills || []), ...offlineMerged];
        } catch (err) {
            console.warn('[OfflineManager] Failed to merge offline bills:', err);
            return supabaseBills || [];
        }
    }

    async getPendingBillsCount(): Promise<number> {
        const bills = await this.getPendingBills();
        return bills.length;
    }

    // Extended local store handlers for 100% local operation
    async cacheExpenses(expenses: any[]): Promise<void> {
        await this.storeMany(STORES.EXPENSES, expenses);
    }

    async getCachedExpenses(adminId?: string, branchId?: string | null): Promise<any[]> {
        const expenses = await this.getAll<any>(STORES.EXPENSES);
        if (!adminId) return expenses;
        return expenses.filter(exp => 
            exp.admin_id === adminId && 
            (branchId ? exp.branch_id === branchId : (exp.branch_id === null || exp.branch_id === undefined))
        );
    }

    async cacheTables(tables: any[]): Promise<void> {
        await this.storeMany(STORES.TABLES, tables);
    }

    async getCachedTables(adminId?: string, branchId?: string | null): Promise<any[]> {
        const tables = await this.getAll<any>(STORES.TABLES);
        if (!adminId) return tables;
        return tables.filter(t => 
            t.admin_id === adminId && 
            (branchId ? t.branch_id === branchId : (t.branch_id === null || t.branch_id === undefined))
        );
    }

    async cacheCustomers(customers: any[]): Promise<void> {
        await this.storeMany(STORES.CUSTOMERS, customers);
    }

    async getCachedCustomers(adminId?: string, branchId?: string | null): Promise<any[]> {
        const customers = await this.getAll<any>(STORES.CUSTOMERS);
        if (!adminId) return customers;
        return customers.filter(c => 
            c.admin_id === adminId && 
            (branchId ? c.branch_id === branchId : (c.branch_id === null || c.branch_id === undefined))
        );
    }

    async getLocalDatabaseSummary(adminId?: string, branchId?: string | null): Promise<{
        itemsCount: number;
        categoriesCount: number;
        billsCount: number;
        pendingBillsCount: number;
        expensesCount: number;
        tablesCount: number;
        customersCount: number;
    }> {
        const [items, categories, bills, pendingBills, expenses, tables, customers] = await Promise.all([
            this.getCachedItems(adminId, branchId),
            this.getCachedCategories(adminId, branchId),
            this.getCachedBills(adminId, branchId),
            this.getPendingBills(),
            this.getCachedExpenses(adminId, branchId),
            this.getCachedTables(adminId, branchId),
            this.getCachedCustomers(adminId, branchId),
        ]);

        return {
            itemsCount: items.length,
            categoriesCount: categories.length,
            billsCount: bills.length,
            pendingBillsCount: pendingBills.length,
            expensesCount: expenses.length,
            tablesCount: tables.length,
            customersCount: customers.length,
        };
    }

    /**
     * Cold boot vault recovery. Reconstructs pending bills from secondaryVault
     * if IndexedDB was cleared by Android OS during shutdown/restart.
     */
    private async verifyAndRestoreVaultMirror(): Promise<void> {
        try {
            const currentPending = await this.getAll<PendingBill>(STORES.PENDING_BILLS);
            if (currentPending.length === 0) {
                const mirroredBills = await secondaryVault.getMirror<PendingBill[]>('pending_bills');
                if (mirroredBills && mirroredBills.length > 0) {
                    console.log(`[VaultRecovery] Restoring ${mirroredBills.length} pending bills from fail-safe vault mirror!`);
                    await this.storeMany(STORES.PENDING_BILLS, mirroredBills);
                    await this.notifyPendingBillsListeners();
                }
            }
        } catch (err) {
            console.warn('[VaultRecovery] Failed to restore from vault mirror:', err);
        }
    }

    // ──────────── Universal Offline Cache ────────────

    async cacheQueryResult(table: string, key: string, data: any): Promise<void> {
        // Delegate to SQLite backend if available
        if (this.backend?.isReady()) {
            return this.backend.cacheQuery(table, key, data);
        }

        if (!this.db) return;
        try {
            const tx = this.db.transaction([STORES.OFFLINE_CACHE], 'readwrite');
            const store = tx.objectStore(STORES.OFFLINE_CACHE);
            const cacheKey = `${table}_${key}`;
            store.put({ cacheKey, table, key, data, updatedAt: Date.now() });
        } catch (err) {
            console.warn('[OfflineCache] Failed to cache:', table, key, err);
        }
    }

    async getCachedQueryResult(table: string, key: string): Promise<{ data: any; updatedAt: number } | null> {
        // Delegate to SQLite backend if available
        if (this.backend?.isReady()) {
            return this.backend.getCachedQuery(table, key);
        }

        if (!this.db) return null;
        return new Promise((resolve) => {
            try {
                const tx = this.db!.transaction([STORES.OFFLINE_CACHE], 'readonly');
                const store = tx.objectStore(STORES.OFFLINE_CACHE);
                const cacheKey = `${table}_${key}`;
                const request = store.get(cacheKey);
                request.onsuccess = () => {
                    const result = request.result;
                    if (result) {
                        resolve({ data: result.data, updatedAt: result.updatedAt });
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => resolve(null);
            } catch {
                resolve(null);
            }
        });
    }

    async clearCacheForTable(table: string): Promise<void> {
        // Delegate to SQLite backend if available
        if (this.backend?.isReady()) {
            return this.backend.clearCacheForTable(table);
        }

        if (!this.db) return;
        try {
            const tx = this.db.transaction([STORES.OFFLINE_CACHE], 'readwrite');
            const store = tx.objectStore(STORES.OFFLINE_CACHE);
            const index = store.index('table');
            const request = index.getAllKeys(table);
            request.onsuccess = () => {
                for (const key of request.result) {
                    store.delete(key);
                }
            };
        } catch (err) {
            console.warn('[OfflineCache] Failed to clear cache for:', table, err);
        }
    }

    // ──────────── Universal Write Queue ────────────

    async queueWrite(entry: { table: string; operation: 'INSERT' | 'UPDATE' | 'DELETE'; data: any; adminId?: string; branchId?: string }): Promise<string> {
        if (!this.db) throw new Error('DB not initialized');
        const id = crypto.randomUUID();
        const item = {
            id,
            table: entry.table,
            operation: entry.operation,
            data: entry.data,
            adminId: entry.adminId || null,
            branchId: entry.branchId || null,
            timestamp: Date.now(),
            status: 'pending' as const,
            retries: 0,
            error: null as string | null
        };
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction([STORES.WRITE_QUEUE], 'readwrite');
            const store = tx.objectStore(STORES.WRITE_QUEUE);
            const request = store.put(item);
            request.onsuccess = () => {
                this.notifyWriteQueueListeners();
                resolve(id);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getWriteQueue(): Promise<any[]> {
        if (!this.db) return [];
        return new Promise((resolve) => {
            const tx = this.db!.transaction([STORES.WRITE_QUEUE], 'readonly');
            const store = tx.objectStore(STORES.WRITE_QUEUE);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => resolve([]);
        });
    }

    async getPendingWriteCount(): Promise<number> {
        if (!this.db) return 0;
        return new Promise((resolve) => {
            const tx = this.db!.transaction([STORES.WRITE_QUEUE], 'readonly');
            const store = tx.objectStore(STORES.WRITE_QUEUE);
            const index = store.index('status');
            const request = index.count('pending');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(0);
        });
    }

    async removeFromWriteQueue(id: string): Promise<void> {
        if (!this.db) return;
        const tx = this.db.transaction([STORES.WRITE_QUEUE], 'readwrite');
        const store = tx.objectStore(STORES.WRITE_QUEUE);
        store.delete(id);
        this.notifyWriteQueueListeners();
    }

    async updateWriteQueueItem(id: string, updates: Partial<{ status: string; retries: number; error: string | null }>): Promise<void> {
        if (!this.db) return;
        return new Promise((resolve) => {
            const tx = this.db!.transaction([STORES.WRITE_QUEUE], 'readwrite');
            const store = tx.objectStore(STORES.WRITE_QUEUE);
            const getReq = store.get(id);
            getReq.onsuccess = () => {
                if (getReq.result) {
                    store.put({ ...getReq.result, ...updates });
                }
                resolve();
            };
            getReq.onerror = () => resolve();
        });
    }

    // Write queue change listeners
    private writeQueueListeners: Set<(count: number) => void> = new Set();

    onWriteQueueChange(listener: (count: number) => void): () => void {
        this.writeQueueListeners.add(listener);
        return () => this.writeQueueListeners.delete(listener);
    }

    private async notifyWriteQueueListeners(): Promise<void> {
        const count = await this.getPendingWriteCount();
        this.writeQueueListeners.forEach(listener => listener(count));
    }

    // ──────────── Write Queue Sync Processor ────────────

    async processWriteQueue(): Promise<{ synced: number; failed: number }> {
        if (!this.db || !this.isOnline) return { synced: 0, failed: 0 };
        
        const items = await this.getWriteQueue();
        const pending = items.filter(i => i.status === 'pending' || (i.status === 'failed' && i.retries < 5));
        let synced = 0;
        let failed = 0;

        const { withOfflineBypass } = await import('@/integrations/supabase/offlineLayer');

        for (const item of pending) {
            try {
                await this.updateWriteQueueItem(item.id, { status: 'syncing' });

                // Rebuild the original filter set (generic .eq/.in support, id fallback)
                const filters: Record<string, any> = item.filters
                    || (item.data?.id ? { id: item.data.id } : {});
                const applyFilters = (q: any) => {
                    for (const [col, val] of Object.entries(filters)) {
                        if (val && typeof val === 'object' && '__in' in (val as any)) q = q.in(col, (val as any).__in);
                        else q = q.eq(col, val);
                    }
                    return q;
                };

                await withOfflineBypass(async () => {
                    if (item.operation === 'INSERT') {
                        const { __pendingSync, ...row } = item.data || {};
                        const { error } = await supabase.from(item.table).upsert(row, { onConflict: 'id' });
                        if (error) throw error;
                    } else if (item.operation === 'UPDATE') {
                        const { id: recordId, __pendingSync, ...updateData } = item.data || {};
                        const { error } = await applyFilters(supabase.from(item.table).update(updateData));
                        if (error) throw error;
                    } else if (item.operation === 'DELETE') {
                        const { error } = await applyFilters(supabase.from(item.table).delete());
                        if (error) throw error;
                    }
                });

                await this.removeFromWriteQueue(item.id);
                // Invalidate cache for this table so next load gets fresh data
                await this.clearCacheForTable(item.table);

                synced++;
            } catch (err: any) {
                console.error('[WriteQueue] Sync failed for:', item.table, item.operation, err);
                await this.updateWriteQueueItem(item.id, {
                    status: 'failed',
                    retries: (item.retries || 0) + 1,
                    error: err?.message || 'Unknown error'
                });
                failed++;
            }
        }

        this.notifyWriteQueueListeners();
        return { synced, failed };
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
