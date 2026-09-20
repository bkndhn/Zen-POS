/**
 * Storage Initialization — Platform-Aware Backend Selection
 * 
 * Detects whether running on Capacitor native (Android/iOS) or Web/PWA
 * and creates the appropriate StorageBackend instance.
 * 
 * Native → SQLiteBackend (faster, durable, unlimited storage)
 * Web    → IndexedDBBackend (current behavior, unchanged)
 */

import type { StorageBackend } from './StorageBackend';

/**
 * Adds application-level AES-GCM encryption on top of a backend whose files
 * are not already encrypted (IndexedDB, SQLite WASM). Falls back to the plain
 * backend when the device has no WebCrypto, so the POS never loses data.
 */
async function wrapWithEncryption(backend: StorageBackend): Promise<StorageBackend> {
  try {
    const { isEncryptionActive } = await import('@/utils/deviceCrypto');
    if (!(await isEncryptionActive())) {
      console.warn('[Storage] Device encryption unavailable — storing in clear');
      return backend;
    }
    const { EncryptedBackend } = await import('./EncryptedBackend');
    return new EncryptedBackend(backend);
  } catch (err) {
    console.warn('[Storage] Encryption layer unavailable:', err);
    return backend;
  }
}

let _backend: StorageBackend | null = null;
let _initPromise: Promise<StorageBackend> | null = null;

/**
 * Creates and initializes the correct storage backend for the current platform.
 * Returns a cached singleton — safe to call multiple times.
 * 
 * Strategy:
 * 1. Try SQLiteBackend (auto-detects native vs WASM mode)
 * 2. If SQLite fails entirely, fall back to IndexedDBBackend
 */
export async function initStorage(): Promise<StorageBackend> {
  if (_backend?.isReady()) return _backend;

  // Prevent multiple simultaneous initializations
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      // Web/PWA: IndexedDB is the durable, well-supported path. The jeep-sqlite
      // WASM build fails to link in several browsers (LinkError), so we never
      // load it on the web.
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.getPlatform() === 'web') {
        console.log('[Storage] Web platform → using IndexedDBBackend (encrypted at rest)');
        const { IndexedDBBackend } = await import('./IndexedDBBackend');
        const raw = new IndexedDBBackend();
        await raw.initialize();
        _backend = await wrapWithEncryption(raw);
        return _backend;
      }

      // Native: SQLite (native plugin, or WASM fallback inside the WebView)
      console.log('[Storage] Initializing SQLiteBackend (auto-detects native vs WASM)...');
      const { SQLiteBackend } = await import('./SQLiteBackend');
      const sqlite = new SQLiteBackend();
      await sqlite.initialize();
      // Native SQLCipher already encrypts the file; the WASM fallback does not.
      _backend = sqlite.isEncryptedAtRest() ? sqlite : await wrapWithEncryption(sqlite);



      // Run one-time migration from IndexedDB → SQLite on first use
      try {
        const { migrateLegacyData } = await import('./migrateLegacy');
        await migrateLegacyData(_backend);
      } catch (e) {
        console.warn('[Storage] Legacy migration skipped or failed (non-blocking):', e);
      }

      return _backend;
    } catch (err) {
      console.error('[Storage] SQLite initialization failed, falling back to IndexedDB:', err);
      // Fallback: always use IndexedDB if SQLite fails
      const { IndexedDBBackend } = await import('./IndexedDBBackend');
      const raw = new IndexedDBBackend();
      await raw.initialize();
      _backend = await wrapWithEncryption(raw);
      return _backend;
    } finally {
      _initPromise = null;
    }
  })();

  return _initPromise;
}

/**
 * Get the current storage backend (must be initialized first).
 * Returns null if not yet initialized.
 */
export function getStorageBackend(): StorageBackend | null {
  return _backend;
}

// Re-export types for convenience
export type { StorageBackend } from './StorageBackend';
export { STORE_NAMES } from './StorageBackend';
