/**
 * Legacy Data Migration — IndexedDB → SQLite
 * 
 * One-time migration that runs on first native launch.
 * Reads all data from the existing IndexedDB stores and bulk-inserts
 * into the new SQLite backend.
 * 
 * Safety features:
 * - Uses a Preferences flag to ensure it only runs once
 * - Validates row counts after migration
 * - Falls back gracefully if migration fails (IndexedDB keeps working)
 * - Does NOT delete IndexedDB data (kept as backup)
 */

import type { StorageBackend } from './StorageBackend';

const MIGRATION_FLAG = 'zenpos_migrated_idb_to_sqlite_v1';
const LEGACY_DB_NAME = 'HotelPOS_OfflineDB';
const LEGACY_DB_VERSION = 5;

/** Store names to migrate (all 17) */
const STORES_TO_MIGRATE = [
  'items', 'bills', 'categories', 'syncQueue', 'settings',
  'pendingBills', 'expenses', 'tables', 'tableOrders', 'customers',
  'additionalCharges', 'payments', 'taxRates', 'displaySettings',
  'branches', 'offlineCache', 'writeQueue',
];

/**
 * Migrate all data from IndexedDB to the new SQLite backend.
 * This is safe to call multiple times — it's a no-op after first success.
 */
export async function migrateLegacyData(backend: StorageBackend): Promise<void> {
  // Check if already migrated
  const flag = localStorage.getItem(MIGRATION_FLAG);
  if (flag === 'true') {
    console.log('[Migration] Already migrated — skipping.');
    return;
  }

  // Check if legacy IndexedDB exists
  const hasLegacyDB = await checkIndexedDBExists(LEGACY_DB_NAME);
  if (!hasLegacyDB) {
    console.log('[Migration] No legacy IndexedDB found — marking as done.');
    localStorage.setItem(MIGRATION_FLAG, 'true');
    return;
  }

  console.log('[Migration] Starting IndexedDB → SQLite migration...');

  try {
    const legacyDB = await openLegacyDB();
    if (!legacyDB) {
      console.warn('[Migration] Could not open legacy DB — marking done.');
      localStorage.setItem(MIGRATION_FLAG, 'true');
      return;
    }

    let totalMigrated = 0;
    const failures: string[] = [];

    for (const storeName of STORES_TO_MIGRATE) {
      try {
        // Check if store exists in legacy DB
        if (!legacyDB.objectStoreNames.contains(storeName)) {
          continue;
        }

        const records = await readAllFromStore(legacyDB, storeName);
        if (records.length === 0) continue;

        // Bulk insert into new backend
        await backend.putMany(storeName, records);
        const migratedRecords = await backend.getAll(storeName);
        const migratedKeys = new Set(migratedRecords.map((record: any) => record?.id ?? record?.key));
        const missing = records.filter((record: any) => {
          const key = record?.id ?? record?.key;
          return key !== undefined && !migratedKeys.has(key);
        });
        if (missing.length > 0 || migratedRecords.length < records.length) {
          throw new Error(`validation failed: ${missing.length || records.length - migratedRecords.length} row(s) missing`);
        }
        totalMigrated += records.length;

        console.log(`[Migration] Migrated ${records.length} records from '${storeName}'`);
      } catch (e) {
        console.warn(`[Migration] Failed to migrate store '${storeName}':`, e);
        failures.push(storeName);
      }
    }

    if (failures.length > 0) {
      throw new Error(`Migration incomplete for: ${failures.join(', ')}`);
    }

    await backend.flush();
    localStorage.setItem(MIGRATION_FLAG, 'true');
    console.log(`[Migration] Complete! Migrated ${totalMigrated} total records.`);

    // Close legacy DB (but don't delete it — keep as backup)
    legacyDB.close();
  } catch (err) {
    console.error('[Migration] Migration failed (non-blocking):', err);
    // Don't set the flag — will retry on next launch
  }
}

/** Check if an IndexedDB database exists without triggering creation */
function checkIndexedDBExists(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if ('databases' in indexedDB) {
        // Modern browsers support indexedDB.databases()
        (indexedDB as any).databases().then((dbs: any[]) => {
          resolve(dbs.some((db: any) => db.name === name));
        }).catch(() => resolve(false));
      } else {
        // Fallback: try opening and check if it has object stores
        const request = (indexedDB as IDBFactory).open(name);
        request.onsuccess = () => {
          const db = request.result;
          const hasStores = db.objectStoreNames.length > 0;
          db.close();
          resolve(hasStores);
        };
        request.onerror = () => resolve(false);
      }
    } catch {
      resolve(false);
    }
  });
}

/** Open the legacy IndexedDB database */
function openLegacyDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(LEGACY_DB_NAME, LEGACY_DB_VERSION);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onupgradeneeded = () => {
        // Don't create stores during migration — just resolve null
        request.transaction?.abort();
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

/** Read all records from an IndexedDB object store */
function readAllFromStore(db: IDBDatabase, storeName: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } catch (e) {
      resolve([]);
    }
  });
}
