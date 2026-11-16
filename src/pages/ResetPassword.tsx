import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2, KeyRound } from 'lucide-react';
import { validateNewPassword } from '@/utils/passwordReset';

const ResetPassword = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    const errDesc = new URLSearchParams(hash.slice(1)).get('error_description') || params.get('error_description');
    if (errDesc) { sessionStorage.removeItem('zenpos_password_recovery'); setInvalid(true); return; }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && hash.includes('type=recovery'))) setReady(true);
    });
    const code = params.get('code');
    (async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) { setInvalid(true); return; }
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) setReady(true);
      else setTimeout(async () => {
        const { data: d2 } = await supabase.auth.getSession();
        if (d2.session) setReady(true); else { sessionStorage.removeItem('zenpos_password_recovery'); setInvalid(true); }
      }, 2500);
    })();
    return () => subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateNewPassword(password, confirm);
    if (problem) { toast({ title: 'Check password', description: problem, variant: 'destructive' }); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) { toast({ title: 'Could not update password', description: error.message, variant: 'destructive' }); return; }
    sessionStorage.removeItem('zenpos_password_recovery');
    toast({ title: 'Password updated', description: 'Please sign in with your new password.' });
    await supabase.auth.signOut();
    navigate('/auth', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-xl p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Set a new password</h1>
          <p className="text-sm text-muted-foreground mt-1">ZenPOS account recovery</p>
        </div>
        {invalid ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">This reset link is invalid or has expired. Please request a new one.</p>
            <Button className="w-full" onClick={() => navigate('/auth', { replace: true })}>Back to sign in</Button>
          </div>
        ) : !ready ? (
          <div className="flex justify-center py-6"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <div className="relative">
                <Input id="new-password" type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required />
                <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input id="confirm-password" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </div>
            <p className="text-xs text-muted-foreground">At least 8 characters, with letters and numbers.</p>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Update password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
