import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Armchair, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { groupOrdersByTableSeat, SeatScopedOrder } from '@/utils/seatUtils';

interface TableSeatGroupsProps<T extends SeatScopedOrder> {
    orders: T[];
    renderOrder: (order: T) => React.ReactNode;
    /** Prefix used to keep React keys unique across columns */
    keyPrefix?: string;
    compact?: boolean;
}

/**
 * Renders table QR orders grouped by table, then by seat (or "Whole Table"),
 * based on each order's `order_scope` / `seat_label`.
 */
function TableSeatGroups<T extends SeatScopedOrder>({
    orders,
    renderOrder,
    keyPrefix = 'grp',
    compact = false,
}: TableSeatGroupsProps<T>) {
    if (orders.length === 0) return null;
    const groups = groupOrdersByTableSeat(orders);

    return (
        <div className={cn('space-y-3', compact && 'space-y-2')}>
            {groups.map((group) => (
                <div
                    key={`${keyPrefix}-t-${group.tableNumber}`}
                    className="rounded-xl border border-dashed border-purple-300/70 dark:border-purple-800/60 bg-purple-50/30 dark:bg-purple-950/10 p-2"
                >
                    <div className="flex items-center gap-2 px-1 pb-2">
                        <Users className="w-4 h-4 text-purple-600" />
                        <span className="text-sm font-bold text-purple-700 dark:text-purple-300">
                            Table {group.tableNumber}
                        </span>
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                            {group.total}
                        </Badge>
                    </div>

                    <div className="space-y-2">
                        {group.seats.map((seat) => (
                            <div key={`${keyPrefix}-t-${group.tableNumber}-${seat.key}`} className="space-y-2">
                                <div className="flex items-center gap-1.5 px-1">
                                    <Armchair
                                        className={cn(
                                            'w-3.5 h-3.5',
                                            seat.isSeat ? 'text-amber-600' : 'text-muted-foreground'
                                        )}
                                    />
                                    <span
                                        className={cn(
                                            'text-[11px] font-semibold uppercase tracking-wide',
                                            seat.isSeat ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'
                                        )}
                                    >
                                        {seat.seatText}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                        · {seat.orders.length} {seat.orders.length === 1 ? 'ticket' : 'tickets'}
                                    </span>
                                </div>
                                {seat.orders.map((order) => (
                                    <React.Fragment key={`${keyPrefix}-o-${order.id}`}>
                                        {renderOrder(order)}
                                    </React.Fragment>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

export default TableSeatGroups;
