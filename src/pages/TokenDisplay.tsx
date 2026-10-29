import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { Button } from '@/components/ui/button';
import { Maximize, Volume2, VolumeX, ChefHat, BellRing, Wifi, WifiOff, Repeat } from 'lucide-react';

interface TokenBill {
  id: string;
  bill_no: string;
  table_no: string | null;
  order_type: string | null;
  kitchen_status: string;
  created_at: string;
}

const SOUND_KEY = 'zenpos_token_sound';

const waitMins = (createdAt: string, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60000));

const shortToken = (billNo: string) => {
  const m = String(billNo || '').match(/(\d+)\s*$/);
  return m ? m[1] : billNo;
};

const playChime = () => {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [587, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.35;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.65);
    });
    setTimeout(() => ctx.close?.(), 1500);
  } catch { /* audio unavailable */ }
};

const announce = (token: string) => {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(`Token number ${token.split('').join(' ')}, your order is ready for pickup`);
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch { /* speech unavailable */ }
};

const TokenDisplay = () => {
  const { adminId: publicAdminId } = useParams<{ adminId: string }>();
  const { adminProfileId, profile } = useAuth() as any;
  const isPublic = !!publicAdminId;
  const adminId = publicAdminId || adminProfileId;
  const [bills, setBills] = useState<TokenBill[]>([]);
  const [now, setNow] = useState(new Date());
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem(SOUND_KEY) !== 'false');
  const [audioUnlocked, setAudioUnlocked] = useState(false);
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
      /* keep last known list when offline */
      setOnline(false);
    }
  }, [adminId, branchFilterId, isPublic]);

  fetchRef.current = fetchBills;

  useEffect(() => { fetchBills(); }, [fetchBills]);

  // Public TV: show the shop's own name (public, non-sensitive setting only)
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
    const poll = setInterval(fetchBills, 20000);
    const onLocal = () => fetchBills();
    window.addEventListener('bills-updated', onLocal);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      window.removeEventListener('bills-updated', onLocal);
    };
  }, [adminId, fetchBills, isPublic]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Screen WakeLock — prevents TV display from sleeping
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch { /* not supported or denied */ }
    };
    requestWakeLock();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      wakeLock?.release?.();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const preparing = bills.filter(b => b.kitchen_status !== 'ready');
  const ready = bills.filter(b => b.kitchen_status === 'ready');

  // Announce newly ready tokens (skip the very first load)
  useEffect(() => {
    const ids = new Set(ready.map(b => b.id));
    if (knownReady.current === null) { knownReady.current = ids; return; }
    const fresh = ready.filter(b => !knownReady.current!.has(b.id));
    knownReady.current = ids;
    if (fresh.length === 0) return;
    const token = shortToken(fresh[fresh.length - 1].bill_no);
    setLastCalled(token);
    setCalledHistory(prev => [...fresh.map(b => shortToken(b.bill_no)).reverse(), ...prev.filter(t => !fresh.some(f => shortToken(f.bill_no) === t))].slice(0, 6));
    if (soundOn && audioUnlocked) {
      playChime();
      setTimeout(() => fresh.forEach(b => announce(shortToken(b.bill_no))), 800);
    }
  }, [ready, soundOn, audioUnlocked]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem(SOUND_KEY, String(next));
  };

  const goFullscreen = () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const label = (b: TokenBill) =>
    b.table_no ? `Table ${b.table_no}` : (b.order_type === 'dine_in' ? 'Dine In' : 'Takeaway');

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {!audioUnlocked && (
        <button
          onClick={() => { setAudioUnlocked(true); playChime(); }}
          className="fixed inset-0 z-50 bg-background/90 backdrop-blur flex flex-col items-center justify-center gap-4"
        >
          <BellRing className="w-16 h-16 text-primary" />
          <span className="text-2xl font-bold">Tap to start Token Display</span>
          <span className="text-muted-foreground">This enables the pickup chime and voice calling</span>
        </button>
      )}

      <header className="flex flex-wrap items-center justify-between gap-2 px-4 md:px-6 py-3 md:py-4 border-b border-border bg-card">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-bold truncate">{isPublic ? (publicShopName || 'ZenPOS') : (profile?.hotel_name || profile?.shop_name || 'ZenPOS')} · Order Status</h1>
          <p className="text-xs md:text-sm text-muted-foreground flex items-center gap-1.5">
            {online ? <Wifi className="w-3.5 h-3.5 text-success" /> : <WifiOff className="w-3.5 h-3.5 text-destructive" />}
            {online ? 'Live' : 'Reconnecting… showing last known orders'}
            {lastSync && <span>· updated {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <span className="text-lg md:text-2xl font-mono tabular-nums">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          {!isPublic && adminId && (
            <Button variant="outline" size="sm" onClick={() => {
              const url = `${window.location.origin}/tokens/${adminId}`;
              navigator.clipboard?.writeText(url).then(() => alert(`TV link copied:\n${url}`)).catch(() => prompt('TV link', url));
            }}>Copy TV link</Button>
          )}
          {lastCalled && (
            <Button variant="outline" size="icon" aria-label="Call last token again" onClick={() => { playChime(); setTimeout(() => announce(lastCalled), 800); }}>
              <Repeat />
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={toggleSound} aria-label="Toggle sound">
            {soundOn ? <Volume2 /> : <VolumeX />}
          </Button>
          <Button variant="outline" size="icon" onClick={goFullscreen} aria-label="Fullscreen">
            <Maximize />
          </Button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-0">
        <section className="p-4 md:p-6 border-b md:border-b-0 md:border-r border-border">
          <h2 className="flex items-center gap-2 text-2xl md:text-3xl font-bold text-warning mb-4 md:mb-6">
            <ChefHat className="w-8 h-8" /> Preparing <span className="text-base font-semibold text-muted-foreground">({preparing.length})</span>
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {preparing.map(b => {
              const mins = waitMins(b.created_at, now);
              return (
                <div key={b.id} className={`rounded-2xl border-2 p-4 text-center ${mins >= 20 ? 'border-destructive/50 bg-destructive/10' : 'border-warning/40 bg-warning/10'}`}>
                  <div className="text-5xl md:text-6xl font-black tabular-nums">{shortToken(b.bill_no)}</div>
                  <div className="text-sm text-muted-foreground mt-1">{label(b)}</div>
                  <div className="text-xs font-semibold mt-1 text-muted-foreground">{b.kitchen_status === 'preparing' ? 'Cooking' : 'Received'} · {mins} min</div>
                </div>
              );
            })}
            {preparing.length === 0 && <p className="text-muted-foreground col-span-full">No orders in the kitchen</p>}
          </div>
        </section>

        <section className="p-4 md:p-6">
          <h2 className="flex items-center gap-2 text-2xl md:text-3xl font-bold text-success mb-4 md:mb-6">
            <BellRing className="w-8 h-8" /> Ready for Pickup <span className="text-base font-semibold text-muted-foreground">({ready.length})</span>
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {ready.map(b => (
              <div key={b.id} className={`rounded-2xl border-2 border-success bg-success/15 p-4 text-center ${shortToken(b.bill_no) === lastCalled ? 'animate-pulse ring-4 ring-success/40' : ''}`}>
                <div className="text-5xl md:text-6xl font-black tabular-nums text-success">{shortToken(b.bill_no)}</div>
                <div className="text-sm text-muted-foreground mt-1">{label(b)}</div>
              </div>
            ))}
            {ready.length === 0 && <p className="text-muted-foreground col-span-full">Nothing ready yet</p>}
          </div>
          {calledHistory.length > 1 && (
            <div className="mt-6">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Recently called</p>
              <div className="flex flex-wrap gap-2">
                {calledHistory.map(t => (
                  <span key={t} className="px-3 py-1 rounded-full bg-muted text-foreground font-bold tabular-nums">{t}</span>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      {lastCalled && (
        <footer className="px-6 py-4 bg-success/15 border-t border-success/40 text-xl md:text-2xl font-semibold text-center">
          🔔 Token {lastCalled}, your order is ready for pickup
        </footer>
      )}
    </div>
  );
};

export default TokenDisplay;
