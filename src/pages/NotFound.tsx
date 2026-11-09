import { Link, useLocation } from "react-router-dom";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  usePageMeta("Page not found — ZenPOS", "This page doesn't exist. Go back to ZenPOS billing or the home page.");

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center max-w-md space-y-4">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Compass className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="text-5xl font-extrabold text-foreground">404</h1>
        <p className="text-lg text-muted-foreground">
          We couldn't find <span className="font-mono text-foreground break-all">{location.pathname}</span>.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild><Link to="/">Open billing</Link></Button>
          <Button asChild variant="outline"><Link to="/landing">Home page</Link></Button>
        </div>
      </div>
    </main>
  );
};

export default NotFound;
