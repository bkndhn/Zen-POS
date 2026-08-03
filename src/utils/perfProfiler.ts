/**
 * Lightweight performance profiler.
 *
 * Wraps window.fetch to time every Supabase REST/RPC/Storage call, keeps rolling
 * per-endpoint statistics in memory, and records route-change durations so slow
 * data refreshes during navigation are easy to spot.
 *
 * Zero UI cost: no React state, no re-renders, bounded memory (one row per endpoint).
 *
 * Usage in the browser console:
 *   __zenPerf.report()   -> table of slowest endpoints
 *   __zenPerf.routes()   -> recent route transitions with their data cost
 *   __zenPerf.reset()
 */

export interface EndpointStat {
    label: string;
    calls: number;
    totalMs: number;
    avgMs: number;
    maxMs: number;
    lastMs: number;
    errors: number;
}

export interface RouteStat {
    path: string;
    at: number;
    /** ms between navigation start and the route settling (no in-flight queries). */
    settleMs: number;
    queries: number;
}

const SLOW_QUERY_MS = 1200;
const MAX_ROUTES = 40;

const stats = new Map<string, EndpointStat>();
const routes: RouteStat[] = [];

let inFlight = 0;
let installed = false;
let currentRoute: { path: string; start: number; queries: number } | null = null;
let settleTimer: ReturnType<typeof setTimeout> | null = null;

/** Turn a Supabase URL into a compact, groupable label such as `items` or `rpc:secure_create_bill`. */
function labelFor(url: string): string | null {
    try {
        const u = new URL(url, window.location.origin);
        if (!/supabase\.(co|in)$/.test(u.hostname) && !u.pathname.startsWith('/rest/v1')) {
            if (!u.pathname.includes('/rest/v1') && !u.pathname.includes('/functions/v1')) return null;
        }
        const path = u.pathname;
        const rest = path.match(/\/rest\/v1\/rpc\/([^/?]+)/);
        if (rest) return `rpc:${rest[1]}`;
        const table = path.match(/\/rest\/v1\/([^/?]+)/);
        if (table) return table[1];
        const fn = path.match(/\/functions\/v1\/([^/?]+)/);
        if (fn) return `fn:${fn[1]}`;
        const storage = path.match(/\/storage\/v1\/object\/[^/]+\/([^/?]+)/);
        if (storage) return `storage:${storage[1]}`;
        return null;
    } catch {
        return null;
    }
}

function record(label: string, ms: number, failed: boolean) {
    const row = stats.get(label) ?? {
        label, calls: 0, totalMs: 0, avgMs: 0, maxMs: 0, lastMs: 0, errors: 0,
    };
    row.calls += 1;
    row.totalMs += ms;
    row.avgMs = row.totalMs / row.calls;
    row.maxMs = Math.max(row.maxMs, ms);
    row.lastMs = ms;
    if (failed) row.errors += 1;
    stats.set(label, row);

    if (ms >= SLOW_QUERY_MS) {
        console.warn(`[perf] slow query ${label} took ${Math.round(ms)}ms`);
    }
    if (currentRoute) currentRoute.queries += 1;
}

/** Settle = no Supabase request in flight for 250ms after a route change. */
function scheduleSettle() {
    if (!currentRoute) return;
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
        if (!currentRoute) return;
        if (inFlight > 0) { scheduleSettle(); return; }
        routes.push({
            path: currentRoute.path,
            at: Date.now(),
            settleMs: Math.round(performance.now() - currentRoute.start),
            queries: currentRoute.queries,
        });
        if (routes.length > MAX_ROUTES) routes.shift();
        currentRoute = null;
        settleTimer = null;
    }, 250);
}

/** Call on every route change to time how long that screen takes to show fresh data. */
export function markNavigation(path: string) {
    currentRoute = { path, start: performance.now(), queries: 0 };
    scheduleSettle();
}

export function perfReport(): EndpointStat[] {
    return Array.from(stats.values()).sort((a, b) => b.totalMs - a.totalMs);
}

export function slowestQueries(limit = 10): EndpointStat[] {
    return Array.from(stats.values()).sort((a, b) => b.avgMs - a.avgMs).slice(0, limit);
}

export function routeReport(): RouteStat[] {
    return [...routes].reverse();
}

export function resetPerf() {
    stats.clear();
    routes.length = 0;
}

export function installPerfProfiler() {
    if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    installed = true;

    const original = window.fetch.bind(window);
    window.fetch = async (input: any, init?: any) => {
        const url = typeof input === 'string' ? input : (input?.url ?? '');
        const label = labelFor(url);
        if (!label) return original(input, init);

        inFlight += 1;
        const start = performance.now();
        try {
            const res = await original(input, init);
            record(label, performance.now() - start, !res.ok);
            return res;
        } catch (err) {
            record(label, performance.now() - start, true);
            throw err;
        } finally {
            inFlight -= 1;
            scheduleSettle();
        }
    };

    (window as any).__zenPerf = {
        report: () => { console.table(perfReport()); return perfReport(); },
        slowest: (n = 10) => { console.table(slowestQueries(n)); return slowestQueries(n); },
        routes: () => { console.table(routeReport()); return routeReport(); },
        reset: resetPerf,
    };
}
