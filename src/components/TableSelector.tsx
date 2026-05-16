import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LayoutGrid, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
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
}

interface TableSelectorProps {
  selectedTableId: string | null;
  onSelectTable: (tableId: string | null, tableNumber: string | null) => void;
}

export const TableSelector: React.FC<TableSelectorProps> = ({
  selectedTableId,
  onSelectTable,
}) => {
  const { profile } = useAuth();
  const { operatingBranchId } = useBranch();
  const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
  const [tables, setTables] = useState<Table[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

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
        query = query.or(`branch_id.eq.${operatingBranchId},branch_id.is.null`);
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5" />
            Select Table
          </DialogTitle>
        </DialogHeader>
        
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
