import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { ArrowRightLeft, MoveRight, AlertCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';

interface TableMoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFromTable?: string;
  fromTableId?: string;
  onMoveSuccess?: () => void;
}

export const TableMoveDialog: React.FC<TableMoveDialogProps> = ({
  open,
  onOpenChange,
  defaultFromTable,
  fromTableId,
  onMoveSuccess
}) => {
  const { adminProfileId } = useAuth();
  const { operatingBranchId } = useBranch();

  const [activeTablesList, setActiveTablesList] = useState<any[]>([]);
  const [allConfiguredTables, setAllConfiguredTables] = useState<any[]>([]);
  const [fromTable, setFromTable] = useState<string>('');
  const [toTable, setToTable] = useState<string>('');
  const [fromSeat, setFromSeat] = useState<string>('all');
  const [toSeat, setToSeat] = useState<string>('auto');
  const [availableSeats, setAvailableSeats] = useState<string[]>([]);
  const [moveAll, setMoveAll] = useState<boolean>(true);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [showMergeConfirm, setShowMergeConfirm] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [moving, setMoving] = useState<boolean>(false);

  // Load active occupied tables & configured table layout
  useEffect(() => {
    if (!open || !adminProfileId) return;

    setMoveAll(true);
    setFromSeat('all');
    setToSeat('auto');
    setShowMergeConfirm(false);

    const loadData = async () => {
      setLoading(true);
      try {
        // Fetch all configured tables first so we can resolve IDs and statuses
        let tablesQuery = (supabase as any)
          .from('tables')
          .select('id, table_number, table_name, capacity, status')
          .eq('admin_id', adminProfileId)
          .eq('is_active', true)
          .order('table_number', { ascending: true });
        if (operatingBranchId) {
          tablesQuery = tablesQuery.eq('branch_id', operatingBranchId);
        }
        const { data: tablesData } = await tablesQuery;

        // Fetch active unbilled table orders
        let ordersQuery = (supabase as any)
          .from('table_orders')
          .select('id, order_number, table_number, seat_id, seat_label, items, total_amount, status, created_at')
          .eq('admin_id', adminProfileId)
          .eq('is_billed', false)
          .in('status', ['pending', 'preparing', 'ready', 'served']);
        if (operatingBranchId) {
          ordersQuery = ordersQuery.eq('branch_id', operatingBranchId);
        }
        const { data: activeOrders } = await ordersQuery;

        // Group active orders by table number
        const tableMap: Record<string, { table_number: string; orders: any[]; seats: Set<string>; total: number }> = {};
        (activeOrders || []).forEach((o: any) => {
          const tNo = String(o.table_number);
          if (!tableMap[tNo]) {
            tableMap[tNo] = { table_number: tNo, orders: [], seats: new Set(), total: 0 };
          }
          tableMap[tNo].orders.push(o);
          tableMap[tNo].total += Number(o.total_amount || 0);
          const seatVal = o.seat_id || o.seat_label;
          if (seatVal) tableMap[tNo].seats.add(String(seatVal));
        });

        // Include tables marked occupied even if they currently have 0 open orders
        (tablesData || []).forEach((t: any) => {
          const tNo = String(t.table_number);
          if (t.status === 'occupied' && !tableMap[tNo]) {
            tableMap[tNo] = { table_number: tNo, orders: [], seats: new Set(), total: 0 };
          }
        });

        const activeList = Object.values(tableMap).sort((a, b) =>
          a.table_number.localeCompare(b.table_number, undefined, { numeric: true })
        );
        setActiveTablesList(activeList);

        const configured = (tablesData || [])
          .map((t: any) => ({
            ...t,
            is_occupied: t.status === 'occupied' || Boolean(tableMap[String(t.table_number)]),
          }))
          .sort((a: any, b: any) =>
            String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true })
          );
        setAllConfiguredTables(configured);

        const resolvedFromTable =
          (fromTableId && configured.find((t: any) => t.id === fromTableId)?.table_number) ||
          defaultFromTable;

        let chosenFrom = '';
        if (resolvedFromTable && tableMap[resolvedFromTable]) {
          chosenFrom = resolvedFromTable;
        } else if (activeList.length > 0) {
          chosenFrom = activeList[0].table_number;
        }
        setFromTable(chosenFrom);

        // Default to-table (first available table not equal to chosenFrom)
        const firstAvailable = configured.find((t: any) => t.table_number !== chosenFrom && !t.is_occupied);
        if (firstAvailable) {
          setToTable(firstAvailable.table_number);
        } else if (configured.length > 0) {
          const alt = configured.find((t: any) => t.table_number !== chosenFrom);
          setToTable(alt ? alt.table_number : '');
        }
      } catch (err) {
        console.error('Error loading table move data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [open, operatingBranchId, adminProfileId, defaultFromTable, fromTableId]);

  // Update available seats & default selected orders for source table
  useEffect(() => {
    if (!fromTable) return;
    const selectedObj = activeTablesList.find(t => t.table_number === fromTable);
    if (selectedObj && selectedObj.seats.size > 0) {
      setAvailableSeats(Array.from(selectedObj.seats));
    } else {
      setAvailableSeats([]);
      setFromSeat('all');
    }
    setSelectedOrderIds((selectedObj?.orders || []).map((o: any) => o.id));
    setShowMergeConfirm(false);
  }, [fromTable, activeTablesList]);

  useEffect(() => {
    setShowMergeConfirm(false);
  }, [toTable, moveAll, fromSeat]);

  const selectedSourceObj = useMemo(
    () => activeTablesList.find(t => t.table_number === fromTable),
    [activeTablesList, fromTable]
  );

  const selectedDestObj = useMemo(
    () => allConfiguredTables.find(t => t.table_number === toTable),
    [allConfiguredTables, toTable]
  );

  const isDestinationOccupied = Boolean(
    selectedDestObj?.is_occupied ||
    selectedDestObj?.status === 'occupied' ||
    activeTablesList.some(t => t.table_number === toTable)
  );

  const ordersToMove = useMemo(() => {
    const allOrders = selectedSourceObj?.orders || [];
    if (moveAll) {
      if (fromSeat === 'all') return allOrders;
      return allOrders.filter((o: any) => (o.seat_id || o.seat_label) === fromSeat);
    }
    return allOrders.filter((o: any) => selectedOrderIds.includes(o.id));
  }, [selectedSourceObj, moveAll, fromSeat, selectedOrderIds]);

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const performTableMove = async () => {
    if (!adminProfileId) return;
    setMoving(true);
    try {
      const targetOrderIds = ordersToMove.map((o: any) => o.id);
      const sourceHasOrders = (selectedSourceObj?.orders?.length || 0) > 0;

      if (sourceHasOrders && targetOrderIds.length === 0) {
        toast.error('Please select at least one order to move.');
        setMoving(false);
        return;
      }

      if (targetOrderIds.length > 0) {
        const updatePayload: Record<string, any> = {
          table_number: toTable,
          updated_at: new Date().toISOString(),
        };
        if (toSeat !== 'auto') {
          updatePayload.seat_id = toSeat;
          updatePayload.seat_label = toSeat;
        }

        const { error: updateErr } = await (supabase as any)
          .from('table_orders')
          .update(updatePayload)
          .in('id', targetOrderIds);

        if (updateErr) throw updateErr;
      }

      // Check if source table has any remaining active unbilled orders
      let leftoverQuery = (supabase as any)
        .from('table_orders')
        .select('id')
        .eq('admin_id', adminProfileId)
        .eq('table_number', fromTable)
        .eq('is_billed', false)
        .in('status', ['pending', 'preparing', 'ready', 'served']);
      if (operatingBranchId) {
        leftoverQuery = leftoverQuery.eq('branch_id', operatingBranchId);
      }
      const { data: sourceLeftovers } = await leftoverQuery;

      const sourceTableRecord = allConfiguredTables.find(t => String(t.table_number) === String(fromTable));
      const destTableRecord = allConfiguredTables.find(t => String(t.table_number) === String(toTable));

      if (!sourceLeftovers || sourceLeftovers.length === 0) {
        let srcUpdate = (supabase as any)
          .from('tables')
          .update({ status: 'available' })
          .eq('admin_id', adminProfileId)
          .eq('table_number', fromTable);
        if (operatingBranchId) srcUpdate = srcUpdate.eq('branch_id', operatingBranchId);
        await srcUpdate;
      }

      let dstUpdate = (supabase as any)
        .from('tables')
        .update({ status: 'occupied' })
        .eq('admin_id', adminProfileId)
        .eq('table_number', toTable);
      if (operatingBranchId) dstUpdate = dstUpdate.eq('branch_id', operatingBranchId);
      await dstUpdate;

      // Best-effort update of pending service requests
      try {
        let srQuery = (supabase as any)
          .from('service_requests')
          .update({ table_number: toTable })
          .eq('table_number', fromTable)
          .eq('status', 'pending');
        if (operatingBranchId) srQuery = srQuery.eq('branch_id', operatingBranchId);
        await srQuery;
      } catch {
        // Non-fatal
      }

      const resolvedFromId = sourceTableRecord?.id || fromTable;
      const resolvedToId = destTableRecord?.id || toTable;

      window.dispatchEvent(new CustomEvent('table-status-changed', {
        detail: { from: resolvedFromId, to: resolvedToId, fromTable, toTable }
      }));
      window.dispatchEvent(new CustomEvent('table-moved', {
        detail: {
          fromTable,
          toTable,
          fromSeat: fromSeat === 'all' ? null : fromSeat,
          toSeat: toSeat === 'auto' ? null : toSeat,
          orderIds: targetOrderIds
        }
      }));
      window.dispatchEvent(new Event('bills-updated'));
      window.dispatchEvent(new Event('orders-updated'));

      toast.success(`Orders moved from Table ${fromTable} to Table ${toTable} ✓`);
      setShowMergeConfirm(false);
      onOpenChange(false);
      if (onMoveSuccess) onMoveSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to move table.');
    } finally {
      setMoving(false);
    }
  };

  const handleExecuteMove = async () => {
    if (!fromTable || !toTable) {
      toast.error('Please select both source and destination tables.');
      return;
    }
    if (fromTable === toTable && (toSeat === 'auto' || (moveAll && fromSeat === 'all') || fromSeat === toSeat)) {
      toast.error('Source and destination tables must be different.');
      return;
    }
    if ((selectedSourceObj?.orders?.length || 0) > 0 && ordersToMove.length === 0) {
      toast.error('Please select at least one order to move.');
      return;
    }

    if (isDestinationOccupied && !showMergeConfirm) {
      setShowMergeConfirm(true);
      return;
    }

    await performTableMove();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-background text-foreground border-border shadow-xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-extrabold">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            Table & Seat Transfer
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Move guest orders from one table/seat to another. Updates Kitchen KDS, Waiter companion, and billing instantly.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading active tables...</div>
        ) : activeTablesList.length === 0 ? (
          <div className="py-6 text-center space-y-2">
            <AlertCircle className="w-10 h-10 mx-auto text-amber-500" />
            <p className="text-sm font-semibold">No Active Occupied Tables</p>
            <p className="text-xs text-muted-foreground">There are currently no active table orders to transfer.</p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Visual Transfer Pathway Banner */}
            <div className="p-3 rounded-xl bg-gradient-to-r from-primary/10 via-muted to-emerald-500/10 border border-border flex items-center justify-between">
              <div className="text-center">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase block">From Source</span>
                <span className="text-lg font-black text-primary">T{fromTable || '?'}</span>
                {moveAll && fromSeat !== 'all' && <span className="text-[11px] font-bold block text-muted-foreground">{fromSeat}</span>}
              </div>

              <MoveRight className="w-6 h-6 text-primary animate-pulse" />

              <div className="text-center">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase block">To Destination</span>
                <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">T{toTable || '?'}</span>
                {toSeat !== 'auto' && <span className="text-[11px] font-bold block text-muted-foreground">{toSeat}</span>}
              </div>
            </div>

            {/* Source Table Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">1. Select Source Table & Seat</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Select value={fromTable} onValueChange={setFromTable}>
                    <SelectTrigger className="h-10 text-sm font-semibold">
                      <SelectValue placeholder="Select Table" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel className="text-xs font-bold uppercase text-muted-foreground">Active Occupied Tables</SelectLabel>
                        {activeTablesList.map(t => (
                          <SelectItem key={t.table_number} value={t.table_number}>
                            Table T{t.table_number} ({t.orders.length} orders · ₹{Math.round(t.total)})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <Select value={fromSeat} onValueChange={setFromSeat} disabled={!moveAll}>
                  <SelectTrigger className="h-10 text-xs font-medium">
                    <SelectValue placeholder="Seat" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Seats</SelectItem>
                    {availableSeats.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Destination Table Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">2. Select Destination Table & Seat</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Select value={toTable} onValueChange={setToTable}>
                    <SelectTrigger className="h-10 text-sm font-semibold border-emerald-500/50">
                      <SelectValue placeholder="Select Destination Table" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[240px]">
                      <SelectGroup>
                        <SelectLabel className="text-xs font-bold uppercase text-muted-foreground">All Configured Tables (A-Z / 1-100)</SelectLabel>
                        {allConfiguredTables.map(t => {
                          const isSelf = t.table_number === fromTable;
                          return (
                            <SelectItem key={t.table_number} value={t.table_number} disabled={isSelf}>
                              <div className="flex items-center justify-between w-full gap-2">
                                <span>Table T{t.table_number} {t.table_name ? `(${t.table_name})` : ''}</span>
                                {t.is_occupied ? (
                                  <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-amber-100 text-amber-800">Occupied</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 bg-emerald-50 text-emerald-700 border-emerald-200">Vacant</Badge>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <Select value={toSeat} onValueChange={setToSeat}>
                  <SelectTrigger className="h-10 text-xs font-medium">
                    <SelectValue placeholder="Target Seat" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto / Main</SelectItem>
                    <SelectItem value="Seat 1">Seat 1</SelectItem>
                    <SelectItem value="Seat 2">Seat 2</SelectItem>
                    <SelectItem value="Seat 3">Seat 3</SelectItem>
                    <SelectItem value="Seat 4">Seat 4</SelectItem>
                    <SelectItem value="Seat 5">Seat 5</SelectItem>
                    <SelectItem value="Seat 6">Seat 6</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Move All vs Select Items/Orders Toggle */}
            {selectedSourceObj && selectedSourceObj.orders.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted border border-border">
                  <button
                    type="button"
                    onClick={() => setMoveAll(true)}
                    className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-colors ${
                      moveAll
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Move all orders
                  </button>
                  <button
                    type="button"
                    onClick={() => setMoveAll(false)}
                    className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-colors ${
                      !moveAll
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Select items to move
                  </button>
                </div>

                {!moveAll && (
                  <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 rounded-xl border border-border bg-muted/30">
                    {selectedSourceObj.orders.map((order: any) => {
                      const checked = selectedOrderIds.includes(order.id);
                      const itemsSummary = Array.isArray(order.items)
                        ? order.items.map((it: any) => `${it.quantity ?? 1}× ${it.name}`).join(', ')
                        : '';
                      return (
                        <label
                          key={order.id}
                          className="flex items-start gap-2.5 p-2 rounded-lg bg-background border border-border/70 cursor-pointer hover:border-primary/40 text-xs"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleOrderSelection(order.id)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 font-semibold">
                              <span>
                                Order #{order.order_number}
                                {(order.seat_label || order.seat_id) ? ` · ${order.seat_label || order.seat_id}` : ''}
                              </span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                ₹{Math.round(Number(order.total_amount || 0))}
                              </span>
                            </div>
                            {itemsSummary && (
                              <p className="text-[11px] text-muted-foreground truncate">{itemsSummary}</p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Transfer Details Card */}
            {selectedSourceObj && (
              <div className="p-3 rounded-xl bg-muted/60 text-xs space-y-1.5 border border-border">
                <div className="flex justify-between font-semibold">
                  <span>Moving Orders:</span>
                  <span className="font-bold text-primary">{ordersToMove.length} Active Orders</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Transfer Bill Value:</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400">
                    ₹{Math.round(ordersToMove.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0))}
                  </span>
                </div>
              </div>
            )}

            {/* Destination Occupied Merge Warning */}
            {showMergeConfirm && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 space-y-2">
                <div className="flex items-start gap-2 text-amber-800 dark:text-amber-200 text-xs font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>Table {toTable} is currently occupied. Moving will merge orders.</span>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={moving}
                    onClick={() => setShowMergeConfirm(false)}
                    className="h-7 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={moving}
                    onClick={performTableMove}
                    className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold"
                  >
                    {moving ? 'Merging...' : 'Confirm Merge'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={moving}>
            Cancel
          </Button>
          {!showMergeConfirm && (
            <Button
              onClick={handleExecuteMove}
              disabled={moving || activeTablesList.length === 0 || !toTable}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 shadow-md"
            >
              {moving ? 'Transferring...' : 'Confirm Table & Seat Move'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
