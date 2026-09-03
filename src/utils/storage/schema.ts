/**
 * SQLite Schema Definitions for ZenPOS
 * 
 * Hybrid approach: Frequently queried columns have proper SQL types + indexes.
 * Remaining fields stored as JSON `data` blob for flexibility.
 * 
 * This maps 1:1 with the 17 IndexedDB object stores.
 */

export const SQLITE_DB_NAME = 'zenpos_offline';
export const SQLITE_DB_VERSION = 2;

/** Primary key field for each store (must match IndexedDB keyPath) */
export const PRIMARY_KEYS: Record<string, string> = {
  items: 'id',
  bills: 'id',
  categories: 'id',
  syncQueue: 'id',
  settings: 'key',
  pendingBills: 'id',
  expenses: 'id',
  tables: 'id',
  tableOrders: 'id',
  customers: 'id',
  additionalCharges: 'id',
  payments: 'id',
  taxRates: 'id',
  displaySettings: 'user_id',
  branches: 'id',
  offlineCache: 'cacheKey',
  writeQueue: 'id',
};

/**
 * Schema migration statements for each version.
 * Version 1 creates all tables matching the IndexedDB stores.
 */
export const SCHEMA_UPGRADES = [
  {
    toVersion: 1,
    statements: [
      // ─── Core Data Tables ────────────────────────────────
      `CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY NOT NULL,
        is_active INTEGER DEFAULT 1,
        category TEXT,
        admin_id TEXT,
        branch_id TEXT,
        data TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_items_active ON items(is_active);`,
      `CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);`,
      `CREATE INDEX IF NOT EXISTS idx_items_admin ON items(admin_id);`,

      `CREATE TABLE IF NOT EXISTS bills (
        id TEXT PRIMARY KEY NOT NULL,
        date TEXT,
        synced INTEGER DEFAULT 0,
        admin_id TEXT,
        branch_id TEXT,
        created_at TEXT,
        data TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date);`,
      `CREATE INDEX IF NOT EXISTS idx_bills_synced ON bills(synced);`,
      `CREATE INDEX IF NOT EXISTS idx_bills_admin ON bills(admin_id);`,

      `CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,
        data TEXT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS syncQueue (
        id TEXT PRIMARY KEY NOT NULL,
        timestamp INTEGER,
        type TEXT,
        data TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_syncq_timestamp ON syncQueue(timestamp);`,
      `CREATE INDEX IF NOT EXISTS idx_syncq_type ON syncQueue(type);`,

      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        data TEXT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS pendingBills (
        id TEXT PRIMARY KEY NOT NULL,
        created_at TEXT,
        synced INTEGER DEFAULT 0,
        admin_id TEXT,
        branch_id TEXT,
        data TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_pending_synced ON pendingBills(synced);`,
      `CREATE INDEX IF NOT EXISTS idx_pending_created ON pendingBills(created_at);`,

      `CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY NOT NULL,
        date TEXT,
        admin_id TEXT,
        branch_id TEXT,
        data TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);`,

      `CREATE TABLE IF NOT EXISTS tables_data (
        id TEXT PRIMARY KEY NOT NULL,
        data TEXT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS tableOrders (
        id TEXT PRIMARY KEY NOT NULL,
        data TEXT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY NOT NULL,
        phone TEXT,
        admin_id TEXT,
        branch_id TEXT,
        data TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);`,

      `CREATE TABLE IF NOT EXISTS additionalCharges (
        id TEXT PRIMARY KEY NOT NULL,
        data TEXT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY NOT NULL,
        data TEXT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS taxRates (
        id TEXT PRIMARY KEY NOT NULL,
        data TEXT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS displaySettings (
        user_id TEXT PRIMARY KEY NOT NULL,
        data TEXT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY NOT NULL,
        data TEXT NOT NULL
      );`,

      // ─── Query Cache ─────────────────────────────────────
      `CREATE TABLE IF NOT EXISTS offlineCache (
        cache_key TEXT PRIMARY KEY NOT NULL,
        tbl TEXT NOT NULL,
        key TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_cache_table ON offlineCache(tbl);`,
      `CREATE INDEX IF NOT EXISTS idx_cache_updated ON offlineCache(updated_at);`,

      // ─── Write Queue ─────────────────────────────────────
      `CREATE TABLE IF NOT EXISTS writeQueue (
        id TEXT PRIMARY KEY NOT NULL,
        tbl TEXT NOT NULL,
        operation TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        timestamp INTEGER NOT NULL,
        retries INTEGER DEFAULT 0,
        error TEXT,
        admin_id TEXT,
        branch_id TEXT,
        data TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_writeq_status ON writeQueue(status);`,
      `CREATE INDEX IF NOT EXISTS idx_writeq_table ON writeQueue(tbl);`,
      `CREATE INDEX IF NOT EXISTS idx_writeq_timestamp ON writeQueue(timestamp);`,

      // ─── Enable WAL mode for concurrent read/write ───────
      `PRAGMA journal_mode=WAL;`,
    ],
  },
  {
    toVersion: 2,
    statements: [
      `ALTER TABLE writeQueue ADD COLUMN filters TEXT;`,
      `CREATE INDEX IF NOT EXISTS idx_writeq_status_timestamp ON writeQueue(status, timestamp);`,
    ],
  },
];

/**
 * Maps IndexedDB store names to SQLite table names.
 * Most are 1:1 except 'tables' → 'tables_data' (reserved SQL keyword).
 */
export const SQLITE_TABLE_MAP: Record<string, string> = {
  items: 'items',
  bills: 'bills',
  categories: 'categories',
  syncQueue: 'syncQueue',
  settings: 'settings',
  pendingBills: 'pendingBills',
  expenses: 'expenses',
  tables: 'tables_data',
  tableOrders: 'tableOrders',
  customers: 'customers',
  additionalCharges: 'additionalCharges',
  payments: 'payments',
  taxRates: 'taxRates',
  displaySettings: 'displaySettings',
  branches: 'branches',
  offlineCache: 'offlineCache',
  writeQueue: 'writeQueue',
};

/** Get the primary key column name for a given store */
export function getPrimaryKey(storeName: string): string {
  return PRIMARY_KEYS[storeName] || 'id';
}

/** Get the SQLite table name for a given store name */
export function getSQLiteTable(storeName: string): string {
  return SQLITE_TABLE_MAP[storeName] || storeName;
}
