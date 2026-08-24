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
        console.log('[Storage] Web platform → using IndexedDBBackend');
        const { IndexedDBBackend } = await import('./IndexedDBBackend');
        _backend = new IndexedDBBackend();
        await _backend.initialize();
        return _backend;
      }

      // Native: SQLite (native plugin, or WASM fallback inside the WebView)
      console.log('[Storage] Initializing SQLiteBackend (auto-detects native vs WASM)...');
      const { SQLiteBackend } = await import('./SQLiteBackend');
      _backend = new SQLiteBackend();
      await _backend.initialize();


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
      _backend = new IndexedDBBackend();
      await _backend.initialize();
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
