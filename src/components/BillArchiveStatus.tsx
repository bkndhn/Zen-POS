import { useEffect, useState } from 'react';
import { Archive } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

type Status = { active: number; archived: number; eligible_60d: number; oldest_archived: string | null; pipeline_enabled: boolean; scheduled: boolean };

export function BillArchiveStatus() {
  const { profile } = useAuth();
  const [s, setS] = useState<Status | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (profile?.role !== 'admin') return;
    (supabase.rpc as any)('get_bill_archive_status').then(({ data, error }: any) => {
      if (error) setError(true); else setS(data as Status);
    });
  }, [profile?.role]);
  if (profile?.role !== 'admin') return null;
  if (error) return <p className="text-sm text-destructive">Could not load bill storage status.</p>;
  if (!s) return <div className="h-24 rounded-lg bg-muted animate-pulse" />;
  const stat = (label: string, value: string | number) => (
    <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-semibold text-foreground">{value}</p></div>
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground"><Archive className="h-4 w-4 text-primary" />Bill storage</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat('Active bills', s.active)}
        {stat('Archived bills', s.archived)}
        {stat('Older than 60 days', s.eligible_60d)}
        {stat('Oldest archived', s.oldest_archived ?? '—')}
      </div>
      <p className="text-xs text-muted-foreground">
        {s.pipeline_enabled && s.scheduled
          ? 'Monthly archive is on. Old settled bills move during the quiet period on the 1st of each month.'
          : 'Monthly archive is off. No bills are moved; all history stays in active bills. Next run: not scheduled.'}
      </p>
    </div>
  );
}
