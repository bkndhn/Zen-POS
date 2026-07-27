/**
 * Shared helpers for table / seat scoped orders.
 *
 * Orders can be scoped to a whole table (`order_scope = 'table'`) or to an
 * individual seat (`order_scope = 'seat'`, with `seat_label` such as "S1" /
 * "Window seat"). These helpers give KDS, Service Area and Table Billing a
 * single consistent way to label and group tickets.
 */

export type OrderScope = 'table' | 'seat';

export interface SeatScopedOrder {
    id: string;
    table_number: string;
    seat_id?: string | null;
    seat_label?: string | null;
    order_scope?: OrderScope | string | null;
    created_at?: string;
}

/** True when the ticket belongs to one specific seat. */
export const isSeatScoped = (order: SeatScopedOrder): boolean => {
    if (order.order_scope) return String(order.order_scope).toLowerCase() === 'seat';
    return Boolean(order.seat_label || order.seat_id);
};

/** "Seat A" / "Whole Table" */
export const getSeatText = (order: SeatScopedOrder): string => {
    if (!isSeatScoped(order)) return 'Whole Table';
    const label = order.seat_label || order.seat_id;
    return label ? `Seat ${label}` : 'Seat';
};

/** "Table 5 · Seat A" (short: "T5 · Seat A") */
export const getOrderTargetLabel = (order: SeatScopedOrder, short = false): string => {
    const table = `${short ? 'T' : 'Table '}${order.table_number}`;
    return `${table} · ${getSeatText(order)}`;
};

/** Stable grouping key for a seat bucket inside a table. */
export const getSeatKey = (order: SeatScopedOrder): string =>
    isSeatScoped(order) ? `seat:${(order.seat_label || order.seat_id || 'seat')}` : 'table';

export interface SeatGroup<T extends SeatScopedOrder> {
    key: string;
    seatText: string;
    isSeat: boolean;
    orders: T[];
}

export interface TableGroup<T extends SeatScopedOrder> {
    tableNumber: string;
    total: number;
    seats: SeatGroup<T>[];
}

const naturalCompare = (a: string, b: string) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Group orders by table, then by seat inside each table.
 * "Whole Table" tickets always sort first inside a table group.
 */
export const groupOrdersByTableSeat = <T extends SeatScopedOrder>(orders: T[]): TableGroup<T>[] => {
    const tables = new Map<string, Map<string, T[]>>();

    for (const order of orders) {
        const tableNumber = String(order.table_number ?? '');
        if (!tables.has(tableNumber)) tables.set(tableNumber, new Map());
        const seats = tables.get(tableNumber)!;
        const seatKey = getSeatKey(order);
        if (!seats.has(seatKey)) seats.set(seatKey, []);
        seats.get(seatKey)!.push(order);
    }

    return Array.from(tables.entries())
        .sort(([a], [b]) => naturalCompare(a, b))
        .map(([tableNumber, seats]) => {
            const seatGroups: SeatGroup<T>[] = Array.from(seats.entries())
                .map(([key, groupOrders]) => ({
                    key,
                    seatText: getSeatText(groupOrders[0]),
                    isSeat: key !== 'table',
                    orders: [...groupOrders].sort((a, b) =>
                        new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
                    ),
                }))
                .sort((a, b) => {
                    if (a.isSeat !== b.isSeat) return a.isSeat ? 1 : -1;
                    return naturalCompare(a.seatText, b.seatText);
                });

            return {
                tableNumber,
                total: seatGroups.reduce((sum, g) => sum + g.orders.length, 0),
                seats: seatGroups,
            };
        });
};

/** Monotonic rank map for order lifecycle progression */
export const STATUS_RANK: Record<string, number> = {
    pending: 1,
    preparing: 2,
    ready: 3,
    served: 4,
    completed: 5,
    cancelled: 99,
    rejected: 99
};

/**
 * Conflict-safe status merge rule:
 * Ensures rapid, out-of-order broadcast messages across multiple devices never
 * regress a ticket's status unless explicitly an undo operation.
 */
export const shouldApplyStatusUpdate = (
    currentStatus: string,
    newStatus: string,
    isUndo = false
): boolean => {
    if (isUndo) return true;
    const currentRank = STATUS_RANK[currentStatus?.toLowerCase()] || 0;
    const newRank = STATUS_RANK[newStatus?.toLowerCase()] || 0;
    return newRank >= currentRank;
};

