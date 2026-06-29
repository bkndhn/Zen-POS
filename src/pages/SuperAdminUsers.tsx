import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Shield, Users as UsersIcon, Settings } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ALL_NAV_ITEMS } from '@/config/navItems';

interface Row {
  profile_id: string;
  user_id: string;
  email: string | null;
  name: string;
  role: string;
  hotel_name: string | null;
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

      // Update state
      setRows(prev => prev.map(r => r.profile_id === adminProfileId ? { ...r, client_permissions: updatedPerms } : r));
      setSelectedAdmin(prev => prev && prev.profile_id === adminProfileId ? { ...prev, client_permissions: updatedPerms } : prev);

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
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold">Super Admin · All Users</h1>
        </div>

        <Input placeholder="Search by name, email, hotel or parent admin..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-sm px-3 py-2">
            {error}
          </div>
        )}

        {/* Admins Table */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><UsersIcon className="w-4 h-4" /> Admins ({admins.length})</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Hotel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Logins</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
                {!loading && admins.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No admins</TableCell></TableRow>}
                {admins.map(r => (
                  <TableRow key={r.profile_id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {r.name}
                        <Badge variant="default" className="text-[10px]">Admin</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{r.email || '—'}</TableCell>
                    <TableCell>{r.hotel_name || '—'}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell>{r.login_count ?? 0}</TableCell>
                    <TableCell className="text-xs">{r.last_login ? new Date(r.last_login).toLocaleString() : '—'}</TableCell>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedAdmin(r);
                          setPermsDialogOpen(true);
                        }}
                        className="h-7 text-xs px-2 border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground shadow-sm transition-colors gap-1.5"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        Permissions
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Sub-users Table */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><UsersIcon className="w-4 h-4" /> Sub-users ({subUsers.length})</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Parent Admin</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Logins</TableHead>
                  <TableHead>Last Login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
                {!loading && subUsers.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No sub-users</TableCell></TableRow>}
                {subUsers.map(r => (
                  <TableRow key={r.profile_id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-xs">{r.email || '—'}</TableCell>
                    <TableCell>{r.admin_name || '—'}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell>{r.login_count ?? 0}</TableCell>
                    <TableCell className="text-xs">{r.last_login ? new Date(r.last_login).toLocaleString() : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Permissions Dialog */}
      <Dialog open={permsDialogOpen} onOpenChange={setPermsDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-6 rounded-2xl">
          <DialogHeader className="shrink-0 border-b pb-4 mb-4">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Shield className="w-5 h-5 text-primary" />
              Client Permissions
            </DialogTitle>
            <DialogDescription className="text-xs">
              Toggle access to specific modules/pages for <strong>{selectedAdmin?.hotel_name || selectedAdmin?.name}</strong>.
            </DialogDescription>
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SuperAdminUsers;
