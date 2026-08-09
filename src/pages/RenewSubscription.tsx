import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { SubscriptionBilling } from '@/components/SubscriptionBilling';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, Copy, ExternalLink, Clock, CheckCircle2, XCircle, AlertTriangle, Shield, Sparkles, Check, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { checkOfflineLicenseStatus, syncSubscriptionLicense, type LicenseStatus } from '@/utils/offlineLicenseManager';
import { PRESET_SUBSCRIPTION_PLANS, calculatePlanPricing, resolvePackPricing, type PackPricingOverride } from '@/utils/subscriptionPlans';
import { useBranch } from '@/contexts/BranchContext';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PaymentSettings {
  upi_id: string | null;
  upi_qr_image_url: string | null;
  payment_instructions: string | null;
  default_amount: number | null;
}

interface SubscriptionPayment {
  id: string;
  created_at: string;
  amount: number;
  status: 'pending' | 'confirmed' | 'rejected';
  transaction_ref: string | null;
}

type SubscriptionStatus = 'active' | 'expiring_soon' | 'expired' | 'force_suspended';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function resolveStatus(license: LicenseStatus | null): SubscriptionStatus {
  if (!license) return 'expired';
  if (license.isForceLoggedOut || license.lockReason === 'force_logout') return 'force_suspended';
  if (license.degradationStage === 'locked') return 'expired';
  if (license.degradationStage === 'limited') return 'expired';
  if (license.daysUntilExpiry !== undefined) {
    if (license.daysUntilExpiry <= 0) return 'expired';
    if (license.daysUntilExpiry <= 7) return 'expiring_soon';
  }
  return 'active';
}

const STATUS_CONFIG: Record<
  SubscriptionStatus,
  { label: string; emoji: string; badgeClass: string; ringClass: string }
> = {
  active: {
    label: 'Active',
    emoji: '🟢',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    ringClass: 'ring-emerald-400/60',
  },
  expiring_soon: {
    label: 'Expiring Soon',
    emoji: '🟡',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    ringClass: 'ring-amber-400/60',
  },
  expired: {
    label: 'Expired',
    emoji: '🔴',
    badgeClass: 'bg-red-500/20 text-red-300 border-red-500/40',
    ringClass: 'ring-red-400/60',
  },
  force_suspended: {
    label: 'Force Suspended',
    emoji: '⚫',
    badgeClass: 'bg-gray-500/20 text-gray-300 border-gray-500/40',
    ringClass: 'ring-gray-400/60',
  },
};

const PAYMENT_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-300',
  confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  rejected: 'bg-red-100 text-red-800 border-red-300',
};