/**
 * Conflict-safe array merger for real-time table orders / bills updates.
 */
export const mergeOrdersConflictSafe = <T extends { id: string; status: string; updated_at?: string; created_at?: string }>(
    existingOrders: T[],
    incomingOrder: T,
    isUndo = false
): T[] => {
    const idx = existingOrders.findIndex(o => o.id === incomingOrder.id);
    if (idx === -1) {
        return [incomingOrder, ...existingOrders];
    }
    const current = existingOrders[idx];
    if (shouldApplyStatusUpdate(current.status, incomingOrder.status, isUndo)) {
        const next = [...existingOrders];
        next[idx] = { ...current, ...incomingOrder };
        return next;
    }
    return existingOrders;
};

export interface KOTStatusBadgeInfo {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    className: string;
    dotColor: string;
}

export const getKOTStatusBadgeInfo = (status?: string | null): KOTStatusBadgeInfo => {
    const s = String(status || 'unsent').toLowerCase();
    switch (s) {
        case 'preparing':
            return {
                label: 'Preparing',
                variant: 'secondary',
                className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30 font-bold text-[10px] py-0 px-1.5 h-4.5 inline-flex items-center gap-1',
                dotColor: 'bg-orange-500 animate-pulse',
            };
        case 'ready':
            return {
                label: 'Ready',
                variant: 'secondary',
                className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 font-bold text-[10px] py-0 px-1.5 h-4.5 inline-flex items-center gap-1',
                dotColor: 'bg-blue-500',
            };
        case 'served':
            return {
                label: 'Served',
                variant: 'secondary',
                className: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 font-bold text-[10px] py-0 px-1.5 h-4.5 inline-flex items-center gap-1',
                dotColor: 'bg-purple-500',
            };
        case 'pending':
        case 'sent':
        case 'kot_sent':
            return {
                label: 'KOT Sent',
                variant: 'secondary',
                className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-bold text-[10px] py-0 px-1.5 h-4.5 inline-flex items-center gap-1',
                dotColor: 'bg-emerald-500',
            };
        case 'unsent':
        case 'draft':
        default:
            return {
                label: 'Unsent Draft',
                variant: 'outline',
                className: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 font-bold text-[10px] py-0 px-1.5 h-4.5 inline-flex items-center gap-1',
                dotColor: 'bg-gray-400',
            };
    }
};

export interface OccupancyTimerInfo {
    elapsedMinutes: number;
    level: 'fresh' | 'mid' | 'long';
    formattedDuration: string;
    ringClass: string;
    badgeClass: string;
    dotColor: string;
    label: string;
}

export const getOccupancyTimerInfo = (createdAt?: string | null): OccupancyTimerInfo | null => {
    if (!createdAt) return null;
    const startTime = new Date(createdAt).getTime();
    if (isNaN(startTime)) return null;

    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - startTime) / 60000));
    const hours = Math.floor(elapsedMinutes / 60);
    const mins = elapsedMinutes % 60;
    const formattedDuration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    if (elapsedMinutes < 30) {
        return {
            elapsedMinutes,
            level: 'fresh',
            formattedDuration,
            ringClass: 'ring-2 ring-emerald-500/80 border-emerald-500/50 shadow-emerald-500/10',
            badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
            dotColor: 'bg-emerald-500',
            label: '🟢 <30m',
        };
    } else if (elapsedMinutes <= 60) {
        return {
            elapsedMinutes,
            level: 'mid',
            formattedDuration,
            ringClass: 'ring-2 ring-amber-500/80 border-amber-500/50 shadow-amber-500/10',
            badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
            dotColor: 'bg-amber-500',
            label: '🟡 30-60m',
        };
    } else {
        return {
            elapsedMinutes,
            level: 'long',
            formattedDuration,
            ringClass: 'ring-2 ring-rose-500/80 border-rose-500/50 shadow-rose-500/20 animate-pulse',
            badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 font-black',
            dotColor: 'bg-rose-500 animate-ping',
            label: '🔴 >60m',
        };
    }
};

