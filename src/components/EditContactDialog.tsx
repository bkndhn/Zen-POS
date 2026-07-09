import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const MOBILE_RE = /^[6-9][0-9]{9}$/;

interface EditContactDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  profileId: string;
  role: 'admin' | 'user' | 'super_admin' | string;
  label?: string;
  initial: {
    mobile_number?: string | null;
    shop_name?: string | null;
    address?: string | null;
    hotel_name?: string | null;
  };
  onSaved: () => void;
}

export const EditContactDialog: React.FC<EditContactDialogProps> = ({
  open, onOpenChange, profileId, role, label, initial, onSaved,
}) => {
  const [mobile, setMobile] = useState('');
  const [shopName, setShopName] = useState('');
  const [address, setAddress] = useState('');
  const [hotelName, setHotelName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMobile(initial.mobile_number || '');
      setShopName(initial.shop_name || '');
      setAddress(initial.address || '');
      setHotelName(initial.hotel_name || '');
    }
  }, [open, initial]);

  const isAdmin = role === 'admin';

  const handleSave = async () => {
    if (mobile && !MOBILE_RE.test(mobile)) {
      toast({
        title: 'Invalid Mobile Number',
        description: 'Mobile number must be exactly 10 digits and start with 6, 7, 8, or 9.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const payload: any = { mobile_number: mobile || null };
      if (isAdmin) {
        payload.shop_name = shopName || null;
        payload.address = address || null;
        payload.hotel_name = hotelName || null;
      }
      const { error } = await supabase.from('profiles').update(payload).eq('id', profileId);
      if (error) throw error;
      toast({ title: 'Saved', description: 'Contact details updated.' });
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message || 'Could not update profile', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Edit Contact Details</DialogTitle>
          <DialogDescription>{label ? `Update contact info for ${label}` : 'Update contact info'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Mobile Number</Label>
            <Input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit number starting 6-9"
            />
            <p className="text-[11px] text-muted-foreground">Must be 10 digits starting with 6, 7, 8, or 9.</p>
          </div>
          {isAdmin && (
            <>
              <div className="space-y-1.5">
                <Label>Hotel Name</Label>
                <Input value={hotelName} onChange={(e) => setHotelName(e.target.value)} placeholder="Hotel name" />
              </div>
              <div className="space-y-1.5">
                <Label>Shop Name</Label>
                <Input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Shop/brand name" />
              </div>
              <div className="space-y-1.5">
                <Label>Address</Label>
                <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Full address" />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
