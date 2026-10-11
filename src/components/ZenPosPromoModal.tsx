import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Phone, MessageSquare, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ZenPosPromoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ZenPosPromoModal: React.FC<ZenPosPromoModalProps> = ({ open, onOpenChange }) => {
  const supportPhone = '9894451420';
  const whatsappNumber = '919894451420';
  const whatsappMessage = encodeURIComponent(
    'Hi! I saw this digital menu and would like to get ZenPOS for my restaurant / food business. Please share details and setup pricing.'
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[92vw] rounded-2xl p-6 bg-white dark:bg-slate-900 shadow-2xl">
        <DialogHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Want This Digital Menu for Your Shop?
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500 dark:text-gray-400">
            Power your restaurant, cafe, juice bar, or food truck with ZenPOS — the lightning-fast POS &amp; QR Ordering OS.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 my-4 text-xs">
          {[
            'Instant QR Menu & WhatsApp Digital Invoicing',
            '100% Offline-First POS with Bluetooth Thermal Printing',
            'Live Kitchen Display (KDS) & Digital Token TV Screen',
            'Free 7-Day Pilot — Zero Setup Fee & No Hardware Lock-in',
          ].map((feature, i) => (
            <div key={i} className="flex items-center gap-2.5 text-gray-700 dark:text-gray-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>{feature}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2.5 pt-1">
          <a
            href={`https://wa.me/${whatsappNumber}?text=${whatsappMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-md transition-all active:scale-95"
          >
            <MessageSquare className="w-4 h-4" />
            Chat on WhatsApp for Free Demo
          </a>

          <a
            href={`tel:${supportPhone}`}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-800 dark:text-gray-200 font-medium text-xs transition-all"
          >
            <Phone className="w-4 h-4 text-gray-500" />
            Call Sales &amp; Support: +91 {supportPhone}
          </a>

          <Link
            to="/landing"
            onClick={() => onOpenChange(false)}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-center text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            <span>Explore All Features &amp; Free Pilot</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
};
