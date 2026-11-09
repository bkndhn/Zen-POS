import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';

export default function ThankYou() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center max-w-md space-y-4">
        <CheckCircle2 className="mx-auto h-16 w-16 text-success" aria-hidden="true" />
        <h1 className="text-3xl font-extrabold text-foreground">Thank you!</h1>
        <p className="text-muted-foreground">We got your request and will call or WhatsApp you within one working day.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild><Link to="/demo">Try the demo meanwhile</Link></Button>
          <Button asChild variant="outline"><Link to="/landing">Back to home</Link></Button>
        </div>
      </div>
    </main>
  );
}
