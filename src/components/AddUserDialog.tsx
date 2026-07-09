import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { Plus, Eye, EyeOff } from 'lucide-react';
import { isStrongPassword, isValidEmail } from '@/utils/securityUtils';

interface AddUserDialogProps {
  onUserAdded: () => void;
  adminId?: string;
}

// Mobile: exactly 10 digits, starts with 6/7/8/9
const MOBILE_RE = /^[6-9][0-9]{9}$/;

export const AddUserDialog: React.FC<AddUserDialogProps> = ({ onUserAdded, adminId }) => {
  const { signUp, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isSuperAdmin = profile?.role === 'super_admin';
  const defaultRole = isSuperAdmin ? 'admin' : 'user';

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: defaultRole,
    hotelName: '',
    shopName: '',
    address: '',
    mobileNumber: '',
  });

  const resetForm = () => setFormData({
    email: '', password: '', name: '', role: defaultRole,
    hotelName: '', shopName: '', address: '', mobileNumber: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValidEmail(formData.email)) {
      toast({ title: "Invalid Email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    const passwordCheck = isStrongPassword(formData.password);
    if (!passwordCheck.valid) {
      toast({ title: "Weak Password", description: passwordCheck.message, variant: "destructive" });
      return;
    }
    // Mobile is required and must match the pattern
    if (!MOBILE_RE.test(formData.mobileNumber.trim())) {
      toast({
        title: "Invalid Mobile Number",
        description: "Mobile number must be exactly 10 digits and start with 6, 7, 8, or 9.",
        variant: "destructive",
      });
      return;
    }
    if (formData.role === 'admin') {
      if (!formData.hotelName.trim()) {
        toast({ title: "Hotel Name Required", description: "Hotel name is required for admin accounts.", variant: "destructive" });
        return;
      }
      if (!formData.shopName.trim()) {
        toast({ title: "Shop Name Required", description: "Shop name is required for admin accounts.", variant: "destructive" });
        return;
      }
      if (!formData.address.trim()) {
        toast({ title: "Address Required", description: "Address is required for admin accounts.", variant: "destructive" });
        return;
      }
    }

    setLoading(true);
    try {
      const { error } = await signUp(
        formData.email,
        formData.password,
        formData.name,
        formData.role,
        formData.hotelName,
        formData.role === 'user' ? adminId : undefined,
        {
          mobileNumber: formData.mobileNumber.trim(),
          shopName: formData.role === 'admin' ? formData.shopName.trim() : undefined,
          address: formData.role === 'admin' ? formData.address.trim() : undefined,
        }
      );

      if (error) {
        if (error.message?.includes('User already registered')) {
          throw new Error('An account with this email already exists.');
        }
        throw error;
      }

      toast({
        title: "Success!",
        description: isSuperAdmin
          ? "Admin account created successfully."
          : "User account created successfully.",
      });
      resetForm();
      setOpen(false);
      onUserAdded();
    } catch (error: any) {
      console.error('Add user error:', error);
      toast({ title: "Error", description: error.message || "Failed to create user account.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          {isSuperAdmin ? 'Add Admin' : 'Add User'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[460px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isSuperAdmin ? 'Add New Admin' : 'Add New User'}</DialogTitle>
          <DialogDescription>
            {isSuperAdmin
              ? 'Create a new hotel admin account with contact details.'
              : 'Create a new sub-user account with contact details.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input id="name" value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} required placeholder="Enter full name" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))} required placeholder="Enter email address" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mobile">Mobile Number</Label>
            <Input
              id="mobile"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={formData.mobileNumber}
              onChange={(e) => setFormData(p => ({ ...p, mobileNumber: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
              required
              placeholder="10-digit number starting 6-9"
            />
            <p className="text-xs text-muted-foreground">Must be 10 digits starting with 6, 7, 8, or 9.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input id="password" type={showPassword ? "text" : "password"} value={formData.password} onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))} required placeholder="Enter password" minLength={8} />
              <Button type="button" variant="ghost" size="sm" className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {isSuperAdmin ? (
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
                <span className="text-sm font-medium text-primary">Hotel Admin</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg border">
                <span className="text-sm font-medium">Staff Member</span>
              </div>
            </div>
          )}

          {formData.role === 'admin' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="hotelName">Hotel Name</Label>
                <Input id="hotelName" value={formData.hotelName} onChange={(e) => setFormData(p => ({ ...p, hotelName: e.target.value }))} required placeholder="Enter hotel name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shopName">Shop Name</Label>
                <Input id="shopName" value={formData.shopName} onChange={(e) => setFormData(p => ({ ...p, shopName: e.target.value }))} required placeholder="Enter shop/brand name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea id="address" value={formData.address} onChange={(e) => setFormData(p => ({ ...p, address: e.target.value }))} required placeholder="Enter full address" rows={2} />
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create User'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
