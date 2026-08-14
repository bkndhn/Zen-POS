// Super-Admin control panel for per-admin cloud storage quotas (database + file storage).
// Limits apply to the admin and all of their branches. Local/offline usage is never limited.
import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { HardDrive, RefreshCw, Database, Image as ImageIcon } from 'lucide-react';

interface Props { adminId: string | null; adminName?: string; onClose: () => void }

type Unit = 'MB' | 'GB';

const fmtBytes = (b: number) => {
  if (!b) return '0 MB';
  const mb = b / 1048576;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`;
};

const splitQuota = (mb: number | null): { unlimited: boolean; value: string; unit: Unit } => {
  if (mb == null) return { unlimited: true, value: '', unit: 'MB' };
  if (mb >= 1024 && mb % 1024 === 0) return { unlimited: false, value: String(mb / 1024), unit: 'GB' };
  return { unlimited: false, value: String(mb), unit: 'MB' };
};

const toMb = (unlimited: boolean, value: string, unit: Unit): number | null => {
  if (unlimited) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return unit === 'GB' ? n * 1024 : n;
};

export const SuperAdminStorageQuota: React.FC<Props> = ({ adminId, adminName, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [measuring, setMeasuring] = useState(false);

  const [dbUnlimited, setDbUnlimited] = useState(true);
  const [dbValue, setDbValue] = useState('');
  const [dbUnit, setDbUnit] = useState<Unit>('MB');

  const [fileUnlimited, setFileUnlimited] = useState(true);
  const [fileValue, setFileValue] = useState('');
  const [fileUnit, setFileUnit] = useState<Unit>('MB');

  const [cleanupPermission, setCleanupPermission] = useState(false);
  const [notes, setNotes] = useState('');
  const [usage, setUsage] = useState<{ db_bytes: number; file_bytes: number; computed_at?: string } | null>(null);

  useEffect(() => {
    if (!adminId) return;
    (async () => {
      setLoading(true);
      const [{ data: q }, { data: u }] = await Promise.all([
        supabase.from('admin_storage_quotas').select('*').eq('admin_id', adminId).maybeSingle(),
        supabase.from('admin_storage_usage').select('db_bytes, file_bytes, computed_at').eq('admin_id', adminId).maybeSingle(),
      ]);
      const d = splitQuota((q as any)?.db_quota_mb ?? null);
      setDbUnlimited(d.unlimited); setDbValue(d.value); setDbUnit(d.unit);
      const f = splitQuota((q as any)?.file_quota_mb ?? null);
      setFileUnlimited(f.unlimited); setFileValue(f.value); setFileUnit(f.unit);
      setCleanupPermission(!!(q as any)?.cleanup_permission);
      setNotes((q as any)?.notes || '');
      setUsage((u as any) ?? null);
      setLoading(false);
    })();
  }, [adminId]);

  if (!adminId) return null;

  const measure = async () => {
    setMeasuring(true);
    const { data, error } = await supabase.rpc('calc_admin_storage_usage', { p_admin_id: adminId });
    setMeasuring(false);
    if (error) return toast.error(error.message);
    const res = data as any;
    setUsage({ db_bytes: res?.db_bytes ?? 0, file_bytes: res?.file_bytes ?? 0, computed_at: res?.computed_at });
    toast.success('Usage recalculated');
  };

  const save = async () => {
    setSaving(true);
    const payload = {
      admin_id: adminId,
      db_quota_mb: toMb(dbUnlimited, dbValue, dbUnit),
      file_quota_mb: toMb(fileUnlimited, fileValue, fileUnit),
      cleanup_permission: cleanupPermission,
      notes: notes || null,
    };
    const { error } = await supabase.from('admin_storage_quotas').upsert(payload as any, { onConflict: 'admin_id' });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Storage limits saved');
    onClose();
  };

  const dbQuotaMb = toMb(dbUnlimited, dbValue, dbUnit);
  const fileQuotaMb = toMb(fileUnlimited, fileValue, fileUnit);
  const dbPct = dbQuotaMb ? Math.min(100, ((usage?.db_bytes ?? 0) / (dbQuotaMb * 1048576)) * 100) : 0;
  const filePct = fileQuotaMb ? Math.min(100, ((usage?.file_bytes ?? 0) / (fileQuotaMb * 1048576)) * 100) : 0;

  return (
    <Dialog open={!!adminId} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><HardDrive className="w-4 h-4" /> Cloud Storage Limits</DialogTitle>
          <p className="text-xs text-muted-foreground">{adminName} — applies to this admin and all their branches</p>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-muted-foreground py-6">Loading…</div>
        ) : (
          <div className="space-y-4">
            {/* Current usage */}
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Current usage</div>
                <Button variant="outline" size="sm" onClick={measure} disabled={measuring} className="h-7 text-xs">
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${measuring ? 'animate-spin' : ''}`} /> Recalculate
                </Button>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1"><Database className="w-3 h-3" /> Database</span>
                  <span className="font-medium">{fmtBytes(usage?.db_bytes ?? 0)}{dbQuotaMb ? ` / ${fmtBytes(dbQuotaMb * 1048576)}` : ' / Unlimited'}</span>
                </div>
                <Progress value={dbPct} className="h-1.5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" /> File storage</span>
                  <span className="font-medium">{fmtBytes(usage?.file_bytes ?? 0)}{fileQuotaMb ? ` / ${fmtBytes(fileQuotaMb * 1048576)}` : ' / Unlimited'}</span>
                </div>
                <Progress value={filePct} className="h-1.5" />
              </div>
              {usage?.computed_at && (
                <p className="text-[10px] text-muted-foreground">Measured {new Date(usage.computed_at).toLocaleString()}</p>
              )}
            </div>

            {/* DB quota */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Database limit</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Unlimited</span>
                  <Switch checked={dbUnlimited} onCheckedChange={setDbUnlimited} />
                </div>
              </div>
              {!dbUnlimited && (
                <div className="flex gap-2">
                  <Input type="number" min={1} placeholder="e.g. 500" value={dbValue} onChange={e => setDbValue(e.target.value)} />
                  <Select value={dbUnit} onValueChange={v => setDbUnit(v as Unit)}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MB">MB</SelectItem>
                      <SelectItem value="GB">GB</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">When exceeded, new bills, orders, items and expenses are blocked in the cloud. Offline/local use is never limited.</p>
            </div>

            {/* File quota */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">File storage limit</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Unlimited</span>
                  <Switch checked={fileUnlimited} onCheckedChange={setFileUnlimited} />
                </div>
              </div>
              {!fileUnlimited && (
                <div className="flex gap-2">
                  <Input type="number" min={1} placeholder="e.g. 1" value={fileValue} onChange={e => setFileValue(e.target.value)} />
                  <Select value={fileUnit} onValueChange={v => setFileUnit(v as Unit)}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MB">MB</SelectItem>
                      <SelectItem value="GB">GB</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Applies to item images and uploads for this admin.</p>
            </div>

            {/* Cleanup permission */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="pr-3">
                <div className="font-medium text-sm">Allow old-data deletion</div>
                <div className="text-xs text-muted-foreground">Paid add-on. Lets the admin (not staff) purge old records to free space.</div>
              </div>
              <Switch checked={cleanupPermission} onCheckedChange={setCleanupPermission} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Internal notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Plan / billing note" />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save limits'}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SuperAdminStorageQuota;
