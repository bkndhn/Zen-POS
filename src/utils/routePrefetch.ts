/**
 * Route-level prefetching.
 *
 * Two layers, both best-effort and never blocking:
 *  1. Chunk prefetch  — warms the lazy() JS bundle for a route so the Suspense
 *                       fallback never flashes on navigation.
 *  2. Data prefetch   — warms the offline/IndexedDB caches that pages read
 *                       first, so a screen paints with real data immediately
 *                       and only revalidates in the background.
 *
 * Single source of truth for both the sidebar, bottom nav and idle warm-up.
 */

import { supabase } from '@/integrations/supabase/client';

export const ROUTE_LOADERS: Record<string, () => Promise<any>> = {
    '/': () => import('@/pages/Billing'),
    '/dashboard': () => import('@/pages/Dashboard'),
    '/analytics': () => import('@/pages/DashboardAnalytics'),
    '/ai-insights': () => import('@/pages/AiInsights'),
    '/billing': () => import('@/pages/Billing'),
    '/items': () => import('@/pages/Items'),
    '/expenses': () => import('@/pages/Expenses'),
    '/reports': () => import('@/pages/Reports'),
    '/settings': () => import('@/pages/Settings'),
    '/service-area': () => import('@/pages/ServiceArea'),
    '/kitchen': () => import('@/pages/KitchenDisplay'),
    '/tables': () => import('@/pages/TableManagement'),
    '/crm': () => import('@/pages/CRM'),
    '/qr-menu': () => import('@/pages/QRMenu'),
    '/table-billing': () => import('@/pages/TableOrderBilling'),
    '/waiter': () => import('@/pages/WaiterCompanion'),
    '/suppliers': () => import('@/pages/Suppliers'),
    '/purchases': () => import('@/pages/Purchases'),
    '/purchase-returns': () => import('@/pages/PurchaseReturns'),
    '/stock': () => import('@/pages/StockManagement'),
    '/stock-reports': () => import('@/pages/StockReports'),
    '/stock-transfers': () => import('@/pages/StockTransfers'),
    '/stock-ledger': () => import('@/pages/StockLedger'),
    '/stock-adjustment': () => import('@/pages/StockAdjustment'),
    '/users': () => import('@/pages/Users'),
    '/online-orders': () => import('@/pages/OnlineOrders'),
};

const loadedChunks = new Set<string>();

/** Warm the JS chunk for a route. Safe to call repeatedly. */
export function prefetchRoute(path: string): void {
    const key = path.split('?')[0];
    if (loadedChunks.has(key)) return;
    const loader = ROUTE_LOADERS[key];
    if (!loader) return;
    loadedChunks.add(key);
    loader().catch(() => { loadedChunks.delete(key); });
}

// ---------------------------------------------------------------------------
// Data prefetch
// ---------------------------------------------------------------------------

const DATA_TTL_MS = 30_000;
const lastWarm = new Map<string, number>();

function throttled(key: string): boolean {
    const prev = lastWarm.get(key) ?? 0;
    if (Date.now() - prev < DATA_TTL_MS) return true;
    lastWarm.set(key, Date.now());
    return false;
}

export interface PrefetchContext {
    adminId?: string | null;
    /** Branch to scope by; null/undefined means "all branches". */
    branchId?: string | null;
}

/** Routes whose first paint depends on the items/categories caches. */
const MENU_ROUTES = new Set(['/', '/billing', '/items', '/waiter', '/table-billing', '/qr-menu']);

async function warmMenuCaches(ctx: PrefetchContext) {
    const { adminId, branchId } = ctx;
    if (!adminId) return;
    const key = `menu:${adminId}:${branchId ?? 'all'}`;
    if (throttled(key)) return;

    const { offlineManager } = await import('@/utils/offlineManager');

    let itemsQuery = supabase.from('items').select('*').eq('admin_id', adminId);
    if (branchId) itemsQuery = itemsQuery.eq('branch_id', branchId);

    let catQuery = supabase.from('item_categories').select('*').eq('admin_id', adminId);
    if (branchId) catQuery = catQuery.eq('branch_id', branchId);

    const [itemsRes, catRes] = await Promise.all([
        itemsQuery.order('name'),
        catQuery.order('display_order', { ascending: true }),
    ]);

    if (!itemsRes.error && itemsRes.data) {
        await offlineManager.cacheItems(itemsRes.data as any[]);
    }
    if (!catRes.error && catRes.data) {
        await offlineManager.cacheCategories(catRes.data as any[]);
    }
}

/**
 * Warm the data a route needs before the user gets there.
 * Fails silently — this is an optimisation, never a correctness path.
 */
export async function prefetchRouteData(path: string, ctx: PrefetchContext): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const key = path.split('?')[0];
    try {
        if (MENU_ROUTES.has(key)) await warmMenuCaches(ctx);
    } catch {
        /* best-effort */
    }
}

/** Chunk + data prefetch in one call, for hover / pointerdown handlers. */
export function prefetchAll(path: string, ctx: PrefetchContext): void {
    prefetchRoute(path);
    void prefetchRouteData(path, ctx);
}

/**
 * Warm the most-used routes once the browser is idle, so the very first
 * navigation after login is already instant.
 */
export function idlePrefetch(paths: string[], ctx: PrefetchContext): void {
    const run = () => {
        paths.forEach((p, i) => setTimeout(() => prefetchRoute(p), i * 120));
        void prefetchRouteData('/billing', ctx);
    };
    const ric = (window as any).requestIdleCallback;
    if (typeof ric === 'function') ric(run, { timeout: 3000 });
    else setTimeout(run, 1500);
}
