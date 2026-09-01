/**
 * ZenPOS Universal Offline Layer
 * ------------------------------------------------------------------
 * Wraps `supabase.from(table)` with a *chain recorder* so that EVERY
 * page in the app becomes offline-capable without page-level code:
 *
 *  READS   → online: run the real query, then cache the result.
 *            offline / network failure: replay from the local cache and
 *            apply the pending write queue on top (read-your-writes).
 *
 *  WRITES  → online: run normally.
 *            offline / network failure: push into the durable write queue
 *            (IndexedDB / SQLite) and return an optimistic success so the
 *            UI keeps flowing. Queue is drained automatically on reconnect.
 *
 * The recorder is lazy: nothing touches the network until the builder is
 * awaited, so there is no extra latency online (one extra object hop).
 */

// NOTE: imported lazily to avoid a circular import with the supabase client.
type OfflineManager = typeof import('@/utils/offlineManager')['offlineManager'];
let _om: OfflineManager | null = null;
const om = async (): Promise<OfflineManager> => {
  if (!_om) _om = (await import('@/utils/offlineManager')).offlineManager;
  return _om;
};

/** Tables driven by dedicated sync engines — never double-queue them. */
const EXCLUDED_TABLES = new Set(['bills', 'bill_items', 'pending_bills']);

/** Terminal-ish methods that mark the chain as a mutation. */
const MUTATION_METHODS = new Set(['insert', 'update', 'upsert', 'delete']);

type ChainCall = { m: string; args: any[] };

let bypassDepth = 0;
/** Run a callback with the offline layer disabled (used by the sync drainer). */
export async function withOfflineBypass<T>(fn: () => Promise<T>): Promise<T> {
  bypassDepth++;
  try {
    return await fn();
  } finally {
    bypassDepth--;
  }
}

const isLocalOnlyMode = () => {
  try {
    return localStorage.getItem('privacy_storage_mode') === 'local';
  } catch {
    return false;
  }
};

const isOffline = () => !navigator.onLine || isLocalOnlyMode();

/** True when a thrown/returned error looks like a transport failure, not a 4xx. */
const isNetworkError = (err: any) => {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  return (
    err.name === 'TypeError' ||
    err.name === 'AbortError' ||
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('load failed') ||
    msg.includes('timeout') ||
    msg.includes('fetch')
  );
};

/** Stable cache key for a recorded read chain. */
const chainKey = (chain: ChainCall[]) => {
  try {
    return chain.map((c) => `${c.m}(${JSON.stringify(c.args)})`).join('|').slice(0, 400);
  } catch {
    return chain.map((c) => c.m).join('|');
  }
};

/** Collect `eq`/`in`/`match` filters from a chain into a simple predicate spec. */
function collectFilters(chain: ChainCall[]): Record<string, any> {
  const filters: Record<string, any> = {};
  for (const c of chain) {
    if (c.m === 'eq' && c.args.length >= 2) filters[c.args[0]] = c.args[1];
    else if (c.m === 'in' && c.args.length >= 2) filters[c.args[0]] = { __in: c.args[1] };
    else if (c.m === 'match' && typeof c.args[0] === 'object') Object.assign(filters, c.args[0]);
  }
  return filters;
}

function rowMatches(row: any, filters: Record<string, any>): boolean {
  return Object.entries(filters).every(([k, v]) => {
    if (v && typeof v === 'object' && '__in' in v) return (v.__in as any[]).includes(row?.[k]);
    return row?.[k] === v;
  });
}

/**
 * Apply queued (not yet synced) writes on top of cached rows so the user
 * always sees their own offline edits — WhatsApp-style local truth.
 */
async function applyPendingOverlay(table: string, rows: any[]): Promise<any[]> {
  let out = Array.isArray(rows) ? [...rows] : [];
  try {
    const queue = await (await om()).getWriteQueue();
    const mine = queue
      .filter((q: any) => q.table === table && q.status !== 'synced')
      .sort((a: any, b: any) => a.timestamp - b.timestamp);

    for (const entry of mine) {
      const filters = entry.filters || (entry.data?.id ? { id: entry.data.id } : {});
      if (entry.operation === 'INSERT') {
        const row = { ...entry.data, __pendingSync: true };
        if (!out.some((r) => r?.id && r.id === row.id)) out.push(row);
      } else if (entry.operation === 'UPDATE') {
        out = out.map((r) =>
          rowMatches(r, filters) ? { ...r, ...entry.data, __pendingSync: true } : r
        );
      } else if (entry.operation === 'DELETE') {
        out = out.filter((r) => !rowMatches(r, filters));
      }
    }
  } catch {
    /* overlay is best-effort */
  }
  return out;
}

