/**
 * StorageBackend Interface — Platform-Agnostic Storage Abstraction
 * 
 * On native Capacitor (Android/iOS): implemented by SQLiteBackend
 * On Web/PWA: implemented by IndexedDBBackend (existing behavior)
 * 
 * The offlineManager delegates all storage I/O to this interface,
 * so switching backends requires ZERO changes to consuming code.
 */

export interface WriteQueueEntry {
  id: string;
  table: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  data: any;
  status: string;
  timestamp: number;
  retries: number;
  error: string | null;
  adminId?: string;
  branchId?: string;
  filters?: Record<string, unknown> | null;
}

export interface CachedQueryResult {
  data: any;
  updatedAt: number;
}

export interface StorageBackend {
  /** Initialize the storage engine (open DB, run migrations) */
  initialize(): Promise<void>;

  /** Close the storage engine gracefully */
  close(): Promise<void>;

  /** Returns true if this backend is ready for operations */
  isReady(): boolean;

  // ─── Generic CRUD ───────────────────────────────────────────
  /** Store a single record (upsert by primary key) */
  put<T>(storeName: string, data: T): Promise<void>;

  /** Store multiple records in a single transaction */
  putMany<T>(storeName: string, items: T[]): Promise<void>;

  /** Get a single record by primary key */
  get<T>(storeName: string, key: string): Promise<T | null>;

  /** Get all records from a store */
  getAll<T>(storeName: string): Promise<T[]>;

  /** Delete a single record by primary key */
  remove(storeName: string, key: string): Promise<void>;

  /** Clear all records from a store */
  clearTable(storeName: string): Promise<void>;

  // ─── Query Cache ────────────────────────────────────────────
  /** Cache an arbitrary query result */
  cacheQuery(table: string, key: string, data: any): Promise<void>;

  /** Get a cached query result */
  getCachedQuery(table: string, key: string): Promise<CachedQueryResult | null>;

  /** Clear all cached queries for a specific table */
  clearCacheForTable(table: string): Promise<void>;

  // ─── Write Queue ────────────────────────────────────────────
  /** Add an entry to the offline write queue */
  enqueueWrite(entry: WriteQueueEntry): Promise<void>;

  /** Get all pending write queue entries */
  getWriteQueue(): Promise<WriteQueueEntry[]>;

  /** Remove a completed entry from the write queue */
  removeFromWriteQueue(id: string): Promise<void>;

  /** Update a write queue entry (e.g., increment retries) */
  updateWriteQueueItem(id: string, updates: Partial<WriteQueueEntry>): Promise<void>;

  /** Get count of pending writes */
  getWriteQueueCount(): Promise<number>;

  /** Persist any buffered writes before shutdown or migration completion. */
  flush(): Promise<void>;
}

/** Store name constants — shared between backends */
export const STORE_NAMES = {
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
  WRITE_QUEUE: 'writeQueue',
} as const;

export type StoreName = typeof STORE_NAMES[keyof typeof STORE_NAMES];
