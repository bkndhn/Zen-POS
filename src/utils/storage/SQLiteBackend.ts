/**
 * SQLiteBackend — SQLite storage for all platforms
 * 
 * Strategy:
 * 1. On native (Android/iOS) with plugin compiled: Uses native SQLite bridge
 * 2. On native WITHOUT plugin compiled: Uses jeep-sqlite (WASM in WebView) — NO REBUILD NEEDED
 * 3. On web/PWA: Uses jeep-sqlite (WASM + IndexedDB persistence)
 * 
 * This means SQLite works everywhere — even in a Capacitor app that
 * hasn't been rebuilt with the native plugin yet.
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
  private useWebMode = false;
  private persistTimer: number | null = null;

  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
  }

  async initialize(): Promise<void> {
    if (this.ready) return;

    // Determine if we need web mode (jeep-sqlite WASM)
    const needsWebMode = await this.shouldUseWebMode();

    try {
      if (needsWebMode) {
        await this.initWebMode();
      }

      // Register schema migrations
      await this.sqlite.addUpgradeStatement(SQLITE_DB_NAME, SCHEMA_UPGRADES);

      let encrypted = false;
      let encryptionMode = 'no-encryption';
      if (!needsWebMode) {
        const secretStored = await this.sqlite.isSecretStored().catch(() => ({ result: false }));
        if (!secretStored.result) {
          const passphrase = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
          await this.sqlite.setEncryptionSecret(passphrase);
          encryptionMode = 'encryption'; // one-time conversion of an existing plaintext database
        } else {
          encryptionMode = 'secret';
        }
        encrypted = true;
      }

      // Recover a connection left open by a killed WebView before creating one.
      const consistency = await this.sqlite.checkConnectionsConsistency().catch(() => ({ result: false }));
      const existing = await this.sqlite.isConnection(SQLITE_DB_NAME, false).catch(() => ({ result: false }));
      if (consistency.result && existing.result && encryptionMode === 'secret') {
        this.db = await this.sqlite.retrieveConnection(SQLITE_DB_NAME, false);
      } else {
        if (existing.result) await this.sqlite.closeConnection(SQLITE_DB_NAME, false).catch(() => undefined);
        this.db = await this.sqlite.createConnection(
          SQLITE_DB_NAME,
          encrypted,
          encryptionMode,
          SQLITE_DB_VERSION,
          false
        );
      }

      try {
        await this.db.open();
      } catch (error) {
        // A secret may exist before a legacy plaintext DB has been converted.
        if (!needsWebMode && encryptionMode === 'secret') {
          await this.sqlite.closeConnection(SQLITE_DB_NAME, false).catch(() => undefined);
          this.db = await this.sqlite.createConnection(
            SQLITE_DB_NAME,
            true,
            'encryption',
            SQLITE_DB_VERSION,
            false,
          );
          await this.db.open();
        } else {
          throw error;
        }
      }
      await this.ensureIntegrity(needsWebMode, encrypted, encryptionMode);
      await this.db.execute('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
      if (!needsWebMode) {
        await this.db.execute('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
      }
      this.ready = true;
      this.useWebMode = needsWebMode;

      if (needsWebMode && typeof window !== 'undefined') {
        // Durability net: flush before unload / tab hide
        const flushNow = () => { void this.flush(); };
        window.addEventListener('pagehide', flushNow);
        window.addEventListener('beforeunload', flushNow);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') flushNow();
        });
      }
      console.log(`[SQLiteBackend] Initialized successfully (mode: ${needsWebMode ? 'WASM/jeep-sqlite' : 'native'})`);
    } catch (err) {
      console.error('[SQLiteBackend] Initialization failed:', err);
      throw err;
    }
  }

  /**
   * Verify the database file is not corrupt. If it is, salvage any unsynced
   * queue rows, drop the damaged database and rebuild an empty schema so the
   * app still opens instead of crash-looping on startup.
   */
  private async ensureIntegrity(webMode: boolean, encrypted: boolean, encryptionMode: string): Promise<void> {
    if (!this.db) return;
    let ok = true;
    try {
      const res = await this.db.query('PRAGMA integrity_check;');
      const verdict = res.values?.[0]?.integrity_check ?? Object.values(res.values?.[0] ?? {})[0];
      ok = String(verdict).toLowerCase() === 'ok';
    } catch {
      ok = false;
    }
    if (ok) return;

    console.error('[SQLiteBackend] Integrity check failed — rebuilding local database');
    let salvaged: any[] = [];
    try {
      const rows = await this.db.query(
        `SELECT * FROM writeQueue WHERE status != 'synced';`
      );
      salvaged = rows.values || [];
    } catch { /* unreadable — nothing to salvage */ }

    try { await this.db.close(); } catch { /* ignore */ }
    await this.sqlite.closeConnection(SQLITE_DB_NAME, false).catch(() => undefined);
    await CapacitorSQLite.deleteDatabase({ database: SQLITE_DB_NAME }).catch(() => undefined);

    this.db = await this.sqlite.createConnection(
      SQLITE_DB_NAME,
      encrypted,
      encryptionMode === 'secret' ? 'secret' : encryptionMode,
      SQLITE_DB_VERSION,
      false
    );
    await this.db.open();

    for (const row of salvaged) {
      try {
        await this.db.run(
          `INSERT OR REPLACE INTO writeQueue (id, tbl, operation, status, timestamp, retries, error, admin_id, branch_id, filters, data, claim_id)
           VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, NULL);`,
          [row.id, row.tbl, row.operation, row.timestamp, row.retries || 0, row.error ?? null,
           row.admin_id ?? null, row.branch_id ?? null, row.filters ?? null, row.data]
        );
      } catch { /* skip unrecoverable row */ }
    }
    console.warn(`[SQLiteBackend] Rebuilt database, restored ${salvaged.length} queued writes`);
  }

  /**
   * Detect whether to use jeep-sqlite web mode.
   * Returns true for:
   * - Web/PWA platform (always)
   * - Native platform where the native plugin isn't compiled into the APK
   */
  private async shouldUseWebMode(): Promise<boolean> {
    const platform = Capacitor.getPlatform();

    // Web/PWA: always use web mode
    if (platform === 'web') return true;

    return !Capacitor.isPluginAvailable('CapacitorSQLite');
  }

  /**
   * Initialize jeep-sqlite web component for WASM-based SQLite.
   * Works in any WebView — no native code needed.
   */
  private async initWebMode(): Promise<void> {
    const { defineCustomElements } = await import('jeep-sqlite/loader');
    defineCustomElements(window);

    if (!document.querySelector('jeep-sqlite')) {
      const jeepEl = document.createElement('jeep-sqlite');
      document.body.appendChild(jeepEl);
      await customElements.whenDefined('jeep-sqlite');
    }

    await this.sqlite.initWebStore();
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.flush();
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
    this.schedulePersist();
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
    this.schedulePersist();
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
    this.schedulePersist();
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
    this.schedulePersist();
  }

  // ─── Write Queue ────────────────────────────────────────────

  async enqueueWrite(entry: WriteQueueEntry): Promise<void> {
    if (!this.db) return;

    await this.db.run(
      `INSERT OR REPLACE INTO writeQueue (id, tbl, operation, status, timestamp, retries, error, admin_id, branch_id, filters, data) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        entry.id, entry.table, entry.operation, entry.status,
        entry.timestamp, entry.retries, entry.error,
        entry.adminId || null, entry.branchId || null,
        entry.filters ? JSON.stringify(entry.filters) : null,
        JSON.stringify(entry.data),
      ]
    );
    await this.saveToStoreIfWeb();
  }

  async getWriteQueue(): Promise<WriteQueueEntry[]> {
    if (!this.db) return [];

    const result = await this.db.query(
      `SELECT * FROM writeQueue
       WHERE status = 'pending' OR (status = 'failed' AND retries < 5)
       ORDER BY timestamp ASC;`
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
      claimId: row.claim_id ?? null,
      filters: row.filters ? (() => { try { return JSON.parse(row.filters); } catch { return null; } })() : null,
      data: (() => { try { return JSON.parse(row.data); } catch { return row.data; } })(),
    }));
  }

  async removeFromWriteQueue(id: string): Promise<void> {
    if (!this.db) return;
    await this.db.run(`DELETE FROM writeQueue WHERE id = ?;`, [id]);
    this.schedulePersist();
  }

  async updateWriteQueueItem(id: string, updates: Partial<WriteQueueEntry>): Promise<void> {
    if (!this.db) return;
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status); }
    if (updates.retries !== undefined) { setClauses.push('retries = ?'); values.push(updates.retries); }
    if (updates.error !== undefined) { setClauses.push('error = ?'); values.push(updates.error); }
    if (updates.status !== undefined && updates.status !== 'syncing') { setClauses.push('claim_id = NULL'); }

    if (setClauses.length === 0) return;
    values.push(id);

    await this.db.run(
      `UPDATE writeQueue SET ${setClauses.join(', ')} WHERE id = ?;`,
      values
    );
    this.schedulePersist();
  }

  async claimWriteQueue(claimId: string, limit = 200): Promise<WriteQueueEntry[]> {
    if (!this.db) return [];
    // Single-statement claim: only rows still unclaimed become ours.
    await this.db.run(
      `UPDATE writeQueue
          SET status = 'syncing', claim_id = ?
        WHERE id IN (
          SELECT id FROM writeQueue
           WHERE claim_id IS NULL
             AND (status = 'pending' OR (status = 'failed' AND retries < 5))
           ORDER BY timestamp ASC
           LIMIT ?
        );`,
      [claimId, limit]
    );
    const result = await this.db.query(
      `SELECT * FROM writeQueue WHERE claim_id = ? ORDER BY timestamp ASC;`,
      [claimId]
    );
    this.schedulePersist();
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
      claimId: row.claim_id ?? null,
      filters: row.filters ? (() => { try { return JSON.parse(row.filters); } catch { return null; } })() : null,
      data: (() => { try { return JSON.parse(row.data); } catch { return row.data; } })(),
    }));
  }

  async releaseStaleClaims(olderThanMs: number): Promise<void> {
    if (!this.db) return;
    const cutoff = Date.now() - olderThanMs;
    await this.db.run(
      `UPDATE writeQueue SET status = 'pending', claim_id = NULL
        WHERE claim_id IS NOT NULL AND timestamp < ?;`,
      [cutoff]
    );
    this.schedulePersist();
  }

  async pruneCache(maxAgeMs: number, maxRows: number): Promise<void> {
    if (!this.db) return;
    const cutoff = Date.now() - maxAgeMs;
    await this.db.run(`DELETE FROM offlineCache WHERE updated_at < ?;`, [cutoff]);
    await this.db.run(
      `DELETE FROM offlineCache WHERE cache_key IN (
         SELECT cache_key FROM offlineCache ORDER BY updated_at DESC LIMIT -1 OFFSET ?
       );`,
      [maxRows]
    );
    this.schedulePersist();
  }

  async getWriteQueueCount(): Promise<number> {
    if (!this.db) return 0;
    const result = await this.db.query(
      `SELECT COUNT(*) as count FROM writeQueue WHERE status = 'pending';`
    );
    return result.values?.[0]?.count || 0;
  }

  // ─── Private Helpers ────────────────────────────────────────

  /**
   * Debounced persistence for single-record writes in WASM mode.
   * Coalesces bursts of writes into one saveToStore call (~150ms) so that
   * a single offline bill is durably written without stalling every write.
   */
  private schedulePersist(): void {
    if (!this.useWebMode) return;
    if (this.persistTimer !== null) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.saveToStoreIfWeb();
    }, 150) as unknown as number;
  }

  /** Flush any pending debounced persist immediately */
  async flush(): Promise<void> {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await this.saveToStoreIfWeb();
  }

  /** Save to IndexedDB web store when in WASM mode (required by jeep-sqlite) */
  private async saveToStoreIfWeb(): Promise<void> {
    if (this.useWebMode) {
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
