import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ChefHat, Bell, Clock, CheckCircle2, Circle, Loader2, Monitor, Tv2 } from 'lucide-react';
import { formatTimeAMPM, getTimeElapsed } from '@/utils/timeUtils';
import { cn } from '@/lib/utils';
import QRCode from 'qrcode';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DisplayBill {
    id: string;
    bill_no: string;
    created_at: string;
    kitchen_status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'rejected';
    service_status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'rejected';
}

interface PoleCartItem {
    name: string;
    quantity: number;
    price: number;
    total: number;
}

interface PoleMessage {
    type: 'CART_UPDATE';
    cart: PoleCartItem[];
    subtotal: number;
    discount: number;
    tax: number;
    grandTotal: number;
    upiId?: string;
    shopName?: string;
    status: 'IDLE' | 'ACTIVE' | 'PAYING' | 'SETTLED';
}

// ─── Kitchen Token Board helpers ──────────────────────────────────────────────

const ORDER_STEPS = [
    { key: 'pending',   label: 'Received',     icon: '📥' },
    { key: 'preparing', label: 'Kitchen Fired', icon: '🍳' },
    { key: 'ready',     label: 'Ready',         icon: '✅' },
    { key: 'served',    label: 'Settled',       icon: '🎉' },
] as const;

function getStepIndex(kitchenStatus: string): number {
    if (kitchenStatus === 'served' || kitchenStatus === 'completed') return 3;
    if (kitchenStatus === 'ready') return 2;
    if (kitchenStatus === 'preparing') return 1;
    return 0;
}

