import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Lightweight animated SVG scenes for each order stage on the online menu:
 * placed → chef cooking → waiter serving → paid/done. Pure CSS animations
 * (GPU transforms only) so they stay smooth on cheap phones.
 */
export type SceneStage = 'placed' | 'cooking' | 'serving' | 'done' | 'cancelled';

export const stageFromStatus = (status?: string): SceneStage => {
  switch (status) {
    case 'accepted':
    case 'preparing':
      return 'cooking';
    case 'ready':
    case 'served':
      return 'serving';
    case 'completed':
      return 'done';
    case 'cancelled':
    case 'no_show':
    case 'rejected':
      return 'cancelled';
    default:
      return 'placed';
  }
};

const LABELS: Record<SceneStage, string> = {
  placed: 'Order received — sending to kitchen',
  cooking: 'Chef is cooking your food',
  serving: 'On its way to you',
  done: 'Order completed — enjoy!',
  cancelled: 'Order cancelled',
};

const Chef = () => (
  <g>
    {/* flames */}
    <g className="zs-flame" style={{ transformOrigin: '100px 150px' }}>
      <path d="M86 152 q6 -14 8 -2 q4 -12 8 0 q4 -10 8 2 q2 6 -4 8 h-16 q-6 -2 -4 -8z" fill="hsl(var(--warning))" />
      <path d="M92 154 q4 -8 6 0 q3 -6 6 0 q1 4 -3 5 h-6 q-4 -1 -3 -5z" fill="hsl(var(--destructive))" />
    </g>
    {/* stove */}
    <rect x="60" y="158" width="80" height="10" rx="3" fill="hsl(var(--muted-foreground))" />
    {/* body */}
    <rect x="80" y="86" width="40" height="52" rx="14" fill="hsl(var(--card))" stroke="hsl(var(--foreground))" strokeWidth="2.5" />
    <circle cx="100" cy="70" r="14" fill="hsl(var(--warning) / 0.35)" stroke="hsl(var(--foreground))" strokeWidth="2.5" />
    {/* hat */}
    <path d="M86 60 q-6 -16 8 -16 q6 -10 14 0 q14 0 8 16z" fill="hsl(var(--card))" stroke="hsl(var(--foreground))" strokeWidth="2.5" />
    {/* arm + wok tossing */}
    <g className="zs-toss" style={{ transformOrigin: '118px 104px' }}>
      <path d="M118 104 l18 18" stroke="hsl(var(--foreground))" strokeWidth="5" strokeLinecap="round" />
      <path d="M120 132 q20 16 40 0z" fill="hsl(var(--foreground))" />
      <line x1="158" y1="132" x2="172" y2="126" stroke="hsl(var(--foreground))" strokeWidth="4" strokeLinecap="round" />
      {/* food bits jumping */}
      <circle className="zs-bit zs-bit1" cx="134" cy="128" r="3" fill="hsl(var(--success))" />
      <circle className="zs-bit zs-bit2" cx="142" cy="126" r="3" fill="hsl(var(--warning))" />
      <circle className="zs-bit zs-bit3" cx="150" cy="128" r="3" fill="hsl(var(--destructive))" />
    </g>
    {/* steam */}
    {[0, 1, 2].map(i => (
      <path key={i} className="zs-steam" style={{ animationDelay: `${i * 0.35}s` }}
        d={`M${132 + i * 9} 116 q-5 -8 0 -16 q5 -8 0 -16`} stroke="hsl(var(--muted-foreground))" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    ))}
  </g>
);

