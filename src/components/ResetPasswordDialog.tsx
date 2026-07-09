import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { KeyRound, Eye, EyeOff, RefreshCw } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetProfileId: string;
  targetLabel: string;
}

const generatePwd = () => {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, (v) => chars[v % chars.length]).join('');
};

export const ResetPasswordDialog: React.FC<Props> = ({ open, onOpenChange, targetProfileId, targetLabel }) => {
  const [pwd, setPwd] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!pwd || pwd.length < 8) {
      toast({ title: 'Too short', description: 'Password must be at least 8 characters.', variant: 'destructive' });
      return;
    }
    if (!/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd) || !/[0-9]/.test(pwd)) {
      toast({ title: 'Weak password', description: 'Password must contain uppercase, lowercase, and a number.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: { target_profile_id: targetProfileId, new_password: pwd },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message || 'Failed');
      toast({
        title: 'Password updated',
        description: `New password set for ${targetLabel}. Share it securely.`,
      });
      setPwd('');
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Reset failed', description: e?.message || 'Unable to reset password', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> Reset Password</DialogTitle>
          <DialogDescription className="text-xs">
            Set a new password for <strong>{targetLabel}</strong>. The user can sign in immediately with the new password.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label className="text-xs">New password</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={show ? 'text' : 'password'}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                placeholder="At least 6 characters"
                autoFocus
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShow((s) => !s)}
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button type="button" variant="outline" size="icon" title="Generate" onClick={() => { setPwd(generatePwd()); setShow(true); }}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Copy or share the password securely with the user. It won't be shown again.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !pwd}>
            {saving ? 'Saving…' : 'Update Password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ResetPasswordDialog;
