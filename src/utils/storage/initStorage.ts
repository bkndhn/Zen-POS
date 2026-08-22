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
 */
export async function initStorage(): Promise<StorageBackend> {
  if (_backend?.isReady()) return _backend;

  // Prevent multiple simultaneous initializations
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      const isNative = isCapacitorNative();

      if (isNative) {
        console.log('[Storage] Native platform detected — using SQLiteBackend');
        const { SQLiteBackend } = await import('./SQLiteBackend');
        _backend = new SQLiteBackend();
      } else {
        console.log('[Storage] Web platform detected — using IndexedDBBackend');
        const { IndexedDBBackend } = await import('./IndexedDBBackend');
        _backend = new IndexedDBBackend();
      }

      await _backend.initialize();

      // Run one-time migration from IndexedDB → SQLite on native
      if (isNative) {
        try {
          const { migrateLegacyData } = await import('./migrateLegacy');
          await migrateLegacyData(_backend);
        } catch (e) {
          console.warn('[Storage] Legacy migration skipped or failed (non-blocking):', e);
        }
      }

      return _backend;
    } catch (err) {
      console.error('[Storage] Backend initialization failed, falling back to IndexedDB:', err);
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

/**
 * Check if running on a Capacitor native platform (Android/iOS).
 */
function isCapacitorNative(): boolean {
  try {
    // @ts-expect-error — Capacitor global may not exist in all environments
    const cap = window.Capacitor;
    if (cap && typeof cap.isNativePlatform === 'function') {
      return cap.isNativePlatform();
    }
    if (cap && cap.platform && cap.platform !== 'web') {
      return true;
    }
  } catch {
    // Not in Capacitor environment
  }
  return false;
}

// Re-export types for convenience
export type { StorageBackend } from './StorageBackend';
export { STORE_NAMES } from './StorageBackend';
