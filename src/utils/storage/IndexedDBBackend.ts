/**
 * IndexedDBBackend — Wraps existing IndexedDB logic into the StorageBackend interface.
 * 
 * Used on Web/PWA platforms. This is essentially the SAME behavior as the
 * current offlineManager's IndexedDB code, just conforming to the interface.
 * 
 * On native Capacitor platforms, SQLiteBackend is used instead.
 */

import type { StorageBackend, WriteQueueEntry, CachedQueryResult } from './StorageBackend';

const DB_NAME = 'HotelPOS_OfflineDB';
const DB_VERSION = 5;

export class IndexedDBBackend implements StorageBackend {
  private db: IDBDatabase | null = null;
  private ready = false;

  async initialize(): Promise<void> {
    if (this.ready && this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[IndexedDBBackend] Failed to open:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.ready = true;
        console.log('[IndexedDBBackend] Initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createStores(db);
      };
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.ready = false;
    }
  }

  isReady(): boolean {
    return this.ready && this.db !== null;
  }

  // ─── Generic CRUD ───────────────────────────────────────────

  async put<T>(storeName: string, data: T): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async putMany<T>(storeName: string, items: T[]): Promise<void> {
    if (!this.db || items.length === 0) return;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      items.forEach(item => store.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async get<T>(storeName: string, key: string): Promise<T | null> {
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    if (!this.db) return [];
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async remove(storeName: string, key: string): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearTable(storeName: string): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ─── Query Cache ────────────────────────────────────────────

  async cacheQuery(table: string, key: string, data: any): Promise<void> {
    if (!this.db) return;
    try {
      const tx = this.db.transaction(['offlineCache'], 'readwrite');
      const store = tx.objectStore('offlineCache');
      const cacheKey = `${table}_${key}`;
      store.put({ cacheKey, table, key, data, updatedAt: Date.now() });
    } catch (err) {
      console.warn('[IndexedDBBackend] cacheQuery failed:', err);
    }
  }

  async getCachedQuery(table: string, key: string): Promise<CachedQueryResult | null> {
    if (!this.db) return null;
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(['offlineCache'], 'readonly');
        const store = tx.objectStore('offlineCache');
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
    if (!this.db) return;
    try {
      const tx = this.db.transaction(['offlineCache'], 'readwrite');
      const store = tx.objectStore('offlineCache');
      const index = store.index('table');
      const request = index.getAllKeys(table);
      request.onsuccess = () => {
        for (const key of request.result) {
          store.delete(key);
        }
      };
    } catch (err) {
      console.warn('[IndexedDBBackend] clearCacheForTable failed:', err);
    }
  }

  // ─── Write Queue ────────────────────────────────────────────

  async enqueueWrite(entry: WriteQueueEntry): Promise<void> {
    await this.put('writeQueue', {
      id: entry.id,
      table: entry.table,
      operation: entry.operation,
      data: entry.data,
      status: entry.status,
      timestamp: entry.timestamp,
      retries: entry.retries,
      error: entry.error,
      adminId: entry.adminId,
      branchId: entry.branchId,
      filters: entry.filters ?? null,
    });
  }

  async getWriteQueue(): Promise<WriteQueueEntry[]> {
    const all = await this.getAll<any>('writeQueue');
    return all.filter(item => item.status === 'pending' || (item.status === 'failed' && item.retries < 5));
  }

  async removeFromWriteQueue(id: string): Promise<void> {
    await this.remove('writeQueue', id);
  }

  async updateWriteQueueItem(id: string, updates: Partial<WriteQueueEntry>): Promise<void> {
    const existing = await this.get<any>('writeQueue', id);
    if (existing) {
      await this.put('writeQueue', { ...existing, ...updates });
    }
  }

  async getWriteQueueCount(): Promise<number> {
    const queue = await this.getWriteQueue();
    return queue.length;
  }

  // ─── Private Helpers ────────────────────────────────────────

  private createStores(db: IDBDatabase): void {
    const storeConfigs: Array<{ name: string; keyPath: string; indexes?: Array<{ name: string; keyPath: string }> }> = [
      { name: 'items', keyPath: 'id', indexes: [{ name: 'is_active', keyPath: 'is_active' }, { name: 'category', keyPath: 'category' }] },
      { name: 'bills', keyPath: 'id', indexes: [{ name: 'date', keyPath: 'date' }, { name: 'synced', keyPath: 'synced' }] },
      { name: 'categories', keyPath: 'id' },
      { name: 'syncQueue', keyPath: 'id', indexes: [{ name: 'timestamp', keyPath: 'timestamp' }, { name: 'type', keyPath: 'type' }] },
      { name: 'settings', keyPath: 'key' },
      { name: 'pendingBills', keyPath: 'id', indexes: [{ name: 'created_at', keyPath: 'created_at' }, { name: 'synced', keyPath: 'synced' }] },
      { name: 'expenses', keyPath: 'id', indexes: [{ name: 'date', keyPath: 'date' }] },
      { name: 'tables', keyPath: 'id' },
      { name: 'tableOrders', keyPath: 'id' },
      { name: 'customers', keyPath: 'id', indexes: [{ name: 'phone', keyPath: 'phone' }] },
      { name: 'additionalCharges', keyPath: 'id' },
      { name: 'payments', keyPath: 'id' },
      { name: 'taxRates', keyPath: 'id' },
      { name: 'displaySettings', keyPath: 'user_id' },
      { name: 'branches', keyPath: 'id' },
      { name: 'offlineCache', keyPath: 'cacheKey', indexes: [{ name: 'table', keyPath: 'table' }, { name: 'updatedAt', keyPath: 'updatedAt' }] },
      { name: 'writeQueue', keyPath: 'id', indexes: [{ name: 'table', keyPath: 'table' }, { name: 'status', keyPath: 'status' }, { name: 'timestamp', keyPath: 'timestamp' }] },
    ];

    for (const config of storeConfigs) {
      if (!db.objectStoreNames.contains(config.name)) {
        const store = db.createObjectStore(config.name, { keyPath: config.keyPath });
        if (config.indexes) {
          for (const idx of config.indexes) {
            store.createIndex(idx.name, idx.keyPath);
          }
        }
      }
    }
  }
}