const OrderStepper: React.FC<{ kitchenStatus: string }> = ({ kitchenStatus }) => {
    const active = getStepIndex(kitchenStatus);
    return (
        <div className="flex items-center justify-between w-full mt-3 px-1">
            {ORDER_STEPS.map((step, idx) => {
                const done    = idx < active;
                const current = idx === active;
                return (
                    <React.Fragment key={step.key}>
                        <div className="flex flex-col items-center gap-1">
                            <div className={cn(
                                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500',
                                done    ? 'bg-green-500 text-white shadow-lg shadow-green-500/40' :
                                current ? 'bg-orange-400 text-white shadow-lg shadow-orange-400/50 animate-pulse' :
                                          'bg-white/10 text-white/30'
                            )}>
                                {done    ? <CheckCircle2 className="w-4 h-4" /> :
                                 current ? <Loader2 className="w-4 h-4 animate-spin" /> :
                                           <Circle className="w-4 h-4" />}
                            </div>
                            <span className={cn(
                                'text-[9px] font-semibold text-center leading-tight max-w-[52px]',
                                done || current ? 'text-white' : 'text-white/30'
                            )}>{step.label}</span>
                        </div>
                        {idx < ORDER_STEPS.length - 1 && (
                            <div className={cn(
                                'flex-1 h-0.5 mx-1 rounded transition-all duration-500',
                                idx < active ? 'bg-green-500' : 'bg-white/10'
                            )} />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

// ─── Pole Display ─────────────────────────────────────────────────────────────

const PoleDisplay: React.FC = () => {
    const [state, setState] = useState<PoleMessage>({
        type: 'CART_UPDATE',
        cart: [],
        subtotal: 0,
        discount: 0,
        tax: 0,
        grandTotal: 0,
        shopName: localStorage.getItem('zenpos_pole_shop_name') || 'ZenPOS',
        status: 'IDLE',
    });
    const [qrDataUrl, setQrDataUrl] = useState<string>('');
    const [settledTimer, setSettledTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
    const [clock, setClock] = useState(new Date());

    // Clock tick
    useEffect(() => {
        const id = setInterval(() => setClock(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    // Load persisted state on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem('zenpos_active_pole_state');
            if (saved) {
                const parsed: PoleMessage = JSON.parse(saved);
                if (parsed.status !== 'SETTLED') setState(parsed);
            }
        } catch { /* ignore */ }
    }, []);

    // BroadcastChannel listener
    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return;
        const ch = new BroadcastChannel('zenpos-customer-pole');
        ch.onmessage = (e: MessageEvent<PoleMessage>) => {
            const msg = e.data;
            if (msg?.type !== 'CART_UPDATE') return;
            setState(msg);
            if (msg.shopName) localStorage.setItem('zenpos_pole_shop_name', msg.shopName);

            if (msg.status === 'SETTLED') {
                const t = setTimeout(() => {
                    setState(prev => ({ ...prev, cart: [], subtotal: 0, discount: 0, tax: 0, grandTotal: 0, status: 'IDLE' }));
                }, 4000);
                setSettledTimer(t);
            }
        };
        return () => { ch.close(); if (settledTimer) clearTimeout(settledTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // QR generation
    useEffect(() => {
        if (!state.upiId || state.grandTotal <= 0) { setQrDataUrl(''); return; }
        const upiStr = `upi://pay?pa=${encodeURIComponent(state.upiId)}&am=${state.grandTotal.toFixed(2)}&cu=INR&tn=ZenPOS%20Payment`;
        QRCode.toDataURL(upiStr, { width: 200, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
            .then(url => setQrDataUrl(url))
            .catch(() => setQrDataUrl(''));
    }, [state.upiId, state.grandTotal]);

    const fmt = (n: number) => `\u20B9${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // SETTLED state
    if (state.status === 'SETTLED') {
        return (
            <div className="fixed inset-0 bg-green-600 flex flex-col items-center justify-center gap-6 text-white">
                <div className="text-8xl animate-bounce">✅</div>
                <h1 className="text-5xl font-black tracking-tight">Payment Received</h1>
                <p className="text-3xl font-semibold opacity-80">Thank You!</p>
            </div>
        );
    }

    // IDLE state
    if (state.status === 'IDLE' || state.cart.length === 0) {
        return (
            <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center gap-8 text-white select-none">
                <div className="text-center space-y-4">
                    <div className="text-7xl animate-pulse">🏪</div>
                    <h1 className="text-5xl font-black tracking-tight">{state.shopName}</h1>
                    <p className="text-2xl text-white/60 font-medium">Welcome! Please wait while we prepare your order.</p>
                </div>
                <div className="text-4xl font-mono font-bold text-white/40 tabular-nums">
                    {clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
                <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-2 text-white/20 text-sm">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span>Live • {state.shopName}</span>
                </div>
            </div>
        );
    }

    // ACTIVE / PAYING state
    return (
        <div className="fixed inset-0 bg-slate-950 flex flex-col text-white overflow-hidden">
            {/* Header bar */}
            <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-white/10 bg-slate-900/60">
                <span className="font-bold text-lg">{state.shopName}</span>
                {state.status === 'PAYING' && (
                    <span className="text-sm font-semibold px-3 py-1 rounded-full bg-primary/20 text-primary animate-pulse">
                        Processing Payment…
                    </span>
                )}
                <span className="text-white/40 text-sm tabular-nums">
                    {clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>

            {/* Main body */}
            <div className="flex-1 flex overflow-hidden">
                {/* LEFT: Item list */}
                <div className="flex-[3] overflow-y-auto p-6 space-y-2 border-r border-white/10">
                    <p className="text-xs uppercase tracking-widest text-white/30 mb-3 font-semibold">Your Order</p>
                    {state.cart.map((item, i) => (
                        <div
                            key={i}
                            className={cn(
                                'flex items-center justify-between py-3 px-4 rounded-xl',
                                i % 2 === 0 ? 'bg-white/5' : 'bg-transparent'
                            )}
                        >
                            <div className="flex items-baseline gap-3 min-w-0">
                                <span className="text-xl font-bold leading-tight truncate max-w-[60vw]">{item.name}</span>
                                <span className="text-base text-white/50 shrink-0">×{item.quantity}</span>
                            </div>
                            <span className="text-xl font-semibold tabular-nums shrink-0 ml-4">{fmt(item.total)}</span>
                        </div>
                    ))}
                </div>

                {/* RIGHT: Summary + QR */}
                <div className="flex-[2] shrink-0 flex flex-col items-center justify-between p-6 bg-slate-900/50">
                    <div className="w-full space-y-3">
                        <div className="flex justify-between text-lg text-white/60">
                            <span>Subtotal</span><span>{fmt(state.subtotal)}</span>
                        </div>
                        {state.discount > 0 && (
                            <div className="flex justify-between text-lg text-red-400">
                                <span>Discount</span><span>-{fmt(state.discount)}</span>
                            </div>
                        )}
                        {state.tax > 0 && (
                            <div className="flex justify-between text-lg text-white/60">
                                <span>GST</span><span>{fmt(state.tax)}</span>
                            </div>
                        )}
                        <div className="border-t border-white/20 pt-3 flex justify-between items-end">
                            <span className="text-2xl font-bold">Total</span>
                            <span className="text-5xl font-black text-primary tabular-nums">{fmt(state.grandTotal)}</span>
                        </div>
                    </div>

                    {/* UPI QR */}
                    {qrDataUrl && state.grandTotal > 0 && (
                        <div className="mt-6 flex flex-col items-center gap-3">
                            <p className="text-sm text-white/40 font-semibold uppercase tracking-wider">Scan to Pay</p>
                            <img
                                src={qrDataUrl}
                                alt="UPI Payment QR"
                                className="rounded-2xl border-4 border-white/10 shadow-2xl"
                                width={200}
                                height={200}
                            />
                            {state.upiId && (
                                <p className="text-xs text-white/30 font-mono">{state.upiId}</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * CustomerDisplay — dual-mode public display
 * ?mode=pole → Customer Pole Display with live cart + UPI QR
 * ?mode=token (default) → Kitchen Token Board (existing logic)
 */
const CustomerDisplay = () => {
    const searchParams = new URLSearchParams(window.location.search);
    const urlAdminId   = searchParams.get('admin');
    const urlBranchId  = searchParams.get('branch');
    const urlMode      = searchParams.get('mode') ?? 'token';

    const [mode, setMode] = useState<'token' | 'pole'>(urlMode === 'pole' ? 'pole' : 'token');
    const [bills, setBills] = useState<DisplayBill[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        if (mode === 'token' && !urlAdminId) {
            setErrorMsg('Invalid Display Configuration. Missing Admin ID.');
            setLoading(false);
        }
    }, [urlAdminId, mode]);

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    const fetchBills = useCallback(async () => {
        if (mode !== 'token') return;
        try {
            const now   = new Date();
            const today = now.toISOString().split('T')[0];
            let query   = (supabase as any)
                .from('bills')
                .select('id, bill_no, created_at, kitchen_status, service_status')
                .gte('created_at', `${today}T00:00:00`)
                .in('kitchen_status', ['pending', 'preparing', 'ready'])
                .order('created_at', { ascending: true });
            if (urlAdminId) query = query.eq('admin_id', urlAdminId);
            if (urlBranchId) query = query.eq('branch_id', urlBranchId);
            const { data, error } = await query;
            if (error) throw error;
            setBills(data || []);
        } catch (err) {
            console.error('CustomerDisplay fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [urlAdminId, urlBranchId, mode]);

    useEffect(() => {
        if (mode !== 'token') { setLoading(false); return; }
        fetchBills();
        const id = setInterval(fetchBills, 10_000);
        return () => clearInterval(id);
    }, [fetchBills, mode]);

    // Realtime for token board
    useEffect(() => {
        if (mode !== 'token' || !urlAdminId) return;
        const channel = supabase.channel('customer_display_bills')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, fetchBills)
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [urlAdminId, fetchBills, mode]);

    // Mode toggle (visible on tap anywhere on header)
    const [showToggle, setShowToggle] = useState(false);
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'd') setShowToggle(v => !v); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // Pole mode — render the separate component
    if (mode === 'pole') {
        return (
            <>
                <PoleDisplay />
                {showToggle && (
                    <div className="fixed top-2 right-2 z-50 flex gap-2">
                        <button onClick={() => setMode('token')} className="px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs font-semibold border border-white/20 hover:bg-black/80">
                            Kitchen Board
                        </button>
                    </div>
                )}
            </>
        );
    }

    // ── Token Board mode (existing logic, preserved) ──────────────────────────
    const readyBills     = bills.filter(b => b.kitchen_status === 'ready');
    const preparingBills = bills.filter(b => b.kitchen_status === 'preparing');

    if (errorMsg) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center text-white space-y-4 p-8">
                    <div className="text-6xl">⚠️</div>
                    <h1 className="text-2xl font-bold">Display Error</h1>
                    <p className="text-gray-400">{errorMsg}</p>
                    <p className="text-gray-500 text-sm">URL: {window.location.href}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white overflow-hidden">
            {/* Header */}
            <div
                className="sticky top-0 z-10 bg-black/40 backdrop-blur-sm border-b border-white/10 px-8 py-4 cursor-pointer select-none"
                onClick={() => setShowToggle(v => !v)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <ChefHat className="w-8 h-8 text-orange-400" />
                        <div>
                            <h1 className="text-2xl font-black tracking-tight">Order Status Board</h1>
                            <p className="text-gray-400 text-sm">Live Kitchen Display</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {showToggle && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setMode('pole'); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-semibold border border-primary/30 hover:bg-primary/30"
                            >
                                <Monitor className="w-3.5 h-3.5" />
                                Customer Display
                            </button>
                        )}
                        <div className="text-right">
                            <div className="text-2xl font-mono font-bold tabular-nums">
                                {formatTimeAMPM(currentTime)}
                            </div>
                            <div className="text-gray-400 text-sm">
                                {currentTime.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-12 h-12 animate-spin text-orange-400" />
                </div>
            ) : (
                <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* READY section */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-green-500 shadow-lg shadow-green-500/50" />
                            <h2 className="text-3xl font-bold text-green-400">READY</h2>
                            {readyBills.length > 0 && (
                                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-lg px-3 py-1">
                                    {readyBills.length}
                                </Badge>
                            )}
                        </div>
                        {readyBills.length === 0 ? (
                            <div className="bg-white/5 rounded-2xl p-12 text-center border border-white/10">
                                <Bell className="w-16 h-16 mx-auto mb-4 text-white/20" />
                                <p className="text-white/40 text-xl">No orders ready yet</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {readyBills.map((bill, index) => (
                                    <div key={bill.id} className={cn(
                                        'bg-gradient-to-br from-green-500/20 to-green-600/10',
                                        'border-2 border-green-500/50 rounded-2xl p-6 text-center shadow-lg shadow-green-500/20 animate-pulse',
                                        index === 0 && 'ring-4 ring-green-400 ring-offset-4 ring-offset-gray-900'
                                    )} style={{ animationDelay: `${index * 0.1}s` }}>
                                        <div className="text-6xl font-black text-green-400 mb-2">{bill.bill_no}</div>
                                        <div className="flex items-center justify-center gap-1 text-white/60 text-sm">
                                            <Bell className="w-4 h-4" /> Ready to Pick Up
                                        </div>
                                        <OrderStepper kitchenStatus="ready" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* PREPARING section */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-orange-500 animate-pulse shadow-lg shadow-orange-500/50" />
                            <h2 className="text-3xl font-bold text-orange-400">PREPARING</h2>
                            {preparingBills.length > 0 && (
                                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-lg px-3 py-1">
                                    {preparingBills.length}
                                </Badge>
                            )}
                        </div>
                        {preparingBills.length === 0 ? (
                            <div className="bg-white/5 rounded-2xl p-12 text-center border border-white/10">
                                <ChefHat className="w-16 h-16 mx-auto mb-4 text-white/20" />
                                <p className="text-white/40 text-xl">No orders in preparation</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {preparingBills.map((bill) => (
                                    <div key={bill.id} className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 border-2 border-orange-500/30 rounded-2xl p-6 text-center">
                                        <div className="text-5xl font-black text-orange-400 mb-2">{bill.bill_no}</div>
                                        <div className="flex items-center justify-center gap-1 text-white/60 text-sm">
                                            <Clock className="w-4 h-4" /> {getTimeElapsed(bill.created_at)}
                                        </div>
                                        <OrderStepper kitchenStatus="preparing" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="fixed bottom-0 left-0 right-0 bg-black/30 backdrop-blur-sm border-t border-white/10 px-8 py-3">
                <div className="flex items-center justify-center gap-2 text-white/40 text-sm">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span>Live · Auto-refreshing</span>
                </div>
            </div>
        </div>
    );
};

export default CustomerDisplay;
