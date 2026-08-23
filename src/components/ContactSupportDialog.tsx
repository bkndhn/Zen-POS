import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Phone, Mail, MessageSquare, ShieldAlert, Clock, MapPin, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContactSupportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ContactSupportDialog: React.FC<ContactSupportDialogProps> = ({ open, onOpenChange }) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [isAdminSupport, setIsAdminSupport] = useState(false);
  const [adminShopDetails, setAdminShopDetails] = useState<{
    shopName?: string;
    address?: string;
    adminName?: string;
  }>({});
  const [coords, setCoords] = useState<{
    phone?: string;
    email?: string;
    whatsapp?: string;
    custom?: string;
    showPhone: boolean;
    showEmail: boolean;
    showWhatsapp: boolean;
    showCustom: boolean;
  } | null>(null);

  useEffect(() => {
    if (open) {
      const fetchSupportCoords = async () => {
        try {
          setLoading(true);
          // If sub-user (role === 'user'), load admin details from shop_settings & profiles
          if (profile?.role === 'user' && profile.admin_id) {
            setIsAdminSupport(true);
            const { data: adminProfile } = await supabase
              .from('profiles')
              .select('id, user_id, name, mobile_number')
              .eq('id', profile.admin_id)
              .maybeSingle();

            let shopData: any = null;
            if (adminProfile?.user_id) {
              const { data: settingsData } = await supabase
                .from('shop_settings')
                .select('shop_name, contact_number, whatsapp, address')
                .eq('user_id', adminProfile.user_id)
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();
              shopData = settingsData;
            }

            const phone = shopData?.contact_number || (adminProfile as any)?.mobile_number || undefined;
            const whatsapp = shopData?.whatsapp || phone;
            const email = undefined;
            const address = shopData?.address || undefined;
            const shopName = shopData?.shop_name || (adminProfile as any)?.name || 'Store Management';

            setAdminShopDetails({
              shopName,
              address,
              adminName: (adminProfile as any)?.name || 'Store Admin'
            });

            setCoords({
              phone,
              email,
              whatsapp,
              custom: address ? `📍 Store Location / Address:\n${address}` : undefined,
              showPhone: !!phone,
              showEmail: !!email,
              showWhatsapp: !!whatsapp,
              showCustom: !!address,
            });
          } else {
            // Admin / Super Admin view platform support info (safe RPC)
            setIsAdminSupport(false);
            const { data: rows, error } = await (supabase as any)
              .rpc('get_app_support_info');

            if (error) throw error;
            const data = Array.isArray(rows) ? rows[0] : rows;
            if (data) {
              setCoords({
                phone: data.support_phone || undefined,
                email: data.support_email || undefined,
                whatsapp: data.support_whatsapp || undefined,
                custom: data.support_custom_details || undefined,
                showPhone: data.show_support_phone ?? true,
                showEmail: data.show_support_email ?? true,
                showWhatsapp: data.show_support_whatsapp ?? true,
                showCustom: data.show_support_custom ?? true,
              });
            }
          }
        } catch (err) {
          console.error('[Support] Failed to fetch support coordinates:', err);
        } finally {
          setLoading(false);
        }
      };

      fetchSupportCoords();
    }
  }, [open, profile]);

  // Generate deep links
  const cleanPhone = coords?.phone?.replace(/[^\d+]/g, '') || '';
  const cleanWhatsapp = coords?.whatsapp?.replace(/[^\d]/g, '') || '';
  const whatsappUrl = cleanWhatsapp ? `https://wa.me/${cleanWhatsapp}` : '';

  const hasAnyContact = coords && (
    (coords.showPhone && coords.phone) ||
    (coords.showEmail && coords.email) ||
    (coords.showWhatsapp && coords.whatsapp) ||
    (coords.showCustom && coords.custom)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 bg-background text-foreground shadow-2xl">
        <DialogHeader className="pb-3 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            {isAdminSupport ? <Building2 className="w-5 h-5 text-primary" /> : <ShieldAlert className="w-5 h-5 text-primary" />}
            {isAdminSupport ? (adminShopDetails.shopName || 'Store Support') : 'Contact Support'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isAdminSupport
              ? `Reach out to your Store Admin (${adminShopDetails.adminName || 'Admin'}) for assistance.`
              : 'Reach out to our Super Admin team for billing, outages, or help.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-2">
            <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <span className="text-xs text-muted-foreground font-medium">Fetching contact details...</span>
          </div>
        ) : !coords || !hasAnyContact ? (
          <div className="text-center py-8 space-y-2">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground/30" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Support contact details unavailable</p>
            <p className="text-xs text-muted-foreground">Please check back later or contact your store manager directly.</p>
          </div>
        ) : (
          <div className="space-y-4 pt-3">
            {/* Deep link grid */}
            <div className="grid gap-3">
              {coords.showPhone && coords.phone && (
                <a
                  href={`tel:${cleanPhone}`}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-xl border border-border/50",
                    "bg-slate-50/50 hover:bg-slate-100/50 dark:bg-zinc-900/30 dark:hover:bg-zinc-900/60",
                    "transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 shadow-sm"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
                      <Phone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-semibold text-muted-foreground">{isAdminSupport ? 'Call Store Admin' : 'Call Support'}</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{coords.phone}</span>
                    </div>
                  </div>
                  <span className="text-xs text-blue-600 dark:text-blue-400 font-bold">Call Now &rarr;</span>
                </a>
              )}

              {coords.showWhatsapp && coords.whatsapp && whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-center justify-between p-4 rounded-xl border border-border/50",
                    "bg-slate-50/50 hover:bg-slate-100/50 dark:bg-zinc-900/30 dark:hover:bg-zinc-900/60",
                    "transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 shadow-sm"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-semibold text-muted-foreground">WhatsApp Chat</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{coords.whatsapp}</span>
                    </div>
                  </div>
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">Chat Now &rarr;</span>
                </a>
              )}

              {coords.showEmail && coords.email && (
                <a
                  href={`mailto:${coords.email}?subject=Store%20Support%20Request`}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-xl border border-border/50",
                    "bg-slate-50/50 hover:bg-slate-100/50 dark:bg-zinc-900/30 dark:hover:bg-zinc-900/60",
                    "transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 shadow-sm"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 dark:bg-purple-500/20 flex items-center justify-center">
                      <Mail className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-semibold text-muted-foreground">Email Admin</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{coords.email}</span>
                    </div>
                  </div>
                  <span className="text-xs text-purple-600 dark:text-purple-400 font-bold">Email Now &rarr;</span>
                </a>
              )}
            </div>

            {/* Custom details / Address notice board */}
            {coords.showCustom && coords.custom && (
              <div className="p-4 rounded-xl border border-dashed border-primary/20 bg-primary/5 flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="text-xs text-left">
                  <div className="font-bold text-primary mb-0.5">{isAdminSupport ? 'Store Location' : 'Important Information'}</div>
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{coords.custom}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
