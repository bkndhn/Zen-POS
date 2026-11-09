import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const sections: [string, string][] = [
  ['What we collect', 'Account details (name, email, phone) of shop owners and staff; the business data you enter (menu, bills, stock, expenses, customers); and basic device information needed for printing, offline sync and notifications.'],
  ['How we use it', 'Only to run the service for your shop: billing, reports, backups, notifications and support. We do not sell your data or show ads.'],
  ['Who can see it', "Each shop's data is isolated. Only that shop's owner and the staff they permit can see it. Platform administrators manage accounts and subscriptions but cannot view your sales, bills, customers or stock."],
  ['Customers of your shop', 'If customers order from your online menu, their name, phone and order are shared only with your shop to fulfil the order.'],
  ['Cookies & local storage', 'We use essential browser storage to keep you signed in and to bill offline. Optional analytics run only if you accept them in the cookie banner.'],
  ['Retention & deletion', 'You can export your data at any time. Ask us to delete your account and we remove your data, except records the law requires us to keep.'],
  ['Security', 'Data is encrypted in transit, protected by row-level access rules, and sign-in is rate limited.'],
  ['Contact', 'For privacy questions, use the contact details on our home page.'],
];

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-background p-4 sm:p-8">
      <article className="max-w-3xl mx-auto space-y-6">
        <Button asChild variant="ghost" className="gap-2"><Link to="/landing"><ArrowLeft className="h-4 w-4" />Back</Link></Button>
        <header>
          <h1 className="text-3xl font-extrabold text-foreground">Privacy policy</h1>
          <p className="text-sm text-muted-foreground mt-1">How ZenPOS handles your data.</p>
        </header>
        {sections.map(([h, p]) => (
          <section key={h} className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{h}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{p}</p>
          </section>
        ))}
      </article>
    </main>
  );
}
