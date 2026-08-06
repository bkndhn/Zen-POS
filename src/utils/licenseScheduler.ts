/**
 * Background license scheduler
 * -----------------------------------------------------------------
 * Guarantees the SaaS licence is re-verified online at least once a
 * week, even if the app is only ever opened offline in between.
 *
 * - Runs on app start, on app resume (Capacitor + tab visibility),
 *   on `online` events and on a slow interval timer.
 * - Anti-spam: a hard minimum interval between network calls, unless
 *   the cached licence is already stale (> weekly deadline).
 * - Enforcement decisions are always derived from the *server*
 *   response, never from a client-writable flag.
 */
import {
    syncSubscriptionLicense,
    checkOfflineLicenseStatus,
    type LicenseStatus,
} from './offlineLicenseManager';

const LAST_ATTEMPT_KEY = 'zen_pos_license_last_attempt';
const LOGIN_BLOCK_KEY = 'zen_pos_login_block';

/** Never hit the network more often than this (anti-spam on resume storms) */
const MIN_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
/** Attempt a refresh at least this often while online */
const DAILY_ATTEMPT_MS = 24 * 60 * 60 * 1000;
/** Hard weekly deadline — verification is forced past this age */
export const WEEKLY_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000;
/** Timer tick */
const TICK_MS = 60 * 60 * 1000; // hourly

function readTs(key: string): number {
    try {
        const raw = localStorage.getItem(key);
        return raw ? parseInt(raw, 10) || 0 : 0;
    } catch {
        return 0;
    }
}

function writeTs(key: string, value: number): void {
    try {
        localStorage.setItem(key, String(value));
    } catch {
        /* storage full / blocked — ignore */
    }
}

/** Age (ms) of the last *successful* online verification */
export function licenseAgeMs(status?: LicenseStatus): number {
    const s = status ?? checkOfflineLicenseStatus();
    if (!s.lastVerifiedAt) return Number.MAX_SAFE_INTEGER;
    const ms = new Date(s.lastVerifiedAt).getTime();
    if (!Number.isFinite(ms)) return Number.MAX_SAFE_INTEGER;
    return Math.max(0, Date.now() - ms);
}

/** True when the licence must be re-verified online before further use */
export function isWeeklyRefreshOverdue(status?: LicenseStatus): boolean {
    return licenseAgeMs(status) > WEEKLY_DEADLINE_MS;
}

/** Server-verified states that must terminate the session immediately */
export function requiresHardLogout(status: LicenseStatus): boolean {
    return (
        status.isForceLoggedOut ||
        status.lockReason === 'force_logout' ||
        status.degradationStage === 'locked'
    );
}

/* ------------------------------------------------------------------ */
/*  Login block (survives restarts until an online check clears it)     */
/* ------------------------------------------------------------------ */

export interface LoginBlock {
    blocked: boolean;
    reason: string;
    at?: string;
}

export function setLoginBlock(reason: string): void {
    try {
        localStorage.setItem(
            LOGIN_BLOCK_KEY,
            JSON.stringify({ blocked: true, reason, at: new Date().toISOString() })
        );
    } catch {
        /* ignore */
    }
}

export function getLoginBlock(): LoginBlock {
    try {
        const raw = localStorage.getItem(LOGIN_BLOCK_KEY);
        if (!raw) return { blocked: false, reason: '' };
        const parsed = JSON.parse(raw);
        return { blocked: !!parsed.blocked, reason: parsed.reason || '', at: parsed.at };
    } catch {
        return { blocked: false, reason: '' };
    }
}

export function clearLoginBlock(): void {
    try {
        localStorage.removeItem(LOGIN_BLOCK_KEY);
    } catch {
        /* ignore */
    }
}

/* ------------------------------------------------------------------ */
/*  Verification                                                        */
/* ------------------------------------------------------------------ */

let inFlight: Promise<LicenseStatus> | null = null;

/**
 * Verify the licence, respecting the anti-spam minimum interval.
 * Pass `force` to bypass the interval (manual "Verify now" button).
 */
export async function verifyLicenseNow(
    adminId: string,
    opts: { force?: boolean } = {}
): Promise<LicenseStatus> {
    if (!adminId) return checkOfflineLicenseStatus();

    const cached = checkOfflineLicenseStatus();
    const overdue = isWeeklyRefreshOverdue(cached);

    if (!navigator.onLine) return cached;

    const sinceAttempt = Date.now() - readTs(LAST_ATTEMPT_KEY);
    if (!opts.force && !overdue && sinceAttempt < MIN_CHECK_INTERVAL_MS) {
        return cached;
    }

    if (inFlight) return inFlight;

    writeTs(LAST_ATTEMPT_KEY, Date.now());
    inFlight = syncSubscriptionLicense(adminId)
        .then((status) => {
            if (status.isValid && !status.isForceLoggedOut) clearLoginBlock();
            return status;
        })
        .catch(() => checkOfflineLicenseStatus())
        .finally(() => {
            inFlight = null;
        });

    return inFlight;
}

