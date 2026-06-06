
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { User, Shield, UserCheck, UserX, Settings, DollarSign, UserPlus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { AddAdditionalChargeDialog } from '@/components/AddAdditionalChargeDialog';
import { DisplaySettings } from '@/components/DisplaySettings';

interface Profile {
  id: string;
  user_id: string;
  name: string;
  role: string;
  hotel_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_login?: string;
  login_count?: number;
  max_branches?: number;
  max_sub_users?: number;
}

type UserStatus = 'active' | 'inactive' | 'suspended';

const AdminManagement = () => {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [chargeDialogOpen, setChargeDialogOpen] = useState(false);
  const [signupEnabled, setSignupEnabled] = useState<boolean>(true);
  const [signupSaving, setSignupSaving] = useState(false);

  const isSuperAdmin = profile?.role === 'super_admin';
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (isAdmin || isSuperAdmin) {
      fetchProfiles();
    }
    if (isSuperAdmin) {
      (async () => {
        const { data } = await (supabase as any).from('app_settings').select('signup_enabled').eq('id', true).maybeSingle();
        if (data) setSignupEnabled(!!data.signup_enabled);
      })();
    }
  }, [profile]);

  const toggleSignup = async (next: boolean) => {
    if (!isSuperAdmin) return;
    setSignupSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('app_settings')
        .update({ signup_enabled: next, updated_at: new Date().toISOString(), updated_by: profile?.user_id })
        .eq('id', true);
      if (error) throw error;
      setSignupEnabled(next);
      toast({ title: 'Updated', description: `Signup is now ${next ? 'enabled' : 'disabled'}.` });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message || 'Could not update', variant: 'destructive' });
    } finally {
      setSignupSaving(false);
    }
  };

  const updateLimits = async (profileId: string, field: 'max_branches' | 'max_sub_users', value: number) => {
    if (!isSuperAdmin) return;
    const v = Math.max(1, Math.min(100, Number.isFinite(value) ? value : 1));
    try {
      const { error } = await supabase.from('profiles').update({ [field]: v } as any).eq('id', profileId);
      if (error) throw error;
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, [field]: v } : p));
      toast({ title: 'Limit updated', description: `${field.replace('_', ' ')} = ${v}` });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message || 'Could not update limit', variant: 'destructive' });
    }
  };


  const fetchProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error('Error fetching profiles:', error);
      toast({
        title: "Error",
        description: "Failed to fetch user profiles",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const updateAdminStatus = async (userId: string, newStatus: UserStatus) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: newStatus })
        .eq('user_id', userId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `User status updated to ${newStatus}`,
      });

      fetchProfiles();
    } catch (error) {
      console.error('Error updating user status:', error);
      toast({
        title: "Error",
        description: "Failed to update user status",
        variant: "destructive"
      });
    }
  };

  const filteredProfiles = profiles.filter(profile =>
    profile.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    profile.hotel_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isAdmin && !isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="p-6 text-center">
            <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-24">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 sm:w-6 sm:h-6" />
            <h1 className="text-xl sm:text-2xl font-bold">Admin Management</h1>
          </div>
        </div>

        {/* Settings Section */}
        <div className="mb-8 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <DollarSign className="w-5 h-5" />
                <span>Additional Charges Management</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-muted-foreground">Manage additional charges for billing</p>
                <Button onClick={() => setChargeDialogOpen(true)} className="w-full sm:w-auto">
                  <DollarSign className="w-4 h-4 mr-2" />
                  Add Charge
                </Button>
              </div>

              <AddAdditionalChargeDialog
                open={chargeDialogOpen}
                onOpenChange={setChargeDialogOpen}
                onSuccess={() => {
                  setChargeDialogOpen(false);
                  toast({
                    title: "Success",
                    description: "Additional charge added successfully"
                  });
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="w-5 h-5" />
                <span>Display Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {profile?.user_id && <DisplaySettings userId={profile.user_id} />}
            </CardContent>
          </Card>

          {isSuperAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <UserPlus className="w-5 h-5" />
                  <span>Signup Access</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-medium">Allow new admin sign-ups</p>
                    <p className="text-sm text-muted-foreground">
                      When disabled, the Sign-up option is hidden on the login page and new accounts cannot be created.
                    </p>
                  </div>
                  <Switch checked={signupEnabled} disabled={signupSaving} onCheckedChange={toggleSignup} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="mb-6">
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>

        <div className="grid gap-4">
          {filteredProfiles.map((userProfile) => (
            <Card key={userProfile.id}>
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center space-x-4">
                    <div className="p-2.5 rounded-full bg-primary/10 mt-1 sm:mt-0">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                        <h3 className="font-semibold text-base sm:text-lg truncate max-w-[200px] sm:max-w-none">{userProfile.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] shrink-0 font-medium border ${userProfile.status === 'active'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : userProfile.status === 'suspended'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                          }`}>
                          {userProfile.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/80 font-medium truncate">{userProfile.hotel_name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="capitalize">Role: {userProfile.role}</span>
                        {userProfile.login_count !== undefined && (
                          <>
                            <span>•</span>
                            <span>Logins: {userProfile.login_count}</span>
                          </>
                        )}
                        {userProfile.last_login && (
                          <>
                            <span>•</span>
                            <span>Last active: {new Date(userProfile.last_login).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                      {userProfile.role === 'admin' && (
                        <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                          <label className="flex items-center gap-1">
                            <span className="text-muted-foreground">Max branches:</span>
                            <Input
                              type="number"
                              min={1}
                              max={100}
                              defaultValue={userProfile.max_branches ?? 1}
                              disabled={!isSuperAdmin}
                              onBlur={(e) => {
                                const v = Number(e.target.value);
                                if (v !== (userProfile.max_branches ?? 1)) updateLimits(userProfile.id, 'max_branches', v);
                              }}
                              className="h-7 w-16"
                            />
                          </label>
                          <label className="flex items-center gap-1">
                            <span className="text-muted-foreground">Max sub-users:</span>
                            <Input
                              type="number"
                              min={1}
                              max={100}
                              defaultValue={userProfile.max_sub_users ?? 5}
                              disabled={!isSuperAdmin}
                              onBlur={(e) => {
                                const v = Number(e.target.value);
                                if (v !== (userProfile.max_sub_users ?? 5)) updateLimits(userProfile.id, 'max_sub_users', v);
                              }}
                              className="h-7 w-16"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 mt-2 sm:mt-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateAdminStatus(userProfile.user_id, 'active' as UserStatus)}
                      disabled={userProfile.status === 'active'}
                      className={`flex-1 sm:flex-none min-w-[100px] ${userProfile.status === 'active' ? '' : 'text-green-600 hover:text-green-700 hover:bg-green-50'}`}
                    >
                      <UserCheck className="w-4 h-4 mr-1 sm:mr-2" />
                      <span className="text-xs sm:text-sm">Activate</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateAdminStatus(userProfile.user_id, 'suspended' as UserStatus)}
                      disabled={userProfile.status === 'suspended'}
                      className={`flex-1 sm:flex-none min-w-[100px] ${userProfile.status === 'suspended' ? '' : 'text-red-600 hover:text-red-700 hover:bg-red-50'}`}
                    >
                      <UserX className="w-4 h-4 mr-1 sm:mr-2" />
                      <span className="text-xs sm:text-sm">Suspend</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredProfiles.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center">
              <User className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No users found</h3>
              <p className="text-muted-foreground">No users match your search criteria.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminManagement;
