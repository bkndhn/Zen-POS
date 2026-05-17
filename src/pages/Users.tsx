import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Users as UsersIcon, Search, User, Shield, ChevronDown, ChevronRight, Crown, QrCode, Package, Save, Building2 } from 'lucide-react';
import { AddUserDialog } from '@/components/AddUserDialog';
import { Switch } from '@/components/ui/switch';

import { UserPermissions } from '@/components/UserPermissions';
import { SubUserBranchAssignments } from '@/components/SubUserBranchAssignments';
import type { UserProfile, UserStatus, UserRole } from '@/types/user';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { format } from 'date-fns';

interface ExtendedUserProfile extends UserProfile {
  admin_id?: string;
  subUsers?: ExtendedUserProfile[];
  last_login?: string | null;
  login_count?: number | null;
  has_qr_menu_access?: boolean;
  item_limit?: number | null;
  max_branches?: number | null;
  max_sub_users?: number | null;
  branchCount?: number;
  itemCount?: number;
  subUserCount?: number;
}

const Users: React.FC = () => {
  const { profile } = useAuth();
  const [users, setUsers] = useState<ExtendedUserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<ExtendedUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedAdmins, setExpandedAdmins] = useState<Set<string>>(new Set());
  const [editingLimits, setEditingLimits] = useState<Record<string, string>>({});
  const [savingLimit, setSavingLimit] = useState<string | null>(null);
  const [editingBranchLimits, setEditingBranchLimits] = useState<Record<string, string>>({});
  const [savingBranchLimit, setSavingBranchLimit] = useState<string | null>(null);
  const [editingSubUserLimits, setEditingSubUserLimits] = useState<Record<string, string>>({});
  const [savingSubUserLimit, setSavingSubUserLimit] = useState<string | null>(null);

  const isSuperAdmin = profile?.role === 'super_admin';
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    fetchUsers();
  }, [profile]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredUsers(users);
    } else {
      const searchLower = searchTerm.toLowerCase();

      const filtered = users.map(user => {
        // Check if Admin matches
        const adminMatches = (
          user.name.toLowerCase().includes(searchLower) ||
          user.role.toLowerCase().includes(searchLower) ||
          user.hotel_name?.toLowerCase().includes(searchLower) ||
          user.status.toLowerCase().includes(searchLower)
        );

        // Check sub-users matches
        const matchingSubUsers = (user.subUsers || []).filter(sub =>
          sub.name.toLowerCase().includes(searchLower) ||
          sub.role.toLowerCase().includes(searchLower)
        );
        const hasMatchingSubUsers = matchingSubUsers.length > 0;

        if (adminMatches || hasMatchingSubUsers) {
          // If Admin matches, show Admin and ALL sub-users (context is important)
          // If Admin doesn't match but has matching sub-users, show Admin and ONLY matching sub-users
          if (adminMatches) {
            return user;
          }
          return { ...user, subUsers: matchingSubUsers };
        }
        return null;
      }).filter((u): u is ExtendedUserProfile => u !== null);

      setFilteredUsers(filtered);
    }
  }, [searchTerm, users]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const allUsers = (data || []).map(user => ({
        id: user.id,
        user_id: user.user_id,
        name: user.name,
        role: user.role as UserRole,
        hotel_name: user.hotel_name,
        status: user.status as UserStatus,
        created_at: user.created_at,
        updated_at: user.updated_at,
        admin_id: user.admin_id,
        last_login: user.last_login,
        login_count: user.login_count,
        has_qr_menu_access: user.has_qr_menu_access ?? false,
        item_limit: (user as any).item_limit ?? null,
        max_branches: (user as any).max_branches ?? 1,
        max_sub_users: (user as any).max_sub_users ?? 5
      })) as ExtendedUserProfile[];

      if (isSuperAdmin) {
        // Super Admin: Show only admins with their sub-users nested
        const admins = allUsers.filter(u => u.role === 'admin');
        const subUsers = allUsers.filter(u => u.role === 'user' && u.admin_id);

        // Attach sub-users to their admins
        admins.forEach(admin => {
          admin.subUsers = subUsers.filter(sub => sub.admin_id === admin.id);
        });

        // Fetch item counts and branch counts per admin
        for (const admin of admins) {
          const [{ count: itemCount }, { count: branchCount }] = await Promise.all([
            supabase.from('items').select('*', { count: 'exact', head: true }).eq('admin_id', admin.id),
            supabase.from('branches').select('*', { count: 'exact', head: true }).eq('admin_id', admin.id),
          ]);
          admin.itemCount = itemCount ?? 0;
          admin.branchCount = branchCount ?? 0;
          admin.subUserCount = (admin.subUsers || []).filter(s => s.status !== 'deleted').length;
        }

        setUsers(admins);
        setFilteredUsers(admins);
      } else if (isAdmin) {
        // Admin: Show only their sub-users (and themselves)
        const relevantUsers = allUsers.filter(u =>
          u.role !== 'super_admin' &&
          (u.user_id === profile?.user_id || u.admin_id === profile?.id)
        );
        setUsers(relevantUsers);
        setFilteredUsers(relevantUsers);
      } else {
        // Regular users see nothing
        setUsers([]);
        setFilteredUsers([]);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateUserStatus = async (userId: string, newStatus: UserStatus, isAdminPause = false) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: newStatus })
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: "Success",
        description: isAdminPause && newStatus === 'paused'
          ? "Admin and all sub-users have been paused"
          : "User status updated successfully",
      });

      fetchUsers();
    } catch (error) {
      console.error('Error updating user status:', error);
      toast({
        title: "Error",
        description: "Failed to update user status",
        variant: "destructive",
      });
    }
  };

  const toggleQRMenuAccess = async (userId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ has_qr_menu_access: !currentValue })
        .eq('id', userId);

      if (error) throw error;

      // Update local state immediately
      setUsers(prev => prev.map(user =>
        user.id === userId ? { ...user, has_qr_menu_access: !currentValue } : user
      ));
      setFilteredUsers(prev => prev.map(user =>
        user.id === userId ? { ...user, has_qr_menu_access: !currentValue } : user
      ));

      toast({
        title: !currentValue ? "QR Menu Enabled" : "QR Menu Disabled",
        description: !currentValue
          ? "Client can now access QR Menu features"
          : "QR Menu access has been revoked",
      });
    } catch (error) {
      console.error('Error toggling QR Menu access:', error);
      toast({
        title: "Error",
        description: "Failed to update QR Menu access",
        variant: "destructive",
      });
    }
  };

  const updateItemLimit = async (adminId: string) => {
    setSavingLimit(adminId);
    try {
      const rawValue = editingLimits[adminId];
      const newLimit = rawValue === '' || rawValue === undefined ? null : parseInt(rawValue, 10);

      if (newLimit !== null && (isNaN(newLimit) || newLimit < 0)) {
        toast({ title: 'Invalid Value', description: 'Item limit must be a positive number or empty for unlimited', variant: 'destructive' });
        setSavingLimit(null);
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ item_limit: newLimit } as any)
        .eq('id', adminId);

      if (error) throw error;

      setUsers(prev => prev.map(u => u.id === adminId ? { ...u, item_limit: newLimit } : u));
      setFilteredUsers(prev => prev.map(u => u.id === adminId ? { ...u, item_limit: newLimit } : u));
      setEditingLimits(prev => { const n = { ...prev }; delete n[adminId]; return n; });

      toast({ title: '✅ Saved', description: `Item limit ${newLimit === null ? 'set to unlimited' : `set to ${newLimit}`}` });
    } catch (error) {
      console.error('Error updating item limit:', error);
      toast({ title: 'Error', description: 'Failed to update item limit', variant: 'destructive' });
    } finally {
      setSavingLimit(null);
    }
  };

  const updateMaxBranches = async (adminId: string) => {
    setSavingBranchLimit(adminId);
    try {
      const rawValue = editingBranchLimits[adminId];
      const newLimit = rawValue === '' || rawValue === undefined ? 1 : parseInt(rawValue, 10);
      if (isNaN(newLimit) || newLimit < 1) {
        toast({ title: 'Invalid Value', description: 'Max branches must be at least 1', variant: 'destructive' });
        setSavingBranchLimit(null);
        return;
      }
      const { error } = await supabase
        .from('profiles')
        .update({ max_branches: newLimit } as any)
        .eq('id', adminId);
      if (error) throw error;
      setUsers(prev => prev.map(u => u.id === adminId ? { ...u, max_branches: newLimit } : u));
      setFilteredUsers(prev => prev.map(u => u.id === adminId ? { ...u, max_branches: newLimit } : u));
      setEditingBranchLimits(prev => { const n = { ...prev }; delete n[adminId]; return n; });
      toast({ title: '✅ Saved', description: `Branch limit set to ${newLimit}` });
    } catch (err) {
      console.error('Error updating max_branches:', err);
      toast({ title: 'Error', description: 'Failed to update branch limit', variant: 'destructive' });
    } finally {
      setSavingBranchLimit(null);
    }
  };

  const updateMaxSubUsers = async (adminId: string) => {
    setSavingSubUserLimit(adminId);
    try {
      const rawValue = editingSubUserLimits[adminId];
      const newLimit = rawValue === '' || rawValue === undefined ? 5 : parseInt(rawValue, 10);
      if (isNaN(newLimit) || newLimit < 1) {
        toast({ title: 'Invalid Value', description: 'Max sub-users must be at least 1', variant: 'destructive' });
        setSavingSubUserLimit(null);
        return;
      }
      const { error } = await supabase.from('profiles').update({ max_sub_users: newLimit } as any).eq('id', adminId);
      if (error) throw error;
      setUsers(prev => prev.map(u => u.id === adminId ? { ...u, max_sub_users: newLimit } : u));
      setFilteredUsers(prev => prev.map(u => u.id === adminId ? { ...u, max_sub_users: newLimit } : u));
      setEditingSubUserLimits(prev => { const n = { ...prev }; delete n[adminId]; return n; });
      toast({ title: '✅ Saved', description: `Sub-user limit set to ${newLimit}` });
    } catch (err) {
      console.error('Error updating max_sub_users:', err);
      toast({ title: 'Error', description: 'Failed to update sub-user limit', variant: 'destructive' });
    } finally {
      setSavingSubUserLimit(null);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'super_admin':
        return <Crown className="w-4 h-4 text-yellow-500" />;
      case 'admin':
        return <Shield className="w-4 h-4" />;
      default:
        return <User className="w-4 h-4" />;
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'default';
      case 'admin':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const toggleAdminExpand = (adminId: string) => {
    setExpandedAdmins(prev => {
      const newSet = new Set(prev);
      if (newSet.has(adminId)) {
        newSet.delete(adminId);
      } else {
        newSet.add(adminId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading users...</p>
        </div>
      </div>
    );
  }

  // Get filtered users for permissions view to sync with search
  const usersForPermissions = isSuperAdmin
    ? filteredUsers.flatMap(admin => [admin, ...(admin.subUsers || [])])
    : filteredUsers.filter(u => u.user_id !== profile?.user_id);

  return (
    <div className="container mx-auto py-4 px-4 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center">
          <UsersIcon className="w-8 h-8 mr-3 text-primary" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Users Management</h1>
            <p className="text-muted-foreground text-sm">
              {isSuperAdmin ? 'Super Admin: Manage all admins and their users' : 'Manage system users and settings'}
            </p>
          </div>
        </div>
        {(isAdmin || isSuperAdmin) && (
          <AddUserDialog onUserAdded={fetchUsers} adminId={profile?.id} />
        )}
      </div>

      {/* Search Bar - Moved to Top */}
      <Card className="mb-6">
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="w-5 h-5" />
            Search Users
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3">
          <Input
            placeholder="Search by name, role, hotel, or status..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </CardContent>
      </Card>



      {/* User Permissions - For both Super Admin and Admin */}
      {(isAdmin || isSuperAdmin) && usersForPermissions.length > 0 && (
        <div className="mb-6">
          <UserPermissions users={usersForPermissions} />
        </div>
      )}

      {/* Users List */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg">
            {isSuperAdmin ? `Admins (${filteredUsers.length})` : `All Users (${filteredUsers.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <div className="text-center py-16">
              <UsersIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">No Users Found</h3>
              <p className="text-muted-foreground">
                {searchTerm ? 'No users match your search criteria.' : 'No users available.'}
              </p>
            </div>
          ) : isSuperAdmin ? (
            // Super Admin View - Hierarchical with collapsible admin sections
            <div className="space-y-4">
              {filteredUsers.map((admin) => (
                <Collapsible
                  key={admin.id}
                  open={expandedAdmins.has(admin.id)}
                  onOpenChange={() => toggleAdminExpand(admin.id)}
                >
                  <Card className="border-2">
                    {/* Admin Header */}
                    <CollapsibleTrigger asChild>
                      <div className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {admin.subUsers && admin.subUsers.length > 0 ? (
                              expandedAdmins.has(admin.id) ? (
                                <ChevronDown className="w-5 h-5 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-5 h-5 text-muted-foreground" />
                              )
                            ) : (
                              <div className="w-5" />
                            )}
                            <div>
                              <h4 className="font-semibold text-lg">{admin.name}</h4>
                              {admin.hotel_name && (
                                <p className="text-sm text-muted-foreground">{admin.hotel_name}</p>
                              )}
                              {admin.last_login && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Last login: {format(new Date(admin.last_login), 'dd MMM yyyy, hh:mm a')}
                                  {admin.login_count !== null && admin.login_count !== undefined && (
                                    <span className="ml-2">({admin.login_count} logins)</span>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {admin.subUsers && admin.subUsers.length > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {admin.subUsers.length} sub-user{admin.subUsers.length !== 1 ? 's' : ''}
                              </Badge>
                            )}
                            <Badge
                              variant={admin.status === 'active' ? 'default' : admin.status === 'paused' ? 'secondary' : 'destructive'}
                              className="text-xs"
                            >
                              {admin.status}
                            </Badge>
                            <Badge variant={getRoleBadgeVariant(admin.role)} className="capitalize flex items-center gap-1">
                              {getRoleIcon(admin.role)}
                              {admin.role}
                            </Badge>
                          </div>
                        </div>

                        {/* Admin Actions */}
                        <div className="flex flex-wrap items-center gap-2 mt-3 ml-8">
                          {/* QR Menu Access Toggle */}
                          <div
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-muted/30"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <QrCode className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs font-medium">QR Menu</span>
                            <Switch
                              checked={admin.has_qr_menu_access ?? false}
                              onCheckedChange={() => toggleQRMenuAccess(admin.id, admin.has_qr_menu_access ?? false)}
                              className="scale-90"
                            />
                          </div>

                          {/* Item Limit Control */}
                          <div
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-muted/30"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Package className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs font-medium whitespace-nowrap">Items Limit</span>
                            <Input
                              type="number"
                              min="0"
                              placeholder="∞"
                              value={editingLimits[admin.id] ?? (admin.item_limit === null || admin.item_limit === undefined ? '' : String(admin.item_limit))}
                              onChange={(e) => setEditingLimits(prev => ({ ...prev, [admin.id]: e.target.value }))}
                              className="w-20 h-7 text-xs px-2"
                            />
                            {editingLimits[admin.id] !== undefined && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={(e) => { e.stopPropagation(); updateItemLimit(admin.id); }}
                                disabled={savingLimit === admin.id}
                              >
                                <Save className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                              {admin.itemCount ?? '?'}/{admin.item_limit === null || admin.item_limit === undefined ? '∞' : admin.item_limit}
                            </Badge>
                          </div>

                          {/* Max Branches Control */}
                          <div
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-muted/30"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs font-medium whitespace-nowrap">Max Branches</span>
                            <Input
                              type="number"
                              min="1"
                              value={editingBranchLimits[admin.id] ?? String(admin.max_branches ?? 1)}
                              onChange={(e) => setEditingBranchLimits(prev => ({ ...prev, [admin.id]: e.target.value }))}
                              className="w-16 h-7 text-xs px-2"
                            />
                            {editingBranchLimits[admin.id] !== undefined && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={(e) => { e.stopPropagation(); updateMaxBranches(admin.id); }}
                                disabled={savingBranchLimit === admin.id}
                              >
                                <Save className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                              {admin.branchCount ?? '?'}/{admin.max_branches ?? 1}
                            </Badge>
                          </div>

                          {/* Max Sub-Users Control */}
                          <div
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-muted/30"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <UsersIcon className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs font-medium whitespace-nowrap">Max Sub-Users</span>
                            <Input
                              type="number"
                              min="1"
                              value={editingSubUserLimits[admin.id] ?? String(admin.max_sub_users ?? 5)}
                              onChange={(e) => setEditingSubUserLimits(prev => ({ ...prev, [admin.id]: e.target.value }))}
                              className="w-16 h-7 text-xs px-2"
                            />
                            {editingSubUserLimits[admin.id] !== undefined && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={(e) => { e.stopPropagation(); updateMaxSubUsers(admin.id); }}
                                disabled={savingSubUserLimit === admin.id}
                              >
                                <Save className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                              {admin.subUserCount ?? (admin.subUsers?.length ?? 0)}/{admin.max_sub_users ?? 5}
                            </Badge>
                          </div>

                          <Button
                            size="sm"
                            variant={admin.status === 'active' ? 'outline' : 'default'}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateUserStatus(admin.id, admin.status === 'active' ? 'paused' : 'active', true);
                            }}
                            className="text-xs"
                          >
                            {admin.status === 'active' ? 'Pause Admin & All Users' : 'Activate'}
                          </Button>
                          {admin.status !== 'deleted' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateUserStatus(admin.id, 'deleted', true);
                              }}
                              className="text-xs"
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>

                    {/* Sub-users */}
                    <CollapsibleContent>
                      {admin.subUsers && admin.subUsers.length > 0 && (
                        <div className="border-t bg-muted/30 p-4">
                          <h5 className="text-sm font-medium mb-3 text-muted-foreground">Sub-users under {admin.name}</h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {admin.subUsers.map(subUser => (
                              <Card key={subUser.id} className="p-3 bg-background">
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <h6 className="font-medium">{subUser.name}</h6>
                                    <Badge
                                      variant={subUser.status === 'active' ? 'outline' : subUser.status === 'paused' ? 'secondary' : 'destructive'}
                                      className="text-xs mt-1"
                                    >
                                      {admin.status === 'paused' ? 'paused (by admin)' : subUser.status}
                                    </Badge>
                                  </div>
                                  <Badge variant="secondary" className="text-xs capitalize flex items-center gap-1">
                                    {getRoleIcon(subUser.role)}
                                    {subUser.role}
                                  </Badge>
                                </div>
                                {(admin.branchCount ?? 0) > 0 && (
                                  <SubUserBranchAssignments
                                    subUserAuthId={subUser.user_id}
                                    adminId={admin.id}
                                    className="mt-2 pt-2 border-t"
                                  />
                                )}
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          ) : (
            // Regular Admin View - Grid of users
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredUsers.map((user) => (
                <Card key={user.id} className="p-3">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-base">{user.name}</h4>
                        {user.hotel_name && (
                          <p className="text-sm text-muted-foreground">{user.hotel_name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {getRoleIcon(user.role)}
                        <Badge
                          variant={getRoleBadgeVariant(user.role)}
                          className="text-xs"
                        >
                          {user.role}
                        </Badge>
                      </div>
                    </div>

                    <Badge
                      variant={user.status === 'active' ? 'default' : user.status === 'paused' ? 'secondary' : 'destructive'}
                      className="text-xs"
                    >
                      {user.status}
                    </Badge>

                    <div className="text-xs text-muted-foreground">
                      <div>Created: {new Date(user.created_at).toLocaleDateString()}</div>
                      {user.last_login && (
                        <div>Last login: {format(new Date(user.last_login), 'dd MMM yyyy, hh:mm a')}</div>
                      )}
                      {user.login_count !== null && user.login_count !== undefined && (
                        <div>Login count: {user.login_count}</div>
                      )}
                    </div>

                    {isAdmin && user.user_id !== profile?.user_id && (
                      <>
                        {user.role === 'user' && profile?.id && (
                          <SubUserBranchAssignments
                            subUserAuthId={user.user_id}
                            adminId={profile.id}
                            className="pt-2 border-t"
                          />
                        )}
                        <div className="flex flex-wrap gap-1 pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateUserStatus(user.id, user.status === 'active' ? 'paused' : 'active')}
                            className="text-xs flex-1 sm:flex-none"
                          >
                            {user.status === 'active' ? 'Pause' : 'Activate'}
                          </Button>
                          {user.status !== 'deleted' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => updateUserStatus(user.id, 'deleted')}
                              className="text-xs flex-1 sm:flex-none"
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Users;