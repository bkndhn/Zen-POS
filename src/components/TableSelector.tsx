import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LayoutGrid, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface Table {
  id: string;
  table_number: string;
  table_name: string | null;
  status: string;
  capacity: number | null;
  x_pos?: number | null;
  y_pos?: number | null;
  width?: number | null;
  height?: number | null;
  shape?: string | null;
}

interface TableSelectorProps {
  selectedTableId: string | null;
  onSelectTable: (tableId: string | null, tableNumber: string | null) => void;
}

export const TableSelector: React.FC<TableSelectorProps> = ({
  selectedTableId,
  onSelectTable,
}) => {
  const { profile , adminProfileId } = useAuth();
  const { operatingBranchId } = useBranch();
  const adminId = adminProfileId;
  const [tables, setTables] = useState<Table[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');

  useEffect(() => {
    if (open && adminId) {
      fetchTables();
    }
  }, [open, adminId, operatingBranchId]);

  const fetchTables = async () => {
    if (!adminId) return;
    try {
      setLoading(true);
      let query: any = supabase
        .from('tables')
        .select('*')
        .eq('admin_id', adminId)
        .eq('is_active', true);

      if (operatingBranchId) {
        query = query.eq('branch_id', operatingBranchId);
      }

      const { data, error } = await query.order('display_order', { ascending: true });

      if (error) throw error;
      setTables(data || []);
    } catch (error) {
      console.error('Error fetching tables:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedTable = tables.find(t => t.id === selectedTableId);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-700 border-green-200';
      case 'occupied': return 'bg-red-100 text-red-700 border-red-200';
      case 'reserved': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'cleaning': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const handleSelectTable = (table: Table) => {
    onSelectTable(table.id, table.table_number);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectTable(null, null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 px-3 gap-2 ${selectedTableId ? 'bg-primary/10 border-primary' : ''}`}
        >
          <LayoutGrid className="w-4 h-4" />
          {selectedTable ? (
            <span className="font-semibold">
              Table {selectedTable.table_number}
              {selectedTable.table_name && ` - ${selectedTable.table_name}`}
            </span>
          ) : (
            <span>Select Table</span>
          )}
          {selectedTableId && (
            <X
              className="w-3 h-3 ml-1 hover:text-destructive"
              onClick={handleClear}
            />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-background text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5" />
            Select Table
          </DialogTitle>
        </DialogHeader>

        {/* View Mode Toggle */}
        {tables.length > 0 && (
          <div className="flex justify-end gap-1 mb-2 bg-muted/40 p-1 rounded-lg border w-fit ml-auto">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className={cn("h-7 text-[10px] font-bold px-2 rounded-md", viewMode === 'grid' && "bg-background shadow-sm")}
            >
              Grid View
            </Button>
            <Button
              variant={viewMode === 'map' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('map')}
              className={cn("h-7 text-[10px] font-bold px-2 rounded-md", viewMode === 'map' && "bg-background shadow-sm")}
            >
              Floor Map
            </Button>
          </div>
        )}
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : tables.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <LayoutGrid className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No tables configured</p>
            <p className="text-xs mt-1">Add tables in Table Management</p>
          </div>
        ) : viewMode === 'map' ? (
          <div 
            className="relative w-full h-[360px] border border-border/80 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-zinc-950/50 p-2 shadow-inner"
            style={{ 
              backgroundImage: 'linear-gradient(to right, rgb(128 128 128 / 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgb(128 128 128 / 0.05) 1px, transparent 1px)', 
              backgroundSize: '15px 15px' 
            }}
          >
            <div className="absolute top-1 left-1 bg-background/90 text-[9px] font-medium px-1.5 py-0.5 rounded border text-muted-foreground z-10">
              Floor Plan Layout
            </div>

            <div className="relative w-full h-full">
              {tables.map((table) => {
                const w = (table.width || 100) * 0.6;
                const h = (table.height || 100) * 0.6;
                const x = (table.x_pos !== null && table.x_pos !== undefined ? table.x_pos : 50) * 0.6;
                const y = (table.y_pos !== null && table.y_pos !== undefined ? table.y_pos : 50) * 0.6;
                const isCircle = table.shape === 'circle';
                const isSelected = selectedTableId === table.id;
                const isOccupied = table.status === 'occupied';

                return (
                  <button
                    key={table.id}
                    disabled={isOccupied}
                    onClick={() => handleSelectTable(table)}
                    style={{
                      position: 'absolute',
                      left: `${x}px`,
                      top: `${y}px`,
                      width: `${w}px`,
                      height: `${h}px`
                    }}
                    className={`
                      flex flex-col items-center justify-center border transition-all text-center p-1 select-none text-[10px]
                      ${isCircle ? 'rounded-full' : 'rounded-xl'}
                      ${isSelected ? 'ring-2 ring-primary ring-offset-1 border-primary z-20 shadow-md' : ''}
                      ${isOccupied ? 'bg-red-500/10 border-red-200 text-red-500 cursor-not-allowed opacity-60' : 'hover:border-primary cursor-pointer'}
                      ${table.status === 'available' && !isSelected ? 'bg-green-500/10 border-green-200 text-green-700 hover:bg-green-500/20' : ''}
                      ${table.status === 'reserved' ? 'bg-yellow-500/10 border-yellow-200 text-yellow-700' : ''}
                      ${table.status === 'cleaning' ? 'bg-blue-500/10 border-blue-200 text-blue-700' : ''}
                    `}
                  >
                    <span className="font-extrabold text-xs">T{table.table_number}</span>
                    <span className="text-[8px] opacity-70">({table.capacity}p)</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto p-1">
            {tables.map((table) => (
              <button
                key={table.id}
                onClick={() => handleSelectTable(table)}
                disabled={table.status === 'occupied'}
                className={`
                  p-3 rounded-lg border-2 transition-all
                  ${selectedTableId === table.id ? 'ring-2 ring-primary ring-offset-2' : ''}
                  ${table.status === 'occupied' ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary cursor-pointer'}
                  ${getStatusColor(table.status)}
                `}
              >
                <div className="text-lg font-bold">{table.table_number}</div>
                {table.table_name && (
                  <div className="text-xs truncate">{table.table_name}</div>
                )}
                <Badge variant="secondary" className="text-[10px] mt-1 capitalize">
                  {table.status}
                </Badge>
                {table.capacity && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {table.capacity} seats
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
        
        {selectedTableId && (
          <div className="pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onSelectTable(null, null);
                setOpen(false);
              }}
              className="w-full"
            >
              Clear Selection
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
