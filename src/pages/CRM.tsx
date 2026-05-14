import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { Users, Search, Phone, Calendar, DollarSign, Download, FileSpreadsheet, Edit, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
// xlsx removed for security; using CSV export instead
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { AllBranchesReadOnlyBanner } from '@/components/AllBranchesReadOnlyBanner';

interface Customer {
  id: string;
  phone: string;
  name: string | null;
  visit_count: number;
  total_spent: number;
  last_visit: string;
  created_at: string;
}

const CRM: React.FC = () => {
  const { profile } = useAuth();
  const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
  const { branchFilterId } = useBranchScopedQuery(() => fetchCustomers());
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  useEffect(() => {
    if (adminId) fetchCustomers();
  }, [adminId, branchFilterId]);

  const fetchCustomers = async () => {
    if (!adminId) return;
    try {
      let query: any = supabase
        .from('customers')
        .select('*')
        .eq('admin_id', adminId)
        .order('last_visit', { ascending: false });
      if (branchFilterId) query = query.eq('branch_id', branchFilterId);
      const { data, error } = await query;

      if (error) throw error;
      setCustomers((data || []).map(c => ({
        ...c,
        visit_count: c.visit_count ?? 0,
        total_spent: c.total_spent ?? 0,
        last_visit: c.last_visit ?? c.created_at
      })));
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast({
        title: "Error",
        description: "Failed to fetch customers",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(customer => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      customer.phone.toLowerCase().includes(query) ||
      (customer.name?.toLowerCase() || '').includes(query)
    );
  });

  // Handle Edit
  const handleEditClick = (customer: Customer) => {
    setEditingCustomer(customer);
    setEditName(customer.name || '');
    setEditPhone(customer.phone);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingCustomer) return;

    if (!editPhone.trim()) {
      toast({ title: "Error", description: "Phone number is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('customers')
        .update({
          name: editName.trim() || null,
          phone: editPhone.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', editingCustomer.id);

      if (error) throw error;

      toast({ title: "Success", description: "Customer updated successfully" });
      setEditDialogOpen(false);
      setEditingCustomer(null);
      fetchCustomers();
    } catch (error) {
      console.error('Error updating customer:', error);
      toast({ title: "Error", description: "Failed to update customer", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Handle Delete
  const handleDeleteClick = (customer: Customer) => {
    setCustomerToDelete(customer);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!customerToDelete) return;

    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customerToDelete.id);

      if (error) throw error;

      toast({ title: "Success", description: "Customer deleted successfully" });
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
      fetchCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
      toast({ title: "Error", description: "Failed to delete customer", variant: "destructive" });
    }
  };

  const exportToExcel = () => {
    try {
      const data = customers.map(c => ({
        'Phone': c.phone,
        'Name': c.name || '-',
        'Total Visits': c.visit_count,
        'Total Spent': `₹${c.total_spent.toFixed(2)}`,
        'Last Visit': format(new Date(c.last_visit), 'dd/MM/yyyy hh:mm a'),
        'First Visit': format(new Date(c.created_at), 'dd/MM/yyyy')
      }));

      const headers = Object.keys(data[0] || {});
      const escape = (v: any) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [headers.join(','), ...data.map(r => headers.map(h => escape((r as any)[h])).join(','))].join('\r\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CRM_Export_${format(new Date(), 'dd-MM-yyyy')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast({
        title: "Success",
        description: "Customer data exported to CSV!"
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Error",
        description: "Failed to export data",
        variant: "destructive"
      });
    }
  };

  const exportToPDF = () => {
    try {
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>CRM Export</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #f4f4f4; font-weight: bold; }
            .summary { margin-bottom: 20px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>${profile?.hotel_name || 'Hotel'} - Customer Report</h1>
          <div class="summary">
            <p><strong>Total Customers:</strong> ${customers.length}</p>
            <p><strong>Total Revenue:</strong> ₹${customers.reduce((sum, c) => sum + c.total_spent, 0).toFixed(2)}</p>
            <p><strong>Generated:</strong> ${format(new Date(), 'dd/MM/yyyy hh:mm a')}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Phone</th>
                <th>Name</th>
                <th>Visits</th>
                <th>Total Spent</th>
                <th>Last Visit</th>
              </tr>
            </thead>
            <tbody>
              ${customers.map(c => `
                <tr>
                  <td>${c.phone}</td>
                  <td>${c.name || '-'}</td>
                  <td>${c.visit_count}</td>
                  <td>₹${c.total_spent.toFixed(2)}</td>
                  <td>${format(new Date(c.last_visit), 'dd/MM/yyyy')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.onload = () => {
          printWindow.print();
        };
      }

      toast({
        title: "Success",
        description: "PDF export opened in new window"
      });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: "Error",
        description: "Failed to generate PDF",
        variant: "destructive"
      });
    }
  };

  const totalRevenue = customers.reduce((sum, c) => sum + c.total_spent, 0);
  const totalVisits = customers.reduce((sum, c) => sum + c.visit_count, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-full overflow-x-hidden pb-24 md:pb-4">
      <AllBranchesReadOnlyBanner message="Read-only aggregate of customers across all branches." />
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-md shadow-primary/20">
            <Users className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">CRM</h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Customer relationship management</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" size="sm" className="text-xs h-8">
            <FileSpreadsheet className="w-3 h-3 mr-1" />
            Excel
          </Button>
          <Button onClick={exportToPDF} variant="outline" size="sm" className="text-xs h-8">
            <Download className="w-3 h-3 mr-1" />
            PDF
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Customers</p>
              <p className="text-lg font-bold">{customers.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">Total Visits</p>
              <p className="text-lg font-bold">{totalVisits}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="text-lg font-bold">₹{totalRevenue.toFixed(0)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by phone or name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Customer List */}
      <Card>
        <CardHeader className="p-3">
          <CardTitle className="text-sm">Customer List ({filteredCustomers.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {filteredCustomers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No customers found
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3 h-3 text-primary" />
                      <span className="font-semibold text-sm">{customer.phone}</span>
                    </div>
                    {customer.name && (
                      <p className="text-xs text-muted-foreground mt-0.5">{customer.name}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {customer.visit_count} visits • Last: {format(new Date(customer.last_visit), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right mr-2">
                      <p className="font-bold text-sm text-primary">₹{customer.total_spent.toFixed(0)}</p>
                      <p className="text-[10px] text-muted-foreground">total spent</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      onClick={() => handleEditClick(customer)}
                      disabled={isAllBranchesView}
                    >
                      <Edit className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteClick(customer)}
                      disabled={isAllBranchesView}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="Enter phone number"
              />
            </div>
            <div className="space-y-2">
              <Label>Name (Optional)</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter customer name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this customer record? This action cannot be undone.
              <br /><br />
              <strong>Phone:</strong> {customerToDelete?.phone}
              <br />
              <strong>Name:</strong> {customerToDelete?.name || 'N/A'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CRM;
