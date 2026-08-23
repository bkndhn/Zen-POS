import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ServiceHeader, ServiceLoading } from '@/components/service/ServiceUI';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { LayoutGrid, Plus, Edit, Pencil, Save, Trash2, Users, Utensils, Clock, CheckCircle2, Sparkles, ShoppingCart, Receipt, ChefHat, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { useBranch } from '@/contexts/BranchContext';
import { AllBranchesReadOnlyBanner } from '@/components/AllBranchesReadOnlyBanner';
import { Switch } from '@/components/ui/switch';
import { getOccupancyTimerInfo } from '@/utils/seatUtils';
import { reservationManager, TableReservation } from '@/utils/reservationManager';

interface Table {
  id: string;
  table_number: string;
  table_name: string | null;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning';
  current_bill_id: string | null;
  is_active: boolean;
  display_order: number;
  has_seats?: boolean;
  seat_count?: number | null;
  seat_configuration?: any;
  seat_order_mode?: string | null;

  x_pos?: number | null;
  y_pos?: number | null;
  width?: number | null;
  height?: number | null;
  shape?: string | null;
  floor_name?: string | null;
}

// Display status config — 6 visual states computed from DB status + order data
type DisplayStatus = 'available' | 'occupied' | 'food_served' | 'bill_printed' | 'needs_cleaning' | 'reserved';

const displayStatusConfig: Record<DisplayStatus, { label: string; color: string; borderColor: string; ringColor: string; icon: any }> = {
  available:      { label: 'Available',      color: 'bg-emerald-500',  borderColor: 'border-emerald-400', ringColor: 'ring-emerald-200',  icon: CheckCircle2 },
  occupied:       { label: 'Ordered',        color: 'bg-amber-500',    borderColor: 'border-amber-400',   ringColor: 'ring-amber-200',    icon: Utensils },
  food_served:    { label: 'Food Served',    color: 'bg-sky-500',      borderColor: 'border-sky-400',     ringColor: 'ring-sky-200',      icon: ChefHat },
  bill_printed:   { label: 'Bill Printed',   color: 'bg-purple-500',   borderColor: 'border-purple-400',  ringColor: 'ring-purple-200',   icon: Receipt },
  needs_cleaning: { label: 'Needs Cleaning', color: 'bg-rose-500',     borderColor: 'border-rose-400',    ringColor: 'ring-rose-200',     icon: Sparkles },
  reserved:       { label: 'Reserved',       color: 'bg-yellow-500',   borderColor: 'border-yellow-400',  ringColor: 'ring-yellow-200',   icon: Clock },
};

// Keep original statusConfig for the DB status dropdown
const statusConfig = {
  available: { label: 'Available', color: 'bg-green-500', icon: CheckCircle2 },
  occupied: { label: 'Occupied', color: 'bg-red-500', icon: Utensils },
  reserved: { label: 'Reserved', color: 'bg-yellow-500', icon: Clock },
  cleaning: { label: 'Cleaning', color: 'bg-blue-500', icon: Sparkles }
};

/** Format elapsed milliseconds to a human-readable duration string */
function formatElapsed(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Return a Tailwind text-color class based on elapsed minutes */
function timerColor(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes >= 30) return 'text-red-600 font-bold';
  if (totalMinutes >= 15) return 'text-orange-500 font-semibold';
  return 'text-green-600';
}

const TableManagement: React.FC = () => {
  const { profile , adminProfileId } = useAuth();
  const adminId = adminProfileId;
  const { branchFilterId, isAllBranchesView } = useBranchScopedQuery(() => { fetchTables(); fetchTableOrderCounts(); });
  const { operatingBranchId } = useBranch();
  const navigate = useNavigate();
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<string | null>(null);

  // Active table orders count per table
  const [tableOrderCounts, setTableOrderCounts] = useState<Record<string, number>>({});
  const [tableSeatOrderCounts, setTableSeatOrderCounts] = useState<Record<string, Record<string, number>>>({});

  // Duration timer state
  const [orderTimestamps, setOrderTimestamps] = useState<Record<string, string>>({}); // table_number -> earliest order created_at
  const [orderStatuses, setOrderStatuses] = useState<Record<string, string[]>>({}); // table_number -> list of order statuses
  // Current time tick — updated every 60s for live timers
  const [currentTime, setCurrentTime] = useState(() => new Date());

  // Form state
  const [tableNumber, setTableNumber] = useState('');
  const [tableName, setTableName] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [hasSeats, setHasSeats] = useState(false);
  const [seatCount, setSeatCount] = useState('2');
  const [seatLabels, setSeatLabels] = useState<string[]>([]);
  // 'table' = whole-table orders only, 'seat' = seat-wise only, 'both' = allow either
  const [seatOrderMode, setSeatOrderMode] = useState<'table' | 'seat' | 'both'>('both');

  const [coverCountInput, setCoverCountInput] = useState('4');

  // Table Pre-Booking / Reservation states
  const [reservations, setReservations] = useState<TableReservation[]>([]);
  const [reservationDialogOpen, setReservationDialogOpen] = useState(false);
  const [editingResId, setEditingResId] = useState<string | null>(null);
  const [resTableNumber, setResTableNumber] = useState('');
  const [resCustomerName, setResCustomerName] = useState('');
  const [resCustomerPhone, setResCustomerPhone] = useState('');
  const [resGuestCount, setResGuestCount] = useState('2');
  const [resDate, setResDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [resTime, setResTime] = useState('19:30');
  const [resNotes, setResNotes] = useState('');
  const [resAdvance, setResAdvance] = useState('');

  const fetchReservations = useCallback(async () => {
    const list = await reservationManager.fetchReservations(adminId, operatingBranchId);
    setReservations(list);
  }, [adminId, operatingBranchId]);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  const resetReservationForm = () => {
    setEditingResId(null);
    setResTableNumber('');
    setResCustomerName('');
    setResCustomerPhone('');
    setResGuestCount('2');
    setResDate(new Date().toISOString().split('T')[0]);
    setResTime('19:30');
    setResNotes('');
    setResAdvance('');
  };

  const handleEditReservation = (r: TableReservation) => {
    setEditingResId(r.id);
    setResTableNumber(r.table_number);
    setResCustomerName(r.customer_name);
    setResCustomerPhone(r.customer_phone);
    setResGuestCount(String(r.guest_count));
    setResDate(r.reservation_date);
    setResTime(r.reservation_time);
    setResNotes(r.notes || '');
    setResAdvance(r.advance_amount ? String(r.advance_amount) : '');
  };

  const handleDeleteReservation = async (id: string) => {
    if (confirm('Are you sure you want to delete this reservation?')) {
      const success = await reservationManager.deleteReservation(id);
      if (success) {
        toast({ title: "Deleted", description: "Reservation deleted successfully." });
        fetchReservations();
      } else {
        toast({ title: "Error", description: "Could not delete reservation.", variant: "destructive" });
      }
    }
  };

  const handleSaveReservation = async () => {
    if (!resTableNumber || !resCustomerName) {
      toast({ title: "Required Fields", description: "Please enter table number and customer name.", variant: "destructive" });
      return;
    }
    
    const resData = {
      table_number: resTableNumber,
      customer_name: resCustomerName,
      customer_phone: resCustomerPhone,
      guest_count: parseInt(resGuestCount, 10) || 2,
      reservation_date: resDate,
      reservation_time: resTime,
      notes: resNotes,
      advance_amount: parseFloat(resAdvance) || 0
    };

    if (editingResId) {
      const ok = await reservationManager.updateReservation(editingResId, resData);
      if (ok) {
        toast({ title: "Updated", description: "Reservation updated successfully." });
      } else {
        toast({ title: "Error", description: "Failed to update reservation.", variant: "destructive" });
      }
    } else {
      await reservationManager.addReservation(resData, adminId, operatingBranchId);
      toast({ title: "⭐ Reservation Created", description: `Table ${resTableNumber} booked for ${resCustomerName} at ${resTime}` });
    }
    
    resetReservationForm();
    fetchReservations();
  };

  const handleSeatReservedGuests = async (table: Table, res: TableReservation) => {
    await reservationManager.updateStatus(res.id, 'seated');
    await handleStatusChange(table.id, 'occupied');
    toast({ title: "🎉 Guests Seated", description: `${res.customer_name} seated at Table ${table.table_number}` });
    fetchReservations();
  };

  // Section/Floor Filter & Table Merge states
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergePrimaryId, setMergePrimaryId] = useState<string>('');
  const [mergeSecondaryIds, setMergeSecondaryIds] = useState<string[]>([]);
  const [mergedGroups, setMergedGroups] = useState<Record<string, string[]>>({}); // Primary Table ID -> Merged Table IDs
  const [tableCovers, setTableCovers] = useState<Record<string, number>>({}); // Table ID -> Cover count

  // Floor plan visual editor states
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [shape, setShape] = useState('rectangle');
  const [width, setWidth] = useState('100');
  const [height, setHeight] = useState('100');
  const [xPos, setXPos] = useState('50');
  const [yPos, setYPos] = useState('50');
  const [floorName, setFloorName] = useState('Main Floor');

  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent, table: Table) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('select') || (e.target as HTMLElement).closest('a')) {
      return;
    }
    e.preventDefault();
    setDraggingTableId(table.id);
    const clientX = e.clientX;
    const clientY = e.clientY;
    const x = table.x_pos !== null && table.x_pos !== undefined ? table.x_pos : 50;
    const y = table.y_pos !== null && table.y_pos !== undefined ? table.y_pos : 50;
    setDragOffset({
      x: clientX - x,
      y: clientY - y
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent, tableId: string) => {
    if (draggingTableId !== tableId) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    let newX = clientX - dragOffset.x;
    let newY = clientY - dragOffset.y;
    
    newX = Math.max(0, Math.min(newX, 900));
    newY = Math.max(0, Math.min(newY, 480));
    
    newX = Math.round(newX / 10) * 10;
    newY = Math.round(newY / 10) * 10;

    setTables(prev => prev.map(t => t.id === tableId ? { ...t, x_pos: newX, y_pos: newY } : t));
  };

  const handlePointerUp = async (e: React.PointerEvent, table: Table) => {
    if (draggingTableId !== table.id) return;
    setDraggingTableId(null);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    try {
      const { error } = await supabase
        .from('tables')
        .update({
          x_pos: table.x_pos || 50,
          y_pos: table.y_pos || 50
        })
        .eq('id', table.id);
      if (error) throw error;
    } catch (err) {
      console.error('Failed to save table position:', err);
    }
  };

  const fetchTables = useCallback(async () => {
    if (!adminId) return;
    let loadedFromCache = false;
    try {
      const { offlineManager } = await import('@/utils/offlineManager');
      const cachedTables = await offlineManager.getCachedTables(adminId, operatingBranchId);
      if (cachedTables && cachedTables.length > 0) {
        setTables(cachedTables);
        loadedFromCache = true;
        setLoading(false);
      }

      let query: any = (supabase as any)
        .from('tables')
        .select('*')
        .eq('admin_id', adminId)
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (branchFilterId) query = query.eq('branch_id', branchFilterId);
      const { data, error } = await query;

      if (!error && data) {
        setTables(data || []);
        await offlineManager.cacheTables(data || []);
      }
    } catch (error) {
      console.warn('Error fetching tables from network (offline fallback active):', error);
      if (!loadedFromCache) {
        toast({
          title: "Offline Mode",
          description: "Connect to internet to refresh tables",
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
    }
  }, [adminId, branchFilterId, operatingBranchId]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  // Live timer — update every 60 seconds for duration display
  useEffect(() => {
    const timerId = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timerId);
  }, []);

  // Fetch active table order counts + timestamps + statuses
  const fetchTableOrderCounts = useCallback(async () => {
    if (!adminId) return;
    try {
      const { data, error } = await (supabase as any)
        .from('table_orders')
        .select('table_number, seat_id, created_at, status')
        .eq('admin_id', adminId)
        .in('status', ['pending', 'preparing', 'ready', 'served'])
        .eq('is_billed', false);

      if (!error && data) {
        const counts: Record<string, number> = {};
        const seatCounts: Record<string, Record<string, number>> = {};
        const timestamps: Record<string, string> = {};
        const statuses: Record<string, string[]> = {};
        (data as any[]).forEach((order: any) => {
          counts[order.table_number] = (counts[order.table_number] || 0) + 1;
          if (order.seat_id) {
            if (!seatCounts[order.table_number]) seatCounts[order.table_number] = {};
            seatCounts[order.table_number][order.seat_id] = (seatCounts[order.table_number][order.seat_id] || 0) + 1;
          }
          // Track earliest created_at per table
          if (!timestamps[order.table_number] || order.created_at < timestamps[order.table_number]) {
            timestamps[order.table_number] = order.created_at;
          }
          // Track all order statuses per table
          if (!statuses[order.table_number]) statuses[order.table_number] = [];
          statuses[order.table_number].push(order.status);
        });
        setTableOrderCounts(counts);
        setTableSeatOrderCounts(seatCounts);
        setOrderStatuses(statuses);
        setOrderTimestamps(timestamps);
      }
    } catch (e) {
      console.warn('Error fetching table order counts:', e);
    }
  }, [adminId]);

  /** Compute the display status for a table from its DB status + order data */
  const getDisplayStatus = useCallback((table: Table): DisplayStatus => {
    // Non-occupied DB statuses map directly
    if (table.status === 'available') return 'available';
    if (table.status === 'reserved') return 'reserved';
    if (table.status === 'cleaning') return 'needs_cleaning';

    // DB status is 'occupied' — determine sub-state
    if (table.current_bill_id) return 'bill_printed';
    const statuses = orderStatuses[table.table_number] || [];
    if (statuses.some(s => s === 'ready' || s === 'served')) return 'food_served';
    
    // Check if any orders exist
    const hasOrders = (tableOrderCounts[table.table_number] || 0) > 0;
    if (hasOrders) return 'occupied';
    
    return 'occupied';
  }, [orderStatuses, tableOrderCounts]);

  /** Pre-compute display statuses for all tables (memo'd) */
  const tableDisplayStatuses = useMemo<Record<string, DisplayStatus>>(() => {
    const map: Record<string, DisplayStatus> = {};
    tables.forEach(t => { map[t.id] = getDisplayStatus(t); });
    return map;
  }, [tables, getDisplayStatus]);

  useEffect(() => {
    fetchTableOrderCounts();
    const interval = setInterval(fetchTableOrderCounts, 30000);
    return () => clearInterval(interval);
  }, [fetchTableOrderCounts]);

  // Real-time subscription for table orders + status via shared channel
  useEffect(() => {
    // Listen on the SAME channel that PublicMenu, Kitchen, ServiceArea all broadcast on
    const channel = supabase.channel('table-order-sync', {
      config: { broadcast: { self: true } }
    })
      .on('broadcast', { event: 'new-table-order' }, () => {
        fetchTableOrderCounts();
        fetchTables();
      })
      .on('broadcast', { event: 'table-order-status-update' }, () => {
        fetchTableOrderCounts();
        fetchTables();
      })
      .on('broadcast', { event: 'table-status-updated' }, () => {
        fetchTables();
        fetchTableOrderCounts();
      })
      .subscribe();

    // Postgres changes as reliable backup
    const pgChannel = supabase.channel('table-orders-mgmt-pg')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_orders' }, () => {
        fetchTableOrderCounts();
        fetchTables();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => {
        fetchTables();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(pgChannel);
    };
  }, [fetchTableOrderCounts, fetchTables]);

  const getDefaultSeatLabels = (count: number): string[] => {
    const labels = [];
    for (let i = 0; i < count; i++) {
      labels.push(String.fromCharCode(65 + i)); // A, B, C...
    }
    return labels;
  };

  const handleOpenDialog = (table?: Table) => {
    if (table) {
      setEditingTable(table);
      setTableNumber(table.table_number);
      setTableName(table.table_name || '');
      setCapacity(String(table.capacity));
      setHasSeats(table.has_seats || false);
      setSeatCount(String(table.seat_count || 2));
      setSeatLabels(Array.isArray(table.seat_configuration) ? (table.seat_configuration as string[]) : getDefaultSeatLabels(table.seat_count || 2));
      setSeatOrderMode((table.seat_order_mode as 'table' | 'seat' | 'both') || 'both');

      setShape(table.shape || 'rectangle');
      setWidth(String(table.width || 100));
      setHeight(String(table.height || 100));
      setXPos(String(table.x_pos !== null && table.x_pos !== undefined ? table.x_pos : 50));
      setYPos(String(table.y_pos !== null && table.y_pos !== undefined ? table.y_pos : 50));
      setFloorName(table.floor_name || 'Main Floor');
    } else {
      setEditingTable(null);
      setTableNumber('');
      setTableName('');
      setCapacity('4');
      setHasSeats(false);
      setSeatCount('2');
      setSeatLabels(getDefaultSeatLabels(2));
      setSeatOrderMode('both');

      setShape('rectangle');
      setWidth('100');
      setHeight('100');
      setXPos('50');
      setYPos('50');
      setFloorName('Main Floor');
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!tableNumber.trim()) {
      toast({ title: "Error", description: "Table number is required", variant: "destructive" });
      return;
    }

    try {
      const tableData: any = {
        table_number: tableNumber.trim(),
        table_name: tableName.trim() || null,
        capacity: parseInt(capacity) || 4,
        admin_id: adminProfileId || null,
        branch_id: operatingBranchId || null,
        has_seats: hasSeats,
        seat_count: hasSeats ? parseInt(seatCount) : 0,
        seat_configuration: hasSeats ? seatLabels : [],
        seat_order_mode: hasSeats ? seatOrderMode : 'table',

        shape: shape,
        width: parseInt(width) || 100,
        height: parseInt(height) || 100,
        x_pos: parseInt(xPos) || 50,
        y_pos: parseInt(yPos) || 50,
        floor_name: floorName.trim() || 'Main Floor'
      };

      if (editingTable) {
        const { error } = await (supabase as any)
          .from('tables')
          .update(tableData)
          .eq('id', editingTable.id);

        if (error) throw error;
        toast({ title: "Success", description: "Table updated successfully" });
      } else {
        const { error } = await (supabase as any)
          .from('tables')
          .insert({
            ...tableData,
            display_order: tables.length
          });

        if (error) throw error;
        toast({ title: "Success", description: "Table created successfully" });
      }

      setDialogOpen(false);
      fetchTables();
    } catch (error: any) {
      console.error('Error saving table:', error);
      toast({ title: "Error", description: error.message || "Failed to save table", variant: "destructive" });
    }
  };

  const handleStatusChange = async (tableId: string, newStatus: Table['status']) => {
    try {
      const { error } = await (supabase as any)
        .from('tables')
        .update({ status: newStatus })
        .eq('id', tableId);

      if (error) throw error;

      toast({ title: "Updated", description: `Table status changed to ${newStatus}` });
      fetchTables();
    } catch (error) {
      console.error('Error updating status:', error);
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!tableToDelete) return;

    try {
      const { error } = await (supabase as any)
        .from('tables')
        .update({ is_active: false })
        .eq('id', tableToDelete);

      if (error) throw error;

      toast({ title: "Deleted", description: "Table removed successfully" });
      setDeleteDialogOpen(false);
      setTableToDelete(null);
      fetchTables();
    } catch (error) {
      console.error('Error deleting table:', error);
      toast({ title: "Error", description: "Failed to delete table", variant: "destructive" });
    }
  };

  if (loading) {
    return <ServiceLoading label="Loading tables…" cards={8} />;
  }

  return (
    <div className="min-h-screen p-2 sm:p-4 w-full max-w-full overflow-x-hidden">
      <div className="max-w-6xl mx-auto w-full">
        <AllBranchesReadOnlyBanner message="Switch to a specific branch to add or edit tables." />
        {/* Header */}
        <ServiceHeader
          icon={LayoutGrid}
          title="Table Management"
          subtitle="Manage dine-in tables & seats"
          tone="primary"
          className="mb-4 sm:mb-5"
          actions={
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReservationDialogOpen(true)}
                className="rounded-xl h-8 text-xs font-bold border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-500/20 shrink-0"
              >
                <Clock className="w-3.5 h-3.5 mr-1 text-yellow-600 shrink-0" />
                <span>Pre-Bookings ({reservations.filter(r => r.status === 'confirmed').length})</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMergeDialogOpen(true)}
                className="rounded-xl h-8 text-xs font-semibold shrink-0"
              >
                <Users className="w-3.5 h-3.5 mr-1 text-primary shrink-0" />
                <span className="truncate">Merge / Split</span>
              </Button>
              <Button onClick={() => handleOpenDialog()} size="sm" className="rounded-xl h-8 text-xs shrink-0">
                <Plus className="w-4 h-4 mr-1 shrink-0" />
                <span className="truncate">Add Table</span>
              </Button>
            </div>
          }
        />


        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-2.5 mb-4">
          {(Object.entries(displayStatusConfig) as [DisplayStatus, typeof displayStatusConfig[DisplayStatus]][]).map(([status, config]) => {
            const count = tables.filter(t => tableDisplayStatuses[t.id] === status).length;
            const Icon = config.icon;
            return (
              <div key={status} className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/80 px-2.5 py-2 transition-all duration-200 hover:border-border hover:shadow-md">
                <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px] rounded-r-full", config.color)} />
                <div className="flex items-center gap-2 pl-1.5">
                  <div className={cn("w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm", config.color)}>
                    <Icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base sm:text-lg font-bold leading-none tabular-nums">{count}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground leading-tight truncate">{config.label}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>


        {/* Section Filter & View Mode Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
          {/* Section Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1">
            {['all', 'Main Floor', 'AC Section', 'Terrace', 'Outdoor Garden'].map(sec => (
              <Button
                key={sec}
                size="sm"
                variant={selectedSection === sec ? 'default' : 'outline'}
                onClick={() => setSelectedSection(sec)}
                className="h-8 text-xs rounded-xl shrink-0"
              >
                {sec === 'all' ? 'All Sections' : sec}
              </Button>
            ))}
          </div>

          {/* View Mode Toggle */}
          <div className="flex gap-2 bg-muted/30 p-1.5 rounded-xl border w-full sm:w-auto">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className={cn("h-8 rounded-lg text-xs font-semibold flex-1", viewMode === 'grid' && "bg-background shadow-sm")}
            >
              <LayoutGrid className="w-3.5 h-3.5 mr-1" />
              Grid View
            </Button>
            <Button
              variant={viewMode === 'map' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('map')}
              className={cn("h-8 rounded-lg text-xs font-semibold flex-1", viewMode === 'map' && "bg-background shadow-sm")}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1 text-primary" />
              Floor Map
            </Button>
          </div>
        </div>

        {/* Tables Content */}
        {tables.length === 0 ? (
          <Card className="p-8 text-center">
            <LayoutGrid className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Tables Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Add your first table to get started with table management.</p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Table
            </Button>
          </Card>
        ) : viewMode === 'map' ? (
          <div 
            className="relative w-full h-[580px] border-2 border-border/40 rounded-2xl overflow-hidden bg-slate-100 dark:bg-[#0a0a0c] p-4"
            style={{ 
              backgroundImage: 'radial-gradient(circle, rgba(128,128,128,0.3) 1.5px, transparent 1.5px)', 
              backgroundSize: '24px 24px',
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.05)'
            }}
          >
            {/* Fade mask for grid edges */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 30%, var(--background) 90%)', opacity: 0.8 }} />

            <div className="absolute top-2 left-2 bg-background/80 backdrop-blur border text-[11px] font-semibold px-2 py-1 rounded shadow-sm z-10 text-muted-foreground flex items-center gap-1">
              ✨ <span className="font-bold text-foreground">Tip:</span> Drag tables to arrange layout. Double click to edit details.
            </div>
            
            <div className="relative w-full h-full rounded-xl">
              {tables.map((table) => {
                const dStatus = tableDisplayStatuses[table.id] || 'available';
                const config = displayStatusConfig[dStatus];
                const Icon = config.icon;
                const width = table.width || 100;
                const height = table.height || 100;
                const x = table.x_pos !== null && table.x_pos !== undefined ? table.x_pos : 50;
                const y = table.y_pos !== null && table.y_pos !== undefined ? table.y_pos : 50;
                const isCircle = table.shape === 'circle';
                const isOccupiedState = dStatus === 'occupied' || dStatus === 'food_served';
                
                // Dynamic visual seats
                const renderSeats = () => {
                  const seats = [];
                  const seatSize = 8;
                  const offset = seatSize / 2 + 6; 
                  
                  if (isCircle) {
                    const radius = width / 2;
                    for (let i = 0; i < table.capacity; i++) {
                      const angle = (i * (360 / table.capacity)) * (Math.PI / 180);
                      const sx = radius + (radius + offset) * Math.cos(angle) - (seatSize / 2);
                      const sy = radius + (radius + offset) * Math.sin(angle) - (seatSize / 2);
                      seats.push(
                        <div key={`seat-${i}`} className={`absolute rounded-full shadow-sm bg-muted border border-border/50`} style={{ width: seatSize, height: seatSize, left: sx, top: sy }} />
                      );
                    }
                  } else {
                    const perimeter = 2 * (width + height);
                    const spacing = perimeter / table.capacity;
                    for (let i = 0; i < table.capacity; i++) {
                      let dist = i * spacing;
                      let sx = 0, sy = 0;
                      if (dist <= width) { sx = dist; sy = -offset; }
                      else if (dist <= width + height) { sx = width + offset; sy = dist - width; }
                      else if (dist <= 2 * width + height) { sx = width - (dist - (width + height)); sy = height + offset; }
                      else { sx = -offset; sy = height - (dist - (2 * width + height)); }
                      
                      sx -= seatSize / 2;
                      sy -= seatSize / 2;
                      seats.push(
                        <div key={`seat-${i}`} className={`absolute rounded-full shadow-sm bg-muted border border-border/50`} style={{ width: seatSize, height: seatSize, left: sx, top: sy }} />
                      );
                    }
                  }
                  return seats;
                };

                return (
                  <div
                    key={table.id}
                    style={{
                      position: 'absolute',
                      left: `${x}px`,
                      top: `${y}px`,
                      width: `${width}px`,
                      height: `${height}px`,
                      touchAction: 'none'
                    }}
                    onPointerDown={(e) => handlePointerDown(e, table)}
                    onPointerMove={(e) => handlePointerMove(e, table.id)}
                    onPointerUp={(e) => handlePointerUp(e, table)}
                    onDoubleClick={() => handleOpenDialog(table)}
                    className="z-10 group"
                  >
                    {/* Pulsing aura for active tables */}
                    {isOccupiedState && (
                      <div className={cn("absolute -inset-4 rounded-full opacity-40 blur-xl animate-[pulse_3s_ease-in-out_infinite] pointer-events-none", config.color)} />
                    )}
                    
                    {/* Visual seats */}
                    {renderSeats()}
                    
                    {/* Main Table Node */}
                    <div
                      className={cn(
                        "relative w-full h-full flex flex-col items-center justify-center border shadow-xl transition-all duration-300 cursor-grab select-none p-2 text-center bg-card/90 backdrop-blur-md",
                        isCircle ? "rounded-full" : "rounded-3xl",
                        config.borderColor,
                        draggingTableId === table.id ? "scale-105 z-50 border-primary bg-primary/10 shadow-2xl cursor-grabbing" : "group-hover:-translate-y-1 group-hover:shadow-2xl",
                        dStatus !== 'available' && "ring-4 ring-opacity-50 " + config.ringColor
                      )}
                    >
                      <span className="font-black text-base md:text-xl tracking-tight">T{table.table_number}</span>
                      {table.table_name && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-[80%] font-medium leading-none mt-0.5">{table.table_name}</span>
                      )}
                      
                      <Icon className={cn("w-4 h-4 mt-1.5 opacity-80 text-foreground")} />
                      
                      {/* Reserved Badge */}
                      {reservationManager.getUpcomingForTable(table.table_number, reservations) && (
                        <div className="absolute -top-2 -right-2 bg-yellow-500 text-yellow-950 p-1 rounded-full shadow-lg border border-yellow-300 animate-bounce">
                          <Sparkles className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {tables.map((table) => {
              const dStatus = tableDisplayStatuses[table.id] || 'available';
              const config = displayStatusConfig[dStatus];
              const Icon = config.icon;
              const isActiveTable = dStatus !== 'available';
              const isOccupiedState = dStatus === 'occupied' || dStatus === 'food_served';

              // Compute elapsed time & occupancy timer info for active tables
              const earliestTs = orderTimestamps[table.table_number];
              const elapsedMs = earliestTs ? Date.now() - new Date(earliestTs).getTime() : 0;
              const occInfo = isActiveTable ? getOccupancyTimerInfo(earliestTs) : null;
              const upcomingRes = reservationManager.getUpcomingForTable(table.table_number, reservations);

              return (
                <Card
                  key={table.id}
                  className={cn(
                    "relative overflow-hidden transition-all hover:shadow-md cursor-pointer border-2",
                    config.borderColor,
                    occInfo ? occInfo.ringClass : (isOccupiedState && cn("ring-2", config.ringColor)),
                    isOccupiedState && "animate-[pulse_3s_ease-in-out_infinite]"
                  )}
                >
                  {/* Status indicator bar */}
                  <div className={cn("absolute top-0 left-0 right-0 h-1.5", config.color)} />

                  <CardContent className="p-3 pt-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-bold text-lg flex items-center gap-1.5">
                          <span>T{table.table_number}</span>
                          {upcomingRes && (
                            <span className="text-[10px] bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 font-extrabold px-1.5 py-0.2 rounded-full border border-yellow-500/40">
                              ⭐ Reserved
                            </span>
                          )}
                        </h3>
                        {table.table_name && (
                          <p className="text-xs text-muted-foreground truncate max-w-[80px]">{table.table_name}</p>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        <Users className="w-2.5 h-2.5 mr-0.5" />
                        {table.capacity}
                      </Badge>
                    </div>

                    {/* Display status + order badge */}
                    <div className="flex items-center gap-1 mb-1.5">
                      <Icon className="w-3 h-3" />
                      <span className="text-xs font-medium">{config.label}</span>
                      {tableOrderCounts[table.table_number] > 0 && (
                        <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 text-[10px] ml-auto px-1.5 h-5 font-bold">
                          <ShoppingCart className="w-2.5 h-2.5 mr-0.5" />
                          {tableOrderCounts[table.table_number]} order{tableOrderCounts[table.table_number] > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>

                    {/* Occupancy Duration Timer Rings (🟢 <30m | 🟡 30-60m | 🔴 >60m) */}
                    {isActiveTable && occInfo && (
                      <div className={cn("flex items-center justify-between text-xs px-2 py-1 rounded-lg border mb-2 font-bold", occInfo.badgeClass)}>
                        <div className="flex items-center gap-1">
                          <Timer className="w-3 h-3" />
                          <span>{occInfo.formattedDuration}</span>
                        </div>
                        <span className="text-[10px] font-extrabold">{occInfo.label}</span>
                      </div>
                    )}

                    {/* Active Upcoming Reservation Details & 1-Tap Seat Action */}
                    {upcomingRes && (
                      <div className="mb-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl space-y-1 text-left">
                        <div className="flex items-center justify-between text-[11px] font-bold text-yellow-700 dark:text-yellow-300">
                          <span>🕒 {upcomingRes.reservation_time} ({upcomingRes.guest_count} guests)</span>
                        </div>
                        <p className="text-[10px] font-semibold text-muted-foreground truncate">{upcomingRes.customer_name} ({upcomingRes.customer_phone})</p>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSeatReservedGuests(table, upcomingRes);
                          }}
                          className="w-full h-6 text-[10px] font-bold bg-yellow-500 hover:bg-yellow-600 text-black shadow-sm rounded-lg"
                        >
                          Seat Guests
                        </Button>
                      </div>
                    )}

                    {/* Generate Bill button for occupied tables with orders */}
                    {table.status === 'occupied' && tableOrderCounts[table.table_number] > 0 && (
                      <Button
                        size="sm"
                        className="w-full h-7 text-xs mb-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl"
                        onClick={() => navigate(`/table-billing?table=${table.table_number}`)}
                      >
                        <Receipt className="w-3 h-3 mr-1" />
                        Generate Bill
                      </Button>
                    )}

                    {/* Render active seats list */}
                    {table.has_seats && table.seat_configuration && Array.isArray(table.seat_configuration) && (table.seat_configuration as string[]).length > 0 && (
                      <div className="mt-1 mb-3 pt-1.5 border-t text-[10px] space-y-1">
                        <span className="text-muted-foreground block font-medium">Seats:</span>
                        <div className="flex flex-wrap gap-1">
                          {(table.seat_configuration as string[]).map((seat: string) => {
                            const hasOrders = tableSeatOrderCounts[table.table_number]?.[seat] > 0;
                            return (
                              <Badge
                                key={seat}
                                variant={hasOrders ? "destructive" : "outline"}
                                className={cn(
                                  "text-[9px] px-1 py-0 h-4 min-w-[16px] text-center justify-center font-bold",
                                  hasOrders 
                                    ? "bg-red-500 text-white border-transparent" 
                                    : "text-muted-foreground border-muted-foreground/30"
                                )}
                              >
                                {seat}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Quick Actions */}
                    <div className="flex gap-1">
                      <Select
                        value={table.status}
                        onValueChange={(value: Table['status']) => handleStatusChange(table.id, value)}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="available">Available</SelectItem>
                          <SelectItem value="occupied">Occupied</SelectItem>
                          <SelectItem value="reserved">Reserved</SelectItem>
                          <SelectItem value="cleaning">Cleaning</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleOpenDialog(table)}
                        title="Edit table"
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                        onClick={() => {
                          setTableToDelete(table.id);
                          setDeleteDialogOpen(true);
                        }}
                        title="Delete table"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col p-0 overflow-hidden gap-0 rounded-2xl">
            <DialogHeader className="p-4 sm:p-5 pb-3 border-b shrink-0 bg-background z-10">
              <DialogTitle>{editingTable ? 'Edit Table' : 'Add New Table'}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tableNumber">Table Number *</Label>
                <Input
                  id="tableNumber"
                  placeholder="e.g. 1, 2, A1"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tableName">Table Name (Optional)</Label>
                <Input
                  id="tableName"
                  placeholder="e.g. Window Seat, VIP Corner"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="capacity">Seating Capacity</Label>
                <Input 
                  id="capacity" 
                  type="number" 
                  min="1" 
                  max="200" 
                  value={capacity} 
                  onChange={(e) => setCapacity(e.target.value)}
                  className="bg-background"
                />
              </div>

              {/* Floor Plan Position / Size settings */}
              <div className="border-t pt-4 space-y-3">
                <h4 className="text-xs font-bold uppercase text-primary tracking-wider">Floor Plan Layout</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="shape" className="text-xs">Table Shape</Label>
                    <Select value={shape} onValueChange={setShape}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rectangle">Rectangle</SelectItem>
                        <SelectItem value="circle">Circle</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="floorName" className="text-xs">Floor Area</Label>
                    <Input id="floorName" className="h-8 text-xs" value={floorName} onChange={(e) => setFloorName(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Size (Width x Height)</Label>
                    <div className="flex items-center gap-1">
                      <Input type="number" min="40" max="250" className="h-8 text-xs" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="W" />
                      <span className="text-xs text-muted-foreground">×</span>
                      <Input type="number" min="40" max="250" className="h-8 text-xs" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="H" />
                    </div>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Position (X, Y)</Label>
                    <div className="flex items-center gap-1">
                      <Input type="number" min="0" max="1000" className="h-8 text-xs" value={xPos} onChange={(e) => setXPos(e.target.value)} placeholder="X" />
                      <span className="text-xs text-muted-foreground">,</span>
                      <Input type="number" min="0" max="800" className="h-8 text-xs" value={yPos} onChange={(e) => setYPos(e.target.value)} placeholder="Y" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <div className="space-y-0.5">
                  <Label htmlFor="hasSeats" className="text-sm font-semibold">Configure Seats</Label>
                  <p className="text-[10px] text-muted-foreground">Allows multiple guests to order separately</p>
                </div>
                <Switch
                  id="hasSeats"
                  checked={hasSeats}
                  onCheckedChange={(checked) => {
                    setHasSeats(checked);
                    if (checked && seatLabels.length === 0) {
                      const countNum = parseInt(seatCount);
                      const labels = [];
                      for (let i = 0; i < countNum; i++) {
                        labels.push(String.fromCharCode(65 + i));
                      }
                      setSeatLabels(labels);
                    }
                  }}
                />
              </div>

              {hasSeats && (
                <div className="space-y-3 bg-muted/40 p-3 rounded-lg border">
                  <div className="space-y-2">
                    <Label htmlFor="seatCount" className="text-xs">Number of Seats</Label>
                    <Input
                      id="seatCount"
                      type="number"
                      min="1"
                      max="100"
                      className="h-8 text-xs bg-background"
                      value={seatCount}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSeatCount(val);
                        const count = parseInt(val) || 0;
                        setSeatLabels(prev => {
                          const newLabels = [...prev];
                          if (newLabels.length < count) {
                            for (let i = newLabels.length; i < count; i++) {
                              // If over 26, it goes to weird ascii, but it's fine for simple labels
                              newLabels.push(String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : ''));
                            }
                          } else if (newLabels.length > count) {
                            newLabels.splice(count);
                          }
                          return newLabels;
                        });
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] text-muted-foreground font-semibold">Ordering Mode</Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        { v: 'both', label: 'Both', hint: 'Table + seat' },
                        { v: 'seat', label: 'Seat only', hint: 'Per guest' },
                        { v: 'table', label: 'Table only', hint: 'One bill' },
                      ] as const).map(opt => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setSeatOrderMode(opt.v)}
                          className={`rounded-md border px-2 py-1.5 text-left transition-colors ${
                            seatOrderMode === opt.v
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-background text-muted-foreground'
                          }`}
                        >
                          <span className="block text-[11px] font-bold">{opt.label}</span>
                          <span className="block text-[9px] opacity-80">{opt.hint}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Controls what waiters and QR guests can pick: the whole table, a specific seat, or either.
                    </p>
                  </div>


                  <div className="space-y-2">
                    <Label className="text-[11px] text-muted-foreground font-semibold">Seat Labels / Custom Names</Label>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                      {seatLabels.map((label, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground font-bold">{idx + 1}.</span>
                          <Input
                            className="h-8 text-xs font-semibold"
                            value={label}
                            onChange={(e) => {
                              const newLabel = e.target.value;
                              setSeatLabels(prev => {
                                const copy = [...prev];
                                copy[idx] = newLabel;
                                return copy;
                              });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="p-4 border-t bg-muted/20 gap-2 shrink-0 bg-background z-10 flex-row justify-end sm:gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>{editingTable ? 'Update' : 'Add'} Table</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the table from your layout. You can add it back anytime.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Table Merge / Split Dialog */}
        <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
          <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 overflow-hidden gap-0 bg-card rounded-2xl">
            <DialogHeader className="p-4 sm:p-5 pb-3 border-b shrink-0 bg-background z-10">
              <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                <Users className="w-5 h-5 text-primary" />
                Merge or Split Tables
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Primary Table (Group Head)</Label>
                <Select value={mergePrimaryId} onValueChange={setMergePrimaryId}>
                  <SelectTrigger className="mt-1 bg-card rounded-xl">
                    <SelectValue placeholder="Select primary table..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tables.map(t => (
                      <SelectItem key={t.id} value={t.id}>Table {t.table_number} ({t.floor_name || 'Main Floor'})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tables to Combine / Merge Into Primary</Label>
                <div className="grid grid-cols-2 gap-2 mt-1.5 max-h-40 overflow-y-auto p-2 border rounded-xl bg-muted/20">
                  {tables.filter(t => t.id !== mergePrimaryId).map(t => {
                    const isChecked = mergeSecondaryIds.includes(t.id);
                    return (
                      <Button
                        key={t.id}
                        type="button"
                        variant={isChecked ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          if (isChecked) setMergeSecondaryIds(prev => prev.filter(id => id !== t.id));
                          else setMergeSecondaryIds(prev => [...prev, t.id]);
                        }}
                        className="text-xs rounded-lg justify-start h-8"
                      >
                        Table {t.table_number}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Currently Merged Groups */}
              {Object.keys(mergedGroups).length > 0 && (
                <div className="border-t pt-3 space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Merged Groups</Label>
                  <div className="space-y-1.5">
                    {Object.entries(mergedGroups).map(([primaryId, secondaries]) => {
                      const primTable = tables.find(t => t.id === primaryId);
                      const secTables = secondaries.map(id => tables.find(t => t.id === id)?.table_number).filter(Boolean);
                      return (
                        <div key={primaryId} className="flex items-center justify-between p-2 bg-muted/50 rounded-xl text-xs">
                          <span className="font-semibold">Table {primTable?.table_number} + ({secTables.join(', ')})</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setMergedGroups(prev => {
                                const copy = { ...prev };
                                delete copy[primaryId];
                                return copy;
                              });
                              toast({ title: 'Split complete', description: `Table ${primTable?.table_number} group split into standalone tables.` });
                            }}
                            className="h-7 text-xs text-destructive hover:bg-destructive/10 rounded-lg"
                          >
                            Split Group
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="p-4 border-t bg-muted/20 gap-2 shrink-0 bg-background z-10 flex-row justify-end sm:gap-2">
              <Button variant="outline" onClick={() => setMergeDialogOpen(false)} className="rounded-xl">Cancel</Button>
              <Button
                disabled={!mergePrimaryId || mergeSecondaryIds.length === 0}
                onClick={() => {
                  const primTable = tables.find(t => t.id === mergePrimaryId);
                  setMergedGroups(prev => ({
                    ...prev,
                    [mergePrimaryId]: mergeSecondaryIds
                  }));
                  handleStatusChange(mergePrimaryId, 'occupied');
                  mergeSecondaryIds.forEach(id => handleStatusChange(id, 'occupied'));
                  toast({
                    title: 'Tables Merged Successfully!',
                    description: `Combined Table ${primTable?.table_number} with ${mergeSecondaryIds.length} other tables.`
                  });
                  setMergeDialogOpen(false);
                  setMergeSecondaryIds([]);
                }}
                className="rounded-xl"
              >
                Merge {mergeSecondaryIds.length + (mergePrimaryId ? 1 : 0)} Tables
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Table Reservation & Pre-Booking Dialog */}
        <Dialog open={reservationDialogOpen} onOpenChange={setReservationDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 overflow-hidden gap-0 bg-card rounded-2xl">
            <DialogHeader className="p-4 sm:p-5 pb-3 border-b shrink-0 bg-background z-10">
              <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                <Clock className="w-5 h-5 text-yellow-600" />
                Table Reservation & Pre-Booking Calendar
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              <div className="bg-yellow-500/10 border border-yellow-500/30 p-3.5 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-yellow-800 dark:text-yellow-300 uppercase tracking-wider">Book New Table Reservation</h4>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <Label className="text-[11px] font-semibold">Table Number</Label>
                    <Select value={resTableNumber} onValueChange={setResTableNumber}>
                      <SelectTrigger className="mt-1 bg-background rounded-xl text-xs h-9">
                        <SelectValue placeholder="Select Table" />
                      </SelectTrigger>
                      <SelectContent>
                        {tables.map(t => (
                          <SelectItem key={t.id} value={t.table_number}>Table {t.table_number}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold">Guest Count</Label>
                    <Input
                      type="number"
                      value={resGuestCount}
                      onChange={(e) => setResGuestCount(e.target.value)}
                      placeholder="e.g. 4"
                      className="mt-1 bg-background rounded-xl text-xs h-9"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <Label className="text-[11px] font-semibold">Customer Name</Label>
                    <Input
                      value={resCustomerName}
                      onChange={(e) => setResCustomerName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="mt-1 bg-background rounded-xl text-xs h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold">Customer Phone</Label>
                    <Input
                      value={resCustomerPhone}
                      onChange={(e) => setResCustomerPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="mt-1 bg-background rounded-xl text-xs h-9"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <Label className="text-[11px] font-semibold">Reservation Date</Label>
                    <Input
                      type="date"
                      value={resDate}
                      onChange={(e) => setResDate(e.target.value)}
                      className="mt-1 bg-background rounded-xl text-xs h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold">Arrival Time</Label>
                    <Input
                      type="time"
                      value={resTime}
                      onChange={(e) => setResTime(e.target.value)}
                      className="mt-1 bg-background rounded-xl text-xs h-9"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="flex-1">
                    <Label className="text-[11px] font-semibold">Advance Amount (₹)</Label>
                    <Input
                      type="number"
                      value={resAdvance}
                      onChange={(e) => setResAdvance(e.target.value)}
                      placeholder="Optional"
                      className="mt-1 bg-background rounded-xl text-xs h-9"
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-[11px] font-semibold">Notes / Requests</Label>
                    <Input
                      value={resNotes}
                      onChange={(e) => setResNotes(e.target.value)}
                      placeholder="e.g. Window seat"
                      className="mt-1 bg-background rounded-xl text-xs h-9"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  {editingResId && (
                    <Button
                      variant="outline"
                      onClick={resetReservationForm}
                      className="flex-1 h-9 rounded-xl text-xs"
                    >
                      Cancel Edit
                    </Button>
                  )}
                  <Button
                    onClick={handleSaveReservation}
                    className="flex-[2] bg-yellow-500 hover:bg-yellow-600 text-black font-bold h-9 rounded-xl text-xs shadow-sm"
                  >
                    {editingResId ? <Save className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                    {editingResId ? "Save Changes" : "Confirm Pre-Booking"}
                  </Button>
                </div>
              </div>

              {/* Today's Active Reservations List */}
              <div className="space-y-2 pt-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Today's Reservations</Label>
                {reservations.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">No active pre-bookings found for today.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {reservations.map(r => (
                      <div key={r.id} className="p-3 bg-muted/40 border rounded-xl flex items-center justify-between text-xs gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 font-bold flex-wrap">
                            <Badge variant="outline" className="text-[10px] bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/40 shrink-0">
                              Table {r.table_number}
                            </Badge>
                            <span className="truncate">{r.customer_name}</span>
                            <span className="text-muted-foreground font-medium shrink-0">({r.guest_count} guests)</span>
                            <Badge variant={r.status === 'seated' ? 'default' : 'secondary'} className="text-[9px] capitalize shrink-0 h-4 px-1">
                              {r.status}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1 truncate">
                            🕒 {r.reservation_date} at {r.reservation_time} • 📞 {r.customer_phone} 
                            {r.advance_amount ? ` • 💰 ₹${r.advance_amount} Adv` : ''}
                            {r.notes ? ` • 📝 ${r.notes}` : ''}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-1 shrink-0">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            onClick={() => handleEditReservation(r)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => handleDeleteReservation(r.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="p-4 border-t bg-muted/20 gap-2 shrink-0 bg-background z-10 flex-row justify-end">
              <Button variant="outline" onClick={() => {
                setReservationDialogOpen(false);
                resetReservationForm();
              }} className="rounded-xl">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default TableManagement;

