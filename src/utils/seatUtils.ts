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
