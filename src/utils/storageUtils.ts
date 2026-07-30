/**
 * Safe LocalStorage wrapper to prevent the app from crashing when the browser 
 * blocks localStorage access (e.g. "The operation is insecure" SecurityError 
 * in incognito mode or restrictive browser settings).
 */

export const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn(`[SafeStorage] Could not read ${key} from localStorage`, error);
      return null;
    }
  },
  
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn(`[SafeStorage] Could not write ${key} to localStorage`, error);
    }
  },
  
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`[SafeStorage] Could not remove ${key} from localStorage`, error);
    }
  },

  clear: (): void => {
    try {
      localStorage.clear();
    } catch (error) {
      console.warn(`[SafeStorage] Could not clear localStorage`, error);
    }
  },

  // Added keys iteration for AuthContext
  getAllKeys: (): string[] => {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) keys.push(key);
      }
      return keys;
    } catch (error) {
      console.warn(`[SafeStorage] Could not iterate localStorage keys`, error);
      return [];
    }
  }
};
