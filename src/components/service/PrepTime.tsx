import React, { useEffect, useState } from 'react';
import { Clock, Flame, TimerReset, AlarmClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    formatClock,
    formatMins,
    getPrepProgress,
    readyByLabel,
    type PrepPhase,
} from '@/utils/prepTime';

/** Single shared ticking clock so dozens of timers cost one interval each second. */
export const useNow = (intervalMs = 1000): number => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), intervalMs);
        return () => window.clearInterval(id);
    }, [intervalMs]);
    return now;
};

const phaseChip: Record<PrepPhase, string> = {
    'on-time': 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
    'due-soon': 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20',
    overdue: 'bg-destructive/10 text-destructive ring-destructive/25',
};

const phaseBar: Record<PrepPhase, string> = {
    'on-time': 'bg-emerald-500',
    'due-soon': 'bg-amber-500',
    overdue: 'bg-destructive',
};

/* ------------------------------------------------------------------ */
/* Item level cooking time badge (menu, item list, cart)               */
/* ------------------------------------------------------------------ */

export const CookingTimeBadge: React.FC<{
    minutes?: number | null;
    className?: string;
    compact?: boolean;
}> = ({ minutes, className, compact }) => {
    if (!minutes || minutes <= 0) return null;
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 font-semibold text-muted-foreground ring-1 ring-border/60 tabular-nums',
                compact ? 'text-[10px]' : 'text-[11px]',
                className
            )}
            title={`Approx. cooking time ${formatMins(minutes)}`}
        >
            <Flame className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
            {formatMins(minutes)}
        </span>
    );
};

/* ------------------------------------------------------------------ */
/* Order level live timer                                              */
/* ------------------------------------------------------------------ */

interface PrepTimerProps {
    /** When the order was placed (or when cooking started). */
    startedAt?: string | Date | null;
    etaMinutes?: number | null;
    now?: number;
    /** 'countdown' = time left (customer view), 'elapsed' = running time (kitchen view). */
    mode?: 'countdown' | 'elapsed';
    showReadyBy?: boolean;
    className?: string;
}

export const PrepTimerChip: React.FC<PrepTimerProps> = ({
    startedAt,
    etaMinutes,
    now,
    mode = 'countdown',
    showReadyBy = false,
    className,
}) => {
    const tick = useNow(1000);
    const p = getPrepProgress(startedAt, etaMinutes, now ?? tick);

    const label =
        mode === 'elapsed'
            ? formatClock(p.elapsedSeconds)
            : p.phase === 'overdue'
                ? `+${formatClock(-p.remainingSeconds)}`
                : formatClock(p.remainingSeconds);

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ring-1',
                phaseChip[p.phase],
                p.phase === 'overdue' && 'animate-pulse',
                className
            )}
        >
            {p.phase === 'overdue' ? <AlarmClock className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            {label}
            {showReadyBy && p.phase !== 'overdue' && (
                <span className="font-medium opacity-75">· {readyByLabel(startedAt, p.etaMinutes)}</span>
            )}
        </span>
    );
};

/** Full-width progress rail with a headline — used on the customer portal. */
export const PrepProgressBar: React.FC<PrepTimerProps & { title?: string }> = ({
    startedAt,
    etaMinutes,
    now,
    title,
    className,
}) => {
    const tick = useNow(1000);
    const p = getPrepProgress(startedAt, etaMinutes, now ?? tick);

    return (
        <div className={cn('space-y-1.5', className)}>
            <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <TimerReset className="h-3.5 w-3.5" />
                    {title || (p.phase === 'overdue' ? 'Running late' : 'Ready in')}
                </span>
                <PrepTimerChip startedAt={startedAt} etaMinutes={etaMinutes} now={now ?? tick} showReadyBy />
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                    className={cn('h-full rounded-full transition-[width] duration-1000 ease-linear', phaseBar[p.phase])}
                    style={{ width: `${Math.round(p.ratio * 100)}%` }}
                />
            </div>
            {p.phase === 'overdue' && (
                <p className="text-[11px] font-medium text-destructive">
                    Taking longer than expected — the kitchen is on it ({formatMins(p.lateMinutes)} over).
                </p>
            )}
        </div>
    );
};

export default PrepTimerChip;
