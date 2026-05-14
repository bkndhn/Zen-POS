import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { CreditCard, Plus, Edit } from 'lucide-react';

interface PaymentType {
  id: string;
  payment_type: string;
  is_disabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export const PaymentTypesManagement: React.FC = () => {
  const { profile } = useAuth();
  const { operatingBranchId, isAllBranchesView } = useBranch();
  const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
  const [open, setOpen] = useState(false);
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([]);
  const [newPaymentType, setNewPaymentType] = useState('');
  const [editingPayment, setEditingPayment] = useState<PaymentType | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchPaymentTypes();
    }
  }, [open, operatingBranchId]);

  const fetchPaymentTypes = async () => {
    if (!adminId) return;
    try {
      // Fetch payment types scoped to this admin + branch
      // Also include legacy rows (branch_id IS NULL) as fallback
      let query = (supabase as any)
        .from('payments')
        .select('*')
        .eq('admin_id', adminId);

      if (operatingBranchId) {
        query = query.or(`branch_id.eq.${operatingBranchId},branch_id.is.null`);
      }

      const { data, error } = await query.order('payment_type');

      if (error) throw error;
      setPaymentTypes(data || []);
    } catch (error) {
      console.error('Error fetching payment types:', error);
      toast({
        title: "Error",
        description: "Failed to fetch payment types",
        variant: "destructive",
      });
    }
  };

  const handleAddPaymentType = async () => {
    if (!newPaymentType.trim()) {
      toast({
        title: "Error",
        description: "Payment type name is required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await (supabase as any)
        .from('payments')
        .insert({
          payment_type: newPaymentType.trim(),
          is_disabled: false,
          is_default: false,
          admin_id: adminId || null,
          branch_id: operatingBranchId || null
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Payment type added successfully",
      });

      setNewPaymentType('');
      fetchPaymentTypes();
    } catch (error) {
      console.error('Error adding payment type:', error);
      toast({
        title: "Error",
        description: "Failed to add payment type",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditPaymentType = async () => {
    if (!editingPayment || !newPaymentType.trim()) {
      toast({
        title: "Error",
        description: "Payment type name is required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('payments')
        .update({ payment_type: newPaymentType.trim() })
        .eq('id', editingPayment.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Payment type updated successfully",
      });

      setEditingPayment(null);
      setNewPaymentType('');
      fetchPaymentTypes();
    } catch (error) {
      console.error('Error updating payment type:', error);
      toast({
        title: "Error",
        description: "Failed to update payment type",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const togglePaymentStatus = async (paymentId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('payments')
        .update({ is_disabled: !currentStatus })
        .eq('id', paymentId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Payment type ${!currentStatus ? 'disabled' : 'enabled'} successfully`,
      });

      fetchPaymentTypes();
    } catch (error) {
      console.error('Error updating payment status:', error);
      toast({
        title: "Error",
        description: "Failed to update payment status",
        variant: "destructive",
      });
    }
  };

  const setAsDefault = async (paymentId: string) => {
    try {
      // First, remove default from payment types within same admin + branch scope
      let clearQuery = (supabase as any)
        .from('payments')
        .update({ is_default: false })
        .eq('is_default', true)
        .eq('admin_id', adminId);
      if (operatingBranchId) clearQuery = clearQuery.eq('branch_id', operatingBranchId);
      const { error: clearError } = await clearQuery;

      if (clearError) throw clearError;

      // Then set the selected one as default
      const { error } = await supabase
        .from('payments')
        .update({ is_default: true })
        .eq('id', paymentId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Default payment type updated successfully",
      });

      fetchPaymentTypes();
    } catch (error) {
      console.error('Error setting default payment:', error);
      toast({
        title: "Error",
        description: "Failed to set default payment",
        variant: "destructive",
      });
    }
  };

  const startEdit = (payment: PaymentType) => {
    setEditingPayment(payment);
    setNewPaymentType(payment.payment_type);
  };

  const cancelEdit = () => {
    setEditingPayment(null);
    setNewPaymentType('');
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="w-4 h-4" />
          Payment Types Management
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={isAllBranchesView}>
              <CreditCard className="w-3 h-3 mr-1" />
              Manage Payment Types
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md w-[95vw] max-h-[85vh] flex flex-col">
            <DialogHeader className="pb-2">
              <DialogTitle className="text-base">Manage Payment Types</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 overflow-y-auto flex-1">
              {/* Add/Edit Form */}
              <Card className="border-muted">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {editingPayment ? 'Edit Payment Type' : 'Add New Payment Type'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <Label htmlFor="payment-type" className="text-xs">Payment Type Name</Label>
                    <Input
                      id="payment-type"
                      value={newPaymentType}
                      onChange={(e) => setNewPaymentType(e.target.value)}
                      placeholder="Enter payment type name"
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="flex gap-2">
                    {editingPayment ? (
                      <>
                        <Button onClick={handleEditPaymentType} disabled={loading} size="sm" className="h-7 text-xs">
                          Save
                        </Button>
                        <Button variant="outline" onClick={cancelEdit} size="sm" className="h-7 text-xs">
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button onClick={handleAddPaymentType} disabled={loading} size="sm" className="h-7 text-xs">
                        <Plus className="w-3 h-3 mr-1" />
                        Add Payment Type
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Payment Types List */}
              <Card className="border-muted">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Existing Payment Types</CardTitle>
                </CardHeader>
                <CardContent>
                  {paymentTypes.length === 0 ? (
                    <p className="text-muted-foreground text-center py-2 text-xs">
                      No payment types found
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {paymentTypes.map((payment) => (
                        <div key={payment.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2 bg-muted/30 rounded text-xs">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={`font-medium truncate ${payment.is_disabled ? 'text-muted-foreground line-through' : ''}`}>
                              {payment.payment_type}
                            </span>
                            {payment.is_default && (
                              <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded whitespace-nowrap">
                                Default
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            <Switch
                              checked={!payment.is_disabled}
                              onCheckedChange={() => togglePaymentStatus(payment.id, payment.is_disabled)}
                              className="scale-75"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setAsDefault(payment.id)}
                              className="h-6 px-2 text-[10px]"
                              disabled={payment.is_default}
                            >
                              Default
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEdit(payment)}
                              className="h-6 w-6 p-0"
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
