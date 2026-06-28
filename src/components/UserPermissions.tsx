import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Shield, User } from 'lucide-react';
import type { UserProfile } from '@/types/user';

interface UserPermission {
  id: string;
  user_id: string;
  page_name: string;
  has_access: boolean;
}

import { ALL_NAV_ITEMS } from '@/config/navItems';

interface UserPermissionsProps {
  users: UserProfile[];
}

import { useAuth } from '@/contexts/AuthContext';
import { useUserPermissions } from '@/hooks/useUserPermissions';

export const UserPermissions: React.FC<UserPermissionsProps> = ({ users }) => {
  const { profile } = useAuth();
  const { hasAccess } = useUserPermissions();
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);

  // Build the permission grid from the single navigation source of truth dynamically
  const AVAILABLE_PAGES = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { name: string; label: string; description: string }[] = [];
    for (const item of ALL_NAV_ITEMS) {
      if (item.page === 'users') continue; // Users page access is role-based, not toggled
      if (seen.has(item.page as string)) continue;
      seen.add(item.page as string);
      out.push({ name: item.page as string, label: item.label, description: `Access ${item.label}` });
    }
    // Non-nav permissions that still need toggles
    if (!seen.has('customerDisplay')) {
      out.push({ name: 'customerDisplay', label: 'Customer Display', description: 'Public order board' });
    }
    if (!seen.has('bottomNavCustomize')) {
      out.push({ name: 'bottomNavCustomize', label: 'Bottom Nav Customise', description: 'Customise Bottom Navigation' });
    }
    return out;
  }, []);

  // Filter pages based on the viewer's role
  // Super Admin sees all pages
  // Admin only sees pages they have access to (cascaded from Super Admin)
  const displayablePages = AVAILABLE_PAGES.filter(page => {
    if (profile?.role === 'super_admin') return true;
    if (profile?.role === 'admin') return hasAccess(page.name as any);
    return false;
  });

  useEffect(() => {
    fetchPermissions();
  }, [users]);

  const fetchPermissions = async () => {
    try {
      const userIds = users.map(u => u.user_id);

      const { data, error } = await supabase
        .from('user_permissions')
        .select('*')
        .in('user_id', userIds);

      if (error) throw error;

      // Build permissions map
      const permMap: Record<string, Record<string, boolean>> = {};

      users.forEach(user => {
        permMap[user.user_id] = {};
        AVAILABLE_PAGES.forEach(page => {
          // Default: admins have all access, users have none
          permMap[user.user_id][page.name] = user.role === 'admin';
        });
      });

      // Override with actual permissions from DB
      (data || []).forEach((perm: UserPermission) => {
        if (permMap[perm.user_id]) {
          permMap[perm.user_id][perm.page_name] = perm.has_access;
        }
      });

      setPermissions(permMap);
    } catch (error) {
      console.error('Error fetching permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = async (userId: string, pageName: string, currentValue: boolean) => {
    // Find the user we're updating to determine their role
    const targetUser = users.find(u => u.user_id === userId);
    const isTargetAdmin = targetUser?.role === 'admin';

    try {
      // Update local state immediately for better UX
      setPermissions(prev => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          [pageName]: !currentValue
        }
      }));

      // Upsert the permission
      const { data, error } = await supabase
        .from('user_permissions')
        .upsert({
          user_id: userId,
          page_name: pageName,
          has_access: !currentValue
        }, {
          onConflict: 'user_id,page_name'
        })
        .select();

      if (error) {
        console.error('[Admin Permissions] Upsert failed:', error.message, error.code);
        throw error;
      }

      // === BROADCAST PERMISSION CHANGE FOR INSTANT SYNC ===
      const channel = supabase.channel('permissions-broadcast');
      await channel.subscribe();

      // Send the main permission change event
      channel.send({
        type: 'broadcast',
        event: 'permission-changed',
        payload: {
          user_id: userId,
          page_name: pageName,
          has_access: !currentValue,
          is_admin: isTargetAdmin,
          timestamp: Date.now()
        }
      });

      // If this is an ADMIN's permission being changed (by Super Admin),
      // also broadcast to all their child users so they can refetch
      if (isTargetAdmin && targetUser?.id) {
        console.log('[UserPermissions] Admin permission changed, notifying child users');

        // Get all child users of this admin
        const { data: childUsers } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('admin_id', targetUser.id)
          .eq('role', 'user');

        if (childUsers && childUsers.length > 0) {
          // Send notification to each child user
          for (const child of childUsers) {
            channel.send({
              type: 'broadcast',
              event: 'admin-permission-changed',
              payload: {
                admin_user_id: userId,
                child_user_id: child.user_id,
                page_name: pageName,
                admin_has_access: !currentValue,
                timestamp: Date.now()
              }
            });
          }
          console.log(`[UserPermissions] Notified ${childUsers.length} child users of admin permission change`);
        }
      }

      // Clean up channel after sending
      setTimeout(() => {
        supabase.removeChannel(channel);
      }, 1000);

      console.log('[UserPermissions] Broadcasted permission change:', {
        user_id: userId,
        page_name: pageName,
        has_access: !currentValue,
        is_admin: isTargetAdmin
      });

      toast({
        title: "Permission Updated",
        description: isTargetAdmin
          ? `${pageName} access ${!currentValue ? 'granted' : 'revoked'} for admin and their users.`
          : `${pageName} access ${!currentValue ? 'granted' : 'revoked'}.`,
      });
    } catch (error) {
      console.error('Error updating permission:', error);
      // Revert on error
      setPermissions(prev => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          [pageName]: currentValue
        }
      }));
      toast({
        title: "Error",
        description: "Failed to update permission",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="w-5 h-5" />
          Page Access Permissions
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Control which pages each user can access. Toggle on to allow access.
        </p>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4">
        {users.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <User className="w-10 h-10 mx-auto mb-2 opacity-50" />
            No users available
          </div>
        ) : (
          users.map(user => (
            <div key={user.id} className="border rounded-lg overflow-hidden">
              {/* User Header */}
              <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-3 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-base">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.hotel_name}</div>
                  </div>
                  <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="capitalize">
                    {user.role}
                  </Badge>
                </div>
              </div>

              {/* Permission Toggles */}
              <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {displayablePages.map(page => {
                  const hasAccess = permissions[user.user_id]?.[page.name] ?? false;

                  return (
                    <div
                      key={page.name}
                      onClick={() => togglePermission(user.user_id, page.name, hasAccess)}
                      className={`p-2 rounded-lg border cursor-pointer transition-all ${hasAccess
                        ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800'
                        : 'bg-gray-50 border-gray-200 dark:bg-gray-900/30 dark:border-gray-700'
                        }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-medium text-sm ${hasAccess ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
                          {page.label}
                        </span>
                        <Switch
                          checked={hasAccess}
                          onCheckedChange={() => { }}
                          className="pointer-events-none scale-75"
                        />
                      </div>
                      <div className={`text-[10px] ${hasAccess ? 'text-green-600 dark:text-green-500' : 'text-muted-foreground'}`}>
                        {hasAccess ? '✓ Allowed' : '✗ Denied'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};
