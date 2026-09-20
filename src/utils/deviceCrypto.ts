/**
 * Device-level encryption for data at rest (AES-GCM 256).
 *
 * Everything the POS keeps on the device — queued orders, the offline sync
 * queue, cached query results and the print queue — is encrypted with a key
 * that never leaves the device:
 *   - Native (Capacitor): raw key stored in Capacitor Preferences (app-private
 *     storage, not readable by other apps).
 *   - Web/PWA: a NON-EXTRACTABLE CryptoKey stored in IndexedDB, so even script
 *     running in the page cannot read the key material out.
 *
 * If WebCrypto is unavailable (very old WebView / insecure origin) the helpers
 * degrade to pass-through so the POS keeps working instead of losing data.
 */

const KEYRING_DB = 'zenpos_keyring';
const KEYRING_STORE = 'keys';
const KEY_ID = 'device_aes_gcm_v1';
const PREF_KEY = 'zp_device_key_v1';
const PREFIX = 'zpe1:'; // envelope marker: zpe1:<base64 iv||ciphertext>

let keyPromise: Promise<CryptoKey | null> | null = null;

const subtle = (): SubtleCrypto | null => {
  try {
    return typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
  } catch {
    return null;
  }
};

const b64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};

const b64d = (str: string): Uint8Array => {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

// ─── Keyring (web): non-extractable CryptoKey in IndexedDB ────────────────
function openKeyring(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEYRING_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEYRING_STORE)) db.createObjectStore(KEYRING_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function keyringGet(db: IDBDatabase): Promise<CryptoKey | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(KEYRING_STORE, 'readonly');
      const req = tx.objectStore(KEYRING_STORE).get(KEY_ID);
      req.onsuccess = () => resolve((req.result as CryptoKey) || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function keyringPut(db: IDBDatabase, key: CryptoKey): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(KEYRING_STORE, 'readwrite');
      tx.objectStore(KEYRING_STORE).put(key, KEY_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function loadNativeKey(s: SubtleCrypto): Promise<CryptoKey | null> {
  const { Preferences } = await import('@capacitor/preferences');
  const { value } = await Preferences.get({ key: PREF_KEY });
  if (value) {
    try {
      return await s.importKey('raw', b64d(value) as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
    } catch {
      /* corrupted — regenerate below */
    }
  }
  const raw = crypto.getRandomValues(new Uint8Array(32));
  await Preferences.set({ key: PREF_KEY, value: b64(raw) });
  return s.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function loadWebKey(s: SubtleCrypto): Promise<CryptoKey | null> {
  const db = await openKeyring();
  const existing = await keyringGet(db);
  if (existing) return existing;
  const key = await s.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await keyringPut(db, key);
  return key;
}

/** Resolves the device key, creating it on first use. Null when unsupported. */
export async function getDeviceKey(): Promise<CryptoKey | null> {
  if (keyPromise) return keyPromise;
  keyPromise = (async () => {
    const s = subtle();
    if (!s) return null;
    try {
      const { Capacitor } = await import('@capacitor/core');
      return Capacitor.isNativePlatform() ? await loadNativeKey(s) : await loadWebKey(s);
    } catch (err) {
      console.warn('[DeviceCrypto] key unavailable, storing in clear:', err);
      return null;
    }
  })();
  return keyPromise;
}

/** True when the device key is usable (encryption actually active). */
export async function isEncryptionActive(): Promise<boolean> {
  return (await getDeviceKey()) !== null;
}

export const isEncrypted = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(PREFIX);

/** Encrypts any JSON-serialisable value into an opaque string envelope. */
export async function encryptValue(value: unknown): Promise<string> {
  const plain = JSON.stringify(value === undefined ? null : value);
  const key = await getDeviceKey();
  const s = subtle();
  if (!key || !s) return plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await s.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(plain) as BufferSource)
  );
  const packed = new Uint8Array(iv.length + ct.length);
  packed.set(iv, 0);
  packed.set(ct, iv.length);
  return PREFIX + b64(packed);
}

/** Decrypts an envelope produced by encryptValue. Plain legacy data passes through. */
export async function decryptValue<T = unknown>(value: unknown): Promise<T | null> {
  if (value === null || value === undefined) return null;
  if (!isEncrypted(value)) {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    }
    return value as T;
  }
  const key = await getDeviceKey();
  const s = subtle();
  if (!key || !s) return null;
  try {
    const packed = b64d(value.slice(PREFIX.length));
    const iv = packed.slice(0, 12);
    const ct = packed.slice(12);
    const pt = await s.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource);
    return JSON.parse(new TextDecoder().decode(pt)) as T;
  } catch (err) {
    console.warn('[DeviceCrypto] decrypt failed — dropping unreadable record');
    return null;
  }
}

/** Encrypts a string for localStorage-style slots. */
export const encryptString = (text: string): Promise<string> => encryptValue(text);

/** Decrypts a string slot; returns null when unreadable. */
export async function decryptString(value: string | null): Promise<string | null> {
  if (!value) return null;
  const out = await decryptValue<string>(value);
  return typeof out === 'string' ? out : null;
}
