import React, { useState } from 'react';
import { Loader2, FlaskConical } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { DEMO_PASSWORD, DEMO_ROLES, DEMO_SHOPS, demoEmail, DEMO_LOGINS_ENABLED } from '@/config/demoAccounts';
import { cn } from '@/lib/utils';

// TEMPORARY one-tap test logins. Remove before launch.
export const DemoAccountsPanel: React.FC = () => {
  const { signIn } = useAuth();
  const [shop, setShop] = useState<string>(DEMO_SHOPS[0].key);
  const [busy, setBusy] = useState<string | null>(null);
  if (!DEMO_LOGINS_ENABLED) return null;

  const login = async (role: (typeof DEMO_ROLES)[number]['role']) => {
    const email = demoEmail(shop, role);
    setBusy(role);
    const { error } = await signIn(email, DEMO_PASSWORD);
    setBusy(null);
    if (error) toast({ title: 'Demo login failed', description: 'Ask Super Admin to tap "Create demo accounts" first.', variant: 'destructive' });
  };

  return (
    <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted/40 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <FlaskConical className="h-4 w-4 text-primary" /> Demo test logins
        <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-muted-foreground">temporary</span>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-background p-1">
        {DEMO_SHOPS.map((s) => (
          <button key={s.key} type="button" onClick={() => setShop(s.key)}
            className={cn('rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
              shop === s.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {s.name.replace('Demo ', '')}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {DEMO_ROLES.map((r) => (
          <button key={r.role} type="button" disabled={!!busy} onClick={() => login(r.role)}
            aria-label={`Sign in as demo ${r.label}`}
            className="flex h-10 items-center justify-center rounded-lg border border-border bg-background text-[11px] font-semibold text-foreground transition-all hover:border-primary hover:text-primary active:scale-95 disabled:opacity-50">
            {busy === r.role ? <Loader2 className="h-4 w-4 animate-spin" /> : r.label}
          </button>
        ))}
      </div>
    </div>
  );
};
