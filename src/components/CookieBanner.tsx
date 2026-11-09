import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const KEY = 'zenpos_cookie_consent';
const PUBLIC = ['/landing', '/demo', '/privacy', '/terms', '/thank-you', '/auth'];

export function CookieBanner() {
  const { pathname } = useLocation();
  const [choice, setChoice] = useState(() => { try { return localStorage.getItem(KEY); } catch { return 'na'; } });
  if (choice || !PUBLIC.includes(pathname)) return null;
  const save = (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* ignore */ } setChoice(v); };
  return (
    <div role="dialog" aria-label="Cookie consent" className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl rounded-xl border bg-card p-4 shadow-lg">
      <p className="text-sm text-muted-foreground">
        We use essential storage to keep you signed in and bill offline, and optional analytics to improve ZenPOS.{' '}
        <Link to="/privacy" className="underline text-foreground">Privacy policy</Link>
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => save('essential')}>Essential only</Button>
        <Button size="sm" onClick={() => save('all')}>Accept all</Button>
      </div>
    </div>
  );
}