/**
 * Gate used at login time. Online: the server response decides.
 * Offline: the cached licence may only carry the session while it is
 * still valid inside the offline grace window.
 */
export async function verifyLicenseForLogin(
    adminId: string
): Promise<{ allowed: boolean; reason?: string; status: LicenseStatus }> {
    const existingBlock = getLoginBlock();

    if (navigator.onLine && adminId) {
        const status = await verifyLicenseNow(adminId, { force: true });
        if (requiresHardLogout(status)) {
            const reason = status.isForceLoggedOut
                ? status.forceLogoutReason || 'Your account has been suspended by the administrator.'
                : 'Your subscription has expired. Please renew to continue using ZenPOS.';
            setLoginBlock(reason);
            return { allowed: false, reason, status };
        }
        clearLoginBlock();
        return { allowed: true, status };
    }

    // Offline path
    const status = checkOfflineLicenseStatus();
    if (existingBlock.blocked) {
        return {
            allowed: false,
            reason: `${existingBlock.reason} Connect to the internet to verify your subscription.`,
            status,
        };
    }
    if (requiresHardLogout(status) || isWeeklyRefreshOverdue(status)) {
        return {
            allowed: false,
            reason:
                'Offline licence check required. Connect to the internet once to verify your active subscription.',
            status,
        };
    }
    return { allowed: true, status };
}

/* ------------------------------------------------------------------ */
/*  Scheduler                                                           */
/* ------------------------------------------------------------------ */

export interface SchedulerHandle {
    stop: () => void;
    checkNow: () => Promise<LicenseStatus>;
}

/**
 * Start the background scheduler for an admin account.
 * `onEnforce` fires only when the *server-verified* licence says the
 * session must end.
 */
export function startLicenseScheduler(
    adminId: string,
    handlers: {
        onStatus?: (status: LicenseStatus) => void;
        onEnforce?: (status: LicenseStatus, reason: string) => void;
    } = {}
): SchedulerHandle {
    let stopped = false;
    let capacitorCleanup: (() => void) | null = null;

    const evaluate = async (force = false) => {
        if (stopped || !adminId) return checkOfflineLicenseStatus();

        const cached = checkOfflineLicenseStatus();
        const shouldTry =
            force ||
            isWeeklyRefreshOverdue(cached) ||
            licenseAgeMs(cached) > DAILY_ATTEMPT_MS;

        const status = shouldTry ? await verifyLicenseNow(adminId, { force }) : cached;

        handlers.onStatus?.(status);

        if (requiresHardLogout(status)) {
            const reason = status.isForceLoggedOut
                ? status.forceLogoutReason || 'Your account has been suspended.'
                : 'Your subscription has expired. Please renew to continue.';
            setLoginBlock(reason);
            handlers.onEnforce?.(status, reason);
            return status;
        }

        // Offline past the weekly deadline → lock the session out too
        if (!navigator.onLine && isWeeklyRefreshOverdue(status)) {
            const reason =
                'Offline for more than 7 days. Connect to the internet to re-verify your subscription.';
            handlers.onEnforce?.(status, reason);
        }

        return status;
    };

    // Initial check (forced so a fresh session always talks to the server)
    void evaluate(true);

    const interval = window.setInterval(() => void evaluate(false), TICK_MS);

    const onOnline = () => void evaluate(true);
    const onVisible = () => {
        if (document.visibilityState === 'visible') void evaluate(false);
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);

    // Native app resume (Capacitor) — optional dependency
    void (async () => {
        try {
            const mod: any = await import('@capacitor/app').catch(() => null);
            if (!mod?.App || stopped) return;
            const listener = await mod.App.addListener('appStateChange', (state: any) => {
                if (state?.isActive) void evaluate(false);
            });
            capacitorCleanup = () => {
                try {
                    listener?.remove?.();
                } catch {
                    /* ignore */
                }
            };
        } catch {
            /* not a native build */
        }
    })();

    return {
        stop: () => {
            stopped = true;
            window.clearInterval(interval);
            window.removeEventListener('online', onOnline);
            document.removeEventListener('visibilitychange', onVisible);
            capacitorCleanup?.();
        },
        checkNow: () => evaluate(true),
    };
}
