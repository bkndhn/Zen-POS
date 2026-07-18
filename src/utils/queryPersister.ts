import { get, set, del } from 'idb-keyval';
import { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

const idbValidKey = (key: IDBValidKey) => {
  return typeof key === 'string' || typeof key === 'number' || key instanceof Date;
};

export function createIDBPersister(idbValidKey: IDBValidKey = 'reactQuery'): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await set(idbValidKey, client);
      } catch (err) {
        console.error('Failed to persist react-query client to indexedDB', err);
      }
    },
    restoreClient: async () => {
      try {
        return await get<PersistedClient>(idbValidKey);
      } catch (err) {
        console.error('Failed to restore react-query client from indexedDB', err);
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await del(idbValidKey);
      } catch (err) {
        console.error('Failed to remove react-query client from indexedDB', err);
      }
    },
  };
}
