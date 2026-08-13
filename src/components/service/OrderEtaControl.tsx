import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Timer, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ETA_BUMP_OPTIONS, formatMins, getPrepProgress } from '@/utils/prepTime';
import { PrepTimerChip } from './PrepTime';

interface OrderEtaControlProps {
    /** Order placed / cooking started time. */
    startedAt: string;
    etaMinutes: number;
    /** Called with the new absolute ETA in minutes. */
    onChangeEta: (nextEta: number) => void | Promise<void>;
    disabled?: boolean;
    className?: string;
}

/**
 * Kitchen-side ETA widget: shows the running time against the promised ETA
 * and lets staff push the ETA out during busy hours.
 */
export const OrderEtaControl: React.FC<OrderEtaControlProps> = ({
    startedAt,
    etaMinutes,
    onChangeEta,
    disabled,
    className,
}) => {
    const [open, setOpen] = useState(false);
    const [custom, setCustom] = useState('');
    const p = getPrepProgress(startedAt, etaMinutes);

    const apply = async (next: number) => {
        const clean = Math.max(1, Math.round(next));
        setOpen(false);
        setCustom('');
        await onChangeEta(clean);
    };

    return (
        <div className={cn('flex items-center gap-1.5', className)}>
            <PrepTimerChip startedAt={startedAt} etaMinutes={etaMinutes} mode="elapsed" />
            <span
                className={cn(
                    'inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground ring-1 ring-border/60 tabular-nums',
                    p.phase === 'overdue' && 'text-destructive'
                )}
            >
                <Timer className="h-3 w-3" />
                ETA {formatMins(etaMinutes)}
            </span>

            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        className="h-6 rounded-full px-2 text-[11px] font-semibold"
                        title="Need more time? Update the ETA"
                    >
                        <Plus className="mr-0.5 h-3 w-3" />
                        Time
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-3">
                    <p className="mb-2 text-xs font-semibold">Add more time</p>
                    <div className="grid grid-cols-3 gap-1.5">
                        {ETA_BUMP_OPTIONS.map(m => (
                            <Button
                                key={m}
                                size="sm"
                                variant="secondary"
                                className="h-8 text-xs font-semibold"
                                onClick={() => apply(etaMinutes + m)}
                            >
                                +{m}m
                            </Button>
                        ))}
                    </div>
                    <div className="mt-3 flex items-center gap-1.5">
                        <Input
                            type="number"
                            min="1"
                            inputMode="numeric"
                            placeholder="Set ETA"
                            value={custom}
                            onChange={(e) => setCustom(e.target.value)}
                            className="h-8 text-xs"
                        />
                        <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={!custom || Number(custom) <= 0}
                            onClick={() => apply(Number(custom))}
                        >
                            Set
                        </Button>
                    </div>
                    <p className="mt-2 text-[10px] leading-tight text-muted-foreground">
                        The customer's live timer updates instantly.
                    </p>
                </PopoverContent>
            </Popover>
        </div>
    );
};

export default OrderEtaControl;
