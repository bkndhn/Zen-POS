import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { LayoutGrid, Plus, Edit, Trash2, Users, Utensils, Clock, CheckCircle2, Sparkles, ShoppingCart, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { useBranch } from '@/contexts/BranchContext';
import { AllBranchesReadOnlyBanner } from '@/components/AllBranchesReadOnlyBanner';
import { Switch } from '@/components/ui/switch';

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
}

const statusConfig = {
  available: { label: 'Available', color: 'bg-green-500', icon: CheckCircle2 },
  occupied: { label: 'Occupied', color: 'bg-red-500', icon: Utensils },
  reserved: { label: 'Reserved', color: 'bg-yellow-500', icon: Clock },
  cleaning: { label: 'Cleaning', color: 'bg-blue-500', icon: Sparkles }
};

const TableManagement: React.FC = () => {
  const { profile } = useAuth();
  const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
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

  // Form state
  const [tableNumber, setTableNumber] = useState('');
  const [tableName, setTableName] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [hasSeats, setHasSeats] = useState(false);
  const [seatCount, setSeatCount] = useState('2');
  const [seatLabels, setSeatLabels] = useState<string[]>([]);

  const fetchTables = useCallback(async () => {
    try {
      if (!adminId) return;
      let query: any = (supabase as any)
        .from('tables')
        .select('*')
        .eq('admin_id', adminId)
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (branchFilterId) query = query.eq('branch_id', branchFilterId);
      const { data, error } = await query;

      if (error) throw error;
      setTables(data || []);
    } catch (error) {
      console.error('Error fetching tables:', error);
      toast({
        title: "Error",
        description: "Failed to fetch tables",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [adminId, branchFilterId]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  // Fetch active table order counts
  const fetchTableOrderCounts = useCallback(async () => {
    if (!adminId) return;
    try {
      const { data, error } = await (supabase as any)
        .from('table_orders')
        .select('table_number, seat_id')
        .eq('admin_id', adminId)
        .in('status', ['pending', 'preparing', 'ready'])
        .eq('is_billed', false);

      if (!error && data) {
        const counts: Record<string, number> = {};
        const seatCounts: Record<string, Record<string, number>> = {};
        (data as any[]).forEach((order: any) => {
          counts[order.table_number] = (counts[order.table_number] || 0) + 1;
          if (order.seat_id) {
            if (!seatCounts[order.table_number]) seatCounts[order.table_number] = {};
            seatCounts[order.table_number][order.seat_id] = (seatCounts[order.table_number][order.seat_id] || 0) + 1;
          }
        });
        setTableOrderCounts(counts);
        setTableSeatOrderCounts(seatCounts);
      }
    } catch (e) {
      console.warn('Error fetching table order counts:', e);
    }
  }, [adminId]);

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
    } else {
      setEditingTable(null);
      setTableNumber('');
      setTableName('');
      setCapacity('4');
      setHasSeats(false);
      setSeatCount('2');
      setSeatLabels(getDefaultSeatLabels(2));
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
        admin_id: profile?.role === 'admin' ? profile.id : null,
        branch_id: operatingBranchId || null,
        has_seats: hasSeats,
        seat_count: hasSeats ? parseInt(seatCount) : 0,
        seat_configuration: hasSeats ? seatLabels : [],
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-3 sm:p-4">
      <div className="max-w-6xl mx-auto">
        <AllBranchesReadOnlyBanner message="Switch to a specific branch to add or edit tables." />
        {/* Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-md shadow-primary/20">
              <LayoutGrid className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight">Table Management</h1>
              <p className="text-xs text-muted-foreground">Manage dine-in tables</p>
            </div>
          </div>
          <Button onClick={() => handleOpenDialog()} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Add Table
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
          {Object.entries(statusConfig).map(([status, config]) => {
            const count = tables.filter(t => t.status === status).length;
            const Icon = config.icon;
            return (
              <Card key={status} className="p-3">
                <div className="flex items-center gap-2">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", config.color)}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground">{config.label}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Tables Grid */}
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
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {tables.map((table) => {
              const config = statusConfig[table.status];
              const Icon = config.icon;

              return (
                <Card
                  key={table.id}
                  className={cn(
                    "relative overflow-hidden transition-all hover:shadow-md cursor-pointer",
                    table.status === 'occupied' && "ring-2 ring-red-200"
                  )}
                >
                  {/* Status indicator */}
                  <div className={cn("absolute top-0 left-0 right-0 h-1", config.color)} />

                  <CardContent className="p-3 pt-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-bold text-lg">T{table.table_number}</h3>
                        {table.table_name && (
                          <p className="text-xs text-muted-foreground truncate max-w-[80px]">{table.table_name}</p>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        <Users className="w-2.5 h-2.5 mr-0.5" />
                        {table.capacity}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-1 mb-3">
                      <Icon className="w-3 h-3" />
                      <span className="text-xs font-medium">{config.label}</span>
                      {tableOrderCounts[table.table_number] > 0 && (
                        <Badge className="bg-purple-100 text-purple-700 text-[10px] ml-auto px-1.5 h-5">
                          <ShoppingCart className="w-2.5 h-2.5 mr-0.5" />
                          {tableOrderCounts[table.table_number]} order{tableOrderCounts[table.table_number] > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>

                    {/* Generate Bill button for occupied tables with orders */}
                    {table.status === 'occupied' && tableOrderCounts[table.table_number] > 0 && (
                      <Button
                        size="sm"
                        className="w-full h-7 text-xs mb-2 bg-purple-600 hover:bg-purple-700 text-white"
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
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingTable ? 'Edit Table' : 'Add New Table'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
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
                <Select value={capacity} onValueChange={setCapacity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 4, 6, 8, 10, 12].map(num => (
                      <SelectItem key={num} value={String(num)}>{num} Seats</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    <Select 
                      value={seatCount} 
                      onValueChange={(val) => {
                        setSeatCount(val);
                        const count = parseInt(val);
                        setSeatLabels(prev => {
                          const newLabels = [...prev];
                          if (newLabels.length < count) {
                            for (let i = newLabels.length; i < count; i++) {
                              newLabels.push(String.fromCharCode(65 + i));
                            }
                          } else if (newLabels.length > count) {
                            newLabels.splice(count);
                          }
                          return newLabels;
                        });
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[2, 3, 4, 5, 6, 8, 10, 12].map(num => (
                          <SelectItem key={num} value={String(num)}>{num} Seats</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] text-muted-foreground font-semibold">Seat Labels / Custom Names</Label>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
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

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>{editingTable ? 'Update' : 'Add'} Table</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Table?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the table from your list. You can add it back later if needed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default TableManagement;