function getRelativeExpiryString(endDateStr?: string | null, daysRemaining?: number): string {
  if (!endDateStr) {
    if (daysRemaining !== undefined && daysRemaining > 0) {
      return `Active Subscription (${daysRemaining} days remaining)`;
    }
    return 'Lifetime Access / Perpetual License';
  }
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
    if (diffDays === 0) return `Expires today (${formattedDate})`;
    if (diffDays === 1) return `Expires tomorrow (${formattedDate})`;
    if (diffDays < 30) return `Expires in ${diffDays} days (${formattedDate})`;
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      const remDays = diffDays % 30;
      return `Expires in ${months} mo${months > 1 ? 's' : ''}${remDays > 0 ? ` ${remDays}d` : ''} (${formattedDate})`;
    }
    const years = (diffDays / 365).toFixed(1);
    return `Expires in ${years} year${+years > 1 ? 's' : ''} (${formattedDate})`;
  } else {
    if (absDays === 1) return `Expired 1 day ago (${formattedDate})`;
    if (absDays < 30) return `Expired ${absDays} days ago (${formattedDate})`;
    if (absDays < 365) {
      const months = Math.floor(absDays / 30);
      return `Expired ${months} month${months > 1 ? 's' : ''} ago (${formattedDate})`;
    }
    const years = Math.floor(absDays / 365);
    const remMonths = Math.floor((absDays % 365) / 30);
    const relStr = remMonths > 0 ? `${years} yr ${remMonths} mo ago` : `${years} yr${years > 1 ? 's' : ''} ago`;
    return `Expired ${relStr} (${formattedDate})`;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const RenewSubscription: React.FC = () => {
  const { profile } = useAuth() as any;
  const { toast } = useToast();
  const { operatingBranchId } = useBranch();
  const packBranchId = operatingBranchId ?? null;


  const adminId: string | undefined =
    profile?.role === 'admin' ? profile.id : profile?.admin_id;

  /* ---- state ---- */
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [utrNumber, setUtrNumber] = useState('');
  const [submittingUtr, setSubmittingUtr] = useState(false);
  const [payingOnline, setPayingOnline] = useState(false);
  const [settingAutoPay, setSettingAutoPay] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState<number>(12); // Default 1 Year Annual (Popular)
  const [customMonthsInput, setCustomMonthsInput] = useState<string>('18');
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);

  const [packOverrides, setPackOverrides] = useState<PackPricingOverride[]>([]);

  /* ---- derived ---- */
  const status = resolveStatus(license);
  const cfg = STATUS_CONFIG[status];
  const daysUntilExpiry = license?.daysUntilExpiry ?? (license?.subscriptionStatus === 'active' ? 30 : 0);
  const baseMonthlyPrice = license?.subscriptionAmount || paymentSettings?.default_amount || 999;

  const activeMonths = isCustomMode
    ? Math.max(1, parseInt(customMonthsInput || '1', 10))
    : selectedMonths;
  const currentPricing = resolvePackPricing(baseMonthlyPrice, activeMonths, packOverrides, packBranchId);
  const planAmount = currentPricing.totalAmount;


  /* ---- data fetching ---- */
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);

        // 1) License status
        const synced = adminId ? await syncSubscriptionLicense(adminId) : checkOfflineLicenseStatus();
        const licStatus = synced ?? checkOfflineLicenseStatus();
        setLicense(licStatus);

        // 2) Payment settings
        const { data: settings } = await (supabase as any)
          .from('payment_settings')
          .select('*')
          .maybeSingle();
        if (settings) setPaymentSettings(settings);

        // 3) Payment history
        if (adminId) {
          const { data: history } = await (supabase as any)
            .from('subscription_payments')
            .select('id, created_at, amount, status, transaction_ref, notes')
            .eq('admin_id', adminId)
            .order('created_at', { ascending: false });
          if (history) setPayments(history);
        }

        // 4) Custom pack pricing set by the super admin for this client/branch
        if (adminId) {
          const { data: packs } = await (supabase as any)
            .from('subscription_pack_pricing')
            .select('*')
            .eq('admin_id', adminId)
            .eq('is_active', true);
          setPackOverrides((packs || []) as PackPricingOverride[]);
        }

      } catch (err) {
        console.error('RenewSubscription: load error', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [adminId]);

  /* ---- handlers ---- */
  const handleCopyUpi = async () => {
    if (!paymentSettings?.upi_id) return;
    try {
      await navigator.clipboard.writeText(paymentSettings.upi_id);
      setCopied(true);
      toast({ title: 'Copied!', description: 'UPI ID copied to clipboard.' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', description: 'Could not copy UPI ID.', variant: 'destructive' });
    }
  };

  const handlePayViaUpi = () => {
    const upiId = paymentSettings?.upi_id;
    const amount = planAmount;
    if (!upiId) {
      toast({ title: 'UPI not configured', description: 'Contact your administrator.', variant: 'destructive' });
      return;
    }
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent('ZenPOS')}&am=${amount}&cu=INR&tn=${encodeURIComponent('ZenPOS-Subscription')}`;
    window.location.href = upiUrl;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(upiId).then(() => {
        toast({
          title: 'UPI ID Copied',
          description: `UPI ID (${upiId}) copied to clipboard. If on desktop, scan QR code or pay on your phone and enter UTR below.`,
        });
      }).catch(() => {});
    }
  };

  /* ---- Online auto-collection (Razorpay / PhonePe) ---- */
  const handlePayOnline = async () => {
    try {
      setPayingOnline(true);
      const planLabel = isCustomMode
        ? `${activeMonths} Month(s) Custom Plan`
        : (PRESET_SUBSCRIPTION_PLANS.find(p => p.months === activeMonths)?.name || `${activeMonths} Months`);

      const { data, error } = await supabase.functions.invoke('payments-create-link', {
        body: {
          amount: planAmount,
          purpose: 'subscription',
          description: `ZenPOS Subscription — ${planLabel}`,
          customer_name: profile?.name || profile?.shop_name || 'Client',
          customer_phone: (profile as any)?.mobile_number || '',
          callback_url: `${window.location.origin}/renew-subscription`,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const url = (data as any)?.short_url || (data as any)?.redirect_url;
      if (!url) throw new Error('Payment link could not be created.');
      window.location.href = url;
    } catch (err: any) {
      toast({ title: 'Online payment unavailable', description: err.message, variant: 'destructive' });
    } finally {
      setPayingOnline(false);
    }
  };

  const handleEnableAutoPay = async () => {
    try {
      setSettingAutoPay(true);
      const { data, error } = await supabase.functions.invoke('payments-create-mandate', {
        body: {
          amount: currentPricing.monthlyRate ?? baseMonthlyPrice,
          interval_months: 1,
          total_count: 12,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const url = (data as any)?.short_url || (data as any)?.auth_link;
      if (!url) throw new Error('Auto-pay setup link could not be created.');
      window.location.href = url;
    } catch (err: any) {
      toast({ title: 'Auto-pay setup failed', description: err.message, variant: 'destructive' });
    } finally {
      setSettingAutoPay(false);
    }
  };


  const handleSubmitPaymentRef = async () => {
    if (!utrNumber.trim()) {
      toast({ title: 'UTR Required', description: 'Please enter your 12-digit UPI UTR / Transaction reference number.', variant: 'destructive' });
      return;
    }
    if (!adminId) return;

    try {
      setSubmittingUtr(true);
      const planLabel = isCustomMode ? `${activeMonths} Month(s) Custom Plan` : (PRESET_SUBSCRIPTION_PLANS.find(p => p.months === activeMonths)?.name || `${activeMonths} Months`);

      const { data, error } = await (supabase as any)
        .from('subscription_payments')
        .insert({
          admin_id: adminId,
          amount: planAmount,
          payment_method: 'upi',
          transaction_ref: utrNumber.trim(),
          status: 'pending',
          notes: `Renewal Plan: ${planLabel} (₹${planAmount})`,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Payment Reference Submitted!',
        description: `Submitted for ${planLabel} (₹${planAmount}). Super Admin will verify and confirm shortly.`,
      });
      setUtrNumber('');
      if (data) {
        setPayments(prev => [data, ...prev]);
      }
    } catch (err: any) {
      toast({ title: 'Submission failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmittingUtr(false);
    }
  };

  /* ---- main UI ---- */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading subscription details…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/80 pb-16">
      {/* ---- Grace-period warning banner ---- */}
      {license?.degradationStage === 'warning' && (
        <div className="bg-amber-500 text-white px-4 py-3 flex items-center gap-3 text-sm font-medium shadow-md">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>
            Your subscription has expired. You are in a grace period — some features may be limited.
            Please renew immediately to avoid full lockout.
          </span>
        </div>
      )}

      <div className="mx-auto max-w-3xl px-4 pt-8 space-y-6">
        {/* ============================================================ */}
        {/*  HEADER CARD                                                  */}
        {/* ============================================================ */}
        <Card className="rounded-2xl overflow-hidden border-0 shadow-xl">
          <div className="bg-gradient-to-br from-primary/90 to-primary p-8 text-white">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-white/70 uppercase tracking-wider">
                  Current Plan
                </p>
                <div className="flex items-baseline gap-2.5 mt-1 flex-wrap">
                  <h1 className="text-2xl font-bold capitalize">
                    {(license as any)?.planName ?? (activeMonths === 12 ? '1 Year Annual Plan' : `${activeMonths} Month Plan`)}
                  </h1>
                  <span className="text-sm font-semibold text-white/90 bg-white/15 px-3 py-1 rounded-full border border-white/20">
                    ₹{currentPricing.monthlyRate.toLocaleString('en-IN')}/mo • Total: ₹{planAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
              <Badge
                className={cn(
                  'border text-xs font-semibold px-3 py-1 rounded-full select-none',
                  cfg.badgeClass,
                )}
              >
                {cfg.emoji}&nbsp;{cfg.label}
              </Badge>
            </div>

            {/* Days remaining / Expiry status */}
            <div className="mt-8 flex items-center gap-4">
              <span
                className={cn(
                  'text-7xl font-extrabold leading-none tabular-nums ring-2 rounded-2xl px-5 py-2',
                  cfg.ringClass,
                )}
              >
                {daysUntilExpiry < 0 ? 0 : daysUntilExpiry}
              </span>
              <div className="flex flex-col space-y-1">
                <span className="text-lg font-bold text-white tracking-wide">
                  {daysUntilExpiry < 0 ? 'Subscription Expired' : 'days remaining'}
                </span>
                <span className="text-xs font-semibold text-white/90 bg-black/20 px-3 py-1 rounded-lg border border-white/20 inline-block w-fit">
                  {getRelativeExpiryString((license as any)?.subscriptionEndDate || profile?.subscription_end_date, daysUntilExpiry)}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* ============================================================ */}
        {/*  SELECT SUBSCRIPTION DURATION & PLAN CARD                    */}
        {/* ============================================================ */}
        <Card className="rounded-2xl shadow-lg border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-lg font-bold">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Select Subscription Duration & Plan
              </div>
              <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">
                Base Rate: ₹{baseMonthlyPrice}/month
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Preset Plan Options Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {PRESET_SUBSCRIPTION_PLANS.map((plan) => {
                const pricing = resolvePackPricing(baseMonthlyPrice, plan.months, packOverrides, packBranchId);
                const isSelected = !isCustomMode && selectedMonths === plan.months;

                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => {
                      setIsCustomMode(false);
                      setSelectedMonths(plan.months);
                    }}
                    className={cn(
                      'relative flex flex-col justify-between p-4 rounded-xl border-2 text-left transition-all cursor-pointer',
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-md ring-2 ring-primary/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900',
                    )}
                  >
                    {/* Badge */}
                    {(pricing.isCustom || plan.badge) && (
                      <span className="absolute -top-2.5 right-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-sm">
                        {pricing.isCustom
                          ? (pricing.discountPercentage > 0 ? `Special • Save ${pricing.discountPercentage}%` : 'Special Price')
                          : plan.badge}
                      </span>
                    )}

                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-foreground">{plan.name}</span>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                      </div>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-xl font-extrabold text-foreground">₹{pricing.totalAmount.toLocaleString('en-IN')}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ₹{pricing.monthlyRate}/mo {pricing.savingsAmount > 0 ? `(Save ₹${pricing.savingsAmount})` : ''}
                      </p>
                    </div>
                  </button>
                );
              })}

              {/* Custom Duration Button */}
              <button
                type="button"
                onClick={() => setIsCustomMode(true)}
                className={cn(
                  'flex flex-col justify-between p-4 rounded-xl border-2 text-left transition-all cursor-pointer',
                  isCustomMode
                    ? 'border-primary bg-primary/5 shadow-md ring-2 ring-primary/30'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900',
                )}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-foreground">Custom Duration</span>
                    {isCustomMode && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Specify custom months or years (1 to 120 mo)</p>
                </div>
              </button>
            </div>

            {/* Custom Duration Input Box */}
            {isCustomMode && (
              <div className="bg-slate-50 dark:bg-slate-900 border rounded-xl p-4 space-y-3">
                <Label className="text-xs font-bold">Enter Custom Duration (in months):</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={customMonthsInput}
                    onChange={(e) => setCustomMonthsInput(e.target.value)}
                    className="h-10 text-sm font-semibold max-w-[150px]"
                    placeholder="e.g. 18"
                  />
                  <span className="text-xs text-muted-foreground font-medium">
                    = {activeMonths >= 12 ? `${(activeMonths / 12).toFixed(1)} Year(s)` : `${activeMonths} Month(s)`}
                  </span>
                </div>
              </div>
            )}

            {/* Summary Bar */}
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/60 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-bold text-emerald-900 dark:text-emerald-200 text-sm">
                  Selected: {isCustomMode ? `${activeMonths} Months Custom Plan` : (PRESET_SUBSCRIPTION_PLANS.find(p => p.months === activeMonths)?.name || `${activeMonths} Months`)}
                </span>
                <p className="text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Total Payable: <strong>₹{currentPricing.totalAmount.toLocaleString('en-IN')}</strong> {currentPricing.savingsAmount > 0 ? `(You save ₹${currentPricing.savingsAmount} with ${currentPricing.discountPercentage}% discount)` : ''}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ============================================================ */}
        {/*  PAYMENT SETTINGS CARD                                        */}
        {/* ============================================================ */}
        {paymentSettings && (
          <Card className="rounded-2xl shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CreditCard className="h-5 w-5 text-primary" />
                Payment Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* UPI ID */}
              {paymentSettings.upi_id && (
                <div className="flex items-center gap-3 bg-gray-100 rounded-xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">UPI ID</p>
                    <p className="text-sm font-mono truncate">{paymentSettings.upi_id}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={handleCopyUpi}
                    aria-label="Copy UPI ID"
                  >
                    {copied ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              )}

              {/* QR Code */}
              {paymentSettings.upi_qr_image_url && (
                <div className="flex justify-center">
                  <img
                    src={paymentSettings.upi_qr_image_url}
                    alt="UPI QR Code"
                    className="h-52 w-52 rounded-xl border object-contain bg-white p-2"
                  />
                </div>
              )}

              {/* Instructions */}
              {paymentSettings.payment_instructions && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 leading-relaxed whitespace-pre-line">
                  {paymentSettings.payment_instructions}
                </div>
              )}

              {/* Pay button */}
              {paymentSettings.upi_id && (
                <Button
                  onClick={handlePayViaUpi}
                  className="w-full gap-2 rounded-xl h-12 text-base font-semibold shadow-md"
                  size="lg"
                >
                  <ExternalLink className="h-4 w-4" />
                  Pay ₹{planAmount} via UPI
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* ============================================================ */}
        {/*  INSTANT ONLINE PAYMENT (Razorpay / PhonePe auto-collect)     */}
        {/* ============================================================ */}
        <Card className="rounded-2xl shadow-lg border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-primary" />
              Instant Online Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Pay securely by UPI, card or netbanking. Your subscription is activated automatically once the payment succeeds — no UTR entry needed.
            </p>
            <Button
              onClick={handlePayOnline}
              disabled={payingOnline}
              size="lg"
              className="w-full gap-2 rounded-xl h-12 text-base font-semibold shadow-md"
            >
              {payingOnline ? <Clock className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Pay ₹{currentPricing.totalAmount.toLocaleString('en-IN')} Online
            </Button>
          </CardContent>
        </Card>

        {/* Auto-pay controls, cadence, receipts & invoices */}
        <SubscriptionBilling
          adminId={adminId}
          monthlyAmount={currentPricing.monthlyRate ?? baseMonthlyPrice}
          shopName={profile?.shop_name || profile?.name}
        />


        {/* ============================================================ */}
        {/*  SUBMIT PAYMENT CONFIRMATION CARD                             */}
        {/* ============================================================ */}
        <Card className="rounded-2xl shadow-lg border-2 border-primary/20 bg-gradient-to-br from-white to-primary/5 dark:from-slate-900 dark:to-slate-900/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Submit Payment Reference (UTR)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              After paying via UPI or scanning the QR code, enter your 12-digit UTR / Transaction Reference Number below so the Super Admin can verify and activate your subscription:
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 space-y-1">
                <Input
                  placeholder="e.g. 123456789012 (12-digit UPI UTR)"
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value)}
                  className="h-11 font-mono text-sm bg-white dark:bg-slate-800"
                />
              </div>
              <Button
                onClick={handleSubmitPaymentRef}
                disabled={submittingUtr || !utrNumber.trim()}
                className="h-11 font-bold shadow-md px-6 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {submittingUtr ? <Clock className="w-4 h-4 mr-2 animate-spin" /> : null}
                Submit Confirmation
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ============================================================ */}
        {/*  PAYMENT HISTORY CARD                                         */}
        {/* ============================================================ */}
        <Card className="rounded-2xl shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-primary" />
              Payment History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No payments recorded yet.
              </p>
            ) : (
              <div className="divide-y">
                {payments.map((p) => {
                  const date = new Date(p.created_at);
                  const statusLabel = p.status.charAt(0).toUpperCase() + p.status.slice(1);
                  const statusIcon =
                    p.status === 'confirmed' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : p.status === 'rejected' ? (
                      <XCircle className="h-3.5 w-3.5" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    );

                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          ₹{p.amount?.toLocaleString('en-IN') ?? '—'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {date.toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                          {p.transaction_ref && (
                            <span className="ml-2 text-gray-400">
                              Ref: {p.transaction_ref}
                            </span>
                          )}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs gap-1 shrink-0 rounded-full px-2.5',
                          PAYMENT_STATUS_BADGE[p.status] ?? '',
                        )}
                      >
                        {statusIcon}
                        {statusLabel}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RenewSubscription;
