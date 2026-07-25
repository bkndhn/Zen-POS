import { offlineManager } from './offlineManager';
import { format } from 'date-fns';

export interface ZenPOSBackupData {
    version: string;
    timestamp: string;
    bills: any[];
    pendingBills: any[];
    items: any[];
    categories: any[];
    // Extended snapshot buckets (optional for backwards compat)
    localStorage?: Record<string, string>;
    meta?: { app: string; schema: number; deviceHint?: string };
}

const SCHEMA_VERSION = 2;

// ---------- AES-GCM helpers (WebCrypto, browser + Android WebView) ----------
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 210_000, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

function b64(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}
function b64d(str: string): Uint8Array {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

export interface EncryptedEnvelope {
    v: number;             // envelope version
    alg: 'AES-GCM-256';
    kdf: 'PBKDF2-SHA256';
    iter: number;
    salt: string;          // base64
    iv: string;            // base64
    ct: string;            // base64 ciphertext
    ts: string;
    app: 'ZenPOS';
}

async function encryptPayload(payload: string, passphrase: string): Promise<EncryptedEnvelope> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const ct = new Uint8Array(
        await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(payload))
    );
    return {
        v: 1,
        alg: 'AES-GCM-256',
        kdf: 'PBKDF2-SHA256',
        iter: 210_000,
        salt: b64(salt),
        iv: b64(iv),
        ct: b64(ct),
        ts: new Date().toISOString(),
        app: 'ZenPOS',
    };
}

async function decryptPayload(env: EncryptedEnvelope, passphrase: string): Promise<string> {
    if (env.alg !== 'AES-GCM-256') throw new Error('Unsupported cipher');
    const salt = b64d(env.salt);
    const iv = b64d(env.iv);
    const ct = b64d(env.ct);
    const key = await deriveKey(passphrase, salt);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
}

// ---------- LocalStorage snapshot (safe keys only) ----------
const LS_SAFE_PREFIXES = ['hotel_pos_'];
function collectLocalStorage(): Record<string, string> {
    const out: Record<string, string> = {};
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (!LS_SAFE_PREFIXES.some(p => k.startsWith(p))) continue;
            // Never back up auth tokens
            if (k.includes('supabase') || k.includes('sb-')) continue;
            const v = localStorage.getItem(k);
            if (v != null) out[k] = v;
        }
    } catch { /* ignore quota / access errors */ }
    return out;
}

function restoreLocalStorage(map: Record<string, string> | undefined): number {
    if (!map) return 0;
    let n = 0;
    for (const [k, v] of Object.entries(map)) {
        if (!LS_SAFE_PREFIXES.some(p => k.startsWith(p))) continue;
        try { localStorage.setItem(k, v); n++; } catch { /* quota */ }
    }
    return n;
}

// ---------- Public API ----------
async function buildBackup(): Promise<ZenPOSBackupData> {
    const [bills, pendingBills, items, categories] = await Promise.all([
        offlineManager.getCachedBills(),
        offlineManager.getPendingBills(),
        offlineManager.getCachedItems(),
        offlineManager.getCachedCategories(),
    ]);
    return {
        version: String(SCHEMA_VERSION),
        timestamp: new Date().toISOString(),
        bills, pendingBills, items, categories,
        localStorage: collectLocalStorage(),
        meta: { app: 'ZenPOS', schema: SCHEMA_VERSION, deviceHint: navigator.userAgent.slice(0, 80) },
    };
}

function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        try { document.body.removeChild(a); } catch { /* noop */ }
        URL.revokeObjectURL(url);
    }, 5000);
}

/**
 * Full local backup. When `passphrase` is provided the file is encrypted
 * end-to-end with AES-GCM-256 (PBKDF2/SHA-256, 210k iterations) so it is
 * safe to store on Drive/WhatsApp/email without exposing sales data.
 */
export const exportLocalDatabase = async (passphrase?: string): Promise<void> => {
    try {
        const backup = await buildBackup();
        const dateStr = format(new Date(), 'yyyy-MM-dd_HH-mm');
        if (passphrase && passphrase.length >= 6) {
            const env = await encryptPayload(JSON.stringify(backup), passphrase);
            const blob = new Blob([JSON.stringify(env, null, 2)], { type: 'application/octet-stream' });
            triggerDownload(blob, `zenpos_backup_${dateStr}.zpbenc`);
        } else {
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            triggerDownload(blob, `zenpos_backup_${dateStr}.json`);
        }
    } catch (error) {
        console.error('Failed to export local database:', error);
        throw new Error('Failed to generate backup file.');
    }
};

/**
 * Restore a plain-JSON or encrypted (.zpbenc) backup. Provide the passphrase
 * used at export time when restoring an encrypted file.
 */
export const importLocalDatabase = async (file: File, passphrase?: string): Promise<{ restored: number }> => {
    const text = await file.text();
    let data: ZenPOSBackupData;

    // Attempt to detect encrypted envelope
    let parsed: any;
    try { parsed = JSON.parse(text); }
    catch { throw new Error('Backup file is not valid JSON.'); }

    if (parsed && parsed.alg === 'AES-GCM-256' && parsed.ct) {
        if (!passphrase) throw new Error('This backup is encrypted. Enter the passphrase to restore.');
        try {
            const plain = await decryptPayload(parsed as EncryptedEnvelope, passphrase);
            data = JSON.parse(plain);
        } catch (e: any) {
            throw new Error('Wrong passphrase or corrupted backup.');
        }
    } else {
        data = parsed as ZenPOSBackupData;
    }

    if (!data.version) throw new Error('Invalid ZenPOS backup: missing version.');
    if (data.bills && !Array.isArray(data.bills)) throw new Error('Invalid backup: bills.');
    if (data.items && !Array.isArray(data.items)) throw new Error('Invalid backup: items.');
    if (data.categories && !Array.isArray(data.categories)) throw new Error('Invalid backup: categories.');

    let restored = 0;
    if (data.bills?.length) { await offlineManager.cacheBillsBatch(data.bills); restored += data.bills.length; }
    if (data.pendingBills?.length) { await offlineManager.cachePendingBillsBatch(data.pendingBills); restored += data.pendingBills.length; }
    if (data.items?.length) { await offlineManager.cacheItems(data.items); restored += data.items.length; }
    if (data.categories?.length) { await offlineManager.cacheCategories(data.categories); restored += data.categories.length; }
    restored += restoreLocalStorage(data.localStorage);

    return { restored };
};
