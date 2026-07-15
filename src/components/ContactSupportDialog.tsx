import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Phone, Mail, MessageSquare, ShieldAlert, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContactSupportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ContactSupportDialog: React.FC<ContactSupportDialogProps> = ({ open, onOpenChange }) => {
  const [loading, setLoading] = useState(false);
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
          const { data, error } = await supabase
            .from('app_settings')
            .select('*')
            .eq('id', true)
            .maybeSingle();

          if (error) throw error;
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
        } catch (err) {
          console.error('[Support] Failed to fetch support coordinates:', err);
        } finally {
          setLoading(false);
        }
      };

      fetchSupportCoords();
    }
  }, [open]);

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
            <ShieldAlert className="w-5 h-5 text-primary" />
            Contact Support
          </DialogTitle>
          <DialogDescription className="text-xs">
            Reach out to our Super Admin team for billing, outages, or help.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-2">
            <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <span className="text-xs text-muted-foreground font-medium">Fetching support coordinates...</span>
          </div>
        ) : !coords || !hasAnyContact ? (
          <div className="text-center py-8 space-y-2">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground/30" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Support channels are currently offline</p>
            <p className="text-xs text-muted-foreground">Please check back later or contact your account representative.</p>
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
                      <span className="text-xs font-semibold text-muted-foreground">Call Support</span>
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
                  href={`mailto:${coords.email}?subject=ZenPOS%20Support%20Request`}
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
                      <span className="text-xs font-semibold text-muted-foreground">Email Support</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{coords.email}</span>
                    </div>
                  </div>
                  <span className="text-xs text-purple-600 dark:text-purple-400 font-bold">Email Now &rarr;</span>
                </a>
              )}
            </div>

            {/* Custom details notice board */}
            {coords.showCustom && coords.custom && (
              <div className="p-4 rounded-xl border border-dashed border-primary/20 bg-primary/5 flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="text-xs text-left">
                  <div className="font-bold text-primary mb-0.5">Important Information</div>
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
