import { offlineManager } from './offlineManager';
import { format } from 'date-fns';

export interface ZenPOSBackupData {
    version: string;
    timestamp: string;
    bills: any[];
    pendingBills: any[];
    items: any[];
    categories: any[];
}

/**
 * Extracts all data from local IndexedDB and downloads it as a JSON file.
 * Includes both cached bills (STORES.BILLS) AND pending unsynced bills (STORES.PENDING_BILLS).
 */
export const exportLocalDatabase = async (): Promise<void> => {
    try {
        const bills = await offlineManager.getCachedBills();
        const pendingBills = await offlineManager.getPendingBills();
        const items = await offlineManager.getCachedItems();
        const categories = await offlineManager.getCachedCategories();

        const backupData: ZenPOSBackupData = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            bills,
            pendingBills,
            items,
            categories
        };

        const jsonString = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const dateStr = format(new Date(), 'yyyy-MM-dd_HH-mm');
        a.download = `zenpos_local_backup_${dateStr}.json`;
        
        document.body.appendChild(a);
        a.click();
        
        // Use a longer timeout for slower Android WebView downloads
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 5000);
    } catch (error) {
        console.error('Failed to export local database:', error);
        throw new Error('Failed to generate backup file.');
    }
};

/**
 * Parses a JSON backup file and restores the data into IndexedDB.
 * Uses batch operations (storeMany) for bills to avoid IDB transaction thrashing.
 */
export const importLocalDatabase = async (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const content = e.target?.result as string;
                const data = JSON.parse(content) as ZenPOSBackupData;
                
                // Robust validation
                if (!data.version) {
                    throw new Error('Invalid ZenPOS backup file: missing version field.');
                }
                if (data.bills && !Array.isArray(data.bills)) {
                    throw new Error('Invalid ZenPOS backup file: bills is not an array.');
                }
                if (data.items && !Array.isArray(data.items)) {
                    throw new Error('Invalid ZenPOS backup file: items is not an array.');
                }
                if (data.categories && !Array.isArray(data.categories)) {
                    throw new Error('Invalid ZenPOS backup file: categories is not an array.');
                }

                // Restore bills using batch method for performance
                if (data.bills && data.bills.length > 0) {
                    await offlineManager.cacheBillsBatch(data.bills);
                }

                // Restore pending bills using batch method
                if (data.pendingBills && Array.isArray(data.pendingBills) && data.pendingBills.length > 0) {
                    await offlineManager.cachePendingBillsBatch(data.pendingBills);
                }

                // Restore items (already batched via storeMany internally)
                if (data.items && data.items.length > 0) {
                    await offlineManager.cacheItems(data.items);
                }

                // Restore categories (already batched via storeMany internally)
                if (data.categories && data.categories.length > 0) {
                    await offlineManager.cacheCategories(data.categories);
                }

                resolve();
            } catch (error: any) {
                console.error('Failed to parse and import backup:', error);
                reject(new Error(error.message || 'Failed to restore backup file.'));
            }
        };

        reader.onerror = () => {
            reject(new Error('Failed to read the backup file.'));
        };

        reader.readAsText(file);
    });
};
