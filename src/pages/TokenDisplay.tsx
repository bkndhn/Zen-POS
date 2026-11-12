import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { Maximize, Settings, WifiOff, Repeat, Volume2, VolumeX } from 'lucide-react';

interface TokenBill {
  id: string;
  bill_no: string;
  table_no: string | null;
  order_type: string | null;
  kitchen_status: string;
  created_at: string;
}

interface UnifiedToken {
  key: string;
  token: string;
  label: string;
  status: 'pending' | 'preparing' | 'ready';
  created_at: string;
  subtitle?: string;
}

const SOUND_KEY = 'zenpos_token_sound';

const waitMins = (createdAt: string, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60000));

const shortToken = (billNo: string) => {
  const m = String(billNo || '').match(/(\d+)\s*$/);
  return m ? m[1] : billNo;
};

function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    [[523, 0], [659, 0.2]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.15);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.15);
    });
  } catch {}
}

const announce = (token: string) => {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(`Token number ${token.split('').join(' ')}, your order is ready for pickup`);
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch { /* speech unavailable */ }
};

const getUrgencyClasses = (elapsed: number) => {
  if (elapsed < 10) return { border: 'border-l-4 border-green-500', timeColor: 'text-green-400' };
  if (elapsed < 15) return { border: 'border-l-4 border-amber-500', timeColor: 'text-amber-400' };
  return { border: 'border-l-4 border-red-500 ring-1 ring-red-500/20', timeColor: 'text-red-400' };
};

