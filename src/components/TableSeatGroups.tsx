import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Armchair, Users, Printer, ChefHat, Bell, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { groupOrdersByTableSeat, SeatScopedOrder } from '@/utils/seatUtils';

interface TableSeatGroupsProps<T extends SeatScopedOrder & { status?: string }> {
    orders: T[];
    renderOrder: (order: T) => React.ReactNode;
    /** Prefix used to keep React keys unique across columns */
    keyPrefix?: string;
    compact?: boolean;
    onUpdateSeatStatus?: (tableNumber: string, seatKey: string, orders: T[], nextStatus: 'preparing' | 'ready' | 'served') => void;
    onPrintSeatGroup?: (tableNumber: string, seatText: string, orders: T[]) => void;
}

/**
 * Renders table QR orders grouped by table, then by seat (or "Whole Table"),
 * with quick KDS batch actions to move tickets per seat and print seat-grouped KOTs.
 */
function TableSeatGroups<T extends SeatScopedOrder & { status?: string }>({
    orders,
    renderOrder,
    keyPrefix = 'grp',
    compact = false,
    onUpdateSeatStatus,
    onPrintSeatGroup,
}: TableSeatGroupsProps<T>) {
    if (orders.length === 0) return null;
    const groups = groupOrdersByTableSeat(orders);

    return (
        <div className={cn('space-y-3', compact && 'space-y-2')}>
            {groups.map((group) => (
                <div
                    key={`${keyPrefix}-t-${group.tableNumber}`}
                    className="rounded-xl border border-dashed border-purple-300/70 dark:border-purple-800/60 bg-purple-50/30 dark:bg-purple-950/10 p-2.5"
                >
                    <div className="flex items-center justify-between px-1 pb-2 border-b border-purple-200/50 dark:border-purple-900/40 mb-2">
                        <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-purple-600" />
                            <span className="text-sm font-bold text-purple-700 dark:text-purple-300">
                                Table {group.tableNumber}
                            </span>
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-bold">
                                {group.total} {group.total === 1 ? 'ticket' : 'tickets'}
                            </Badge>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {group.seats.map((seat) => {
                            const seatOrders = seat.orders;
                            const firstStatus = (seatOrders[0]?.status || 'pending').toLowerCase();
                            const isPending = firstStatus === 'pending';
                            const isPreparing = firstStatus === 'preparing';
                            const isReady = firstStatus === 'ready';

                            return (
                                <div key={`${keyPrefix}-t-${group.tableNumber}-${seat.key}`} className="space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-1.5 px-1 bg-white/60 dark:bg-zinc-900/60 p-1.5 rounded-lg border border-purple-200/40 dark:border-purple-900/30">
                                        <div className="flex items-center gap-1.5">
                                            <Armchair
                                                className={cn(
                                                    'w-3.5 h-3.5',
                                                    seat.isSeat ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                                                )}
                                            />
                                            <span
                                                className={cn(
                                                    'text-[11px] font-bold uppercase tracking-wide',
                                                    seat.isSeat ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'
                                                )}
                                            >
                                                {seat.seatText}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground font-mono">
                                                ({seatOrders.length})
                                            </span>
                                        </div>

                                        {/* Quick Seat Batch Actions & KOT Print */}
                                        <div className="flex items-center gap-1">
                                            {onPrintSeatGroup && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => onPrintSeatGroup(group.tableNumber, seat.seatText, seatOrders)}
                                                    className="h-6 px-1.5 text-[10px] text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50"
                                                    title="Print KOT grouped for this seat"
                                                >
                                                    <Printer className="w-3 h-3 mr-1" />
                                                    <span>Print KOT</span>
                                                </Button>
                                            )}

                                            {onUpdateSeatStatus && isPending && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={() => onUpdateSeatStatus(group.tableNumber, seat.key, seatOrders, 'preparing')}
                                                    className="h-6 px-2 text-[10px] font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-md shadow-sm"
                                                >
                                                    <ChefHat className="w-3 h-3 mr-1" />
                                                    <span>Prepare Seat</span>
                                                </Button>
                                            )}

                                            {onUpdateSeatStatus && isPreparing && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={() => onUpdateSeatStatus(group.tableNumber, seat.key, seatOrders, 'ready')}
                                                    className="h-6 px-2 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-sm"
                                                >
                                                    <Bell className="w-3 h-3 mr-1" />
                                                    <span>Seat Ready</span>
                                                </Button>
                                            )}

                                            {onUpdateSeatStatus && isReady && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={() => onUpdateSeatStatus(group.tableNumber, seat.key, seatOrders, 'served')}
                                                    className="h-6 px-2 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm"
                                                >
                                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                                    <span>Serve Seat</span>
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Order Cards */}
                                    {seatOrders.map((order) => (
                                        <React.Fragment key={`${keyPrefix}-o-${order.id}`}>
                                            {renderOrder(order)}
                                        </React.Fragment>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

export default TableSeatGroups;