function shapeResult(chain: ChainCall[], rows: any[]) {
  const wantsSingle = chain.some((c) => c.m === 'single' || c.m === 'maybeSingle');
  const isCount = chain.some((c) => c.m === 'select' && c.args?.[1]?.count);
  if (wantsSingle) {
    return { data: rows[0] ?? null, error: null, count: rows.length, status: 200, statusText: 'OK (offline cache)' };
  }
  return {
    data: rows,
    error: null,
    count: isCount ? rows.length : null,
    status: 200,
    statusText: 'OK (offline cache)',
  };
}

/** Replay the recorded chain against the real PostgREST builder. */
function replay(realFrom: (t: string) => any, table: string, chain: ChainCall[]) {
  let builder: any = realFrom(table);
  for (const call of chain) builder = builder[call.m](...call.args);
  return builder;
}

async function executeRead(realFrom: any, table: string, chain: ChainCall[]) {
  const key = chainKey(chain);

  const fromCache = async () => {
    const cached = await (await om()).getCachedQueryResult(table, key);
    const rows = await applyPendingOverlay(table, (cached?.data as any[]) || []);
    return shapeResult(chain, rows);
  };

  if (isOffline()) return fromCache();

  try {
    const res: any = await replay(realFrom, table, chain);
    if (res?.error && isNetworkError(res.error)) return fromCache();
    if (!res?.error && res?.data != null) {
      const rows = Array.isArray(res.data) ? res.data : [res.data];
      // Cache in the background — never block the UI path.
      om().then((m) => m.cacheQueryResult(table, key, rows)).catch(() => {});
    }
    return res;
  } catch (err) {
    if (isNetworkError(err)) return fromCache();
    throw err;
  }
}

async function executeMutation(realFrom: any, table: string, chain: ChainCall[]) {
  const mutation = chain.find((c) => MUTATION_METHODS.has(c.m))!;
  const op = mutation.m;
  const filters = collectFilters(chain);

  const queueIt = async () => {
    if (op === 'insert' || op === 'upsert') {
      const payload = mutation.args[0];
      const rows = (Array.isArray(payload) ? payload : [payload]).map((r: any) => ({
        id: r?.id || crypto.randomUUID(),
        created_at: r?.created_at || new Date().toISOString(),
        ...r,
      }));
      for (const row of rows) {
        await (await om()).queueWrite({ table, operation: 'INSERT', data: row });
      }
      return shapeResult(chain, rows);
    }
    if (op === 'update') {
      await (await om()).queueWrite({
        table,
        operation: 'UPDATE',
        data: { ...mutation.args[0], ...(filters.id ? { id: filters.id } : {}) },
        filters,
      });
      return shapeResult(chain, [{ ...mutation.args[0], ...filters }]);
    }
    // delete
    await (await om()).queueWrite({
      table,
      operation: 'DELETE',
      data: { ...(filters.id ? { id: filters.id } : {}) },
      filters,
    });
    return shapeResult(chain, []);
  };

  if (isOffline()) return queueIt();

  try {
    const res: any = await replay(realFrom, table, chain);
    if (res?.error && isNetworkError(res.error)) return queueIt();
    if (!res?.error) om().then((m) => m.clearCacheForTable(table)).catch(() => {});
    return res;
  } catch (err) {
    if (isNetworkError(err)) return queueIt();
    throw err;
  }
}

/**
 * Installs the offline layer onto a Supabase client instance.
 * Idempotent — safe to call once at module load.
 */
export function installOfflineLayer(client: any) {
  if (client.__offlineLayerInstalled) return client;
  const realFrom = client.from.bind(client);
  client.__offlineLayerInstalled = true;

  client.from = (table: string) => {
    if (bypassDepth > 0 || EXCLUDED_TABLES.has(table)) return realFrom(table);

    const chain: ChainCall[] = [];

    const run = () => {
      const isMutation = chain.some((c) => MUTATION_METHODS.has(c.m));
      return isMutation
        ? executeMutation(realFrom, table, chain)
        : executeRead(realFrom, table, chain);
    };

    const proxy: any = new Proxy(function () {} as any, {
      get(_t, prop: string | symbol) {
        if (prop === 'then') {
          return (onOk: any, onErr: any) => run().then(onOk, onErr);
        }
        if (prop === 'catch') return (onErr: any) => run().catch(onErr);
        if (prop === 'finally') return (cb: any) => run().finally(cb);
        if (typeof prop === 'symbol') return undefined;
        return (...args: any[]) => {
          chain.push({ m: String(prop), args });
          return proxy;
        };
      },
    });

    return proxy;
  };

  return client;
}
