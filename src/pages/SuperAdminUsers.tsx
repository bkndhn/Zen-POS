import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Shield, Users as UsersIcon, Settings, Database, RefreshCw, Play, CheckCircle2, XCircle, Download, Upload, KeyRound, Activity, CreditCard, Bell, FileText, ExternalLink, PhoneCall , Globe } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ALL_NAV_ITEMS } from '@/config/navItems';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SubscriptionPackPricing } from '@/components/SubscriptionPackPricing';
import { ResetPasswordDialog } from '@/components/ResetPasswordDialog';
import { EditContactDialog } from '@/components/EditContactDialog';
import { SuperAdminAiLimits } from '@/components/SuperAdminAiLimits';
import { SuperAdminStorageQuota } from '@/components/SuperAdminStorageQuota';
import { PlatformPaymentSettings } from '@/components/PlatformPaymentSettings';
import { AddUserDialog } from '@/components/AddUserDialog';
import { Pencil, Sparkles, HardDrive, Plus, Pause, Trash2, AlertTriangle, Sliders, Save } from 'lucide-react';
import { cn } from '@/lib/utils';

export function getRelativeSubscriptionText(endDateStr?: string | null): { text: string; isExpired: boolean; badgeColor: string; stage: 'active' | 'expiring' | 'expired' } {
  if (!endDateStr) return { text: 'Lifetime / No Expiry', isExpired: false, badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300', stage: 'active' };

  const endDate = new Date(endDateStr);
  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const absDays = Math.abs(diffDays);

  const formattedDate = endDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  if (diffDays >= 0) {
    if (diffDays === 0) return { text: `Expires today (${formattedDate})`, isExpired: false, badgeColor: 'bg-amber-100 text-amber-800 border-amber-300', stage: 'expiring' };
    if (diffDays === 1) return { text: `Expires tomorrow (${formattedDate})`, isExpired: false, badgeColor: 'bg-amber-100 text-amber-800 border-amber-300', stage: 'expiring' };
    if (diffDays <= 7) return { text: `Expires in ${diffDays} days (${formattedDate})`, isExpired: false, badgeColor: 'bg-amber-100 text-amber-800 border-amber-300', stage: 'expiring' };
    if (diffDays < 30) return { text: `Expires in ${diffDays} days (${formattedDate})`, isExpired: false, badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300', stage: 'active' };
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return { text: `Expires in ${months} month${months > 1 ? 's' : ''} (${formattedDate})`, isExpired: false, badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300', stage: 'active' };
    }
    const years = (diffDays / 365).toFixed(1);
    return { text: `Expires in ${years} year${+years > 1 ? 's' : ''} (${formattedDate})`, isExpired: false, badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300', stage: 'active' };
  } else {
    if (absDays === 1) return { text: `Expired 1 day ago (${formattedDate})`, isExpired: true, badgeColor: 'bg-orange-100 text-orange-800 border-orange-300', stage: 'expired' };
    if (absDays < 30) return { text: `Expired ${absDays} days ago (${formattedDate})`, isExpired: true, badgeColor: 'bg-orange-100 text-orange-800 border-orange-300', stage: 'expired' };
    if (absDays < 365) {
      const months = Math.floor(absDays / 30);
      return { text: `Expired ${months} month${months > 1 ? 's' : ''} ago (${formattedDate})`, isExpired: true, badgeColor: 'bg-red-100 text-red-800 border-red-300', stage: 'expired' };
    }
    const years = Math.floor(absDays / 365);
    const remMonths = Math.floor((absDays % 365) / 30);
    const relStr = remMonths > 0 ? `${years} yr ${remMonths} mo ago` : `${years} yr${years > 1 ? 's' : ''} ago`;
    return { text: `Expired ${relStr} (${formattedDate})`, isExpired: true, badgeColor: 'bg-red-100 text-red-800 border-red-300', stage: 'expired' };
  }
}

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

  subscription_plan?: string;
  subscription_status?: string;
  subscription_end_date?: string;
  subscription_amount?: number;
  force_logout?: boolean;
  force_logout_reason: string | null;
  max_branches?: number;
  max_sub_users?: number;
  public_ordering_enabled?: boolean;
  _shiftUnlocked?: boolean;
  _fcmUnlocked?: boolean;
  _nativeAppUnlocked?: boolean;
}

interface ClientLimitsModalProps {
  target: Row;
  onClose: () => void;
  onSaved: () => void;
}

const ClientLimitsModal: React.FC<ClientLimitsModalProps> = ({ target, onClose, onSaved }) => {
  const [maxBranches, setMaxBranches] = useState<number>(target.max_branches ?? 1);
  const [maxSubUsers, setMaxSubUsers] = useState<number>(target.max_sub_users ?? 5);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (maxBranches < 1 || maxSubUsers < 1) {
      toast({ title: 'Invalid limits', description: 'Limits must be at least 1.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          max_branches: maxBranches,
          max_sub_users: maxSubUsers,
        })
        .eq('id', target.profile_id);

      if (error) throw error;

      toast({
        title: 'Client Limits Updated!',
        description: `Set limits for ${target.hotel_name || target.name}: Max ${maxBranches} branch(es), Max ${maxSubUsers} staff user(s).`,
      });
      onSaved();
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message || 'Could not update limits', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[420px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-600" />
            Configure Client Account Limits
          </DialogTitle>
          <DialogDescription>
            Set maximum allowed branches and staff users for <strong>{target.hotel_name || target.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Max Allowed Branches</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={maxBranches}
              onChange={(e) => setMaxBranches(Math.max(1, parseInt(e.target.value) || 1))}
              className="h-10 text-sm font-bold"
            />
            <p className="text-[11px] text-muted-foreground">Number of physical store branches this client can create.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Max Allowed Staff Users (Sub-Users)</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={maxSubUsers}
              onChange={(e) => setMaxSubUsers(Math.max(1, parseInt(e.target.value) || 1))}
              className="h-10 text-sm font-bold"
            />
            <p className="text-[11px] text-muted-foreground">Number of staff login accounts this client admin can add.</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-xl">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1.5">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Account Limits'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

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
  const [storageTarget, setStorageTarget] = useState<Row | null>(null);
  const [clientLimitsTarget, setClientLimitsTarget] = useState<Row | null>(null);
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'admin' | 'staff'>('admin');

  // Pause / Activate and Delete state & handlers
  const [pauseTarget, setPauseTarget] = useState<Row | null>(null);
  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const handleTogglePause = (userRow: Row) => {
    setPauseTarget(userRow);
    setPauseConfirmOpen(true);
  };

  const handleConfirmPause = async () => {
    if (!pauseTarget) return;
    setActionLoading(true);
    const isPausing = pauseTarget.status !== 'paused';
    const newStatus = isPausing ? 'paused' : 'active';
    try {
      const { error: pErr } = await supabase.from('profiles').update({ status: newStatus }).eq('id', pauseTarget.profile_id);
      if (pErr) throw pErr;

      if (pauseTarget.role === 'admin') {
        await supabase.from('profiles').update({ status: newStatus }).eq('admin_id', pauseTarget.profile_id);
      }

      if (isPausing) {
        const channel = supabase.channel(`force-logout-broadcast-${pauseTarget.profile_id}`);
        await channel.send({
          type: 'broadcast',
          event: 'force_logout',
          payload: { force: true, reason: 'Organization account has been paused by Super Admin.' }
        });
        supabase.removeChannel(channel);
      }

      toast({
        title: isPausing ? "Account Paused & Force Logged Out" : "Account Activated",
        description: isPausing
          ? `Client admin "${pauseTarget.hotel_name || pauseTarget.name}" and sub-users force logged out.`
          : `Client admin "${pauseTarget.hotel_name || pauseTarget.name}" activated successfully.`
      });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update user status", variant: "destructive" });
    } finally {
      setActionLoading(false);
      setPauseConfirmOpen(false);
      setPauseTarget(null);
    }
  };

  const handleDeleteClientClick = (userRow: Row) => {
    setDeleteTarget(userRow);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDeleteClient = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try {
      const channel = supabase.channel(`force-logout-broadcast-${deleteTarget.profile_id}`);
      await channel.send({
        type: 'broadcast',
        event: 'force_logout',
        payload: { force: true, reason: 'Organization account has been deleted.' }
      });
      supabase.removeChannel(channel);

      const { error } = await supabase.rpc('super_admin_delete_client', { p_target_admin_id: deleteTarget.profile_id });
      if (error) throw error;

      toast({
        title: "Client Admin & Data Deleted",
        description: `Client "${deleteTarget.hotel_name || deleteTarget.name}", sub-users, and all data permanently deleted.`
      });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to delete client account", variant: "destructive" });
    } finally {
      setActionLoading(false);
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    }
  };

  // Tabs & URL sync state
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') || 'users';
  const [activeTabState, setActiveTabState] = useState(tabFromUrl);

  useEffect(() => {
    const t = searchParams.get('tab') || 'users';
    setActiveTabState(t);
  }, [searchParams]);

  const activeTab = activeTabState;
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    setSearchParams({ tab });
  };
  const [backupSettings, setBackupSettings] = useState<any>(null);
  const [backupLogs, setBackupLogs] = useState<any[]>([]);
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [triggeringBackup, setTriggeringBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [isBackupEnabled, setIsBackupEnabled] = useState(false);
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
  const [showPoweredByWatermark, setShowPoweredByWatermark] = useState(true);
  const [poweredByContact, setPoweredByContact] = useState('');
  const [savingSupport, setSavingSupport] = useState(false);
  const [loadingSupport, setLoadingSupport] = useState(false);

  // Terms & Conditions / Legal Policy State
  const [termsAndConditionsText, setTermsAndConditionsText] = useState('');
  const [savingTerms, setSavingTerms] = useState(false);

  // Subscription management state
  const [paymentUpiId, setPaymentUpiId] = useState('');
  const [paymentQrImageUrl, setPaymentQrImageUrl] = useState('');
  const [paymentInstructions, setPaymentInstructions] = useState('');
  const [defaultSubAmount, setDefaultSubAmount] = useState(999);
  const [savingPayment, setSavingPayment] = useState(false);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [subPayments, setSubPayments] = useState<any[]>([]);
  const [subFilter, setSubFilter] = useState<'all' | 'active' | 'expiring' | 'expired' | 'suspended'>('all');

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
        setShowPoweredByWatermark(data.show_powered_by_watermark ?? true);
        setPoweredByContact(data.powered_by_contact || '');
        setTermsAndConditionsText((data as any).terms_and_conditions || '');
      }
    } catch (e: any) {
      console.error("Failed to load support data:", e);
      toast({ title: "Failed to load support settings", description: e.message, variant: "destructive" });
    } finally {
      setLoadingSupport(false);
    }
  };

  const handleSaveTerms = async () => {
    try {
      setSavingTerms(true);
      const { error } = await (supabase as any)
        .from('app_settings')
        .update({
          terms_and_conditions: termsAndConditionsText,
          updated_at: new Date().toISOString()
        })
        .eq('id', true);

      if (error) throw error;
      toast({ title: "Saved!", description: "Terms & Conditions updated and published live." });
    } catch (e: any) {
      toast({ title: "Failed to save terms", description: e.message, variant: "destructive" });
    } finally {
      setSavingTerms(false);
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
            show_powered_by_watermark: showPoweredByWatermark,
            powered_by_contact: poweredByContact,
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

  const fetchPaymentSettings = async () => {
    try {
      setLoadingPayment(true);
      const { data, error } = await (supabase as any).from('payment_settings').select('*').maybeSingle();
      if (error) throw error;
      if (data) {
        setPaymentUpiId(data.upi_id || '');
        setPaymentQrImageUrl(data.upi_qr_image_url || '');
        setPaymentInstructions(data.payment_instructions || '');
        setDefaultSubAmount(data.default_amount || 999);
      }
      const { data: payments, error: pErr } = await (supabase as any).from('subscription_payments').select('*').order('created_at', { ascending: false }).limit(100);
      if (pErr) throw pErr;
      setSubPayments(payments || []);
    } catch (e: any) {
      console.error('Failed to load payment settings:', e);
    } finally {
      setLoadingPayment(false);
    }
  };

  const handleSavePaymentSettings = async () => {
    try {
      setSavingPayment(true);
      const { error } = await (supabase as any).from('payment_settings').upsert({
        id: '00000000-0000-0000-0000-000000000001',
        upi_id: paymentUpiId,
        upi_qr_image_url: paymentQrImageUrl,
        default_amount: defaultSubAmount,
        payment_instructions: paymentInstructions,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast({ title: 'Saved', description: 'Payment settings updated.' });
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally {
      setSavingPayment(false);
    }
  };

  const handleSetSubscription = async (adminProfileId: string, plan: string, amount: number, endDate: string) => {
    try {
      const formattedEndDate = endDate ? new Date(`${endDate}T23:59:59.000Z`).toISOString() : null;
      const { error } = await (supabase as any).from('profiles').update({
        subscription_plan: plan,
        subscription_amount: amount,
        subscription_end_date: formattedEndDate,
        subscription_status: 'active',
      }).eq('id', adminProfileId);
      if (error) throw error;
      toast({ title: 'Subscription updated', description: 'Changes saved successfully.' });
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleForceLogout = async (adminProfileId: string, force: boolean, reason: string) => {
    try {
      const { error } = await (supabase as any).from('profiles').update({
        force_logout: force,
        force_logout_reason: force ? reason : null,
        subscription_status: force ? 'paused' : 'active',
      }).eq('id', adminProfileId);
      if (error) throw error;
      // Broadcast force logout via realtime channel
      const bc = supabase.channel(`force-logout-${adminProfileId}`);
      bc.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await bc.send({ type: 'broadcast', event: 'force_logout', payload: { force, reason } });
          supabase.removeChannel(bc);
        }
      });
      toast({ title: force ? 'Client force logged out' : 'Force logout lifted', description: force ? reason : 'Client can now login again.' });
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleConfirmPayment = async (paymentId: string, adminProfileId: string) => {
    try {
      const now = new Date();
      // Get current end date, extend from it or from now
      const admin = rows.find(r => r.profile_id === adminProfileId);
      const currentEndStr = (admin as any)?.subscription_end_date;
      const baseDate = currentEndStr && new Date(currentEndStr) > now ? new Date(currentEndStr) : now;
      const newEnd = new Date(baseDate);
      newEnd.setDate(newEnd.getDate() + 30);
      
      await (supabase as any).from('subscription_payments').update({
        status: 'confirmed',
        confirmed_by: profile?.id,
        confirmed_at: now.toISOString(),
      }).eq('id', paymentId);
      
      await (supabase as any).from('profiles').update({
        subscription_status: 'active',
        subscription_end_date: newEnd.toISOString(),
        force_logout: false,
        force_logout_reason: null,
      }).eq('id', adminProfileId);
      
      toast({ title: 'Payment confirmed', description: `Subscription extended to ${newEnd.toLocaleDateString('en-IN')}` });
      fetchPaymentSettings();
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleQuickExtend = async (adminProfileId: string, daysToAdd: number) => {
    try {
      const admin = rows.find(r => r.profile_id === adminProfileId);
      const now = new Date();
      const currentEndStr = (admin as any)?.subscription_end_date;
      const baseDate = currentEndStr && new Date(currentEndStr) > now ? new Date(currentEndStr) : now;
      const newEnd = new Date(baseDate);
      newEnd.setDate(newEnd.getDate() + daysToAdd);

      const { error } = await (supabase as any).from('profiles').update({
        subscription_status: 'active',
        subscription_end_date: newEnd.toISOString(),
        force_logout: false,
        force_logout_reason: null,
      }).eq('id', adminProfileId);

      if (error) throw error;
      toast({
        title: 'Subscription Extended',
        description: `Extended by ${daysToAdd} days to ${newEnd.toLocaleDateString('en-IN')}`,
      });
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Failed to extend', description: e.message, variant: 'destructive' });
    }
  };

  const handleQuickExtendMonths = async (adminProfileId: string, monthsToAdd: number) => {
    try {
      const admin = rows.find(r => r.profile_id === adminProfileId);
      const now = new Date();
      const currentEndStr = (admin as any)?.subscription_end_date;
      const baseDate = currentEndStr && new Date(currentEndStr) > now ? new Date(currentEndStr) : now;
      const newEnd = new Date(baseDate);
      newEnd.setMonth(newEnd.getMonth() + monthsToAdd);

      const { error } = await (supabase as any).from('profiles').update({
        subscription_status: 'active',
        subscription_end_date: newEnd.toISOString(),
        force_logout: false,
        force_logout_reason: null,
      }).eq('id', adminProfileId);

      if (error) throw error;
      toast({
        title: 'Subscription Extended',
        description: `Extended by ${monthsToAdd} month(s) to ${newEnd.toLocaleDateString('en-IN')}`,
      });
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Failed to extend', description: e.message, variant: 'destructive' });
    }
  };

  const handleCustomExtend = async (adminProfileId: string) => {
    const input = window.prompt('Enter extension duration in months (e.g. 1, 3, 6, 12, 36) or days (e.g. 45d):');
    if (!input || !input.trim()) return;

    const trimmed = input.trim();
    if (trimmed.endsWith('d')) {
      const days = parseInt(trimmed.replace('d', ''), 10);
      if (!isNaN(days) && days > 0) {
        handleQuickExtend(adminProfileId, days);
        return;
      }
    }

    const months = parseInt(trimmed, 10);
    if (!isNaN(months) && months > 0) {
      handleQuickExtendMonths(adminProfileId, months);
    } else {
      toast({ title: 'Invalid input', description: 'Please enter a valid number of months or days (e.g. 6 or 45d).', variant: 'destructive' });
    }
  };

  const handleSendExpiryPushNotification = async (adminProfileId: string, hotelName: string, daysLeftText: string) => {
    try {
      const channelName = `subscription-notifications-${adminProfileId}`;
      const bc = supabase.channel(channelName);
      bc.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await bc.send({
            type: 'broadcast',
            event: 'expiry_push_reminder',
            payload: {
              title: '⚠️ Subscription Renewal Notice',
              body: `Your ZenPOS plan for ${hotelName || 'your restaurant'} is ${daysLeftText}. Renew now to keep uninterrupted service!`,
              url: '/renew',
              timestamp: new Date().toISOString(),
            },
          });
          setTimeout(() => supabase.removeChannel(bc), 1000);
        }
      });

      toast({
        title: '🔔 Push Reminder Sent!',
        description: `Push notification dispatched to ${hotelName || 'client'} Android/PWA bar.`,
      });
    } catch (e: any) {
      toast({ title: 'Failed to send notification', description: e.message, variant: 'destructive' });
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
        setIsBackupEnabled(settings.is_enabled || false);
        setRetentionDays(settings.retention_days || 10);
      }
      
      const { data: logs, error: logsErr } = await supabase.storage.from('pos_backups').list();
      
      if (logsErr) throw logsErr;
      
      if (logs) {
        // Map storage files to match the expected log format in UI
        const mappedLogs = logs
          .filter(f => f.name !== '.emptyFolderPlaceholder')
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .map(f => ({
            id: f.id || f.name,
            created_at: f.created_at,
            status: 'success',
            file_name: f.name,
            file_size: f.metadata?.size || 0,
            details: 'Cloud Auto-Backup via App'
          }));
        setBackupLogs(mappedLogs as any[]);
      }
    } catch (e: any) {
      console.error("Backup data fetch error", e);
      toast({ title: "Failed to load backups", description: e.message, variant: "destructive" });
    } finally {
      setLoadingBackup(false);
    }
  };

  const saveBackupSettings = async () => {
    try {
      const { error } = await supabase.from('backup_settings').upsert({
        id: backupSettings?.id || undefined,
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
      toast({ title: "Starting Backup", description: "Generating cloud backup..." });
      
      const { buildBackup } = await import('@/utils/backupUtils');
      const backupData = await buildBackup();
      const backupJson = JSON.stringify(backupData, null, 2);
      
      const now = new Date();
      const filename = `backup_manual_${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}.json`;

      const { error: uploadError } = await supabase.storage
        .from('pos_backups')
        .upload(filename, backupJson, {
          contentType: 'application/json',
          upsert: true
        });

      if (uploadError) throw uploadError;

      toast({ title: "Backup Successful", description: `Cloud backup ${filename} created successfully.` });
      fetchBackupData();
    } catch (e: any) {
      console.error("Backup trigger failed", e);
      toast({ title: "Backup Execution Failed", description: e.message || "Failed to generate manual backup.", variant: "destructive" });
      fetchBackupData();
    } finally {
      setTriggeringBackup(false);
    }
  };

  const downloadCloudBackup = async (fileName: string) => {
    try {
      toast({ title: "Downloading...", description: `Fetching ${fileName} from cloud storage.` });
      const { data, error } = await supabase.storage.from('pos_backups').download(fileName);
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: "Success", description: "Backup file downloaded." });
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
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
        // Enriched with client_permissions & subscription fields from profiles table
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, client_permissions, subscription_plan, subscription_status, subscription_end_date, subscription_amount, force_logout, force_logout_reason, max_branches, max_sub_users, public_ordering_enabled');

        if (profilesError) throw profilesError;

        const profileMap = new Map((profilesData || []).map(p => [p.id, p]));

        const { data: shopSettingsData } = await supabase.from('shop_settings').select('user_id, shift_management_unlocked, fcm_unlocked, native_app_unlocked') as { data: any[] | null };
        const settingsMap = new Map((shopSettingsData || []).map((s: any) => [s.user_id, s]));

        const enrichedRows = (data as Row[]).map(r => {
          const prof: any = profileMap.get(r.profile_id) || {};
          const settings: any = settingsMap.get(r.user_id) || {};
          return {
            ...r,
            client_permissions: prof.client_permissions || {},
            subscription_plan: prof.subscription_plan || 'basic',
            subscription_status: prof.subscription_status || 'active',
            subscription_end_date: prof.subscription_end_date || null,
            subscription_amount: prof.subscription_amount || 0,
            force_logout: prof.force_logout || false,
            force_logout_reason: prof.force_logout_reason || null,

            max_branches: prof.max_branches ?? 1,
            max_sub_users: prof.max_sub_users ?? 5,
            public_ordering_enabled: prof.public_ordering_enabled !== false,
            _shiftUnlocked: settings.shift_management_unlocked ?? false,
            _fcmUnlocked: settings.fcm_unlocked ?? false,
            _nativeAppUnlocked: settings.native_app_unlocked ?? false,
          };
        });

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

  useEffect(() => {
    if (profile?.role === 'super_admin' && activeTab === 'subscriptions') {
      fetchPaymentSettings();

      // Realtime listener for incoming client UTR payment submissions
      const subChannel = supabase
        .channel('subscription-payments-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'subscription_payments' },
          (payload) => {
            fetchPaymentSettings();
            fetchUsers();
            if (payload.eventType === 'INSERT') {
              toast({
                title: '⚡ New Payment Reference (UTR) Received!',
                description: 'A client submitted a new UTR reference for subscription renewal.',
              });
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(subChannel);
      };
    }
  }, [activeTab, profile]);

  const handleTogglePermission = async (adminProfileId: string, toPath: string, enabled: boolean) => {
    const admin = rows.find(r => r.profile_id === adminProfileId);
    if (!admin) return;

    const currentPerms = admin.client_permissions || {};
    const updatedPerms = { ...currentPerms, [toPath]: enabled };
    if (toPath === '/online-orders' || toPath === 'allow_online_orders') {
      updatedPerms['/online-orders'] = enabled;
      updatedPerms['allow_online_orders'] = enabled;
    }

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

  // Super Admin only: master switch for customer ordering from the public QR portal.
  // When disabled the client cannot re-enable it; the portal becomes view-only (menu still visible).
  const handleTogglePublicOrdering = async (adminProfileId: string, enabled: boolean) => {
    const admin = rows.find(r => r.profile_id === adminProfileId);
    if (!admin) return;
    try {
      const { error } = await (supabase as any)
        .from('profiles')
        .update({ public_ordering_enabled: enabled })
        .eq('id', adminProfileId);
      if (error) throw error;

      setRows(prev => prev.map(r => r.profile_id === adminProfileId ? { ...r, public_ordering_enabled: enabled } : r));
      setSelectedAdmin(prev => prev && prev.profile_id === adminProfileId ? { ...prev, public_ordering_enabled: enabled } : prev);

      toast({
        title: enabled ? 'Public ordering enabled' : 'Public ordering disabled',
        description: enabled
          ? `${admin.hotel_name || admin.name} customers can place orders from the QR portal.`
          : `${admin.hotel_name || admin.name} portal is now view-only for all branches.`,
      });
    } catch (err: any) {
      console.error('Failed to update public ordering flag:', err);
      toast({ title: 'Update failed', description: err.message || 'Could not update setting', variant: 'destructive' });
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
    base['allow_online_orders'] = enabled;
    base['/online-orders'] = enabled;
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

  const baseFiltered = useMemo(() => {
    let result = rows;


    const s = q.trim().toLowerCase();
    if (!s) return result;
    return result.filter(r =>
      (r.name || '').toLowerCase().includes(s) ||
      (r.email || '').toLowerCase().includes(s) ||
      (r.mobile_number || '').toLowerCase().includes(s) ||
      (r.hotel_name || '').toLowerCase().includes(s) ||
      (r.shop_name || '').toLowerCase().includes(s) ||
      (r.admin_name || '').toLowerCase().includes(s)
    );
  }, [rows, q]);

  const allAdmins = useMemo(() => baseFiltered.filter(r => r.role === 'admin'), [baseFiltered]);
  const allStaff = useMemo(() => baseFiltered.filter(r => r.role === 'user'), [baseFiltered]);

  const admins = allAdmins;
  const subUsers = allStaff;

  const filtered = useMemo(() => {
    if (userRoleFilter === 'admin') return allAdmins;
    if (userRoleFilter === 'staff') return allStaff;
    return baseFiltered;
  }, [baseFiltered, allAdmins, allStaff, userRoleFilter]);

  if (authLoading) return null;
  if (!profile) return <Navigate to="/auth" replace />;
  if (profile.role !== 'super_admin') return <Navigate to="/" replace />;

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
            <Button size="sm" variant="outline" onClick={async () => {
              try {
                const { data } = await supabase.storage.from('app-releases').createSignedUrl('zenpos-latest.apk', 3600);
                if (data?.signedUrl) {
                  window.open(data.signedUrl, '_blank');
                } else {
                  toast({ title: 'APK not available', description: 'Upload an APK to app-releases bucket first.', variant: 'destructive' });
                }
              } catch {
                toast({ title: 'Download failed', variant: 'destructive' });
              }
            }}>
              📱 Download APK
            </Button>
            <Badge className="px-3 py-1 font-bold text-xs uppercase tracking-wider bg-primary/10 border-primary/20 text-primary">System Overlord</Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="hidden sm:grid sm:grid-cols-5 max-w-4xl bg-slate-100 dark:bg-slate-900 border rounded-xl p-1">
            <TabsTrigger value="users" className="rounded-lg py-2 text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm">
              <UsersIcon className="w-3.5 h-3.5 mr-2" /> Users & Staff ({rows.length})
            </TabsTrigger>
            <TabsTrigger value="subscriptions" className="rounded-lg py-2 text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm">
              <CreditCard className="w-3.5 h-3.5 mr-2" /> Subscriptions ({subPayments.length})
            </TabsTrigger>
            <TabsTrigger value="payments" className="rounded-lg py-2 text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm">
              <CreditCard className="w-3.5 h-3.5 mr-2" /> Payments
            </TabsTrigger>
            <TabsTrigger value="backups" className="rounded-lg py-2 text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm">
              <Database className="w-3.5 h-3.5 mr-2" /> Backups & Health
            </TabsTrigger>
            <TabsTrigger value="support" className="rounded-lg py-2 text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm">
              <Settings className="w-3.5 h-3.5 mr-2" /> Support & Legal
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4 mt-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <Input
                placeholder="Search name, email, mobile, business, shop, or admin..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="max-w-md h-10 shadow-sm bg-white dark:bg-slate-800"
              />
              
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border">
                  <button
                    type="button"
                    onClick={() => setUserRoleFilter('admin')}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-bold transition-all',
                      userRoleFilter === 'admin' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Admins ({allAdmins.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserRoleFilter('staff')}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-bold transition-all',
                      userRoleFilter === 'staff' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Staff ({allStaff.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserRoleFilter('all')}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-bold transition-all',
                      userRoleFilter === 'all' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    All ({baseFiltered.length})
                  </button>
                </div>

                <Button
                  onClick={() => setAddUserDialogOpen(true)}
                  className="h-10 font-bold gap-2 rounded-xl shadow-md"
                >
                  <Plus className="w-4 h-4" /> Add User
                </Button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm px-4 py-3 flex items-start gap-2 animate-pulse">
                <span className="text-base shrink-0">⚠️</span>
                <p className="font-semibold">{error}</p>
              </div>
            )}

            {/* Unified User Directory Table */}
            <Card className="border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
              <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm sm:text-base flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                      <UsersIcon className="w-4 h-4 text-primary" /> System User Directory ({filtered.length})
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Consolidated management of Tenant Admins and Branch Staff sub-users.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono font-bold">
                    {allAdmins.length} Admins • {allStaff.length} Staff
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/30 dark:bg-slate-950/20">
                    <TableRow>
                      <TableHead className="font-bold text-xs">Full Name</TableHead>
                      <TableHead className="font-bold text-xs">Role</TableHead>
                      <TableHead className="font-bold text-xs">Email</TableHead>
                      <TableHead className="font-bold text-xs">Mobile (Click to Call)</TableHead>
                      <TableHead className="font-bold text-xs">Business Name</TableHead>
                      <TableHead className="font-bold text-xs">Business Type</TableHead>
                      <TableHead className="font-bold text-xs">Shop Name</TableHead>
                      <TableHead className="font-bold text-xs">Address</TableHead>
                      <TableHead className="font-bold text-xs">Parent Admin</TableHead>
                      <TableHead className="font-bold text-xs">Status</TableHead>
                      <TableHead className="font-bold text-xs">Logins</TableHead>
                      <TableHead className="font-bold text-xs">Last Login</TableHead>
                      <TableHead className="font-bold text-xs">Created</TableHead>
                      <TableHead className="text-right font-bold text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && <TableRow><TableCell colSpan={13} className="text-center py-6 text-muted-foreground">Loading users...</TableCell></TableRow>}
                    {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={13} className="text-center py-6 text-muted-foreground">No users found matching query</TableCell></TableRow>}
                    {filtered.map(r => (
                      <TableRow key={r.profile_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20">
                        <TableCell className="font-bold text-xs text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {r.name || '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant={r.role === 'admin' ? 'default' : 'secondary'} className="text-[9px] font-bold px-1.5 py-0.5 uppercase">
                            {r.role === 'admin' ? 'Admin' : 'Staff'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{r.email || '—'}</TableCell>
                        <TableCell className="text-xs font-mono whitespace-nowrap">
                          {r.mobile_number ? (
                            <a
                              href={`tel:${r.mobile_number}`}
                              className="inline-flex items-center gap-1.5 text-primary hover:text-primary/80 font-bold hover:underline bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-lg border border-primary/20 transition-all"
                              title="Click to dial number directly"
                            >
                              <PhoneCall className="w-3 h-3 text-primary" />
                              {r.mobile_number}
                            </a>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{r.hotel_name || '—'}</TableCell>
                        <TableCell className="text-xs font-medium capitalize">Restaurant</TableCell>
                        <TableCell className="text-xs font-medium">{r.shop_name || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={r.address || ''}>
                          {r.address || '—'}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {r.admin_name || (r.role === 'admin' ? 'Self (Admin)' : '—')}
                        </TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell className="font-semibold text-xs">{r.login_count ?? 0}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">{r.last_login ? new Date(r.last_login).toLocaleString('en-IN') : '—'}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
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
                              onClick={() => handleTogglePause(r)}
                              className={cn(
                                "h-8 text-xs px-2.5 rounded-xl font-bold gap-1 transition-all",
                                r.status === 'paused'
                                  ? "border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400"
                                  : "border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400"
                              )}
                              title={r.status === 'paused' ? "Activate Account" : "Pause Account (Force Logout)"}
                            >
                              {r.status === 'paused' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                              {r.status === 'paused' ? "Activate" : "Pause"}
                            </Button>

                            {r.role === 'admin' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setClientLimitsTarget(r)}
                                  className="h-8 text-xs px-2.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-400 rounded-xl font-bold gap-1 transition-all shadow-sm"
                                  title="Manage Account Limits (Branches & Staff Users)"
                                >
                                  <Sliders className="w-3.5 h-3.5" />
                                  Limits ({r.max_branches ?? 1}B / {r.max_sub_users ?? 5}U)
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
                                  onClick={() => setStorageTarget(r)}
                                  className="h-8 text-xs px-2 border-slate-200 dark:border-slate-800 rounded-xl"
                                  title="Cloud storage limits (database & files)"
                                >
                                  <HardDrive className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedAdmin(r);
                                    setPermsDialogOpen(true);
                                  }}
                                  className="h-8 text-xs px-2.5 border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground shadow-sm transition-all duration-150 gap-1.5 rounded-xl font-semibold"
                                >
                                  <Shield className="w-3.5 h-3.5" />
                                  Permissions
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                    onClick={() => handleDeleteClientClick(r)}
                                  className="h-8 text-xs px-2.5 border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white dark:border-rose-900 dark:text-rose-400 rounded-xl font-bold gap-1 transition-all"
                                  title="Delete Client & Entire Data (Force Logout)"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete
                                </Button>
                                <div className="flex items-center gap-3 ml-1">
                                  <div className="flex items-center gap-1.5" title="Unlock Shift Management for this client">
                                    <Switch
                                      id={`sa-shift-${r.profile_id}`}
                                      checked={r._shiftUnlocked ?? false}
                                      onCheckedChange={async (val) => {
                                        await supabase.from('shop_settings').update({ shift_management_unlocked: val } as any).eq('user_id', r.user_id);
                                        setRows(prev => prev.map(u => u.profile_id === r.profile_id ? { ...u, _shiftUnlocked: val } : u));
                                        toast({ title: val ? 'Shift Management unlocked' : 'Shift Management locked' });
                                      }}
                                      className="scale-75"
                                    />
                                    <Label htmlFor={`sa-shift-${r.profile_id}`} className="text-[10px] cursor-pointer whitespace-nowrap">Shifts</Label>
                                  </div>
                                  <div className="flex items-center gap-1.5" title="Unlock FCM Push Notifications for this client">
                                    <Switch
                                      id={`sa-fcm-${r.profile_id}`}
                                      checked={r._fcmUnlocked ?? false}
                                      onCheckedChange={async (val) => {
                                        await supabase.from('shop_settings').update({ fcm_unlocked: val } as any).eq('user_id', r.user_id);
                                        setRows(prev => prev.map(u => u.profile_id === r.profile_id ? { ...u, _fcmUnlocked: val } : u));
                                        toast({ title: val ? 'Push Notifications unlocked' : 'Push Notifications locked' });
                                      }}
                                      className="scale-75"
                                    />
                                    <Label htmlFor={`sa-fcm-${r.profile_id}`} className="text-[10px] cursor-pointer whitespace-nowrap">FCM</Label>
                                  </div>
                                  <div className="flex items-center gap-1.5" title="Unlock Native App (Capacitor APK) for this client">
                                    <Switch
                                      id={`sa-app-${r.profile_id}`}
                                      checked={r._nativeAppUnlocked ?? false}
                                      onCheckedChange={async (val) => {
                                        await supabase.from('shop_settings').update({ native_app_unlocked: val } as any).eq('user_id', r.user_id);
                                        setRows(prev => prev.map(u => u.profile_id === r.profile_id ? { ...u, _nativeAppUnlocked: val } : u));
                                        toast({ title: val ? 'Native App unlocked' : 'Native App locked' });
                                      }}
                                      className="scale-75"
                                    />
                                    <Label htmlFor={`sa-app-${r.profile_id}`} className="text-[10px] cursor-pointer whitespace-nowrap">App</Label>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="space-y-6 mt-6 focus-visible:outline-none">
            <PlatformPaymentSettings />
          </TabsContent>

          <TabsContent value="backups" className="space-y-6 mt-6 focus-visible:outline-none">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Backup Settings Configuration */}
              <div className="lg:col-span-1 space-y-6">
                <Card className="border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-sm sm:text-base flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                      <Settings className="w-4 h-4 text-primary" /> Cloud Storage Settings
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">Configure automatic database backups to Supabase Cloud Storage.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl border bg-slate-50 dark:bg-slate-950">
                      <div className="flex flex-col gap-0.5">
                        <Label className="text-xs font-bold">Enable Auto Backup</Label>
                        <span className="text-[10px] text-muted-foreground">Upload backups to Cloud Storage automatically.</span>
                      </div>
                      <Switch checked={isBackupEnabled} onCheckedChange={setIsBackupEnabled} />
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
                          <TableHead className="font-bold text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingBackup && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading logs...</TableCell></TableRow>}
                        {!loadingBackup && backupLogs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No backup activities recorded yet.</TableCell></TableRow>}

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
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" onClick={() => downloadCloudBackup(log.file_name)} title="Download Backup">
                                <Download className="w-4 h-4 text-primary" />
                              </Button>
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

                    {/* Client Portal Branding */}
                    <Card className="border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden col-span-1 lg:col-span-2 mt-2 mb-2">
                      <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-4">
                        <CardTitle className="text-sm sm:text-base flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                          <Globe className="w-4 h-4 text-primary" />
                          Client Portal Branding (Powered by ZenPOS)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-5">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label className="font-semibold text-gray-800 dark:text-gray-200">Show "Powered by ZenPOS" Footer</Label>
                              <p className="text-xs text-slate-500 mt-0.5">Displays a clickable promotion in all client public menus.</p>
                            </div>
                            <Switch 
                              checked={showPoweredByWatermark} 
                              onCheckedChange={setShowPoweredByWatermark} 
                            />
                          </div>
                          {showPoweredByWatermark && (
                            <div className="pt-2">
                              <Label className="font-semibold text-gray-800 dark:text-gray-200 block mb-2">Promotion Contact Text</Label>
                              <textarea 
                                value={poweredByContact}
                                onChange={(e) => setPoweredByContact(e.target.value)}
                                placeholder="e.g., Call us at +91 9876543210 or visit zenpos.com to get this for your restaurant!"
                                className="w-full text-sm p-3 rounded-xl border border-input bg-slate-50/50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                rows={2}
                              />
                              <p className="text-xs text-slate-500 mt-1.5">This text appears when clients' customers click the footer branding.</p>
                            </div>
                          )}
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

                {/* Google Play Store Terms & Conditions Manager Card */}
                <Card className="border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden mt-6">
                  <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-sm sm:text-base flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                          <FileText className="w-4 h-4 text-primary" /> Google Play Store Terms & Conditions Manager
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">
                          Edit and publish live Terms & Conditions and Privacy Policy text required for Google Play Store app approval.
                        </CardDescription>
                      </div>
                      <a
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-bold transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> View Live /terms Page
                      </a>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Terms & Conditions & Privacy Policy Content (Supports Plain Text & Markdown Formatting)
                      </Label>
                      <Textarea
                        rows={16}
                        value={termsAndConditionsText}
                        onChange={e => setTermsAndConditionsText(e.target.value)}
                        placeholder="Enter Terms & Conditions and Privacy Policy text..."
                        className="font-mono text-xs leading-relaxed bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-xl p-4"
                      />
                    </div>
                    <Button
                      onClick={handleSaveTerms}
                      disabled={savingTerms}
                      className="h-11 px-6 font-bold shadow-md gap-2 rounded-xl"
                    >
                      <RefreshCw className={`w-4 h-4 ${savingTerms ? 'animate-spin' : ''}`} />
                      💾 Save & Publish Terms & Conditions
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="subscriptions" className="space-y-6 mt-6 focus-visible:outline-none">
            {loadingPayment ? (
              <div className="text-center py-12 text-muted-foreground">Loading subscription settings...</div>
            ) : (
              <div className="space-y-6">
                {/* Per-client / per-branch pack pricing */}
                <SubscriptionPackPricing admins={admins as any} />

                {/* Payment Settings Card */}
                <Card className="border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm">
                  <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-4">
                    <CardTitle className="text-sm sm:text-base flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                      <CreditCard className="w-4 h-4 text-primary" /> Payment Settings
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">Configure UPI payment details shown to clients for subscription payments.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">UPI ID</Label>
                        <Input placeholder="e.g. yourname@upi" value={paymentUpiId} onChange={e => setPaymentUpiId(e.target.value)} className="h-9 text-xs bg-white dark:bg-slate-800 font-mono" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">QR Code Image URL</Label>
                        <Input placeholder="https://... QR image URL" value={paymentQrImageUrl} onChange={e => setPaymentQrImageUrl(e.target.value)} className="h-9 text-xs bg-white dark:bg-slate-800 font-mono" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">Default Amount (₹)</Label>
                        <Input type="number" min={0} value={defaultSubAmount} onChange={e => setDefaultSubAmount(+e.target.value)} className="h-9 text-xs bg-white dark:bg-slate-800 font-semibold" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">Payment Instructions</Label>
                        <Input placeholder="e.g. Pay via UPI and share screenshot" value={paymentInstructions} onChange={e => setPaymentInstructions(e.target.value)} className="h-9 text-xs bg-white dark:bg-slate-800" />
                      </div>
                    </div>
                    <Button onClick={handleSavePaymentSettings} disabled={savingPayment} className="h-9 font-bold shadow-sm gap-1.5">
                      <RefreshCw className={`w-3.5 h-3.5 ${savingPayment ? 'animate-spin' : ''}`} /> Save Payment Settings
                    </Button>
                  </CardContent>
                </Card>

                {/* Per-Admin Subscription Cards */}
                <Card className="border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm">
                  <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-sm sm:text-base flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                          <UsersIcon className="w-4 h-4 text-primary" /> Admin Subscriptions ({admins.length})
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">Manage subscription plans, force logout, and payment status per admin.</CardDescription>
                      </div>

                      {/* Status Filter Pills */}
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
                        <button
                          onClick={() => setSubFilter('all')}
                          className={cn('px-2.5 py-1 rounded-lg transition-all', subFilter === 'all' ? 'bg-white dark:bg-slate-700 shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
                        >
                          All ({admins.length})
                        </button>
                        <button
                          onClick={() => setSubFilter('active')}
                          className={cn('px-2.5 py-1 rounded-lg transition-all', subFilter === 'active' ? 'bg-emerald-500 text-white shadow-sm' : 'text-emerald-600 hover:text-emerald-700')}
                        >
                          Active
                        </button>
                        <button
                          onClick={() => setSubFilter('expiring')}
                          className={cn('px-2.5 py-1 rounded-lg transition-all', subFilter === 'expiring' ? 'bg-amber-500 text-white shadow-sm' : 'text-amber-600 hover:text-amber-700')}
                        >
                          Expiring
                        </button>
                        <button
                          onClick={() => setSubFilter('expired')}
                          className={cn('px-2.5 py-1 rounded-lg transition-all', subFilter === 'expired' ? 'bg-red-500 text-white shadow-sm' : 'text-red-600 hover:text-red-700')}
                        >
                          Expired
                        </button>
                        <button
                          onClick={() => setSubFilter('suspended')}
                          className={cn('px-2.5 py-1 rounded-lg transition-all', subFilter === 'suspended' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700')}
                        >
                          Suspended
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    {admins.length === 0 && <div className="text-center py-6 text-muted-foreground text-sm">No admins found.</div>}
                    {admins.filter(admin => {
                      const a = admin as any;
                      const isSuspended = a.force_logout === true;
                      const rel = getRelativeSubscriptionText(a.subscription_end_date);
                      if (subFilter === 'suspended') return isSuspended;
                      if (subFilter === 'active') return !isSuspended && rel.stage === 'active';
                      if (subFilter === 'expiring') return !isSuspended && rel.stage === 'expiring';
                      if (subFilter === 'expired') return !isSuspended && rel.stage === 'expired';
                      return true;
                    }).map(admin => {
                      const a = admin as any;
                      const formattedDate = a.subscription_end_date ? new Date(a.subscription_end_date).toISOString().split('T')[0] : '';
                      const relInfo = getRelativeSubscriptionText(a.subscription_end_date);
                      const pendingPayment = subPayments.find(p => p.admin_id === admin.profile_id && p.status === 'pending');

                      return (
                        <div key={`sub-admin-${admin.profile_id}-${formattedDate}-${a.subscription_plan}-${a.subscription_amount}`} className="border rounded-xl p-4 bg-white dark:bg-slate-900/50 space-y-3 shadow-sm hover:shadow transition-shadow">
                          {/* Top Info Bar */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{admin.hotel_name || admin.name}</span>
                              <span className="ml-2 text-xs text-muted-foreground font-mono">{admin.email}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Relative Expiry Badge */}
                              <Badge className={cn('text-[11px] font-semibold border px-2.5 py-0.5', relInfo.badgeColor)}>
                                {relInfo.text}
                              </Badge>

                              {a.force_logout && <Badge variant="destructive" className="text-[10px]">FORCE LOGGED OUT</Badge>}
                            </div>
                          </div>

                          {/* Pending Payment Notification Banner if Client Submitted UTR */}
                          {pendingPayment && (
                            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-lg p-2.5 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-amber-600 dark:text-amber-400">⚡ Client Submitted Payment:</span>
                                <span className="font-semibold">₹{pendingPayment.amount}</span>
                                <span>| UTR: <strong className="font-mono text-amber-950 dark:text-amber-100">{pendingPayment.transaction_ref || '—'}</strong></span>
                              </div>
                              <Button
                                size="sm"
                                className="h-7 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shrink-0"
                                onClick={() => handleConfirmPayment(pendingPayment.id, admin.profile_id)}
                              >
                                <CheckCircle2 className="w-3 h-3" /> Confirm & Extend +30 Days
                              </Button>
                            </div>
                          )}

                          {/* Form Inputs & Action Buttons */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold text-muted-foreground">Plan</Label>
                              <Input defaultValue={a.subscription_plan || 'basic'} id={`plan-${admin.profile_id}`} className="h-8 text-xs font-medium" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold text-muted-foreground">Amount (₹)</Label>
                              <Input type="number" defaultValue={a.subscription_amount || defaultSubAmount} id={`amount-${admin.profile_id}`} className="h-8 text-xs font-semibold" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold text-muted-foreground">End Date</Label>
                              <Input type="date" defaultValue={a.subscription_end_date ? new Date(a.subscription_end_date).toISOString().split('T')[0] : ''} id={`enddate-${admin.profile_id}`} className="h-8 text-xs font-mono" />
                            </div>
                            <div className="flex items-end gap-1.5">
                              <Button size="sm" className="h-8 text-xs font-bold gap-1 flex-1" onClick={() => {
                                const plan = (document.getElementById(`plan-${admin.profile_id}`) as HTMLInputElement)?.value || 'basic';
                                const amount = +(document.getElementById(`amount-${admin.profile_id}`) as HTMLInputElement)?.value || defaultSubAmount;
                                const endDate = (document.getElementById(`enddate-${admin.profile_id}`) as HTMLInputElement)?.value || '';
                                handleSetSubscription(admin.profile_id, plan, amount, endDate);
                              }}>
                                <CheckCircle2 className="w-3 h-3" /> Save
                              </Button>
                              <Button size="sm" variant={a.force_logout ? 'default' : 'destructive'} className="h-8 text-xs font-bold gap-1" onClick={() => {
                                if (a.force_logout) {
                                  handleForceLogout(admin.profile_id, false, '');
                                } else {
                                  const reason = window.prompt('Reason for force logout (e.g. Payment overdue):');
                                  if (reason) handleForceLogout(admin.profile_id, true, reason);
                                }
                              }}>
                                <XCircle className="w-3 h-3" /> {a.force_logout ? 'Lift' : 'Force Out'}
                              </Button>
                            </div>
                          </div>

                          {/* Quick Extension & Push Reminder Bar */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t text-[11px] text-muted-foreground">
                            <span>Shortcuts & Extensions:</span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                onClick={() => handleSendExpiryPushNotification(admin.profile_id, admin.hotel_name || admin.name, relInfo.text)}
                                className="px-2 py-0.5 rounded bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-bold text-[10px] border border-purple-300/60 transition-colors flex items-center gap-1"
                                title="Send Push Notification to client's Android/PWA Status Bar"
                              >
                                <Bell className="w-3 h-3" /> Push Reminder
                              </button>
                              <button
                                onClick={() => handleQuickExtendMonths(admin.profile_id, 1)}
                                className="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] border border-emerald-300/60 transition-colors"
                              >
                                +1 Mo
                              </button>
                              <button
                                onClick={() => handleQuickExtendMonths(admin.profile_id, 3)}
                                className="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] border border-emerald-300/60 transition-colors"
                              >
                                +3 Mo
                              </button>
                              <button
                                onClick={() => handleQuickExtendMonths(admin.profile_id, 6)}
                                className="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold text-[10px] border border-blue-300/60 transition-colors"
                              >
                                +6 Mo
                              </button>
                              <button
                                onClick={() => handleQuickExtendMonths(admin.profile_id, 12)}
                                className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold text-[10px] border border-indigo-300/60 transition-colors"
                              >
                                +1 Yr
                              </button>
                              <button
                                onClick={() => handleQuickExtendMonths(admin.profile_id, 36)}
                                className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-bold text-[10px] border border-amber-300/60 transition-colors"
                              >
                                +3 Yr
                              </button>
                              <button
                                onClick={() => handleCustomExtend(admin.profile_id)}
                                className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-[10px] border border-slate-300/60 transition-colors"
                              >
                                +Custom
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Payment History */}
                <Card className="border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
                  <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-4">
                    <CardTitle className="text-sm sm:text-base flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                      <Database className="w-4 h-4 text-primary" /> Payment History ({subPayments.length})
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">Recent subscription payment submissions from clients with UTR references.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50/30 dark:bg-slate-950/20">
                        <TableRow>
                          <TableHead className="font-bold text-xs">Date</TableHead>
                          <TableHead className="font-bold text-xs">Client / Admin</TableHead>
                          <TableHead className="font-bold text-xs">Plan / Duration</TableHead>
                          <TableHead className="font-bold text-xs">Amount</TableHead>
                          <TableHead className="font-bold text-xs">UTR / Ref No.</TableHead>
                          <TableHead className="font-bold text-xs">Status</TableHead>
                          <TableHead className="text-right font-bold text-xs">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subPayments.length === 0 && (
                          <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No payment records yet.</TableCell></TableRow>
                        )}
                        {subPayments.map(p => {
                          const matchingAdmin = rows.find(r => r.profile_id === p.admin_id);
                          const clientLabel = matchingAdmin?.hotel_name || matchingAdmin?.name || matchingAdmin?.email || (p.admin_id ? `${p.admin_id.slice(0, 8)}...` : 'Unknown');

                          return (
                            <TableRow key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 text-xs">
                              <TableCell className="font-mono text-muted-foreground whitespace-nowrap">{new Date(p.created_at).toLocaleString('en-IN')}</TableCell>
                              <TableCell className="font-semibold text-xs text-slate-900 dark:text-slate-100" title={p.admin_id}>{clientLabel}</TableCell>
                              <TableCell className="text-xs text-muted-foreground font-medium">{p.notes || 'Subscription Renewal'}</TableCell>
                              <TableCell className="font-bold text-emerald-600">₹{p.amount?.toLocaleString('en-IN') ?? '—'}</TableCell>
                              <TableCell className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                                {p.transaction_ref ? (
                                  <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700">{p.transaction_ref}</span>
                                ) : '—'}
                              </TableCell>
                              <TableCell>
                                <Badge variant={p.status === 'confirmed' ? 'default' : p.status === 'pending' ? 'secondary' : 'destructive'} className="text-[10px]">
                                  {(p.status || 'pending').toUpperCase()}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {p.status === 'pending' && (
                                  <Button size="sm" className="h-7 text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleConfirmPayment(p.id, p.admin_id)}>
                                    <CheckCircle2 className="w-3 h-3" /> Confirm & Extend
                                  </Button>
                                )}
                                {p.status === 'confirmed' && <span className="text-[10px] text-emerald-600 font-bold">✓ Confirmed</span>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
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

            <div className="flex items-center justify-between p-3 rounded-xl border bg-pink-50/50 dark:bg-pink-900/20 hover:bg-pink-50 dark:hover:bg-pink-900/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-pink-100 flex items-center justify-center dark:bg-pink-900/60">
                  <span className="text-sm">💬</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-pink-800 dark:text-pink-300">Feedback Module (QR + CRM)</span>
                  <span className="text-[10px] text-pink-600 dark:text-pink-400 font-mono">allow_feedback_module</span>
                </div>
              </div>
              <Switch
                checked={selectedAdmin?.client_permissions?.['allow_feedback_module'] === true}
                onCheckedChange={(checked) => {
                  if (selectedAdmin) {
                    handleTogglePermission(selectedAdmin.profile_id, 'allow_feedback_module', checked);
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border bg-orange-50/50 dark:bg-orange-900/20 hover:bg-orange-50 dark:hover:bg-orange-900/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center dark:bg-orange-900/60">
                  <span className="text-sm">📱</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-orange-800 dark:text-orange-300">Online Orders Hub</span>
                  <span className="text-[10px] text-orange-600 dark:text-orange-400 font-mono">allow_online_orders</span>
                </div>
              </div>
              <Switch
                checked={selectedAdmin?.client_permissions?.['allow_online_orders'] === true}
                onCheckedChange={(checked) => {
                  if (selectedAdmin) {
                    handleTogglePermission(selectedAdmin.profile_id, 'allow_online_orders', checked);
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border bg-emerald-50/50 dark:bg-emerald-900/20 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center dark:bg-emerald-900/60">
                  <span className="text-sm">🛒</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Public Portal Ordering</span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">public_ordering_enabled</span>
                  <span className="text-[10px] text-muted-foreground">Off = menu view-only. Client cannot override.</span>
                </div>
              </div>
              <Switch
                checked={selectedAdmin?.public_ordering_enabled !== false}
                onCheckedChange={(checked) => {
                  if (selectedAdmin) {
                    handleTogglePublicOrdering(selectedAdmin.profile_id, checked);
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

      {clientLimitsTarget && (
        <ClientLimitsModal
          target={clientLimitsTarget}
          onClose={() => setClientLimitsTarget(null)}
          onSaved={() => {
            fetchUsers();
            setClientLimitsTarget(null);
          }}
        />
      )}

      {aiLimitTarget && (
        <SuperAdminAiLimits
          adminId={aiLimitTarget.profile_id}
          adminName={aiLimitTarget.hotel_name || aiLimitTarget.name || aiLimitTarget.email || 'admin'}
          onClose={() => setAiLimitTarget(null)}
        />
      )}

      {storageTarget && (
        <SuperAdminStorageQuota
          adminId={storageTarget.profile_id}
          adminName={storageTarget.hotel_name || storageTarget.name || storageTarget.email || 'admin'}
          onClose={() => setStorageTarget(null)}
        />
      )}

      <AddUserDialog
        open={addUserDialogOpen}
        onOpenChange={setAddUserDialogOpen}
        onUserAdded={fetchUsers}
      />

      {/* Confirm Pause / Activate Modal */}
      <AlertDialog open={pauseConfirmOpen} onOpenChange={setPauseConfirmOpen}>
        <AlertDialogContent className="rounded-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {pauseTarget?.status === 'paused' ? 'Activate Client Account?' : 'Pause Client & Force Log Out?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 dark:text-slate-300 space-y-2 pt-2">
              {pauseTarget?.status === 'paused' ? (
                <p>
                  Are you sure you want to activate <strong>{pauseTarget?.hotel_name || pauseTarget?.name || pauseTarget?.email}</strong>? They will be able to log in to Zen POS again.
                </p>
              ) : (
                <p>
                  Are you sure you want to pause <strong>{pauseTarget?.hotel_name || pauseTarget?.name || pauseTarget?.email}</strong>?
                  This will <strong className="text-amber-700 dark:text-amber-400">INSTANTLY FORCE LOG OUT</strong> the Client Admin and all of their sub-users across all active browser tabs and devices without needing a page refresh.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 pt-2">
            <AlertDialogCancel disabled={actionLoading} className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmPause(); }}
              disabled={actionLoading}
              className={cn(
                "rounded-xl font-bold text-white",
                pauseTarget?.status === 'paused' ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"
              )}
            >
              {actionLoading ? "Processing..." : pauseTarget?.status === 'paused' ? "Activate Now" : "Pause & Force Logout"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Delete Client Modal */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="rounded-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-600">
              <Trash2 className="w-5 h-5 text-rose-500" />
              Permanently Delete Client & All Data?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 dark:text-slate-300 space-y-2 pt-2">
              <p>
                Are you sure you want to PERMANENTLY delete <strong>{deleteTarget?.hotel_name || deleteTarget?.name || deleteTarget?.email}</strong>?
              </p>
              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 p-3 rounded-xl text-xs text-rose-800 dark:text-rose-300 space-y-1">
                <p className="font-bold">⚠️ CRITICAL WARNING:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Deletes Client Admin and all sub-user login authentication accounts from Supabase Backend.</li>
                  <li>Deletes all bills, items, customers, tables, branches, and settings.</li>
                  <li>Instantly force logs out all active user sessions across all devices.</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 pt-2">
            <AlertDialogCancel disabled={actionLoading} className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmDeleteClient(); }}
              disabled={actionLoading}
              className="rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white"
            >
              {actionLoading ? "Deleting..." : "Permanently Delete Everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SuperAdminUsers;
