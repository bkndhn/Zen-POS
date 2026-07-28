import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { ArrowRightLeft, MoveRight, Users, Utensils, CheckCircle2, AlertCircle } from 'lucide-react';
import { executeTableMove } from '@/utils/tableMoveUtils';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';

interface TableMoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFromTable?: string;
  onMoveSuccess?: () => void;
}

export const TableMoveDialog: React.FC<TableMoveDialogProps> = ({
  open,
  onOpenChange,
  defaultFromTable,
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
  const [loading, setLoading] = useState<boolean>(false);
  const [moving, setMoving] = useState<boolean>(false);

  // Load active occupied tables & configured table layout
  useEffect(() => {
    if (!open || !operatingBranchId || !adminProfileId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Fetch active occupied tables with order details
        const { data: activeOrders } = await (supabase as any)
          .from('orders')
          .select('id, table_number, seat_id, total_amount, status, created_at')
          .eq('admin_id', adminProfileId)
          .eq('branch_id', operatingBranchId)
          .in('status', ['pending', 'preparing', 'ready', 'served']);

        // Group by table number
        const tableMap: Record<string, { table_number: string; orders: any[]; seats: Set<string>; total: number }> = {};
        (activeOrders || []).forEach((o: any) => {
          const tNo = String(o.table_number);
          if (!tableMap[tNo]) {
            tableMap[tNo] = { table_number: tNo, orders: [], seats: new Set(), total: 0 };
          }
          tableMap[tNo].orders.push(o);
          tableMap[tNo].total += Number(o.total_amount || 0);
          if (o.seat_id) tableMap[tNo].seats.add(o.seat_id);
        });

        const activeList = Object.values(tableMap).sort((a, b) => a.table_number.localeCompare(b.table_number, undefined, { numeric: true }));
        setActiveTablesList(activeList);

        // Set default selected source table
        if (defaultFromTable && tableMap[defaultFromTable]) {
          setFromTable(defaultFromTable);
        } else if (activeList.length > 0) {
          setFromTable(activeList[0].table_number);
        }

        // Fetch all configured tables for destination picker
        const { data: tablesData } = await (supabase as any)
          .from('tables')
          .select('id, table_number, table_name, capacity, status, is_occupied')
          .eq('branch_id', operatingBranchId)
          .order('table_number', { ascending: true });

        const configured = (tablesData || []).sort((a: any, b: any) => 
          String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true })
        );
        setAllConfiguredTables(configured);

        // Default to-table (first available table not equal to fromTable)
        const firstAvailable = configured.find((t: any) => t.table_number !== defaultFromTable && !t.is_occupied);
        if (firstAvailable) {
          setToTable(firstAvailable.table_number);
        } else if (configured.length > 0) {
          const alt = configured.find((t: any) => t.table_number !== defaultFromTable);
          if (alt) setToTable(alt.table_number);
        }
      } catch (err) {
        console.error('Error loading table move data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [open, operatingBranchId, adminProfileId, defaultFromTable]);

  // Update available seats for source table
  useEffect(() => {
    if (!fromTable) return;
    const selectedObj = activeTablesList.find(t => t.table_number === fromTable);
    if (selectedObj && selectedObj.seats.size > 0) {
      setAvailableSeats(Array.from(selectedObj.seats));
    } else {
      setAvailableSeats([]);
      setFromSeat('all');
    }
  }, [fromTable, activeTablesList]);

  const handleExecuteMove = async () => {
    if (!fromTable || !toTable) {
      toast({ title: 'Invalid Selection', description: 'Please select both source and destination tables.', variant: 'destructive' });
      return;
    }
    if (fromTable === toTable && (fromSeat === 'all' || fromSeat === toSeat)) {
      toast({ title: 'Invalid Transfer', description: 'Source and destination tables must be different.', variant: 'destructive' });
      return;
    }

    setMoving(true);
    try {
      const res = await executeTableMove({
        fromTable,
        toTable,
        fromSeat: fromSeat === 'all' ? null : fromSeat,
        toSeat: toSeat === 'auto' ? null : toSeat,
        adminId: adminProfileId!,
        branchId: operatingBranchId!,
      });

      if (res.success) {
        toast({
          title: '🔄 Table Moved Successfully',
          description: res.message,
        });
        onOpenChange(false);
        if (onMoveSuccess) onMoveSuccess();
      } else {
        toast({
          title: 'Transfer Failed',
          description: res.message,
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to move table.',
        variant: 'destructive',
      });
    } finally {
      setMoving(false);
    }
  };

  const selectedSourceObj = activeTablesList.find(t => t.table_number === fromTable);

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
                {fromSeat !== 'all' && <span className="text-[11px] font-bold block text-muted-foreground">{fromSeat}</span>}
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

                <Select value={fromSeat} onValueChange={setFromSeat}>
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

            {/* Transfer Details Card */}
            {selectedSourceObj && (
              <div className="p-3 rounded-xl bg-muted/60 text-xs space-y-1.5 border border-border">
                <div className="flex justify-between font-semibold">
                  <span>Moving Orders:</span>
                  <span className="font-bold text-primary">{selectedSourceObj.orders.length} Active Orders</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Transfer Bill Value:</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400">₹{Math.round(selectedSourceObj.total)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={moving}>
            Cancel
          </Button>
          <Button 
            onClick={handleExecuteMove} 
            disabled={moving || activeTablesList.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 shadow-md"
          >
            {moving ? 'Transferring...' : 'Confirm Table & Seat Move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
