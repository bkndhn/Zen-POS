import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Utensils } from 'lucide-react';
import { getTimeElapsed, formatQuantityWithUnit } from '@/utils/timeUtils';
import { cn } from '@/lib/utils';

interface KitchenBillItem {
    id: string;
    quantity: number;
    items: {
        id: string;
        name: string;
        unit?: string;
        base_value?: number;
    } | null;
}

export interface KitchenBill {
    id: string;
    bill_no: string;
    created_at: string;
    kitchen_status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'rejected';
    service_status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'rejected';
    bill_items: KitchenBillItem[];
    table_no?: string;
}

interface KitchenOrderCardProps {
    bill: KitchenBill;
    processing: boolean;
    onAction: () => void;
    actionLabel: string;
    actionColor: string;
}

/** Age buckets drive the urgency tint on the elapsed-time chip. */
const ageTone = (createdAt: string) => {
    const mins = (Date.now() - new Date(createdAt).getTime()) / 60000;
    if (isNaN(mins)) return 'muted';
    if (mins >= 15) return 'late';
    if (mins >= 8) return 'warn';
    return 'fresh';
};

const KitchenOrderCard: React.FC<KitchenOrderCardProps> = ({
    bill,
    processing,
    onAction,
    actionLabel,
    actionColor,
}) => {
    const tone = ageTone(bill.created_at);

    return (
        <Card
            className={cn(
                "relative overflow-hidden rounded-2xl border-border/60 bg-card/95 p-0",
                "shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
                processing && "opacity-60 pointer-events-none"
            )}
        >
            {/* Urgency rail */}
            <span
                aria-hidden
                className={cn(
                    "absolute inset-y-0 left-0 w-1.5",
                    tone === 'late' && "bg-destructive",
                    tone === 'warn' && "bg-amber-500",
                    tone === 'fresh' && "bg-primary/70",
                    tone === 'muted' && "bg-muted"
                )}
            />

            <div className="pl-5 pr-4 py-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Order
                        </p>
                        <h3 className="text-2xl font-bold leading-tight tracking-tight truncate">
                            #{bill.bill_no}
                        </h3>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span
                            className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                                tone === 'late' && "bg-destructive/10 text-destructive",
                                tone === 'warn' && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                                tone === 'fresh' && "bg-primary/10 text-primary",
                                tone === 'muted' && "bg-muted text-muted-foreground"
                            )}
                        >
                            <Clock className="w-3 h-3" />
                            {getTimeElapsed(bill.created_at)}
                        </span>
                        {bill.table_no && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-foreground">
                                <Utensils className="w-3 h-3 text-muted-foreground" />
                                {bill.table_no}
                            </span>
                        )}
                    </div>
                </div>

                {/* Items */}
                <div className="mt-3 divide-y divide-border/50 rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
                    {bill.bill_items.map((item) => (
                        <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 px-3 py-2"
                        >
                            <span className="text-sm font-medium leading-snug break-words min-w-0">
                                {item.items?.name || 'Unknown'}
                            </span>
                            <span className="shrink-0 rounded-lg bg-background px-2.5 py-1 text-sm font-bold tabular-nums shadow-sm ring-1 ring-border/60">
                                {formatQuantityWithUnit(item.quantity, item.items?.unit)}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Action */}
                <Button
                    onClick={onAction}
                    disabled={processing}
                    className={cn(
                        "mt-4 w-full h-11 rounded-xl font-semibold text-white shadow-sm active:scale-[0.99] transition-transform",
                        actionColor
                    )}
                >
                    {processing ? 'Processing…' : actionLabel}
                </Button>
            </div>
        </Card>
    );
};

export default React.memo(KitchenOrderCard);
