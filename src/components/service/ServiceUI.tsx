import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

/**
 * Shared presentational primitives for the dine-in service surfaces
 * (Tables, Table Billing, Waiter Companion, KDS, Service Area, Customer Portal).
 *
 * Purely visual — no data fetching, no business logic.
 */

type Tone = 'primary' | 'purple' | 'amber' | 'emerald' | 'rose' | 'sky' | 'slate';

const toneTile: Record<Tone, string> = {
    primary: 'from-primary to-primary/70 shadow-primary/25',
    purple: 'from-purple-500 to-fuchsia-500 shadow-purple-500/25',
    amber: 'from-amber-500 to-orange-500 shadow-amber-500/25',
    emerald: 'from-emerald-500 to-teal-500 shadow-emerald-500/25',
    rose: 'from-rose-500 to-red-500 shadow-rose-500/25',
    sky: 'from-sky-500 to-blue-600 shadow-sky-500/25',
    slate: 'from-slate-500 to-slate-700 shadow-slate-500/25',
};

const toneText: Record<Tone, string> = {
    primary: 'text-primary',
    purple: 'text-purple-600 dark:text-purple-400',
    amber: 'text-amber-600 dark:text-amber-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
    sky: 'text-sky-600 dark:text-sky-400',
    slate: 'text-slate-600 dark:text-slate-300',
};

const toneDot: Record<Tone, string> = {
    primary: 'bg-primary',
    purple: 'bg-purple-500',
    amber: 'bg-amber-500',
    emerald: 'bg-emerald-500',
    rose: 'bg-rose-500',
    sky: 'bg-sky-500',
    slate: 'bg-slate-400',
};

/* ------------------------------------------------------------------ */
/* Page header                                                         */
/* ------------------------------------------------------------------ */

interface ServiceHeaderProps {
    icon: LucideIcon;
    title: string;
    subtitle?: React.ReactNode;
    tone?: Tone;
    /** Renders a sticky frosted bar (KDS / Service Area style) */
    sticky?: boolean;
    badge?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
}

export const ServiceHeader: React.FC<ServiceHeaderProps> = ({
    icon: Icon,
    title,
    subtitle,
    tone = 'primary',
    sticky = false,
    badge,
    actions,
    className,
}) => (
    <header
        className={cn(
            'relative overflow-hidden',
            sticky
                ? 'sticky top-0 z-20 -mx-3 sm:-mx-4 px-3 sm:px-4 py-2.5 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60'
                : 'rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl px-3 py-2.5 sm:px-4 sm:py-3 shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_8px_24px_-16px_hsl(var(--foreground)/0.25)]',
            className
        )}
    >
        {!sticky && (
            <span
                aria-hidden
                className={cn(
                    'pointer-events-none absolute -top-16 -right-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-[0.12] blur-2xl',
                    toneTile[tone]
                )}
            />
        )}
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
                <div
                    className={cn(
                        'grid place-items-center shrink-0 rounded-xl bg-gradient-to-br shadow-lg h-9 w-9 sm:h-10 sm:w-10',
                        toneTile[tone]
                    )}
                >
                    <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5 text-white" />
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <h1 className="truncate text-[15px] sm:text-xl font-bold tracking-tight leading-tight">{title}</h1>
                        {badge}
                    </div>
                    {subtitle && (
                        <p className="truncate text-[11px] sm:text-xs text-muted-foreground leading-tight mt-0.5">
                            {subtitle}
                        </p>
                    )}
                </div>
            </div>
            {actions && <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto mt-1 sm:mt-0">{actions}</div>}
        </div>
    </header>
);

/* ------------------------------------------------------------------ */
/* Live / connection pill                                              */
/* ------------------------------------------------------------------ */

export const LivePill: React.FC<{ online: boolean; labelOnline?: string; labelOffline?: string; className?: string }> = ({
    online,
    labelOnline = 'Live',
    labelOffline = 'Offline',
    className,
}) => (
    <span
        className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            online
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400',
            className
        )}
    >
        <span className="relative flex h-1.5 w-1.5">
            {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />}
            <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', online ? 'bg-emerald-500' : 'bg-rose-500')} />
        </span>
        {online ? labelOnline : labelOffline}
    </span>
);

