/**
 * EncryptedBackend — transparent at-rest encryption decorator.
 *
 * Wraps any StorageBackend and encrypts the *payload* of every record with the
 * device key (AES-GCM 256, see utils/deviceCrypto). Primary keys and the few
 * indexed columns stay in the clear so lookups, indexes and the write-queue
 * scheduler keep working exactly as before.
 *
 * Used on Web/PWA and on the SQLite WASM fallback. The native SQLite build is
 * already encrypted at rest (SQLCipher), so it is not double-wrapped.
 */

import type { StorageBackend, WriteQueueEntry, CachedQueryResult } from './StorageBackend';
import { encryptValue, decryptValue, isEncrypted } from '@/utils/deviceCrypto';

const ENC_FIELD = '__enc';

/** Fields that must stay readable per store (primary key + indexes). */
const CLEAR_FIELDS: Record<string, string[]> = {
  items: ['id', 'is_active', 'category'],
  bills: ['id', 'date', 'synced'],
  categories: ['id'],
  syncQueue: ['id', 'timestamp', 'type'],
  settings: ['key'],
  pendingBills: ['id', 'created_at', 'synced'],
  expenses: ['id', 'date'],
  tables: ['id'],
  tableOrders: ['id'],
  customers: ['id', 'phone'],
  additionalCharges: ['id'],
  payments: ['id'],
  taxRates: ['id'],
  displaySettings: ['user_id'],
  branches: ['id'],
  offlineCache: ['cacheKey', 'table', 'key', 'updatedAt'],
  writeQueue: ['id', 'table', 'operation', 'status', 'timestamp', 'retries', 'adminId', 'branchId', 'claimId', 'claimedAt'],
};

const clearFieldsFor = (store: string): string[] => CLEAR_FIELDS[store] ?? ['id'];

export class EncryptedBackend implements StorageBackend {
  constructor(private inner: StorageBackend) {}

  // ─── Envelope helpers ───────────────────────────────────────
  private async seal(store: string, record: any): Promise<any> {
    if (!record || typeof record !== 'object') return record;
    const keep = clearFieldsFor(store);
    const outer: any = {};
    const secret: any = {};
    for (const [k, v] of Object.entries(record)) {
      if (k === ENC_FIELD) continue;
      if (keep.includes(k)) outer[k] = v;
      else secret[k] = v;
    }
    outer[ENC_FIELD] = await encryptValue(secret);
    return outer;
  }

  private async open<T>(record: any): Promise<T | null> {
    if (!record || typeof record !== 'object') return record ?? null;
    const blob = record[ENC_FIELD];
    if (blob === undefined) return record as T; // legacy plaintext row
    const { [ENC_FIELD]: _omit, ...outer } = record;
    const secret = isEncrypted(blob) || typeof blob === 'string' ? await decryptValue<any>(blob) : blob;
    if (secret === null && isEncrypted(blob)) return null; // unreadable — drop
    return { ...outer, ...(secret || {}) } as T;
  }

  private async openMany<T>(rows: any[]): Promise<T[]> {
    const out: T[] = [];
    for (const row of rows) {
      const opened = await this.open<T>(row);
      if (opened) out.push(opened);
    }
    return out;
  }

  // ─── Lifecycle (pass-through) ───────────────────────────────
  initialize(): Promise<void> { return this.inner.initialize(); }
  close(): Promise<void> { return this.inner.close(); }
  isReady(): boolean { return this.inner.isReady(); }
  flush(): Promise<void> { return this.inner.flush(); }

  // ─── Generic CRUD ───────────────────────────────────────────
  async put<T>(storeName: string, data: T): Promise<void> {
    return this.inner.put(storeName, await this.seal(storeName, data));
  }

  async putMany<T>(storeName: string, items: T[]): Promise<void> {
    if (!items?.length) return;
    const sealed = await Promise.all(items.map(i => this.seal(storeName, i)));
    return this.inner.putMany(storeName, sealed);
  }

  async get<T>(storeName: string, key: string): Promise<T | null> {
    return this.open<T>(await this.inner.get<any>(storeName, key));
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    return this.openMany<T>(await this.inner.getAll<any>(storeName));
  }

  remove(storeName: string, key: string): Promise<void> { return this.inner.remove(storeName, key); }
  clearTable(storeName: string): Promise<void> { return this.inner.clearTable(storeName); }

  // ─── Query cache ────────────────────────────────────────────
  async cacheQuery(table: string, key: string, data: any): Promise<void> {
    return this.inner.cacheQuery(table, key, await encryptValue(data));
  }

  async getCachedQuery(table: string, key: string): Promise<CachedQueryResult | null> {
    const row = await this.inner.getCachedQuery(table, key);
    if (!row) return null;
    if (!isEncrypted(row.data)) return row; // legacy plaintext cache
    const data = await decryptValue<any>(row.data);
    if (data === null) return null;
    return { data, updatedAt: row.updatedAt };
  }

  clearCacheForTable(table: string): Promise<void> { return this.inner.clearCacheForTable(table); }

  // ─── Write queue ────────────────────────────────────────────
  async enqueueWrite(entry: WriteQueueEntry): Promise<void> {
    return this.inner.enqueueWrite({
      ...entry,
      data: await encryptValue(entry.data),
      filters: entry.filters ? ({ [ENC_FIELD]: await encryptValue(entry.filters) } as any) : entry.filters ?? null,
    });
  }

  private async openQueueEntry(entry: any): Promise<WriteQueueEntry | null> {
    if (!entry) return null;
    const data = isEncrypted(entry.data) ? await decryptValue<any>(entry.data) : entry.data;
    if (data === null && isEncrypted(entry.data)) return null;
    let filters = entry.filters ?? null;
    if (filters && typeof filters === 'object' && ENC_FIELD in filters) {
      filters = await decryptValue<any>(filters[ENC_FIELD]);
    }
    return { ...entry, data, filters };
  }

  private async openQueue(entries: any[]): Promise<WriteQueueEntry[]> {
    const out: WriteQueueEntry[] = [];
    for (const e of entries) {
      const opened = await this.openQueueEntry(e);
      if (opened) out.push(opened);
    }
    return out;
  }

  async getWriteQueue(): Promise<WriteQueueEntry[]> {
    return this.openQueue(await this.inner.getWriteQueue());
  }

  removeFromWriteQueue(id: string): Promise<void> { return this.inner.removeFromWriteQueue(id); }

  async updateWriteQueueItem(id: string, updates: Partial<WriteQueueEntry>): Promise<void> {
    const next: Partial<WriteQueueEntry> = { ...updates };
    if ('data' in updates && updates.data !== undefined && !isEncrypted(updates.data)) {
      next.data = await encryptValue(updates.data);
    }
    if ('filters' in updates && updates.filters) {
      next.filters = { [ENC_FIELD]: await encryptValue(updates.filters) } as any;
    }
    return this.inner.updateWriteQueueItem(id, next);
  }

  async claimWriteQueue(claimId: string, limit?: number): Promise<WriteQueueEntry[]> {
    return this.openQueue(await this.inner.claimWriteQueue(claimId, limit));
  }

  releaseStaleClaims(olderThanMs: number): Promise<void> { return this.inner.releaseStaleClaims(olderThanMs); }
  pruneCache(maxAgeMs: number, maxRows: number): Promise<void> { return this.inner.pruneCache(maxAgeMs, maxRows); }
  getWriteQueueCount(): Promise<number> { return this.inner.getWriteQueueCount(); }
  resetWriteQueueRetries(): Promise<void> { return this.inner.resetWriteQueueRetries(); }
}