const TokenDisplay = () => {
  const { adminId: publicAdminId } = useParams<{ adminId: string }>();
  const { adminProfileId } = useAuth() as any;
  const isPublic = !!publicAdminId;
  const adminId = publicAdminId || adminProfileId;
  const [bills, setBills] = useState<TokenBill[]>([]);
  const [remoteOrders, setRemoteOrders] = useState<any[]>([]);
  const [tableOrders, setTableOrders] = useState<any[]>([]);
  const [now, setNow] = useState(new Date());
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [lastCalled, setLastCalled] = useState<string | null>(null);
  const [calledHistory, setCalledHistory] = useState<string[]>([]);
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [publicShopName, setPublicShopName] = useState<string>('');
  const knownReady = useRef<Set<string> | null>(null);
  const fetchRef = useRef<() => void>(() => {});
  const { branchFilterId } = useBranchScopedQuery(() => fetchRef.current());

  const fetchBills = useCallback(async () => {
    if (!adminId) return;
    const today = new Date().toISOString().split('T')[0];
    try {
      if (isPublic) {
        const { data, error } = await (supabase as any).rpc('get_public_tokens', { p_admin_id: adminId });
        if (error) throw error;
        setBills(Array.isArray(data) ? data : []);
        setOnline(true); setLastSync(new Date());
        return;
      }
      let q: any = (supabase as any)
        .from('bills')
        .select('id, bill_no, table_no, order_type, kitchen_status, created_at')
        .eq('admin_id', adminId)
        .eq('date', today)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .in('kitchen_status', ['pending', 'preparing', 'ready'])
        .neq('service_status', 'completed')
        .neq('service_status', 'rejected')
        .order('created_at', { ascending: true })
        .limit(100);
      if (branchFilterId) q = q.eq('branch_id', branchFilterId);
      const { data, error } = await q;
      if (error) throw error;
      setBills(Array.isArray(data) ? data : []);
      setOnline(true); setLastSync(new Date());
    } catch {
      setOnline(false);
    }
  }, [adminId, branchFilterId, isPublic]);

  const fetchRemoteOrders = useCallback(async () => {
    if (!adminId || isPublic) return;
    try {
      let q: any = (supabase as any)
        .from('remote_orders')
        .select('id, order_number, status, created_at, items, order_type, customer_name')
        .eq('admin_id', adminId)
        .in('status', ['pending', 'accepted', 'preparing', 'ready'])
        .order('created_at', { ascending: true })
        .limit(100);
      if (branchFilterId) q = q.eq('branch_id', branchFilterId);
      const { data } = await q;
      setRemoteOrders(Array.isArray(data) ? data : []);
    } catch {
      /* remote_orders unavailable */
    }
  }, [adminId, branchFilterId, isPublic]);

  const fetchTableOrders = useCallback(async () => {
    if (!adminId || isPublic) return;
    try {
      let q: any = (supabase as any)
        .from('table_orders')
        .select('id, order_number, table_number, seat_label, status, created_at')
        .eq('admin_id', adminId)
        .in('status', ['pending', 'preparing', 'ready'])
        .eq('is_billed', false)
        .order('created_at', { ascending: true })
        .limit(100);
      if (branchFilterId) q = q.eq('branch_id', branchFilterId);
      const { data } = await q;
      setTableOrders(Array.isArray(data) ? data : []);
    } catch {
      /* table_orders unavailable */
    }
  }, [adminId, branchFilterId, isPublic]);

  fetchRef.current = () => {
    fetchBills();
    fetchRemoteOrders();
    fetchTableOrders();
  };

  useEffect(() => {
    let active = true;
    Promise.all([fetchBills(), fetchRemoteOrders(), fetchTableOrders()]).finally(() => {
      if (active) setInitialLoaded(true);
    });
    return () => { active = false; };
  }, [fetchBills, fetchRemoteOrders, fetchTableOrders]);

  // Public TV: show the shop's own name
  useEffect(() => {
    if (!isPublic || !publicAdminId) return;
    (supabase as any).rpc('get_public_shop_settings_by_profile', { p_profile_id: publicAdminId })
      .then(({ data }: any) => {
        const n = data?.shop_name || data?.hotel_name || data?.business_name;
        if (typeof n === 'string') setPublicShopName(n.slice(0, 60));
      }).catch(() => {});
  }, [isPublic, publicAdminId]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    if (!adminId) return;
    if (isPublic) {
      const poll = setInterval(fetchBills, 5000);
      return () => clearInterval(poll);
    }
    const channel = supabase
      .channel(`tokens-${adminId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills', filter: `admin_id=eq.${adminId}` }, () => fetchBills())
      .subscribe();
    const remoteOrdersChannel = supabase
      .channel(`token-remote-orders-${adminId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'remote_orders', filter: `admin_id=eq.${adminId}` }, () => fetchRemoteOrders())
      .subscribe();
    const tableOrdersChannel = supabase
      .channel(`token-table-orders-${adminId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_orders', filter: `admin_id=eq.${adminId}` }, () => fetchTableOrders())
      .subscribe();
    const poll = setInterval(() => {
      fetchBills();
      fetchRemoteOrders();
      fetchTableOrders();
    }, 20000);
    const onLocal = () => {
      fetchBills();
      fetchRemoteOrders();
      fetchTableOrders();
    };
    window.addEventListener('bills-updated', onLocal);
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(remoteOrdersChannel);
      supabase.removeChannel(tableOrdersChannel);
      clearInterval(poll);
      window.removeEventListener('bills-updated', onLocal);
    };
  }, [adminId, fetchBills, fetchRemoteOrders, fetchTableOrders, isPublic]);

  // Clock — update every second
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Screen WakeLock — prevents TV display from sleeping
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try { lock = await navigator.wakeLock?.request('screen'); } catch {}
    };
    acquire();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) acquire(); });
    return () => { lock?.release(); };
  }, []);

  const allOrders = useMemo<UnifiedToken[]>(() => {
    const billItems: UnifiedToken[] = bills.map(b => ({
      key: `bill-${b.id}`,
      token: shortToken(b.bill_no),
      label: b.table_no ? `Table ${b.table_no}` : (b.order_type === 'dine_in' ? 'Dine In' : 'Takeaway'),
      status: b.kitchen_status === 'ready' ? 'ready' : b.kitchen_status === 'preparing' ? 'preparing' : 'pending',
      created_at: b.created_at,
    }));

    const remoteItems: UnifiedToken[] = remoteOrders.map(r => {
      const tokenNum = shortToken(String(r.token_number ?? r.order_number ?? r.id.slice(-4)));
      const tableNum = r.table_number;
      return {
        key: `remote-${r.id}`,
        token: tokenNum,
        label: tableNum ? `🪑 Table ${tableNum}` : `📱 Token #${tokenNum}`,
        status: r.status === 'ready' ? 'ready' : r.status === 'preparing' ? 'preparing' : 'pending',
        created_at: r.created_at || new Date().toISOString(),
        subtitle: r.customer_name ? `Online · ${r.customer_name}` : 'Online Order',
      };
    });

    const tableItems: UnifiedToken[] = tableOrders.map(t => ({
      key: `table-${t.id}`,
      token: String(t.order_number ?? shortToken(t.id)),
      label: t.table_number
        ? `🪑 Table ${t.table_number}${t.seat_label ? ` (${t.seat_label})` : ''}`
        : '🪑 Table Order',
      status: t.status === 'ready' ? 'ready' : t.status === 'preparing' ? 'preparing' : 'pending',
      created_at: t.created_at || new Date().toISOString(),
    }));

    return [...billItems, ...remoteItems, ...tableItems].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [bills, remoteOrders, tableOrders]);

  const preparing = useMemo(() => allOrders.filter(o => o.status !== 'ready'), [allOrders]);
  const ready = useMemo(() => allOrders.filter(o => o.status === 'ready'), [allOrders]);

  // Announce newly ready tokens (skip very first load)
  useEffect(() => {
    const ids = new Set(ready.map(o => o.key));
    if (!initialLoaded) { knownReady.current = ids; return; }
    if (knownReady.current === null) { knownReady.current = ids; return; }
    const fresh = ready.filter(o => !knownReady.current!.has(o.key));
    knownReady.current = ids;
    if (fresh.length === 0) return;
    const token = fresh[fresh.length - 1].token;
    setLastCalled(token);
    setCalledHistory(prev => [...fresh.map(o => o.token).reverse(), ...prev.filter(t => !fresh.some(f => f.token === t))].slice(0, 6));
    if (soundEnabled) {
      playChime();
      setTimeout(() => fresh.forEach(o => announce(o.token)), 800);
    }
  }, [ready, soundEnabled, initialLoaded]);

  const toggleSound = () => {
    const next = !soundEnabled;
    if (next) playChime();
    setSoundEnabled(next);
    localStorage.setItem(SOUND_KEY, String(next));
  };

  const goFullscreen = () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  // Stats
  const totalOpen = allOrders.length;
  const prepCount = preparing.length;
  const readyCount = ready.length;
  const avgPrepMins = prepCount > 0
    ? Math.round(preparing.reduce((s, o) => s + waitMins(o.created_at, now), 0) / prepCount)
    : 0;
  const longestWait = allOrders.length > 0
    ? Math.max(...allOrders.map(o => waitMins(o.created_at, now)))
    : 0;

  return (
    <div className="bg-gray-950 min-h-screen text-white flex flex-col">
      {/* Enable Sound banner */}
      {!soundEnabled && (
        <div className="bg-amber-500 text-black text-xs px-4 py-2 flex items-center justify-between">
          <span>🔔 Enable sound for order-ready announcements</span>
          <button
            onClick={() => { playChime(); setSoundEnabled(true); }}
            className="bg-black text-white px-3 py-1 rounded-full text-xs font-bold"
          >
            Enable Sound
          </button>
        </div>
      )}

      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        {/* Left: branding */}
        <div>
          <div className="text-white font-bold text-lg">
            🎫 {publicShopName ? `${publicShopName} · Token Display` : 'ZenPOS Token Display'}
          </div>
          <div className="text-gray-500 text-xs uppercase tracking-widest">Kitchen Display System</div>
        </div>

        {/* Center: order counts */}
        <div className="flex items-center gap-6 text-sm">
          <span className="text-blue-400 font-semibold">{prepCount} Preparing</span>
          <span className="text-green-400 font-semibold">{readyCount} Ready</span>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-3">
          {/* LIVE indicator */}
          <div className="flex items-center gap-1.5">
            {online ? (
              <>
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-green-400 text-xs font-semibold">LIVE</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-red-400" />
                <span className="text-red-400 text-xs font-semibold">OFFLINE</span>
              </>
            )}
          </div>

          {/* Clock */}
          <span className="text-white font-mono text-sm tabular-nums">
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>

          {/* Copy TV link (non-public only) */}
          {!isPublic && adminId && (
            <button
              onClick={() => {
                const url = `${window.location.origin}/tokens/${adminId}`;
                navigator.clipboard?.writeText(url).then(() => alert(`TV link copied:\n${url}`)).catch(() => prompt('TV link', url));
              }}
              className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700"
            >
              Copy TV link
            </button>
          )}

          {/* Repeat last call */}
          {lastCalled && (
            <button
              aria-label="Call last token again"
              onClick={() => {
                if (soundEnabled) {
                  playChime();
                  setTimeout(() => announce(lastCalled), 800);
                }
              }}
              className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
            >
              <Repeat className="w-4 h-4" />
            </button>
          )}

          {/* Sound toggle */}
          <button
            onClick={toggleSound}
            aria-label="Toggle sound"
            className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Fullscreen */}
          <button
            onClick={goFullscreen}
            aria-label="Fullscreen"
            className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
          >
            <Maximize className="w-4 h-4" />
          </button>

          {/* Settings gear (decorative / placeholder) */}
          <button
            aria-label="Settings"
            className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Two-column body */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 overflow-auto">
        {/* Preparing column */}
        <section className="bg-gray-900/50 rounded-xl border border-blue-900/30 p-4 flex flex-col gap-3">
          <h2 className="text-blue-300 font-bold text-lg flex items-center gap-2 mb-1">
            👨‍🍳 Preparing <span className="text-gray-500 text-sm font-normal">({prepCount})</span>
          </h2>
          {preparing.length === 0 && (
            <p className="text-gray-500 text-sm">No orders in the kitchen</p>
          )}
          {preparing.map(o => {
            const elapsed = waitMins(o.created_at, now);
            const { border, timeColor } = getUrgencyClasses(elapsed);
            return (
              <div key={o.key} className={`bg-gray-900 rounded-xl p-4 ${border} shadow-lg flex flex-col gap-1`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-white font-black text-4xl tabular-nums leading-none">
                      {o.token}
                    </div>
                    <div className="text-gray-400 text-sm mt-1">{o.label}</div>
                  </div>
                  <div className={`font-mono text-sm font-semibold ${timeColor}`}>{elapsed} min</div>
                </div>
                <div className="text-gray-400 text-xs mt-1">
                  {o.status === 'preparing' ? 'Cooking' : 'Received'}
                  {o.subtitle ? ` · ${o.subtitle}` : ''}
                </div>
              </div>
            );
          })}
        </section>

        {/* Ready column */}
        <section className="bg-gray-900/50 rounded-xl border border-green-900/30 p-4 flex flex-col gap-3">
          <h2 className="text-green-300 font-bold text-lg flex items-center gap-2 mb-1">
            🔔 Ready for Pickup <span className="text-gray-500 text-sm font-normal">({readyCount})</span>
          </h2>
          {ready.length === 0 && (
            <p className="text-gray-500 text-sm">Nothing ready yet</p>
          )}
          {ready.map(o => {
            const elapsed = waitMins(o.created_at, now);
            const { border, timeColor } = getUrgencyClasses(elapsed);
            return (
              <div key={o.key} className={`bg-gray-900 rounded-xl p-4 ${border} shadow-lg flex flex-col gap-1 ${o.token === lastCalled ? 'ring-2 ring-green-400/40 animate-pulse' : ''}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-white font-black text-4xl tabular-nums leading-none">
                      {o.token}
                    </div>
                    <div className="text-gray-400 text-sm mt-1">{o.label}</div>
                  </div>
                  <div className={`font-mono text-sm font-semibold ${timeColor}`}>{elapsed} min</div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                    ✅ Ready for Pickup
                  </span>
                  {o.subtitle && (
                    <span className="text-xs text-gray-400">{o.subtitle}</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Recently called history */}
          {calledHistory.length > 1 && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">Recently called</p>
              <div className="flex flex-wrap gap-2">
                {calledHistory.map(t => (
                  <span key={t} className="px-3 py-1 rounded-full bg-gray-800 text-gray-300 font-bold tabular-nums text-sm">{t}</span>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Footer stats bar */}
      <footer className="bg-gray-900 border-t border-gray-800 px-6 py-2 flex items-center gap-6 text-xs text-gray-400">
        <span>Total Open: <span className="text-white font-semibold">{totalOpen}</span></span>
        <span>Preparing: <span className="text-blue-400 font-semibold">{prepCount}</span></span>
        <span>Ready: <span className="text-green-400 font-semibold">{readyCount}</span></span>
        <span>Avg Prep: <span className="text-amber-400 font-semibold">{avgPrepMins} min</span></span>
        <span>Longest Wait: <span className="text-red-400 font-semibold">{longestWait} min</span></span>
        {lastSync && (
          <span className="ml-auto">Updated: {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        )}
      </footer>
    </div>
  );
};

export default TokenDisplay;
