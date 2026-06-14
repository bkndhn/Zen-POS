import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Shield, Users as UsersIcon } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
}

const SuperAdminUsers: React.FC = () => {
  const { profile, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.role !== 'super_admin') return;
    (async () => {
      const { data, error } = await (supabase as any).rpc('get_all_users_for_super_admin');
      if (error) {
        console.error('get_all_users_for_super_admin failed:', error);
        setError(error.message || 'Failed to load users');
      } else if (data) {
        setRows(data as Row[]);
      }
      setLoading(false);
    })();
  }, [profile]);


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
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
                {!loading && admins.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No admins</TableCell></TableRow>}
                {admins.map(r => (
                  <TableRow key={r.profile_id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-xs">{r.email || '—'}</TableCell>
                    <TableCell>{r.hotel_name || '—'}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell>{r.login_count ?? 0}</TableCell>
                    <TableCell className="text-xs">{r.last_login ? new Date(r.last_login).toLocaleString() : '—'}</TableCell>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

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
    </div>
  );
};

export default SuperAdminUsers;
