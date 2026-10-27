import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { QuickCounterPad } from '@/components/QuickCounterPad';
import { useFillToBottom } from '@/hooks/useFillToBottom';

function App() {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState('');
  const [full, setFull] = useState(true);
  const [mode, setMode] = useState<'num' | 'quick'>((new URLSearchParams(location.search).get('mode') as any) || 'num');
  useFillToBottom(ref, full);
  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b flex items-center px-3 font-bold">ZenPOS · Billing</header>
      <main className="p-3 pb-24">
        <div ref={ref} className={full ? 'flex flex-col min-h-0 overflow-hidden' : 'mb-4'} data-testid="wrapper">
          <div className="flex items-center justify-between px-1 gap-2 shrink-0 mb-2">
            <div className="p-1 rounded-lg bg-muted flex">
              <button onClick={() => setMode('num')} className="px-4 py-1.5 text-[11px] font-bold">NUM</button>
              <button onClick={() => setMode('quick')} className="px-4 py-1.5 text-[11px] font-bold">QUICK</button>
            </div>
            <button className="h-8 px-2 border rounded" onClick={() => setFull(f => !f)}>⤢</button>
          </div>
          <QuickCounterPad value={v} onChange={setV} onCash={() => {}} onAddToCart={() => {}} busy={false}
            prices={[40, 60, 100, 150]} mode={mode} fullScreen={full}
            cart={[{ id: '1', name: 'Chai', quantity: 2, price: 15 }]} total={30} className={full ? 'flex-1 min-h-0' : undefined} />
        </div>
      </main>
      <nav aria-label="Primary" className="fixed bottom-0 left-0 right-0 bg-card border-t" style={{ height: 70 }} />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
