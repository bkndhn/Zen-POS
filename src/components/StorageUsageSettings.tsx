// Admin-only cloud storage usage panel + gated old-data cleanup tool.
// Limits are set by the Super Admin and apply to the admin and all their branches.
import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { HardDrive, RefreshCw, Database, Image as ImageIcon, Trash2, AlertTriangle, Lock } from 'lucide-react';

const fmtBytes = (b: number) => {
  if (!b) return '0 MB';
  const mb = b / 1048576;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`;
};
const fmtQuota = (mb: number | null) => (mb == null ? 'Unlimited' : fmtBytes(mb * 1048576));

const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
};

export const StorageUsageSettings: React.FC = () => {
  const { profile, adminProfileId } = useAuth();
  const adminId = adminProfileId;
  const isAdmin = profile?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quota, setQuota] = useState<{ db_quota_mb: number | null; file_quota_mb: number | null; cleanup_permission: boolean } | null>(null);
  const [usage, setUsage] = useState<{ db_bytes: number; file_bytes: number; computed_at?: string } | null>(null);

  const [preset, setPreset] = useState('12');
  const [customDate, setCustomDate] = useState(monthsAgo(12));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [purging, setPurging] = useState(false);

  const load = useCallback(async () => {
    if (!adminId) { setLoading(false); return; }
    const [{ data: q }, { data: u }] = await Promise.all([
      supabase.from('admin_storage_quotas').select('db_quota_mb, file_quota_mb, cleanup_permission').eq('admin_id', adminId).maybeSingle(),
      supabase.from('admin_storage_usage').select('db_bytes, file_bytes, computed_at').eq('admin_id', adminId).maybeSingle(),
    ]);
    setQuota((q as any) ?? { db_quota_mb: null, file_quota_mb: null, cleanup_permission: false });
    setUsage((u as any) ?? null);
    setLoading(false);
  }, [adminId]);

  useEffect(() => { load(); }, [load]);

  const recalc = async () => {
    if (!adminId) return;
    setRefreshing(true);
    const { data, error } = await supabase.rpc('calc_admin_storage_usage', { p_admin_id: adminId });
    setRefreshing(false);
    if (error) return toast.error(error.message);
    const res = data as any;
    setUsage({ db_bytes: res?.db_bytes ?? 0, file_bytes: res?.file_bytes ?? 0, computed_at: res?.computed_at });
    toast.success('Storage usage updated');
  };

  const cutoffDate = preset === 'custom' ? customDate : monthsAgo(Number(preset));

  const runPurge = async () => {
    if (confirmText.trim().toUpperCase() !== 'DELETE') {
      toast.error('Type DELETE to confirm');
      return;
    }
    setPurging(true);
    const { data, error } = await supabase.rpc('admin_purge_old_data', { p_before_date: cutoffDate, p_confirm: 'DELETE' });
    setPurging(false);
    if (error) return toast.error(error.message);
    const counts = (data as any)?.deleted ?? {};
    const total = Object.values(counts).reduce((s: number, n: any) => s + Number(n || 0), 0);
    toast.success(`Deleted ${total} old records`);
    setConfirmOpen(false);
    setConfirmText('');
    load();
  };

  if (!isAdmin || !adminId) return null;
  if (loading) return null;

  const dbPct = quota?.db_quota_mb ? Math.min(100, ((usage?.db_bytes ?? 0) / (quota.db_quota_mb * 1048576)) * 100) : 0;
  const filePct = quota?.file_quota_mb ? Math.min(100, ((usage?.file_bytes ?? 0) / (quota.file_quota_mb * 1048576)) * 100) : 0;
  const dbFull = dbPct >= 100;
  const fileFull = filePct >= 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><HardDrive className="w-4 h-4 text-primary" /> Cloud Storage Usage</CardTitle>
        <CardDescription>
          Your cloud limit covers this account and all its branches. Offline / local use is never limited.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Current usage</span>
            <Button variant="outline" size="sm" onClick={recalc} disabled={refreshing} className="h-8 text-xs">
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium"><Database className="w-3.5 h-3.5" /> Database</span>
              <span>{fmtBytes(usage?.db_bytes ?? 0)} / {fmtQuota(quota?.db_quota_mb ?? null)}</span>
            </div>
            <Progress value={dbPct} className="h-2" />
            {dbFull && <p className="text-xs text-destructive font-medium">Limit reached — new cloud records are blocked until space is freed.</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium"><ImageIcon className="w-3.5 h-3.5" /> Images & files</span>
              <span>{fmtBytes(usage?.file_bytes ?? 0)} / {fmtQuota(quota?.file_quota_mb ?? null)}</span>
            </div>
            <Progress value={filePct} className="h-2" />
            {fileFull && <p className="text-xs text-destructive font-medium">File limit reached — new uploads are blocked.</p>}
          </div>

          {usage?.computed_at && (
            <p className="text-[11px] text-muted-foreground">Last measured {new Date(usage.computed_at).toLocaleString()}</p>
          )}
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label className="text-base flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-destructive" /> Delete old data
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Permanently removes old bills, orders, feedback and logs to free cloud space. This cannot be undone.
              </p>
            </div>
            {quota?.cleanup_permission
              ? <Badge variant="secondary" className="shrink-0">Enabled</Badge>
              : <Badge variant="outline" className="shrink-0 gap-1"><Lock className="w-3 h-3" /> Locked</Badge>}
          </div>

          {!quota?.cleanup_permission ? (
            <p className="text-xs text-muted-foreground">
              This is a paid add-on. Contact support to enable data cleanup for your account.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Delete records older than</Label>
                  <Select value={preset} onValueChange={setPreset}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24">2 years</SelectItem>
                      <SelectItem value="12">1 year</SelectItem>
                      <SelectItem value="6">6 months</SelectItem>
                      <SelectItem value="3">3 months</SelectItem>
                      <SelectItem value="custom">Custom date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {preset === 'custom' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Before date</Label>
                    <Input type="date" value={customDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setCustomDate(e.target.value)} />
                  </div>
                )}
              </div>
              <Button variant="destructive" onClick={() => { setConfirmText(''); setConfirmOpen(true); }} className="w-full sm:w-auto">
                <Trash2 className="w-4 h-4 mr-2" /> Delete data before {cutoffDate}
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Permanently delete old data?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 pt-1">
              <span className="block">
                All bills, bill items, table &amp; online orders, feedback, stock ledger and logs created
                <strong> before {cutoffDate}</strong> will be permanently deleted for this account and every branch.
              </span>
              <span className="block font-semibold text-destructive">This action cannot be undone. Take a backup first.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Type <strong>DELETE</strong> to confirm</Label>
            <Input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="DELETE" autoFocus />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purging}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); runPurge(); }}
              disabled={purging || confirmText.trim().toUpperCase() !== 'DELETE'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {purging ? 'Deleting…' : 'Delete permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default StorageUsageSettings;