const Waiter = () => (
  <g className="zs-walk">
    <g className="zs-bob">
      <circle cx="100" cy="64" r="13" fill="hsl(var(--warning) / 0.35)" stroke="hsl(var(--foreground))" strokeWidth="2.5" />
      <rect x="84" y="80" width="32" height="48" rx="12" fill="hsl(var(--primary))" stroke="hsl(var(--foreground))" strokeWidth="2.5" />
      <path d="M96 82 l4 8 l4 -8" fill="hsl(var(--card))" />
      {/* arm up holding cloche */}
      <path d="M114 92 l20 -14" stroke="hsl(var(--foreground))" strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="146" cy="76" rx="22" ry="3" fill="hsl(var(--foreground))" />
      <path d="M126 74 a20 18 0 0 1 40 0z" fill="hsl(var(--muted))" stroke="hsl(var(--foreground))" strokeWidth="2.5" />
      <circle cx="146" cy="54" r="3" fill="hsl(var(--foreground))" />
    </g>
    <line className="zs-leg-a" x1="94" y1="126" x2="90" y2="160" stroke="hsl(var(--foreground))" strokeWidth="5" strokeLinecap="round" style={{ transformOrigin: '94px 126px' }} />
    <line className="zs-leg-b" x1="106" y1="126" x2="110" y2="160" stroke="hsl(var(--foreground))" strokeWidth="5" strokeLinecap="round" style={{ transformOrigin: '106px 126px' }} />
    {/* speed lines */}
    {[0, 1, 2].map(i => (
      <line key={i} className="zs-speed" style={{ animationDelay: `${i * 0.15}s` }} x1="44" x2="66" y1={90 + i * 16} y2={90 + i * 16} stroke="hsl(var(--muted-foreground))" strokeWidth="3" strokeLinecap="round" />
    ))}
  </g>
);

const Placed = () => (
  <g>
    <g className="zs-ring" style={{ transformOrigin: '100px 70px' }}>
      <path d="M76 110 q0 -44 24 -44 q24 0 24 44z" fill="hsl(var(--warning))" stroke="hsl(var(--foreground))" strokeWidth="2.5" />
      <rect x="70" y="108" width="60" height="8" rx="4" fill="hsl(var(--foreground))" />
      <circle cx="100" cy="62" r="5" fill="hsl(var(--foreground))" />
    </g>
    <path className="zs-ticket" d="M74 128 h52 v38 l-6 -4 l-7 4 l-7 -4 l-6 4 l-6 -4 l-7 4 l-7 -4 l-6 4z" fill="hsl(var(--card))" stroke="hsl(var(--foreground))" strokeWidth="2" />
    <line x1="82" y1="140" x2="118" y2="140" stroke="hsl(var(--muted-foreground))" strokeWidth="2" />
    <line x1="82" y1="148" x2="108" y2="148" stroke="hsl(var(--muted-foreground))" strokeWidth="2" />
  </g>
);

const Done = () => (
  <g>
    <circle className="zs-pop" cx="100" cy="100" r="44" fill="hsl(var(--success))" style={{ transformOrigin: '100px 100px' }} />
    <path className="zs-check" d="M80 100 l14 14 l28 -30" stroke="hsl(var(--success-foreground))" strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    {Array.from({ length: 10 }).map((_, i) => {
      const a = (i / 10) * Math.PI * 2;
      return (
        <circle key={i} className="zs-confetti" cx={100 + Math.cos(a) * 62} cy={100 + Math.sin(a) * 62} r="4"
          fill={i % 3 === 0 ? 'hsl(var(--warning))' : i % 3 === 1 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'}
          style={{ animationDelay: `${i * 0.05}s`, transformOrigin: '100px 100px' }} />
      );
    })}
  </g>
);

export const OrderStageScene: React.FC<{ status?: string; className?: string }> = ({ status, className }) => {
  const stage = stageFromStatus(status);
  return (
    <div className={cn('py-3 text-center overflow-hidden', className)}>
      <svg key={stage} viewBox="0 0 200 180" className="w-full max-w-[220px] h-auto mx-auto zs-enter" role="img" aria-label={LABELS[stage]}>
        {stage === 'placed' && <Placed />}
        {stage === 'cooking' && <Chef />}
        {stage === 'serving' && <Waiter />}
        {stage === 'done' && <Done />}
        {stage === 'cancelled' && (
          <g><circle cx="100" cy="100" r="44" fill="hsl(var(--destructive) / 0.15)" stroke="hsl(var(--destructive))" strokeWidth="4" />
            <path d="M84 84 l32 32 M116 84 l-32 32" stroke="hsl(var(--destructive))" strokeWidth="7" strokeLinecap="round" /></g>
        )}
      </svg>
      <p key={`l-${stage}`} className="text-sm font-bold text-foreground mt-1 zs-enter">{LABELS[stage]}</p>
    </div>
  );
};

export default OrderStageScene;
