/**
 * ZenPOS Table & Seat Transfer Utility
 * 
 * Enables moving active guest orders seat-by-seat or table-by-table.
 * Automatically updates database order records, table occupancy statuses,
 * kitchen KDS tickets, and waiter companion apps in real time.
 */

import { supabase } from '@/integrations/supabase/client';

export interface MoveTableParams {
  fromTable: string;
  toTable: string;
  fromSeat?: string | null; // e.g. "Seat 1" or null for whole table
  toSeat?: string | null;   // e.g. "Seat 2" or null
  adminId: string;
  branchId: string;
}

export async function executeTableMove(params: MoveTableParams): Promise<{ success: boolean; message: string }> {
  const { fromTable, toTable, fromSeat, toSeat, adminId, branchId } = params;

  if (fromTable === toTable && (fromSeat === toSeat || (!fromSeat && !toSeat))) {
    return { success: false, message: 'Source and destination table/seat are identical.' };
  }

  try {
    // 1. Query active orders at source table
    let query = (supabase as any)
      .from('orders')
      .select('id, table_number, seat_id, order_number, status')
      .eq('admin_id', adminId)
      .eq('branch_id', branchId)
      .eq('table_number', fromTable)
      .in('status', ['pending', 'preparing', 'ready', 'served']);

    if (fromSeat) {
      query = query.eq('seat_id', fromSeat);
    }

    const { data: activeOrders, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    if (!activeOrders || activeOrders.length === 0) {
      return { success: false, message: `No active orders found at Table T${fromTable}${fromSeat ? ` (${fromSeat})` : ''}.` };
    }

    const orderIds = activeOrders.map((o: any) => o.id);

    // 2. Update orders to target table & seat
    const updatePayload: any = { 
      table_number: toTable,
      updated_at: new Date().toISOString()
    };
    if (toSeat !== undefined) {
      updatePayload.seat_id = toSeat;
    }

    const { error: updateErr } = await (supabase as any)
      .from('orders')
      .update(updatePayload)
      .in('id', orderIds);

    if (updateErr) throw updateErr;

    // 3. Update table statuses in `tables` table
    // Check if source table has any leftover active orders
    const { data: sourceLeftovers } = await (supabase as any)
      .from('orders')
      .select('id')
      .eq('admin_id', adminId)
      .eq('branch_id', branchId)
      .eq('table_number', fromTable)
      .in('status', ['pending', 'preparing', 'ready', 'served']);

    if (!sourceLeftovers || sourceLeftovers.length === 0) {
      await (supabase as any)
        .from('tables')
        .update({ status: 'available', is_occupied: false })
        .eq('branch_id', branchId)
        .eq('table_number', fromTable);
    }

    // Mark target table as occupied
    await (supabase as any)
      .from('tables')
      .update({ status: 'occupied', is_occupied: true })
      .eq('branch_id', branchId)
      .eq('table_number', toTable);

    // 4. Move active waiter call requests to target table
    await (supabase as any)
      .from('service_requests')
      .update({ table_number: toTable })
      .eq('branch_id', branchId)
      .eq('table_number', fromTable)
      .eq('status', 'pending');

    // 5. Broadcast real-time events across POS, KDS, Waiter Companion & Public Menu
    window.dispatchEvent(new CustomEvent('table-moved', {
      detail: { fromTable, toTable, fromSeat, toSeat, orderIds }
    }));
    window.dispatchEvent(new Event('bills-updated'));
    window.dispatchEvent(new Event('orders-updated'));

    const seatStr = fromSeat ? ` (${fromSeat}${toSeat ? ` ➔ ${toSeat}` : ''})` : '';
    return {
      success: true,
      message: `Table T${fromTable}${seatStr} moved to Table T${toTable} successfully!`
    };
  } catch (err: any) {
    console.error('Error executing table move:', err);
    return { success: false, message: err.message || 'Failed to transfer table orders.' };
  }
}
