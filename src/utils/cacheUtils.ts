
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiry: number;
}

// Cache TTL constants (in milliseconds) - increase these to reduce Supabase calls
export const CACHE_TTL = {
  SHORT: 2 * 60 * 1000,       // 2 minutes - for frequently changing data
  MEDIUM: 10 * 60 * 1000,     // 10 minutes - for moderately changing data
  LONG: 30 * 60 * 1000,       // 30 minutes - for rarely changing data
  ITEMS: 15 * 60 * 1000,      // 15 minutes - items don't change often
  REPORTS: 5 * 60 * 1000,     // 5 minutes - reports
  PERMISSIONS: 60 * 60 * 1000, // 1 hour - permissions rarely change
};

class DataCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = CACHE_TTL.MEDIUM; // Increased from 2 to 10 minutes
  private subscribers = new Map<string, Set<() => void>>();

  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiry: Date.now() + ttl
    };
    this.cache.set(key, entry);

    // Backup to localStorage so cache survives page reloads offline
    try {
      localStorage.setItem(`hotel_pos_cache_${key}`, JSON.stringify(entry));
    } catch (err) {
      console.warn(`[Cache] Error writing persistent cache for ${key}:`, err);
    }

    // Notify subscribers of cache update
    this.notifySubscribers(key);
  }

  get<T>(key: string): T | null {
    let entry = this.cache.get(key);

    // Fallback to localStorage persistence if in-memory Map was cleared on page refresh
    if (!entry) {
      try {
        const stored = localStorage.getItem(`hotel_pos_cache_${key}`);
        if (stored) {
          entry = JSON.parse(stored);
          if (entry) {
            this.cache.set(key, entry);
          }
        }
      } catch (err) {
        console.warn(`[Cache] Error reading persistent cache for ${key}:`, err);
      }
    }

    if (!entry) return null;

    // If online and entry is expired, invalidate so fresh data can be fetched
    // BUT if offline (or navigator.onLine is false), preserve cached data indefinitely!
    const isExpired = Date.now() > entry.expiry;
    if (isExpired && navigator.onLine) {
      // Don't delete immediately; return entry.data as stale fallback while background fetch runs
      return entry.data;
    }

    return entry.data;
  }

  // Subscribe to cache changes for a specific key
  subscribe(key: string, callback: () => void): () => void {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(callback);

    // Return unsubscribe function
    return () => {
      const keySubscribers = this.subscribers.get(key);
      if (keySubscribers) {
        keySubscribers.delete(callback);
        if (keySubscribers.size === 0) {
          this.subscribers.delete(key);
        }
      }
    };
  }

  private notifySubscribers(key: string): void {
    const keySubscribers = this.subscribers.get(key);
    if (keySubscribers) {
      keySubscribers.forEach(callback => callback());
    }
  }

  invalidate(key: string): void {
    this.cache.delete(key);
    this.notifySubscribers(key);
  }

  invalidatePattern(pattern: string): void {
    const keys = Array.from(this.cache.keys());
    keys.forEach(key => {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        this.notifySubscribers(key);
      }
    });
  }

  // Force refresh for specific keys
  forceRefresh(keys: string[]): void {
    keys.forEach(key => {
      this.invalidate(key);
    });
  }

  clear(): void {
    const allKeys = Array.from(this.cache.keys());
    this.cache.clear();
    allKeys.forEach(key => this.notifySubscribers(key));
  }

  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  // Check if data is stale (older than half TTL)
  isStale(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return true;

    const halfTTL = (entry.expiry - entry.timestamp) / 2;
    return (Date.now() - entry.timestamp) > halfTTL;
  }
}

export const dataCache = new DataCache();

// Enhanced cache keys with more granular control
export const CACHE_KEYS = {
  ITEMS: 'items',
  ITEMS_LIST: 'items_list',
  ACTIVE_ITEMS: 'active_items',
  CATEGORIES: 'categories',
  ITEM_CATEGORIES: 'item_categories',
  EXPENSE_CATEGORIES: 'expense_categories',
  EXPENSES: 'expenses',
  EXPENSES_LIST: 'expenses_list',
  BILLS: 'bills',
  BILLS_LIST: 'bills_list',
  REPORTS: 'reports',
  PAYMENTS: 'payments',
  PAYMENT_METHODS: 'payment_methods',
  MOST_SOLD_ITEMS: 'most_sold_items',
  USER_PREFERENCES: 'user_preferences'
};

// Helper function for cached Supabase fetches with optimistic updates
export async function cachedFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl?: number,
  forceRefresh: boolean = false
): Promise<T> {
  if (!forceRefresh) {
    const cached = dataCache.get<T>(key);
    if (cached) {
      console.log(`Cache hit for key: ${key}`);
      import('@/utils/rum').then(m => m.rum.cacheHit(key)).catch(() => {});

      // Background refresh if data is stale
      if (dataCache.isStale(key)) {
        console.log(`Background refresh for stale key: ${key}`);
        fetchFn().then(freshData => {
          dataCache.set(key, freshData, ttl);
        }).catch(err => {
          console.warn(`Background refresh failed for ${key}:`, err);
        });
      }

      return cached;
    }
  }

  console.log(`Cache miss for key: ${key}, fetching...`);
  import('@/utils/rum').then(m => m.rum.cacheMiss(key)).catch(() => {});
  const start = performance.now();
  const data = await fetchFn();
  const elapsed = performance.now() - start;
  import('@/utils/rum').then(m => m.rum.query(key, elapsed)).catch(() => {});
  dataCache.set(key, data, ttl);
  return data;
}

// Optimistic cache update for immediate UI feedback
export function optimisticUpdate<T>(key: string, updater: (current: T | null) => T): void {
  const current = dataCache.get<T>(key);
  const updated = updater(current);
  dataCache.set(key, updated, dataCache['DEFAULT_TTL']);
}

// Batch invalidation for related data
export function invalidateRelatedData(operation: 'items' | 'expenses' | 'bills' | 'payments'): void {
  switch (operation) {
    case 'items':
      dataCache.invalidatePattern('items');
      dataCache.invalidate(CACHE_KEYS.MOST_SOLD_ITEMS);
      break;
    case 'expenses':
      dataCache.invalidatePattern('expense');
      dataCache.invalidate(CACHE_KEYS.REPORTS);
      break;
    case 'bills':
      dataCache.invalidatePattern('bills');
      dataCache.invalidate(CACHE_KEYS.REPORTS);
      dataCache.invalidate(CACHE_KEYS.MOST_SOLD_ITEMS);
      break;
    case 'payments':
      dataCache.invalidatePattern('payment');
      dataCache.invalidate(CACHE_KEYS.REPORTS);
      break;
  }
}
