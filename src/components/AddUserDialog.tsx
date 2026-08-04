import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { Plus, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isStrongPassword, isValidEmail } from '@/utils/securityUtils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

interface AddUserDialogProps {
  onUserAdded: () => void;
  adminId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

// Mobile: exactly 10 digits, starts with 6/7/8/9
const MOBILE_RE = /^[6-9][0-9]{9}$/;

export const AddUserDialog: React.FC<AddUserDialogProps> = ({
  onUserAdded,
  adminId,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
  trigger,
}) => {
  const { signUp, profile, adminProfileId } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = externalOpen !== undefined;
  const isOpen = isControlled ? externalOpen : internalOpen;

  const setIsOpen = (value: boolean) => {
    if (isControlled) {
      externalOnOpenChange?.(value);
    } else {
      setInternalOpen(value);
    }
  };

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const isSuperAdmin = profile?.role === 'super_admin';
  const targetRole = isSuperAdmin ? 'admin' : 'user';

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    role: targetRole,
    hotelName: '',
    shopName: '',
    address: '',
    mobileNumber: '',
  });

  const [subUserLimitState, setSubUserLimitState] = useState<{ currentCount: number; maxAllowed: number } | null>(null);

  React.useEffect(() => {
    setFormData(p => ({ ...p, role: isSuperAdmin ? 'admin' : 'user' }));
  }, [isSuperAdmin]);

  React.useEffect(() => {
    if (open && !isSuperAdmin && adminProfileId) {
      (async () => {
        try {
          const [{ count }, { data: adminProf }] = await Promise.all([
            supabase
              .from('profiles')
              .select('*', { count: 'exact', head: true })
              .eq('admin_id', adminProfileId)
              .neq('status', 'deleted'),
            supabase
              .from('profiles')
              .select('max_sub_users')
              .eq('id', adminProfileId)
              .maybeSingle()
          ]);

          const currentCount = count || 0;
          const maxAllowed = (adminProf as any)?.max_sub_users ?? 5;
          setSubUserLimitState({ currentCount, maxAllowed });
        } catch (e) {
          console.error('Error checking sub-user limit:', e);
        }
      })();
    } else {
      setSubUserLimitState(null);
    }
  }, [open, isSuperAdmin, adminProfileId]);

  const resetForm = () => setFormData({
    email: '', password: '', confirmPassword: '', name: '', role: isSuperAdmin ? 'admin' : 'user',
    hotelName: '', shopName: '', address: '', mobileNumber: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isSuperAdmin && subUserLimitState && subUserLimitState.currentCount >= subUserLimitState.maxAllowed) {
      toast({
        title: "⚠️ Staff Member Limit Reached",
        description: `Your subscription is restricted to a maximum of ${subUserLimitState.maxAllowed} staff member(s). You currently have ${subUserLimitState.currentCount} active staff user(s). Contact Super Admin to upgrade your user limit.`,
        variant: "destructive",
      });
      return;
    }

    if (!isValidEmail(formData.email)) {
      toast({ title: "Invalid Email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    const passwordCheck = isStrongPassword(formData.password);
    if (!passwordCheck.valid) {
      toast({ title: "Weak Password", description: passwordCheck.message, variant: "destructive" });
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "Passwords do not match. Please verify that both typed passwords match.",
        variant: "destructive",
      });
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

    // Require tenant fields for Client Admin accounts
    if (targetRole === 'admin') {
      if (!formData.hotelName.trim()) {
        toast({ title: "Business Name Required", description: "Business name is required for admin accounts.", variant: "destructive" });
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
      const { error, user } = await signUp(
        formData.email,
        formData.password,
        formData.name,
        targetRole,
        formData.hotelName,
        targetRole === 'user' ? adminId : undefined,
        {
          mobileNumber: formData.mobileNumber.trim(),
          shopName: formData.shopName.trim(),
          address: formData.address.trim(),
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
          ? "Client Admin created successfully."
          : "Sub-user account created successfully.",
      });
      resetForm();
      setIsOpen(false);
      onUserAdded();
    } catch (error: any) {
      console.error('Add user error:', error);
      toast({ title: "Error", description: error.message || "Failed to create user account.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : !isControlled ? (
        <DialogTrigger asChild>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            {isSuperAdmin ? 'Add User' : 'Add User'}
          </Button>
        </DialogTrigger>
      ) : null}

      <DialogContent className="sm:max-w-[460px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isSuperAdmin ? 'Add New System User' : 'Add New User'}</DialogTitle>
          <DialogDescription>
            {isSuperAdmin
              ? 'Create a new tenant admin or branch staff account with contact details.'
              : 'Create a new sub-user account with contact details.'}
          </DialogDescription>
        </DialogHeader>

        {subUserLimitState && subUserLimitState.currentCount >= subUserLimitState.maxAllowed && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl text-rose-800 dark:text-rose-300 text-xs font-semibold flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">⚠️ Staff Member Limit Reached ({subUserLimitState.currentCount}/{subUserLimitState.maxAllowed})</p>
              <p className="text-[11px] mt-0.5 text-rose-700 dark:text-rose-400">Your subscription permits up to {subUserLimitState.maxAllowed} staff members. Contact Super Admin to upgrade your user limit.</p>
            </div>
          </div>
        )}

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

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                value={formData.confirmPassword}
                onChange={(e) => setFormData(p => ({ ...p, confirmPassword: e.target.value }))}
                required
                placeholder="Re-enter password to confirm"
                minLength={8}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {isSuperAdmin ? (
            <div className="space-y-2">
              <Label className="text-xs font-bold">Account Role</Label>
              <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl">
                <span className="text-sm font-bold text-primary block">Client Admin</span>
                <span className="text-[11px] text-muted-foreground">Creates and manages business instance & sub-users</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs font-bold">Account Role</Label>
              <div className="p-3 bg-secondary/50 rounded-xl border">
                <span className="text-sm font-bold block">Branch Sub-User</span>
                <span className="text-[11px] text-muted-foreground">Staff member with branch & page permissions</span>
              </div>
            </div>
          )}

          {formData.role === 'admin' && (
            <>

              <div className="space-y-2">
                <Label htmlFor="hotelName">Business Name</Label>
                <Input id="hotelName" value={formData.hotelName} onChange={(e) => setFormData(p => ({ ...p, hotelName: e.target.value }))} required placeholder="Enter business name" />
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
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading || (subUserLimitState !== null && subUserLimitState.currentCount >= subUserLimitState.maxAllowed)}>
              {loading ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
