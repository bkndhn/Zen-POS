/**
 * Native & PWA Storage Engine for Zen POS
 * Handles OS-level storage persistence (navigator.storage.persist)
 * and seamless fallback across IndexedDB, localStorage, and Capacitor Preferences.
 */

export interface StorageStatus {
    isPersistent: boolean;
    quotaBytes: number;
    usageBytes: number;
    usageMB: string;
    quotaMB: string;
    percentUsed: string;
}

/**
 * Request OS-level persistent storage permission to prevent browser/Android Webview
 * from auto-evicting IndexedDB database under low disk space conditions.
 */
export async function initStoragePersistence(): Promise<boolean> {
    try {
        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persisted();
            if (!isPersisted) {
                const granted = await navigator.storage.persist();
                console.log(`[StoragePersistence] Storage persist request result: ${granted}`);
                localStorage.setItem('hotel_pos_storage_persistent', granted ? 'true' : 'false');
                return granted;
            } else {
                console.log('[StoragePersistence] Storage is already persistent.');
                localStorage.setItem('hotel_pos_storage_persistent', 'true');
                return true;
            }
        }
    } catch (err) {
        console.warn('[StoragePersistence] Storage persistence check failed:', err);
    }
    return false;
}

/**
 * Fetch storage usage statistics (IndexedDB + Cache API + Web Storage)
 */
export async function getStorageEstimate(): Promise<StorageStatus> {
    const defaultStatus: StorageStatus = {
        isPersistent: localStorage.getItem('hotel_pos_storage_persistent') === 'true',
        quotaBytes: 0,
        usageBytes: 0,
        usageMB: '0.00',
        quotaMB: '0.00',
        percentUsed: '0.0',
    };

    try {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            const usage = estimate.usage || 0;
            const quota = estimate.quota || 0;
            const isPersistent = await navigator.storage.persisted().catch(() => defaultStatus.isPersistent);

            const usageMB = (usage / (1024 * 1024)).toFixed(2);
            const quotaMB = (quota / (1024 * 1024)).toFixed(2);
            const percentUsed = quota > 0 ? ((usage / quota) * 100).toFixed(1) : '0.0';

            return {
                isPersistent,
                quotaBytes: quota,
                usageBytes: usage,
                usageMB,
                quotaMB,
                percentUsed,
            };
        }
    } catch (err) {
        console.warn('[StorageEstimate] Failed to estimate storage:', err);
    }

    return defaultStatus;
}

/**
 * Universal Key-Value Storage Helper
 * Syncs critical preferences to Capacitor Preferences if available,
 * falling back smoothly to localStorage.
 */
export const universalStorage = {
    async getItem(key: string): Promise<string | null> {
        try {
            // @ts-expect-error - Check Capacitor global object if injected
            if (window.Capacitor?.Plugins?.Preferences) {
                // @ts-expect-error - Capacitor Preferences plugin
                const { value } = await window.Capacitor.Plugins.Preferences.get({ key });
                if (value !== null && value !== undefined) return value;
            }
        } catch { /* Fallback to localStorage */ }
        return localStorage.getItem(key);
    },

    async setItem(key: string, value: string): Promise<void> {
        try {
            localStorage.setItem(key, value);
            // @ts-expect-error - Check Capacitor global object
            if (window.Capacitor?.Plugins?.Preferences) {
                // @ts-expect-error - Capacitor Preferences plugin
                await window.Capacitor.Plugins.Preferences.set({ key, value });
            }
        } catch (err) {
            console.warn(`[UniversalStorage] Failed to set ${key}:`, err);
        }
    },

    async removeItem(key: string): Promise<void> {
        try {
            localStorage.removeItem(key);
            // @ts-expect-error - Check Capacitor global object
            if (window.Capacitor?.Plugins?.Preferences) {
                // @ts-expect-error - Capacitor Preferences plugin
                await window.Capacitor.Plugins.Preferences.remove({ key });
            }
        } catch (err) {
            console.warn(`[UniversalStorage] Failed to remove ${key}:`, err);
        }
    }
};

/**
 * Secondary Fail-Safe Vault Mirror
 * Dual-stores pending bills, items, and offline counters in universalStorage so data is preserved
 * across cold Android phone restarts, battery pulls, or OS Webview clear events.
 */
export const secondaryVault = {
    async saveMirror(vaultKey: string, payload: any): Promise<void> {
        try {
            const jsonStr = JSON.stringify({
                ts: Date.now(),
                data: payload
            });
            await universalStorage.setItem(`hotel_pos_vault_${vaultKey}`, jsonStr);
        } catch (err) {
            console.warn(`[SecondaryVault] Mirror save failed for ${vaultKey}:`, err);
        }
    },

    async getMirror<T>(vaultKey: string): Promise<T | null> {
        try {
            const raw = await universalStorage.getItem(`hotel_pos_vault_${vaultKey}`);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed?.data || null;
        } catch (err) {
            console.warn(`[SecondaryVault] Mirror read failed for ${vaultKey}:`, err);
            return null;
        }
    },

    async clearMirror(vaultKey: string): Promise<void> {
        await universalStorage.removeItem(`hotel_pos_vault_${vaultKey}`);
    }
};

