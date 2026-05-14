import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface AddAdditionalChargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  branchId?: string | null;
}

const UNIT_OPTIONS = [
  'Piece (pc)',
  'Kilogram (kg)',
  'Gram (gm)',
  'Liter (lt)',
  'Milliliter (ml)',
  'Box',
  'Pack',
  'Bottle'
];

export const AddAdditionalChargeDialog: React.FC<AddAdditionalChargeDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
  branchId
}) => {
  const { profile } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    charge_type: 'fixed',
    amount: 0,
    unit: 'Piece (pc)',
    description: '',
    is_active: true,
    is_default: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Charge name is required",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Get admin_id for data isolation
      const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
      
      const { error } = await (supabase as any)
        .from('additional_charges')
        .insert([{
          ...formData,
          unit: formData.charge_type === 'per_unit' ? formData.unit : null,
          admin_id: adminId || null,
          branch_id: branchId || null
        }]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Additional charge created successfully"
      });

      setFormData({
        name: '',
        charge_type: 'fixed',
        amount: 0,
        unit: 'Piece (pc)',
        description: '',
        is_active: true,
        is_default: false
      });
      
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating additional charge:', error);
      toast({
        title: "Error",
        description: "Failed to create additional charge",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Add Additional Charge
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Charge Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Packing Charges, Service Tax"
              required
            />
          </div>

          <div>
            <Label htmlFor="charge_type">Charge Type</Label>
            <Select
              value={formData.charge_type}
              onValueChange={(value) => setFormData(prev => ({ ...prev, charge_type: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed Amount</SelectItem>
                <SelectItem value="per_unit">Per Unit</SelectItem>
                <SelectItem value="percentage">Percentage</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="amount">
              {formData.charge_type === 'per_unit' ? 'Amount per Unit (₹)' : 
               formData.charge_type === 'percentage' ? 'Percentage (%)' : 'Amount (₹)'} *
            </Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData(prev => ({ ...prev, amount: Number(e.target.value) }))}
              required
            />
          </div>

          {formData.charge_type === 'per_unit' && (
            <div>
              <Label htmlFor="unit">Unit *</Label>
              <Select
                value={formData.unit}
                onValueChange={(value) => setFormData(prev => ({ ...prev, unit: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map(unit => (
                    <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description"
              rows={3}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
            />
            <Label htmlFor="is_active">Charge is active</Label>
          </div>

          <div className="flex space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? 'Creating...' : 'Create Charge'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};