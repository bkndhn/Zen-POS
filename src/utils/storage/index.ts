/**
 * ZenPOS Storage Layer — Barrel Export
 * 
 * Usage:
 *   import { initStorage, getStorageBackend } from '@/utils/storage';
 */

export { initStorage, getStorageBackend, STORE_NAMES } from './initStorage';
export type { StorageBackend, WriteQueueEntry, CachedQueryResult } from './StorageBackend';
