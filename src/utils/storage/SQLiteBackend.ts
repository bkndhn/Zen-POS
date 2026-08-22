/**
 * SQLiteBackend — Native SQLite storage for Capacitor Android/iOS
 * 
 * Uses @capacitor-community/sqlite for native performance:
 * - 4-10x faster bulk inserts than IndexedDB
 * - Data stored in app sandbox (never purged by OS)
 * - Proper SQL indexes, JOINs, and ACID transactions
 * - WAL mode for concurrent read/write
 * 
 * On web/PWA, falls back to jeep-sqlite (sql.js + IndexedDB bridge).
 */

import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { StorageBackend, WriteQueueEntry, CachedQueryResult } from './StorageBackend';
import { SQLITE_DB_NAME, SQLITE_DB_VERSION, SCHEMA_UPGRADES, getSQLiteTable, getPrimaryKey } from './schema';

/** Batch size for executeSet operations to avoid bridge bottlenecks */
const BATCH_CHUNK_SIZE = 500;

export class SQLiteBackend implements StorageBackend {
  private sqlite: SQLiteConnection;
  private db: SQLiteDBConnection | null = null;
  private ready = false;

  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
  }

  async initialize(): Promise<void> {
    if (this.ready) return;

    try {
      // Web platform: initialize jeep-sqlite web component
      if (Capacitor.getPlatform() === 'web') {
        const { defineCustomElements } = await import('jeep-sqlite/loader');
        defineCustomElements(window);

        if (!document.querySelector('jeep-sqlite')) {
          const jeepEl = document.createElement('jeep-sqlite');
          document.body.appendChild(jeepEl);
          await customElements.whenDefined('jeep-sqlite');
        }

        await this.sqlite.initWebStore();
      }

      // Register schema migrations
      await this.sqlite.addUpgradeStatement(SQLITE_DB_NAME, SCHEMA_UPGRADES);

      // Open database connection
      this.db = await this.sqlite.createConnection(
        SQLITE_DB_NAME,
        false,            // encrypted
        'no-encryption',  // encryption mode
        SQLITE_DB_VERSION,
        false             // read-only
      );

      await this.db.open();
      this.ready = true;
      console.log('[SQLiteBackend] Initialized successfully');
    } catch (err) {
      console.error('[SQLiteBackend] Initialization failed:', err);
      throw err;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.saveToStoreIfWeb();
      await this.sqlite.closeConnection(SQLITE_DB_NAME, false);
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
    const table = getSQLiteTable(storeName);
    const pk = getPrimaryKey(storeName);
    const record = data as any;
    const keyValue = record[pk];

    if (!keyValue) {
      console.warn(`[SQLiteBackend] Cannot put record without primary key '${pk}' in ${table}`);
      return;
    }

    // Extract indexed columns if they exist on the record
    const columns = this.getIndexedColumns(storeName, record);
    const colNames = [pk, ...columns.map(c => c.name), 'data'];
    const placeholders = colNames.map(() => '?').join(', ');
    const values = [keyValue, ...columns.map(c => c.value), JSON.stringify(record)];

    const sql = `INSERT OR REPLACE INTO ${table} (${colNames.join(', ')}) VALUES (${placeholders});`;
    await this.db.run(sql, values);
  }

  async putMany<T>(storeName: string, items: T[]): Promise<void> {
    if (!this.db || items.length === 0) return;
    const table = getSQLiteTable(storeName);
    const pk = getPrimaryKey(storeName);

    // Build batch statements in chunks
    for (let i = 0; i < items.length; i += BATCH_CHUNK_SIZE) {
      const chunk = items.slice(i, i + BATCH_CHUNK_SIZE);
      const statements = chunk.map(item => {
        const record = item as any;
        const keyValue = record[pk];
        if (!keyValue) return null;

        const columns = this.getIndexedColumns(storeName, record);
        const colNames = [pk, ...columns.map(c => c.name), 'data'];
        const placeholders = colNames.map(() => '?').join(', ');
        const values = [keyValue, ...columns.map(c => c.value), JSON.stringify(record)];

        return {
          statement: `INSERT OR REPLACE INTO ${table} (${colNames.join(', ')}) VALUES (${placeholders});`,
          values,
        };
      }).filter(Boolean) as Array<{ statement: string; values: any[] }>;

      if (statements.length > 0) {
        await this.db.executeSet(statements, true); // true = wrap in transaction
      }
    }

    await this.saveToStoreIfWeb();
  }

  async get<T>(storeName: string, key: string): Promise<T | null> {
    if (!this.db) return null;
    const table = getSQLiteTable(storeName);
    const pk = getPrimaryKey(storeName);

    const result = await this.db.query(
      `SELECT data FROM ${table} WHERE ${pk} = ?;`,
      [key]
    );

    if (result.values && result.values.length > 0) {
      try {
        return JSON.parse(result.values[0].data) as T;
      } catch {
        return result.values[0].data as T;
      }
    }
    return null;
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    if (!this.db) return [];
    const table = getSQLiteTable(storeName);

    const result = await this.db.query(`SELECT data FROM ${table};`);

    if (result.values) {
      return result.values.map(row => {
        try {
          return JSON.parse(row.data) as T;
        } catch {
          return row.data as T;
        }
      });
    }
    return [];
  }

  async remove(storeName: string, key: string): Promise<void> {
    if (!this.db) return;
    const table = getSQLiteTable(storeName);
    const pk = getPrimaryKey(storeName);

    await this.db.run(`DELETE FROM ${table} WHERE ${pk} = ?;`, [key]);
  }

  async clearTable(storeName: string): Promise<void> {
    if (!this.db) return;
    const table = getSQLiteTable(storeName);

    await this.db.run(`DELETE FROM ${table};`);
    await this.saveToStoreIfWeb();
  }

  // ─── Query Cache ────────────────────────────────────────────

  async cacheQuery(table: string, key: string, data: any): Promise<void> {
    if (!this.db) return;
    const cacheKey = `${table}_${key}`;

    await this.db.run(
      `INSERT OR REPLACE INTO offlineCache (cache_key, tbl, key, updated_at, data) VALUES (?, ?, ?, ?, ?);`,
      [cacheKey, table, key, Date.now(), JSON.stringify(data)]
    );
  }

  async getCachedQuery(table: string, key: string): Promise<CachedQueryResult | null> {
    if (!this.db) return null;
    const cacheKey = `${table}_${key}`;

    const result = await this.db.query(
      `SELECT data, updated_at FROM offlineCache WHERE cache_key = ?;`,
      [cacheKey]
    );

    if (result.values && result.values.length > 0) {
      try {
        return {
          data: JSON.parse(result.values[0].data),
          updatedAt: result.values[0].updated_at,
        };
      } catch {
        return null;
      }
    }
    return null;
  }

  async clearCacheForTable(table: string): Promise<void> {
    if (!this.db) return;
    await this.db.run(`DELETE FROM offlineCache WHERE tbl = ?;`, [table]);
  }

  // ─── Write Queue ────────────────────────────────────────────

  async enqueueWrite(entry: WriteQueueEntry): Promise<void> {
    if (!this.db) return;

    await this.db.run(
      `INSERT OR REPLACE INTO writeQueue (id, tbl, operation, status, timestamp, retries, error, admin_id, branch_id, data) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        entry.id, entry.table, entry.operation, entry.status,
        entry.timestamp, entry.retries, entry.error,
        entry.adminId || null, entry.branchId || null,
        JSON.stringify(entry.data),
      ]
    );
  }

  async getWriteQueue(): Promise<WriteQueueEntry[]> {
    if (!this.db) return [];

    const result = await this.db.query(
      `SELECT * FROM writeQueue WHERE status = 'pending' ORDER BY timestamp ASC;`
    );

    if (!result.values) return [];

    return result.values.map(row => ({
      id: row.id,
      table: row.tbl,
      operation: row.operation as 'INSERT' | 'UPDATE' | 'DELETE',
      status: row.status,
      timestamp: row.timestamp,
      retries: row.retries,
      error: row.error,
      adminId: row.admin_id,
      branchId: row.branch_id,
      data: (() => { try { return JSON.parse(row.data); } catch { return row.data; } })(),
    }));
  }

  async removeFromWriteQueue(id: string): Promise<void> {
    if (!this.db) return;
    await this.db.run(`DELETE FROM writeQueue WHERE id = ?;`, [id]);
  }

  async updateWriteQueueItem(id: string, updates: Partial<WriteQueueEntry>): Promise<void> {
    if (!this.db) return;
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status); }
    if (updates.retries !== undefined) { setClauses.push('retries = ?'); values.push(updates.retries); }
    if (updates.error !== undefined) { setClauses.push('error = ?'); values.push(updates.error); }

    if (setClauses.length === 0) return;
    values.push(id);

    await this.db.run(
      `UPDATE writeQueue SET ${setClauses.join(', ')} WHERE id = ?;`,
      values
    );
  }

  async getWriteQueueCount(): Promise<number> {
    if (!this.db) return 0;
    const result = await this.db.query(
      `SELECT COUNT(*) as count FROM writeQueue WHERE status = 'pending';`
    );
    return result.values?.[0]?.count || 0;
  }

  // ─── Private Helpers ────────────────────────────────────────

  /** Save to IndexedDB web store on web platform (required by jeep-sqlite) */
  private async saveToStoreIfWeb(): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
      try {
        await this.sqlite.saveToStore(SQLITE_DB_NAME);
      } catch (e) {
        console.warn('[SQLiteBackend] saveToStore failed:', e);
      }
    }
  }

  /**
   * Extract indexed column values from a record for a given store.
   * These columns exist as proper SQL columns (not just in the JSON data blob)
   * for efficient querying and indexing.
   */
  private getIndexedColumns(storeName: string, record: any): Array<{ name: string; value: any }> {
    const cols: Array<{ name: string; value: any }> = [];

    switch (storeName) {
      case 'items':
        if (record.is_active !== undefined) cols.push({ name: 'is_active', value: record.is_active ? 1 : 0 });
        if (record.category !== undefined) cols.push({ name: 'category', value: record.category });
        if (record.admin_id !== undefined) cols.push({ name: 'admin_id', value: record.admin_id });
        if (record.branch_id !== undefined) cols.push({ name: 'branch_id', value: record.branch_id });
        break;
      case 'bills':
        if (record.date !== undefined) cols.push({ name: 'date', value: record.date });
        if (record.synced !== undefined) cols.push({ name: 'synced', value: record.synced ? 1 : 0 });
        if (record.admin_id !== undefined) cols.push({ name: 'admin_id', value: record.admin_id });
        if (record.branch_id !== undefined) cols.push({ name: 'branch_id', value: record.branch_id });
        if (record.created_at !== undefined) cols.push({ name: 'created_at', value: record.created_at });
        break;
      case 'pendingBills':
        if (record.created_at !== undefined) cols.push({ name: 'created_at', value: record.created_at });
        if (record.synced !== undefined) cols.push({ name: 'synced', value: record.synced ? 1 : 0 });
        if (record.admin_id !== undefined) cols.push({ name: 'admin_id', value: record.admin_id });
        if (record.branch_id !== undefined) cols.push({ name: 'branch_id', value: record.branch_id });
        break;
      case 'expenses':
        if (record.date !== undefined) cols.push({ name: 'date', value: record.date });
        if (record.admin_id !== undefined) cols.push({ name: 'admin_id', value: record.admin_id });
        if (record.branch_id !== undefined) cols.push({ name: 'branch_id', value: record.branch_id });
        break;
      case 'customers':
        if (record.phone !== undefined) cols.push({ name: 'phone', value: record.phone });
        if (record.admin_id !== undefined) cols.push({ name: 'admin_id', value: record.admin_id });
        if (record.branch_id !== undefined) cols.push({ name: 'branch_id', value: record.branch_id });
        break;
      case 'syncQueue':
        if (record.timestamp !== undefined) cols.push({ name: 'timestamp', value: record.timestamp });
        if (record.type !== undefined) cols.push({ name: 'type', value: record.type });
        break;
    }

    return cols;
  }
}