/* ------------------------------------------------------------------ */
/* Stat tile                                                           */
/* ------------------------------------------------------------------ */

interface StatTileProps {
    icon?: LucideIcon;
    label: string;
    value: React.ReactNode;
    tone?: Tone;
    active?: boolean;
    onClick?: () => void;
    className?: string;
}

export const StatTile: React.FC<StatTileProps> = ({
    icon: Icon,
    label,
    value,
    tone = 'primary',
    active,
    onClick,
    className,
}) => {
    const Comp: any = onClick ? 'button' : 'div';
    return (
        <Comp
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={cn(
                'group relative overflow-hidden rounded-xl border border-border/60 bg-card/80 px-2.5 py-2 text-left transition-all duration-200',
                onClick && 'active:scale-[0.97] hover:border-border hover:shadow-md',
                active && 'ring-2 ring-primary/40 border-primary/40',
                className
            )}
        >
            <span
                aria-hidden
                className={cn('absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-gradient-to-b', toneTile[tone])}
            />
            <div className="flex items-center gap-2 pl-1.5">
                {Icon && (
                    <div className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br shadow-sm', toneTile[tone])}>
                        <Icon className="h-3.5 w-3.5 text-white" />
                    </div>
                )}
                <div className="min-w-0">
                    <p className="text-base sm:text-lg font-bold leading-none tabular-nums">{value}</p>
                    <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground leading-tight">
                        {label}
                    </p>
                </div>
            </div>
        </Comp>
    );
};

/* ------------------------------------------------------------------ */
/* Section heading                                                     */
/* ------------------------------------------------------------------ */

interface SectionHeadingProps {
    title: string;
    count?: number;
    tone?: Tone;
    icon?: LucideIcon;
    pulse?: boolean;
    actions?: React.ReactNode;
    className?: string;
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({
    title,
    count,
    tone = 'primary',
    icon: Icon,
    pulse,
    actions,
    className,
}) => (
    <div
        className={cn(
            'flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/30 px-2.5 py-1.5 backdrop-blur-sm',
            className
        )}
    >
        <div className="flex items-center gap-2 min-w-0">
            {Icon ? (
                <Icon className={cn('h-4 w-4 shrink-0', toneText[tone])} />
            ) : (
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', toneDot[tone], pulse && 'animate-pulse')} />
            )}
            <h2 className="truncate text-sm font-bold tracking-tight">{title}</h2>
            {typeof count === 'number' && (
                <span
                    className={cn(
                        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums text-white bg-gradient-to-br shadow-sm',
                        toneTile[tone]
                    )}
                >
                    {count}
                </span>
            )}
        </div>
        {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
    </div>
);

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description?: string;
    tone?: Tone;
    action?: React.ReactNode;
    className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon: Icon,
    title,
    description,
    tone = 'slate',
    action,
    className,
}) => (
    <div
        className={cn(
            'flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center',
            className
        )}
    >
        <div className={cn('mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br opacity-90 shadow-lg', toneTile[tone])}>
            <Icon className="h-6 w-6 text-white" />
        </div>
        <p className="text-sm font-bold tracking-tight">{title}</p>
        {description && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>}
        {action && <div className="mt-3">{action}</div>}
    </div>
);

/* ------------------------------------------------------------------ */
/* Loading state (shimmer, not spinner)                                */
/* ------------------------------------------------------------------ */

export const ServiceLoading: React.FC<{ label?: string; cards?: number; className?: string }> = ({
    label = 'Loading…',
    cards = 6,
    className,
}) => (
    <div className={cn('p-3 sm:p-4 space-y-4', className)}>
        <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-muted" />
            <div className="space-y-2">
                <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded-md bg-muted/70" />
            </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: cards }).map((_, i) => (
                <div
                    key={i}
                    style={{ animationDelay: `${i * 60}ms` }}
                    className="h-28 animate-pulse rounded-2xl border border-border/50 bg-muted/50"
                />
            ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">{label}</p>
    </div>
);

export default ServiceHeader;
