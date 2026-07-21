import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Shield, Users as UsersIcon, Settings, Database, RefreshCw, Play, CheckCircle2, XCircle, Download, Upload, KeyRound, Activity } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ALL_NAV_ITEMS } from '@/config/navItems';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResetPasswordDialog } from '@/components/ResetPasswordDialog';
import { EditContactDialog } from '@/components/EditContactDialog';
import { SuperAdminAiLimits } from '@/components/SuperAdminAiLimits';
import { Pencil, Sparkles } from 'lucide-react';

interface Row {
  profile_id: string;
  user_id: string;
  email: string | null;
  name: string;
  role: string;
  hotel_name: string | null;
  shop_name: string | null;
  mobile_number: string | null;
  address: string | null;
  status: string;
  admin_id: string | null;
  admin_name: string | null;
  last_login: string | null;
  login_count: number;
  created_at: string;
  client_permissions?: Record<string, boolean>;
}

const SuperAdminUsers: React.FC = () => {
  const { profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Modal / Permissions State
  const [selectedAdmin, setSelectedAdmin] = useState<Row | null>(null);
  const [permsDialogOpen, setPermsDialogOpen] = useState(false);
  const [pwdTarget, setPwdTarget] = useState<{ id: string; label: string } | null>(null);
  const [contactTarget, setContactTarget] = useState<Row | null>(null);
  const [aiLimitTarget, setAiLimitTarget] = useState<Row | null>(null);

  // Backup & Restore State
  const [activeTab, setActiveTab] = useState('users');
  const [backupSettings, setBackupSettings] = useState<any>(null);
  const [backupLogs, setBackupLogs] = useState<any[]>([]);
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [triggeringBackup, setTriggeringBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [gdriveFolderId, setGdriveFolderId] = useState('');
  const [gdriveCredentials, setGdriveCredentials] = useState('');
  const [isBackupEnabled, setIsBackupEnabled] = useState(true);
  const [retentionDays, setRetentionDays] = useState(10);

  // Support details state
  const [supportPhone, setSupportPhone] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [supportWhatsapp, setSupportWhatsapp] = useState('');
  const [supportCustomDetails, setSupportCustomDetails] = useState('');
  const [showSupportPhone, setShowSupportPhone] = useState(true);
  const [showSupportEmail, setShowSupportEmail] = useState(true);
  const [showSupportWhatsapp, setShowSupportWhatsapp] = useState(true);
  const [showSupportCustom, setShowSupportCustom] = useState(true);
  const [savingSupport, setSavingSupport] = useState(false);
  const [loadingSupport, setLoadingSupport] = useState(false);

  const fetchSupportData = async () => {
    try {
      setLoadingSupport(true);
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('id', true)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setSupportPhone(data.support_phone || '');
        setSupportEmail(data.support_email || '');
        setSupportWhatsapp(data.support_whatsapp || '');
        setSupportCustomDetails(data.support_custom_details || '');
        setShowSupportPhone(data.show_support_phone ?? true);
        setShowSupportEmail(data.show_support_email ?? true);
        setShowSupportWhatsapp(data.show_support_whatsapp ?? true);
        setShowSupportCustom(data.show_support_custom ?? true);
      }
    } catch (e: any) {
      console.error("Failed to load support data:", e);
      toast({ title: "Failed to load support settings", description: e.message, variant: "destructive" });
    } finally {
      setLoadingSupport(false);
    }
  };

  const handleSaveSupport = async () => {
    try {
      setSavingSupport(true);
      const { error } = await supabase
        .from('app_settings')
        .update({
          support_phone: supportPhone,
          support_email: supportEmail,
          support_whatsapp: supportWhatsapp,
          support_custom_details: supportCustomDetails,
          show_support_phone: showSupportPhone,
          show_support_email: showSupportEmail,
          show_support_whatsapp: showSupportWhatsapp,
          show_support_custom: showSupportCustom,
          updated_at: new Date().toISOString()
        })
        .eq('id', true);

      if (error) throw error;
      toast({ title: "Success", description: "Support settings saved successfully." });
    } catch (e: any) {
      console.error("Failed to save support settings:", e);
      toast({ title: "Failed to save support settings", description: e.message, variant: "destructive" });
    } finally {
      setSavingSupport(false);
    }
  };

  const fetchBackupData = async () => {
    try {
      setLoadingBackup(true);
      const { data: settings, error: settingsErr } = await supabase
        .from('backup_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (settingsErr) throw settingsErr;

      if (settings) {
        setBackupSettings(settings);
        setGdriveFolderId(settings.gdrive_folder_id || '');
        setGdriveCredentials(settings.gdrive_credentials ? JSON.stringify(settings.gdrive_credentials, null, 2) : '');
        setIsBackupEnabled(settings.is_enabled);
        setRetentionDays(settings.retention_days || 10);
      }
      
      const { data: logs, error: logsErr } = await supabase
        .from('backup_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (logsErr) throw logsErr;
      if (logs) setBackupLogs(logs);
    } catch (e: any) {
      console.error("Failed to load backup data:", e);
      toast({ title: "Failed to load backup logs", description: e.message, variant: "destructive" });
    } finally {
      setLoadingBackup(false);
    }
  };

  const saveBackupSettings = async () => {
    try {
      let parsedCreds = null;
      if (gdriveCredentials.trim()) {
        try {
          parsedCreds = JSON.parse(gdriveCredentials);
        } catch (e) {
          return toast({ title: "Invalid Credentials JSON", description: "Please enter valid Google Service Account JSON.", variant: "destructive" });
        }
      }
      
      const { error } = await supabase.from('backup_settings').upsert({
        id: backupSettings?.id || undefined,
        gdrive_folder_id: gdriveFolderId || null,
        gdrive_credentials: parsedCreds,
        is_enabled: isBackupEnabled,
        retention_days: retentionDays,
        updated_at: new Date().toISOString()
      });
      
      if (error) throw error;
      
      toast({ title: "Settings Saved", description: "Backup configurations updated successfully." });
      fetchBackupData();
    } catch (e: any) {
      toast({ title: "Failed to save settings", description: e.message, variant: "destructive" });
    }
  };

  const triggerBackupNow = async () => {
    setTriggeringBackup(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-backup', {
        method: 'POST'
      });
      
      if (error) throw error;
      
      toast({ title: "Backup Process Finished", description: data?.details || "Database backup ran successfully." });
      fetchBackupData();
    } catch (e: any) {
      console.error("Backup trigger failed", e);
      toast({ title: "Backup Execution Failed", description: e.message || "Ensure your Edge Function is deployed.", variant: "destructive" });
      fetchBackupData();
    } finally {
      setTriggeringBackup(false);
    }
  };

  const downloadBackupFile = async () => {
    try {
      toast({ title: "Generating local backup...", description: "Compiling database tables into JSON." });
      const tablesToDump = [
        'profiles', 'branches', 'user_branches', 'user_permissions',
        'items', 'item_categories', 'bills', 'bill_items',
        'purchases', 'purchase_items', 'purchase_distributions', 'purchase_payments',
        'suppliers', 'expenses', 'expense_categories', 'tables', 'table_orders',
        'shop_settings', 'tax_rates', 'additional_charges', 'payments', 'display_settings'
      ];
      
      const databaseDump: Record<string, any[]> = {};
      for (const table of tablesToDump) {
        const { data, error } = await (supabase as any).from(table).select('*');
        if (error) console.error(`Error dumping table ${table}:`, error);
        databaseDump[table] = data || [];
      }
      
      const backupJsonString = JSON.stringify({
        version: "1.0",
        backup_timestamp: new Date().toISOString(),
        data: databaseDump
      }, null, 2);
      
      const blob = new Blob([backupJsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `zenpos_local_backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: "Backup Downloaded", description: "Database dump downloaded successfully." });
    } catch (e: any) {
      toast({ title: "Failed to generate backup", description: e.message, variant: "destructive" });
    }
  };

  const restoreDatabaseFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmRestore = window.confirm("WARNING: This will overwrite existing database records with the backup file data. This action CANNOT be undone. Are you sure you want to proceed?");
    if (!confirmRestore) {
      e.target.value = '';
      return;
    }
    
    setRestoringBackup(true);
    try {
      const text = await file.text();
      const backupObj = JSON.parse(text);
      
      if (!backupObj.version || !backupObj.data) {
        throw new Error("Invalid backup file structure. Missing version or data.");
      }
      
      const restoreData = backupObj.data;
      
      const tablesOrder = [
        'profiles', 'branches', 'user_branches', 'user_permissions',
        'suppliers', 'item_categories', 'items', 'bills', 'bill_items',
        'purchases', 'purchase_items', 'purchase_distributions', 'purchase_payments',
        'expenses', 'expense_categories', 'tables', 'table_orders',
        'shop_settings', 'tax_rates', 'additional_charges', 'payments', 'display_settings'
      ];
      
      for (const table of tablesOrder) {
        const rows = restoreData[table];
        if (rows && rows.length > 0) {
          // Batch upsert in chunks of 100
          for (let i = 0; i < rows.length; i += 100) {
            const chunk = rows.slice(i, i + 100);
            const { error } = await (supabase as any).from(table).upsert(chunk);
            if (error) throw new Error(`Table ${table} restore failed: ${error.message}`);
          }
        }
      }
      
      toast({ title: "Database Restored", description: "All client and branch data restored successfully." });
      fetchUsers();
    } catch (e: any) {
      console.error("Restore failed", e);
      toast({ title: "Restore Failed", description: e.message, variant: "destructive" });
    } finally {
      setRestoringBackup(false);
      e.target.value = '';
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error: rpcError } = await (supabase as any).rpc('get_all_users_for_super_admin');
      if (rpcError) throw rpcError;

      if (data) {
        // Enriched with client_permissions from profiles table
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, client_permissions');

        if (profilesError) throw profilesError;

        const permsMap = new Map((profilesData || []).map(p => [p.id, p.client_permissions]));

        const enrichedRows = (data as Row[]).map(r => ({
          ...r,
          client_permissions: (permsMap.get(r.profile_id) as any) || {}
        }));

        setRows(enrichedRows);
      }
    } catch (err: any) {
      console.error('Failed to load super admin users:', err);
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.role === 'super_admin') {
      fetchUsers();
    }
  }, [profile]);

  useEffect(() => {
    if (profile?.role === 'super_admin' && activeTab === 'backups') {
      fetchBackupData();
    }
  }, [activeTab, profile]);

  useEffect(() => {
    if (profile?.role === 'super_admin' && activeTab === 'support') {
      fetchSupportData();
    }
  }, [activeTab, profile]);

  const handleTogglePermission = async (adminProfileId: string, toPath: string, enabled: boolean) => {
    const admin = rows.find(r => r.profile_id === adminProfileId);
    if (!admin) return;

    const currentPerms = admin.client_permissions || {};
    const updatedPerms = { ...currentPerms, [toPath]: enabled };

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ client_permissions: updatedPerms })
        .eq('id', adminProfileId);

      if (error) throw error;

      // Update local state immediately
      setRows(prev => prev.map(r => r.profile_id === adminProfileId ? { ...r, client_permissions: updatedPerms } : r));
      setSelectedAdmin(prev => prev && prev.profile_id === adminProfileId ? { ...prev, client_permissions: updatedPerms } : prev);

      // Broadcast to all connected clients instantly (no refresh needed)
      const bc = supabase.channel(`permissions:${adminProfileId}`);
      bc.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await bc.send({ type: 'broadcast', event: 'permissions_updated', payload: { client_permissions: updatedPerms } });
          supabase.removeChannel(bc);
        }
      });

      toast({
        title: "Permission updated",
        description: `${enabled ? 'Enabled' : 'Disabled'} access for ${admin.hotel_name || admin.name}`,
      });
    } catch (err: any) {
      console.error('Failed to update client permission:', err);
      toast({
        title: "Update failed",
        description: err.message || "Failed to update database record",
        variant: "destructive"
      });
    }
  };

  const handleSetAllPermissions = async (adminProfileId: string, enabled: boolean) => {
    const admin = rows.find(r => r.profile_id === adminProfileId);
    if (!admin) return;
    const base: Record<string, boolean> = {};
    ALL_NAV_ITEMS.forEach(item => { base[item.to] = enabled; });
    base['receipt_qr'] = enabled;
    base['calci_billing'] = enabled;
    base['allow_cloud_storage'] = enabled;
    try {
      const { error } = await supabase.from('profiles').update({ client_permissions: base }).eq('id', adminProfileId);
      if (error) throw error;
      setRows(prev => prev.map(r => r.profile_id === adminProfileId ? { ...r, client_permissions: base } : r));
      setSelectedAdmin(prev => prev && prev.profile_id === adminProfileId ? { ...prev, client_permissions: base } : prev);
      // Broadcast instantly
      const bc = supabase.channel(`permissions:${adminProfileId}`);
      bc.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await bc.send({ type: 'broadcast', event: 'permissions_updated', payload: { client_permissions: base } });
          supabase.removeChannel(bc);
        }
      });
      toast({ title: `All permissions ${enabled ? 'enabled' : 'disabled'}`, description: `Updated for ${admin.hotel_name || admin.name}` });
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      (r.name || '').toLowerCase().includes(s) ||
      (r.email || '').toLowerCase().includes(s) ||
      (r.hotel_name || '').toLowerCase().includes(s) ||
      (r.admin_name || '').toLowerCase().includes(s)
    );
  }, [rows, q]);

  if (authLoading) return null;
  if (!profile) return <Navigate to="/auth" replace />;
  if (profile.role !== 'super_admin') return <Navigate to="/" replace />;

  const admins = filtered.filter(r => r.role === 'admin');
  const subUsers = filtered.filter(r => r.role === 'user');

  const statusBadge = (s: string) => {
    const v = (s || 'active').toLowerCase();
    const variant = v === 'active' ? 'default' : v === 'suspended' || v === 'paused' ? 'destructive' : 'secondary';
    return <Badge variant={variant as any} className="text-[10px]">{v.toUpperCase()}</Badge>;
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-24">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">Super Admin Portal</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => window.location.assign('/super-admin/rum')}>
              <Activity className="w-3.5 h-3.5 mr-1" /> RUM Dashboard
            </Button>
            <Badge className="px-3 py-1 font-bold text-xs uppercase tracking-wider bg-primary/10 border-primary/20 text-primary">System Overlord</Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 max-w-lg bg-slate-100 dark:bg-slate-900 border rounded-xl p-1">
            <TabsTrigger value="users" className="rounded-lg py-2 text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm">
              <UsersIcon className="w-3.5 h-3.5 mr-2" /> Users & Permissions
            </TabsTrigger>
            <TabsTrigger value="backups" className="rounded-lg py-2 text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm">
              <Database className="w-3.5 h-3.5 mr-2" /> Backup & Recovery
            </TabsTrigger>
            <TabsTrigger value="support" className="rounded-lg py-2 text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm">
              <Settings className="w-3.5 h-3.5 mr-2" /> Support Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6 mt-6 focus-visible:outline-none">
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
              <Input placeholder="Search by name, email, hotel or parent admin..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md h-10 shadow-sm bg-white dark:bg-slate-800" />
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm px-4 py-3 flex items-start gap-2 animate-pulse">
                <span className="text-base shrink-0">⚠️</span>
                <p className="font-semibold">{error}</p>
              </div>
            )}

            {/* Admins Table */}
            <Card className="border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
              <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-4">
                <CardTitle className="text-sm sm:text-base flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                  <UsersIcon className="w-4 h-4 text-primary" /> Tenant Admins ({admins.length})
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Admins who manage separate hotel client instances.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/30 dark:bg-slate-950/20">
                    <TableRow>
                      <TableHead className="font-bold text-xs">Name</TableHead>
                      <TableHead className="font-bold text-xs">Email</TableHead>
                      <TableHead className="font-bold text-xs">Mobile</TableHead>
                      <TableHead className="font-bold text-xs">Hotel</TableHead>
                      <TableHead className="font-bold text-xs">Shop</TableHead>
                      <TableHead className="font-bold text-xs">Address</TableHead>
                      <TableHead className="font-bold text-xs">Status</TableHead>
                      <TableHead className="font-bold text-xs">Logins</TableHead>
                      <TableHead className="font-bold text-xs">Last Login</TableHead>
                      <TableHead className="font-bold text-xs">Created</TableHead>
                      <TableHead className="text-right font-bold text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && <TableRow><TableCell colSpan={11} className="text-center py-6 text-muted-foreground">Loading...</TableCell></TableRow>}
                    {!loading && admins.length === 0 && <TableRow><TableCell colSpan={11} className="text-center py-6 text-muted-foreground">No admins found</TableCell></TableRow>}
                    {admins.map(r => (
                      <TableRow key={r.profile_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20">
                        <TableCell className="font-semibold">
                          <div className="flex items-center gap-2">
                            {r.name}
                            <Badge variant="default" className="text-[9px] font-bold px-1.5 py-0.5">Admin</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{r.email || '—'}</TableCell>
                        <TableCell className="text-xs font-mono">{r.mobile_number || '—'}</TableCell>
                        <TableCell className="font-medium">{r.hotel_name || '—'}</TableCell>
                        <TableCell className="font-medium">{r.shop_name || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={r.address || ''}>{r.address || '—'}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell className="font-semibold">{r.login_count ?? 0}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{r.last_login ? new Date(r.last_login).toLocaleString() : '—'}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setContactTarget(r)}
                              className="h-8 text-xs px-2 border-slate-200 dark:border-slate-800 rounded-xl"
                              title="Edit contact"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPwdTarget({ id: r.profile_id, label: r.hotel_name || r.name || r.email || 'user' })}
                              className="h-8 text-xs px-2 border-slate-200 dark:border-slate-800 rounded-xl"
                              title="Reset password"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setAiLimitTarget(r)}
                              className="h-8 text-xs px-2 border-slate-200 dark:border-slate-800 rounded-xl"
                              title="AI Insights limits"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedAdmin(r);
                                setPermsDialogOpen(true);
                              }}
                              className="h-8 text-xs px-3 border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground shadow-sm transition-all duration-150 gap-1.5 rounded-xl font-semibold"
                            >
                              <Shield className="w-3.5 h-3.5" />
                              Permissions
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Sub-users Table */}
            <Card className="border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
              <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-4">
                <CardTitle className="text-sm sm:text-base flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                  <UsersIcon className="w-4 h-4 text-primary" /> Branch Staff & Sub-users ({subUsers.length})
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Sub-users assigned to individual hotel client branches.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/30 dark:bg-slate-950/20">
                    <TableRow>
                      <TableHead className="font-bold text-xs">Name</TableHead>
                      <TableHead className="font-bold text-xs">Email</TableHead>
                      <TableHead className="font-bold text-xs">Mobile</TableHead>
                      <TableHead className="font-bold text-xs">Parent Admin</TableHead>
                      <TableHead className="font-bold text-xs">Status</TableHead>
                      <TableHead className="font-bold text-xs">Logins</TableHead>
                      <TableHead className="font-bold text-xs">Last Login</TableHead>
                      <TableHead className="text-right font-bold text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Loading...</TableCell></TableRow>}
                    {!loading && subUsers.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No sub-users found</TableCell></TableRow>}
                    {subUsers.map(r => (
                      <TableRow key={r.profile_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20">
                        <TableCell className="font-semibold">{r.name}</TableCell>
                        <TableCell className="text-xs font-mono">{r.email || '—'}</TableCell>
                        <TableCell className="text-xs font-mono">{r.mobile_number || '—'}</TableCell>
                        <TableCell className="font-medium text-slate-700 dark:text-slate-300">{r.admin_name || '—'}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell className="font-semibold">{r.login_count ?? 0}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{r.last_login ? new Date(r.last_login).toLocaleString() : '—'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setContactTarget(r)}
                              className="h-8 text-xs px-2 border-slate-200 dark:border-slate-800 rounded-xl"
                              title="Edit contact"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPwdTarget({ id: r.profile_id, label: r.name || r.email || 'user' })}
                              className="h-8 text-xs px-2 border-slate-200 dark:border-slate-800 rounded-xl"
                              title="Reset password"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="backups" className="space-y-6 mt-6 focus-visible:outline-none">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Backup Settings Configuration */}
              <div className="lg:col-span-1 space-y-6">
                <Card className="border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-sm sm:text-base flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                      <Settings className="w-4 h-4 text-primary" /> Google Drive Settings
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">Configure auto backup credentials and GDrive folders.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl border bg-slate-50 dark:bg-slate-950">
                      <div className="flex flex-col gap-0.5">
                        <Label className="text-xs font-bold">Enable Auto Backup</Label>
                        <span className="text-[10px] text-muted-foreground">Upload backups to Google Drive.</span>
                      </div>
                      <Switch checked={isBackupEnabled} onCheckedChange={setIsBackupEnabled} />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Google Drive Folder ID</Label>
                      <Input placeholder="Enter GDrive Folder ID..." value={gdriveFolderId} onChange={e => setGdriveFolderId(e.target.value)} className="h-9 text-xs bg-white dark:bg-slate-800 font-mono" />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs font-bold">Service Account JSON Credentials</Label>
                        <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono text-muted-foreground">OAuth2 JSON</Badge>
                      </div>
                      <textarea
                        placeholder='Paste Google Service Account credentials JSON here...'
                        value={gdriveCredentials}
                        onChange={e => setGdriveCredentials(e.target.value)}
                        className="w-full h-36 p-2 border rounded-lg text-[10px] font-mono bg-white dark:bg-slate-850 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary border-slate-200 dark:border-slate-800"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">Retention Days</Label>
                        <Input type="number" min={1} max={90} value={retentionDays} onChange={e => setRetentionDays(+e.target.value)} className="h-9 text-xs bg-white dark:bg-slate-800 font-semibold" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">Backup Schedule</Label>
                        <div className="h-9 border border-slate-200 dark:border-slate-800 rounded-lg px-2 flex items-center bg-slate-50 dark:bg-slate-950 text-[10px] font-bold text-muted-foreground font-mono">
                          08:00, 14:00, 23:00
                        </div>
                      </div>
                    </div>

                    <Button onClick={saveBackupSettings} disabled={loadingBackup} className="w-full h-9 font-bold mt-2 shadow-sm gap-1.5">
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingBackup ? 'animate-spin' : ''}`} /> Save Settings
                    </Button>
                  </CardContent>
                </Card>

                {/* Manual Actions */}
                <Card className="border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm bg-slate-50/50 dark:bg-slate-900/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-300">
                      Disaster Recovery Controls
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button onClick={triggerBackupNow} disabled={triggeringBackup} className="w-full h-9 font-bold bg-primary hover:bg-primary/90 text-white gap-1.5 shadow-sm">
                      <Play className={`w-3.5 h-3.5 ${triggeringBackup ? 'animate-pulse' : ''}`} /> Trigger Manual Backup
                    </Button>

                    <Button onClick={downloadBackupFile} variant="outline" className="w-full h-9 font-bold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:bg-slate-100 text-slate-700 dark:text-slate-300 gap-1.5 shadow-sm">
                      <Download className="w-3.5 h-3.5 text-primary" /> Download Local Backup (JSON)
                    </Button>

                    <div className="relative pt-1">
                      <Label htmlFor="restore-file-input" className="w-full h-9 border border-dashed border-primary/30 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold text-primary hover:bg-primary/5 cursor-pointer shadow-sm transition-all">
                        {restoringBackup ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        {restoringBackup ? 'Restoring Database...' : 'Restore Database from File'}
                      </Label>
                      <input
                        id="restore-file-input"
                        type="file"
                        accept=".json"
                        disabled={restoringBackup}
                        onChange={restoreDatabaseFromFile}
                        className="hidden"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Activity Logs history list */}
              <div className="lg:col-span-2">
                <Card className="border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm h-full flex flex-col">
                  <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-4">
                    <CardTitle className="text-sm sm:text-base flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                      <Database className="w-4 h-4 text-primary" /> Backup Activity Logs (Last 10 Days)
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">List of all automated and manual database backup executions.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 overflow-y-auto flex-1 max-h-[500px] scroll-smooth">
                    <Table>
                      <TableHeader className="bg-slate-50/30 dark:bg-slate-950/20">
                        <TableRow>
                          <TableHead className="font-bold text-xs">Date/Time</TableHead>
                          <TableHead className="font-bold text-xs">Status</TableHead>
                          <TableHead className="font-bold text-xs">File Name</TableHead>
                          <TableHead className="font-bold text-xs">File Size</TableHead>
                          <TableHead className="font-bold text-xs">Activity Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingBackup && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading logs...</TableCell></TableRow>}
                        {!loadingBackup && backupLogs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No backup activities recorded yet.</TableCell></TableRow>}
                        {backupLogs.map(log => (
                          <TableRow key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 text-xs">
                            <TableCell className="font-mono text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</TableCell>
                            <TableCell>
                              {log.status === 'success' ? (
                                <Badge className="bg-emerald-500/10 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1 w-max font-bold py-0.5 px-2 text-[10px]">
                                  <CheckCircle2 className="w-3 h-3" /> SUCCESS
                                </Badge>
                              ) : (
                                <Badge className="bg-rose-500/10 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center gap-1 w-max font-bold py-0.5 px-2 text-[10px]">
                                  <XCircle className="w-3 h-3" /> FAILED
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-semibold max-w-[150px] truncate" title={log.file_name}>{log.file_name || '—'}</TableCell>
                            <TableCell className="font-mono font-semibold">
                              {log.file_size ? `${(log.file_size / 1024).toFixed(1)} KB` : '—'}
                            </TableCell>
                            <TableCell className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed max-w-[200px]" title={log.details}>
                              {log.details || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="support" className="space-y-6 mt-6 focus-visible:outline-none">
            {loadingSupport ? (
              <div className="text-center py-12 text-muted-foreground">Loading support details...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Column 1: Contact details */}
                <Card className="border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm bg-white dark:bg-zinc-900 overflow-hidden">
                  <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-4">
                    <CardTitle className="text-sm sm:text-base flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                      <Settings className="w-4 h-4 text-primary" /> Contact Channels
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">Manage channels clients use to contact you for billing, bugs, or help.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    {/* Phone field */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="support-phone" className="text-xs font-bold">Support Phone Number</Label>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">Show in App</span>
                          <Switch id="show-phone" checked={showSupportPhone} onCheckedChange={setShowSupportPhone} />
                        </div>
                      </div>
                      <Input
                        id="support-phone"
                        value={supportPhone}
                        onChange={(e) => setSupportPhone(e.target.value)}
                        placeholder="e.g. +91 9876543210"
                        className="h-10 bg-slate-50/50 dark:bg-zinc-950"
                      />
                    </div>

                    {/* Email field */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="support-email" className="text-xs font-bold">Support Email Address</Label>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">Show in App</span>
                          <Switch id="show-email" checked={showSupportEmail} onCheckedChange={setShowSupportEmail} />
                        </div>
                      </div>
                      <Input
                        id="support-email"
                        type="email"
                        value={supportEmail}
                        onChange={(e) => setSupportEmail(e.target.value)}
                        placeholder="e.g. support@zenpos.com"
                        className="h-10 bg-slate-50/50 dark:bg-zinc-950"
                      />
                    </div>

                    {/* WhatsApp field */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="support-whatsapp" className="text-xs font-bold">Support WhatsApp Number</Label>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">Show in App</span>
                          <Switch id="show-whatsapp" checked={showSupportWhatsapp} onCheckedChange={setShowSupportWhatsapp} />
                        </div>
                      </div>
                      <Input
                        id="support-whatsapp"
                        value={supportWhatsapp}
                        onChange={(e) => setSupportWhatsapp(e.target.value)}
                        placeholder="e.g. +91 9876543210 (with country code)"
                        className="h-10 bg-slate-50/50 dark:bg-zinc-950"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Column 2: Custom details */}
                <div className="space-y-6">
                  <Card className="border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm bg-white dark:bg-zinc-900 overflow-hidden">
                    <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-4">
                      <CardTitle className="text-sm sm:text-base flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                        <Database className="w-4 h-4 text-primary" /> Custom Info & Deep Links
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground">Additional details, links, or notice banner to show clients.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="support-custom" className="text-xs font-bold">Custom Support Text / Notice</Label>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground">Show in App</span>
                            <Switch id="show-custom" checked={showSupportCustom} onCheckedChange={setShowSupportCustom} />
                          </div>
                        </div>
                        <textarea
                          id="support-custom"
                          value={supportCustomDetails}
                          onChange={(e) => setSupportCustomDetails(e.target.value)}
                          placeholder="e.g. For server outages, check status.zenpos.com. Support hours are 9 AM - 11 PM."
                          rows={6}
                          className="w-full text-sm p-3 rounded-xl border border-input bg-slate-50/50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Button 
                    onClick={handleSaveSupport} 
                    disabled={savingSupport} 
                    className="w-full h-11 font-bold text-white shadow-lg bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary"
                  >
                    {savingSupport ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                    💾 Save Support Coordinates
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Permissions Dialog */}
      <Dialog open={permsDialogOpen} onOpenChange={setPermsDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-6 rounded-2xl">
          <DialogHeader className="shrink-0 border-b pb-4 mb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                  <Shield className="w-5 h-5 text-primary" />
                  Client Permissions
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Toggle access to specific modules/pages for <strong>{selectedAdmin?.hotel_name || selectedAdmin?.name}</strong>.
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:hover:bg-green-900/40 dark:border-green-800 dark:text-green-300"
                  onClick={() => selectedAdmin && handleSetAllPermissions(selectedAdmin.profile_id, true)}
                >
                  Enable All
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:border-red-800 dark:text-red-300"
                  onClick={() => selectedAdmin && handleSetAllPermissions(selectedAdmin.profile_id, false)}
                >
                  Disable All
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2 scroll-smooth">
            {ALL_NAV_ITEMS.map((item) => {
              const isEnabled = selectedAdmin?.client_permissions?.[item.to] !== false;
              const Icon = item.icon;
              return (
                <div key={item.to} className="flex items-center justify-between p-3 rounded-xl border bg-muted/10 hover:bg-muted/20 dark:bg-zinc-900/20 dark:hover:bg-zinc-900/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">{item.label}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{item.to}</span>
                    </div>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) => {
                      if (selectedAdmin) {
                        handleTogglePermission(selectedAdmin.profile_id, item.to, checked);
                      }
                    }}
                  />
                </div>
              );
            })}
            
            <div className="flex items-center justify-between p-3 rounded-xl border bg-blue-50/50 dark:bg-blue-900/20 hover:bg-blue-50 dark:hover:bg-blue-900/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center dark:bg-blue-900/60">
                  <span className="text-sm">🖨️</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">Custom Receipt QR Code</span>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">receipt_qr</span>
                </div>
              </div>
              <Switch
                checked={selectedAdmin?.client_permissions?.['receipt_qr'] === true}
                onCheckedChange={(checked) => {
                  if (selectedAdmin) {
                    handleTogglePermission(selectedAdmin.profile_id, 'receipt_qr', checked);
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border bg-green-50/50 dark:bg-green-900/20 hover:bg-green-50 dark:hover:bg-green-900/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center dark:bg-green-900/60">
                  <span className="text-sm">🧮</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-green-800 dark:text-green-300">Calci Billing Mode</span>
                  <span className="text-[10px] text-green-600 dark:text-green-400 font-mono">calci_billing</span>
                </div>
              </div>
              <Switch
                checked={selectedAdmin?.client_permissions?.['calci_billing'] === true}
                onCheckedChange={(checked) => {
                  if (selectedAdmin) {
                    handleTogglePermission(selectedAdmin.profile_id, 'calci_billing', checked);
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border bg-purple-50/50 dark:bg-purple-900/20 hover:bg-purple-50 dark:hover:bg-purple-900/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center dark:bg-purple-900/60">
                  <span className="text-sm">☁️</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-purple-800 dark:text-purple-300">Cloud Storage (Bills/Reports)</span>
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-mono">allow_cloud_storage</span>
                </div>
              </div>
              <Switch
                checked={selectedAdmin?.client_permissions?.['allow_cloud_storage'] !== false}
                onCheckedChange={(checked) => {
                  if (selectedAdmin) {
                    handleTogglePermission(selectedAdmin.profile_id, 'allow_cloud_storage', checked);
                  }
                }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {pwdTarget && (
        <ResetPasswordDialog
          open={!!pwdTarget}
          onOpenChange={(v) => !v && setPwdTarget(null)}
          targetProfileId={pwdTarget.id}
          targetLabel={pwdTarget.label}
        />
      )}

      {contactTarget && (
        <EditContactDialog
          open={!!contactTarget}
          onOpenChange={(v) => !v && setContactTarget(null)}
          profileId={contactTarget.profile_id}
          role={contactTarget.role}
          label={contactTarget.name || contactTarget.email || 'user'}
          initial={{
            mobile_number: contactTarget.mobile_number,
            shop_name: contactTarget.shop_name,
            address: contactTarget.address,
            hotel_name: contactTarget.hotel_name,
          }}
          onSaved={fetchUsers}
        />
      )}

      {aiLimitTarget && (
        <SuperAdminAiLimits
          adminId={aiLimitTarget.profile_id}
          adminName={aiLimitTarget.hotel_name || aiLimitTarget.name || aiLimitTarget.email || 'admin'}
          onClose={() => setAiLimitTarget(null)}
        />
      )}
    </div>
  );
};

export default SuperAdminUsers;
