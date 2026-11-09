import { useLocation } from 'react-router-dom';
import { usePageMeta } from '@/hooks/usePageMeta';

const META: Record<string, [string, string]> = {
  '/': ['Billing — ZenPOS', 'Fast restaurant billing with KOT printing and offline support.'],
  '/billing': ['Billing — ZenPOS', 'Fast restaurant billing with KOT printing and offline support.'],
  '/auth': ['Sign in — ZenPOS', 'Sign in to your ZenPOS restaurant account.'],
  '/landing': ['ZenPOS — Restaurant billing & POS for India', 'GST billing, kitchen display, QR menu, khata and offline mode for restaurants.'],
  '/demo': ['Try the demo — ZenPOS', 'Try ZenPOS billing in your browser, no sign-up needed.'],
  '/dashboard': ['Dashboard — ZenPOS', "Today's sales at a glance."],
  '/reports': ['Reports — ZenPOS', 'Sales, GST, payments, shifts and cash register.'],
  '/items': ['Menu items — ZenPOS', 'Manage your menu, prices and photos.'],
  '/kitchen': ['Kitchen display — ZenPOS', 'Live kitchen orders by colour stage.'],
  '/khata': ['Khata — ZenPOS', 'Customer credit ledger and dues.'],
  '/waiter': ['Waiter — ZenPOS', 'Take table orders and print KOTs.'],
  '/settings': ['Settings — ZenPOS', 'Shop, printer and billing settings.'],
  '/privacy': ['Privacy policy — ZenPOS', 'How ZenPOS collects, uses and protects your data.'],
  '/terms': ['Terms & conditions — ZenPOS', 'Terms of service for using ZenPOS.'],
  '/thank-you': ['Thank you — ZenPOS', 'We received your request and will contact you soon.'],
};

/** Gives every route a title + description; pages with their own meta override this. */
export function RouteMeta() {
  const { pathname } = useLocation();
  const seg = '/' + (pathname.split('/')[1] || '');
  const [title, desc] = META[pathname] || META[seg] || [
    `${seg.slice(1).replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()) || 'ZenPOS'} — ZenPOS`,
    'ZenPOS restaurant billing and operations.',
  ];
  usePageMeta(title, desc);
  return null;
}
