import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { formatMins } from '@/utils/prepTime';

interface KitchenBusyModeProps {
    /** auth user_id that owns the shop_settings row */
    userId: string | null;
    branchId: string | null;
    onChanged?: () => void;
    className?: string;
}

const DURATIONS = [30, 60, 120, 180];

/**
 * Busy-hour control for the kitchen: adds a buffer to the ETA of every NEW order
 * (applied before the customer places it, so the promise stays honest).
 */
export const KitchenBusyMode: React.FC<KitchenBusyModeProps> = ({ userId, branchId, onChanged, className }) => {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [buffer, setBuffer] = useState('10');
    const [duration, setDuration] = useState(60);
    const [defaultTime, setDefaultTime] = useState('10');
    const [active, setActive] = useState<{ buffer: number; until: string | null } | null>(null);

    const load = React.useCallback(async () => {
        if (!userId) return;
        let q: any = (supabase as any)
            .from('shop_settings')
            .select('kitchen_busy_buffer_mins, kitchen_busy_until, default_cooking_time_mins')
            .eq('user_id', userId);
        if (branchId) q = q.eq('branch_id', branchId);
        const { data } = await q.maybeSingle();
        if (!data) return;
        const until = data.kitchen_busy_until as string | null;
        const expired = until ? new Date(until).getTime() < Date.now() : false;
        const buf = Number(data.kitchen_busy_buffer_mins) || 0;
        setDefaultTime(String(Number(data.default_cooking_time_mins) || 10));
        setActive(buf > 0 && !expired ? { buffer: buf, until } : null);
        if (buf > 0) setBuffer(String(buf));
    }, [userId, branchId]);

    useEffect(() => { load(); }, [load]);

    const save = async (clear = false) => {
        if (!userId) return;
        setSaving(true);
        try {
            const payload: Record<string, any> = clear
                ? { kitchen_busy_buffer_mins: 0, kitchen_busy_until: null }
                : {
                    kitchen_busy_buffer_mins: Math.max(0, Math.round(Number(buffer) || 0)),
                    kitchen_busy_until: new Date(Date.now() + duration * 60000).toISOString(),
                    default_cooking_time_mins: Math.max(1, Math.round(Number(defaultTime) || 10)),
                };

            let q: any = (supabase as any).from('shop_settings').update(payload).eq('user_id', userId);
            if (branchId) q = q.eq('branch_id', branchId);
            const { error } = await q;
            if (error) throw error;

            toast({
                title: clear ? '✅ Busy mode off' : '🔥 Busy mode on',
                description: clear
                    ? 'New orders use their normal cooking time again.'
                    : `New orders get +${formatMins(Number(buffer) || 0)} for the next ${formatMins(duration)}.`,
            });
            setOpen(false);
            await load();
            onChanged?.();
        } catch (e: any) {
            toast({ title: 'Could not update', description: e?.message || 'Please try again', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    type="button"
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    className={cn('h-8 gap-1.5 rounded-full px-3 text-xs font-semibold', active && 'bg-amber-500 hover:bg-amber-600 text-white', className)}
                    title="Busy hours: add extra time to new order ETAs"
                >
                    <Flame className="h-3.5 w-3.5" />
                    {active ? `Busy +${active.buffer}m` : 'Busy mode'}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Kitchen busy mode</DialogTitle>
                    <DialogDescription>
                        Adds extra minutes to the ETA of every new order — customers see the longer time before they order.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="busy_buffer">Extra time per order (minutes)</Label>
                        <Input
                            id="busy_buffer"
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={buffer}
                            onChange={(e) => setBuffer(e.target.value)}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Keep it on for</Label>
                        <div className="grid grid-cols-4 gap-1.5">
                            {DURATIONS.map(d => (
                                <Button
                                    key={d}
                                    type="button"
                                    size="sm"
                                    variant={duration === d ? 'default' : 'secondary'}
                                    className="h-8 text-xs font-semibold"
                                    onClick={() => setDuration(d)}
                                >
                                    {d < 60 ? `${d}m` : `${d / 60}h`}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="default_cook">Default cooking time for items without one</Label>
                        <Input
                            id="default_cook"
                            type="number"
                            min="1"
                            inputMode="numeric"
                            value={defaultTime}
                            onChange={(e) => setDefaultTime(e.target.value)}
                        />
                    </div>

                    {active?.until && (
                        <p className="text-xs text-muted-foreground">
                            Currently active until {new Date(active.until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
                        </p>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                    {active && (
                        <Button type="button" variant="outline" disabled={saving} onClick={() => save(true)}>
                            Turn off
                        </Button>
                    )}
                    <Button type="button" disabled={saving} onClick={() => save(false)}>
                        {saving ? 'Saving…' : 'Apply'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default KitchenBusyMode;
