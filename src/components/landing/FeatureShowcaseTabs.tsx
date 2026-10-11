import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, ChefHat, Monitor, WifiOff, Check } from 'lucide-react';

const tabs = [
  {
    id: 'billing',
    icon: Zap,
    label: '⚡ Lightning Billing',
    title: 'Fastest Counter Billing in the Industry',
    points: [
      'Instant item search — type 2 letters, dish appears',
      'Hold up to 5 customer tabs simultaneously',
      'Cash chip bar shows exact change in 1 tap',
      'Split bills by guest, item, or custom amount',
      'Thermal bill prints in < 2 seconds',
    ],
    preview: (
      <div className="bg-card border border-border rounded-xl p-4 space-y-2 font-mono text-xs">
        <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2">
          <span className="text-primary">🔍</span>
          <span className="text-primary font-bold">mas</span><span className="text-muted-foreground">ala dosa</span>
          <span className="ml-auto bg-primary text-primary-foreground px-2 py-0.5 rounded text-[10px] font-bold">₹80</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {['Tab 1: Blue Shirt', 'Tab 2: Parcel', '+ New Tab'].map(t => (
            <span key={t} className="px-2 py-1 rounded-md bg-muted text-muted-foreground text-[10px] border border-border">{t}</span>
          ))}
        </div>
        <div className="border-t border-border pt-2 flex items-center justify-between">
          <span className="text-foreground font-bold">Total: ₹240</span>
          <div className="flex gap-1">
            {['₹250', '₹500', 'Exact'].map(c => (
              <span key={c} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold border border-primary/20 cursor-pointer hover:bg-primary/20">{c}</span>
            ))}
          </div>
        </div>
        <div className="text-green-600 font-bold text-sm">Change: ₹10 ✓</div>
      </div>
    ),
  },
  {
    id: 'kds',
    icon: ChefHat,
    label: '🍳 Kitchen Display',
    title: 'Real-Time Kitchen Throughput Monitor',
    points: [
      'Color-coded tickets: Green → Amber → Pulsing Red',
      'Aggregate item counter: "8 Masala Dosa | 4 Cold Coffee"',
      'Mark individual items ready while others cook',
      'One-tap Undo on accidentally cleared tickets',
      'Station-wise auto-routing (Grill, Fry, Beverage)',
    ],
    preview: (
      <div className="bg-card border border-border rounded-xl p-4 space-y-2 text-xs font-mono">
        <div className="text-[10px] font-bold text-muted-foreground mb-1">⚡ PREP BOARD — Live Totals</div>
        <div className="flex gap-1.5 flex-wrap mb-2">
          {[['Masala Dosa', 8, 'green'], ['Cold Coffee', 4, 'blue'], ['Veg Biryani', 3, 'amber']].map(([name, count, color]) => (
            <span key={String(name)} className={`px-2 py-0.5 rounded-full text-white text-[10px] font-bold bg-${color}-500`}>
              {name} × {count}
            </span>
          ))}
        </div>
        {[{ t: '#7', items: 'Masala Dosa × 2, Filter Coffee × 1', mins: 4, color: 'green' }, { t: '#8', items: 'Veg Biryani × 1, Lassi × 2', mins: 12, color: 'amber' }, { t: '#9', items: 'Chicken Curry × 2', mins: 18, color: 'red' }].map(o => (
          <div key={o.t} className={`flex items-start gap-2 p-2 rounded-lg border-l-4 border-${o.color}-500 bg-${o.color}-50 dark:bg-${o.color}-950/30`}>
            <span className={`font-bold text-${o.color}-700 dark:text-${o.color}-400`}>{o.t}</span>
            <span className="text-foreground flex-1">{o.items}</span>
            <span className={`text-${o.color}-700 dark:text-${o.color}-400 font-bold`}>{o.mins}m</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'token',
    icon: Monitor,
    label: '📺 Token TV Board',
    title: 'Customer Token TV Display',
    points: [
      'Auto-announces "Token 42 — Your order is ready!" via speaker',
      'Split screen: Preparing vs. Ready sections',
      'Screen WakeLock — TV never sleeps',
      'Works on any Android TV or tablet in full-screen',
      'Live sync — updates in < 1 second via Supabase Realtime',
    ],
    preview: (
      <div className="bg-slate-900 rounded-xl p-4 text-white text-xs font-mono space-y-2">
        <div className="flex justify-between items-center text-[10px] text-slate-400 mb-2">
          <span className="font-bold text-white text-sm">ZenPOS Token Display</span>
          <span>14:32:07</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-amber-400 font-bold mb-1.5">⏳ PREPARING</div>
            {[38, 40, 41].map(n => (
              <div key={n} className="bg-amber-900/40 rounded-lg px-3 py-2 mb-1 text-amber-300 font-bold text-lg text-center">{n}</div>
            ))}
          </div>
          <div>
            <div className="text-[10px] text-green-400 font-bold mb-1.5">✅ READY</div>
            {[36, 37, 39].map(n => (
              <div key={n} className={`rounded-lg px-3 py-2 mb-1 font-bold text-lg text-center ${n === 39 ? 'bg-green-500 text-white animate-pulse' : 'bg-green-900/40 text-green-300'}`}>{n}{n === 39 ? ' 🔔' : ''}</div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'offline',
    icon: WifiOff,
    label: '📱 100% Offline',
    title: '100% Offline — Bills Never Stop',
    points: [
      'Built on SQLite + IndexedDB — bills survive no internet',
      'Smart sync queue — pushes to cloud when reconnected',
      'No "Service Unavailable" screens, ever',
      'Works in underground canteens, rural areas, festivals',
      'Your cashier never even notices the internet dropped',
    ],
    preview: (
      <div className="bg-card border border-border rounded-xl p-4 space-y-3 text-xs">
        <div className="flex items-center gap-2 text-red-500 font-bold">
          <WifiOff className="w-4 h-4" /> Wi-Fi disconnected
        </div>
        <div className="space-y-1.5">
          {['Bill #1042 — ₹320 (queued)', 'Bill #1043 — ₹180 (queued)', 'Bill #1044 — ₹540 (queued)'].map(b => (
            <div key={b} className="flex items-center gap-2 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
              <span className="text-foreground">{b}</span>
            </div>
          ))}
        </div>
        <div className="text-green-600 font-bold flex items-center gap-2">
          <Check className="w-4 h-4" /> Wi-Fi restored — 3 bills synced ✓
        </div>
      </div>
    ),
  },
];

export const FeatureShowcaseTabs: React.FC = () => {
  const [activeTab, setActiveTab] = useState('billing');
  const tab = tabs.find(t => t.id === activeTab)!;

  return (
    <section className="py-16 sm:py-20 bg-muted/30">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <Badge variant="outline" className="mb-3">Interactive Preview</Badge>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">See ZenPOS in Action</h2>
          <p className="text-muted-foreground">Click any tab to explore how it works before signing up.</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border transition-all ${activeTab === t.id ? 'bg-primary text-primary-foreground border-primary shadow-md' : 'bg-background text-foreground border-border hover:border-primary/40'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Left: info */}
          <div>
            <h3 className="text-xl font-bold mb-4 text-foreground">{tab.title}</h3>
            <ul className="space-y-3">
              {tab.points.map(p => (
                <li key={p} className="flex items-start gap-2.5 text-sm text-foreground">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* Right: interactive preview */}
          <Card className="border border-border shadow-sm">
            <CardContent className="p-4">
              {tab.preview}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};
