/**
 * Cooking / prep time helpers.
 *
 * A single source of truth for how the app talks about "how long will this take":
 * item level cooking time, order level ETA, running timers and overdue detection.
 */

export const DEFAULT_COOKING_TIME_MINS = 10;

export interface PrepConfig {
    default_cooking_time_mins: number;
    busy_buffer_mins: number;
    busy_until?: string | null;
}

export const DEFAULT_PREP_CONFIG: PrepConfig = {
    default_cooking_time_mins: DEFAULT_COOKING_TIME_MINS,
    busy_buffer_mins: 0,
    busy_until: null,
};

/** Normalises whatever comes back from the RPC / settings row. */
export const normalizePrepConfig = (raw: any): PrepConfig => {
    if (!raw || typeof raw !== 'object') return DEFAULT_PREP_CONFIG;
    const busyUntil = raw.busy_until ?? raw.kitchen_busy_until ?? null;
    const expired = busyUntil ? new Date(busyUntil).getTime() < Date.now() : false;
    return {
        default_cooking_time_mins:
            Number(raw.default_cooking_time_mins) > 0
                ? Math.round(Number(raw.default_cooking_time_mins))
                : DEFAULT_COOKING_TIME_MINS,
        busy_buffer_mins: expired ? 0 : Math.max(0, Math.round(Number(raw.busy_buffer_mins ?? raw.kitchen_busy_buffer_mins) || 0)),
        busy_until: busyUntil,
    };
};

/** Compact human label: 12m, 1h 05m. Always integer minutes. */
export const formatMins = (mins: number): string => {
    const m = Math.max(0, Math.round(mins));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h} hr` : `${h} hr ${rem} min`;
};

/** mm:ss clock used for the live running timer. Caps hours in H:MM:SS. */
export const formatClock = (totalSeconds: number): string => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

/**
 * Cooking time promised to the customer for a set of cart lines.
 * Kitchens cook in parallel, so the slowest item drives the ETA (never the sum),
 * plus the busy-hour buffer the kitchen has switched on.
 */
export const estimateOrderMinutes = (
    lines: Array<{ cooking_time_mins?: number | null }>,
    config: PrepConfig = DEFAULT_PREP_CONFIG
): number => {
    const times = (lines || [])
        .map(l => Number(l?.cooking_time_mins))
        .filter(n => Number.isFinite(n) && n > 0);
    const base = times.length ? Math.max(...times) : config.default_cooking_time_mins;
    return Math.max(1, Math.round(base + (config.busy_buffer_mins || 0)));
};

export type PrepPhase = 'on-time' | 'due-soon' | 'overdue';

export interface PrepProgress {
    /** Seconds since the order was placed. */
    elapsedSeconds: number;
    /** Seconds left against the ETA (negative when late). */
    remainingSeconds: number;
    /** 0..1 clamped progress towards the ETA. */
    ratio: number;
    phase: PrepPhase;
    etaMinutes: number;
    /** Minutes past the promised time, 0 when on time. */
    lateMinutes: number;
}

/**
 * Live progress of one order against its ETA.
 * `now` is passed in so callers can drive it from a single ticking clock.
 */
export const getPrepProgress = (
    startedAt: string | Date | null | undefined,
    etaMinutes: number | null | undefined,
    now: number = Date.now()
): PrepProgress => {
    const eta = Number(etaMinutes) > 0 ? Math.round(Number(etaMinutes)) : DEFAULT_COOKING_TIME_MINS;
    const startMs = startedAt ? new Date(startedAt).getTime() : now;
    const elapsedSeconds = Number.isFinite(startMs) ? Math.max(0, (now - startMs) / 1000) : 0;
    const totalSeconds = eta * 60;
    const remainingSeconds = totalSeconds - elapsedSeconds;
    const ratio = totalSeconds > 0 ? Math.min(1, elapsedSeconds / totalSeconds) : 1;

    let phase: PrepPhase = 'on-time';
    if (remainingSeconds <= 0) phase = 'overdue';
    else if (remainingSeconds <= Math.min(180, totalSeconds * 0.2)) phase = 'due-soon';

    return {
        elapsedSeconds,
        remainingSeconds,
        ratio,
        phase,
        etaMinutes: eta,
        lateMinutes: remainingSeconds < 0 ? Math.floor(-remainingSeconds / 60) : 0,
    };
};

/** Wall-clock "ready by" label, e.g. 8:45 PM. */
export const readyByLabel = (
    startedAt: string | Date | null | undefined,
    etaMinutes: number | null | undefined
): string => {
    const eta = Number(etaMinutes) > 0 ? Number(etaMinutes) : DEFAULT_COOKING_TIME_MINS;
    const start = startedAt ? new Date(startedAt) : new Date();
    if (isNaN(start.getTime())) return '';
    const ready = new Date(start.getTime() + eta * 60000);
    return ready.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

/** Quick ETA nudges offered on the kitchen screen during busy hours. */
export const ETA_BUMP_OPTIONS = [5, 10, 15, 20, 30];
