/**
 * Image Diagnostics
 * -----------------
 * Verifies that item images are reachable end-to-end in production.
 * For each item with an image_url we:
 *   1. Compute the primary URL (via getCDNUrl) and raw Supabase URL
 *   2. Attempt an <img> load of each; capture success/failure
 *   3. Report the final URL, HTTP-reachable status, and bucket public access
 *
 * Use this after deploying to Vercel to confirm images load without hitting
 * the weserv proxy or being blocked by bucket ACLs.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getCDNUrl, getFallbackImageUrl } from '@/utils/imageUtils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';

interface Row {
  id: string;
  name: string;
  raw: string;
  cdn: string;
  cdnOk?: boolean;
  rawOk?: boolean;
}

const probe = (url: string): Promise<boolean> =>
  new Promise((resolve) => {
    if (!url) return resolve(false);
    const img = new Image();
    const timer = setTimeout(() => resolve(false), 8000);
    img.onload = () => { clearTimeout(timer); resolve(true); };
    img.onerror = () => { clearTimeout(timer); resolve(false); };
    img.src = url + (url.includes('?') ? '&' : '?') + '_probe=' + Date.now();
  });

const ImageDiagnostics = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [bucketOk, setBucketOk] = useState<boolean | null>(null);

  const run = async () => {
    setLoading(true);
    setBucketOk(null);
    const { data, error } = await supabase
      .from('items')
      .select('id, name, image_url')
      .not('image_url', 'is', null)
      .limit(25);
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    const items = (data ?? []).filter((i) => !!i.image_url);
    const initial: Row[] = items.map((i) => ({
      id: i.id,
      name: i.name,
      raw: getFallbackImageUrl(i.image_url!),
      cdn: getCDNUrl(i.image_url!),
    }));
    setRows(initial);

    // Probe in parallel
    const probed = await Promise.all(
      initial.map(async (r) => ({
        ...r,
        cdnOk: await probe(r.cdn),
        rawOk: await probe(r.raw),
      })),
    );
    setRows(probed);
    setBucketOk(probed.some((r) => r.rawOk));
    setLoading(false);
  };

  useEffect(() => { run(); }, []);

  const cdnHits = rows.filter((r) => r.cdnOk).length;
  const rawHits = rows.filter((r) => r.rawOk).length;

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Image Diagnostics</h1>
          <p className="text-sm text-muted-foreground">
            Confirms product images are reachable in this deployment.
          </p>
        </div>
        <Button onClick={run} disabled={loading} size="lg" className="min-h-[44px]">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Re-run
        </Button>
      </div>

      <Card className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Metric label="Items checked" value={rows.length} />
        <Metric label="Primary URL OK" value={`${cdnHits}/${rows.length}`} good={cdnHits === rows.length && rows.length > 0} />
        <Metric label="Raw Supabase OK" value={`${rawHits}/${rows.length}`} good={rawHits === rows.length && rows.length > 0} />
      </Card>

      {bucketOk === false && (
        <Card className="p-4 border-red-500 border-2 bg-red-50 dark:bg-red-950/30 text-sm">
          <strong className="text-red-700 dark:text-red-300">Bucket public access looks broken.</strong>
          <p className="mt-1">
            No raw Supabase URL loaded. Make sure the <code>item-images</code> bucket is set
            to public in Supabase (Storage → Buckets → item-images → Settings → Public).
          </p>
        </Card>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <Card key={r.id} className="p-3 flex flex-col sm:flex-row gap-3 items-start">
            <img
              src={r.raw}
              alt={r.name}
              className="w-24 h-24 object-cover rounded border"
              loading="lazy"
            />
            <div className="flex-1 min-w-0 text-xs space-y-1">
              <div className="font-semibold text-sm">{r.name}</div>
              <UrlLine label="Primary (CDN)" url={r.cdn} ok={r.cdnOk} />
              <UrlLine label="Fallback (Supabase)" url={r.raw} ok={r.rawOk} />
            </div>
          </Card>
        ))}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No items with images found.</p>
        )}
      </div>
    </div>
  );
};

const Metric = ({ label, value, good }: { label: string; value: React.ReactNode; good?: boolean }) => (
  <div>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`text-xl font-bold ${good === true ? 'text-green-600' : good === false ? 'text-red-600' : ''}`}>
      {value}
    </div>
  </div>
);

const UrlLine = ({ label, url, ok }: { label: string; url: string; ok?: boolean }) => (
  <div className="flex items-start gap-2">
    {ok === undefined ? (
      <Loader2 className="w-4 h-4 mt-0.5 animate-spin text-muted-foreground flex-shrink-0" />
    ) : ok ? (
      <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600 flex-shrink-0" />
    ) : (
      <XCircle className="w-4 h-4 mt-0.5 text-red-600 flex-shrink-0" />
    )}
    <div className="min-w-0 flex-1">
      <Badge variant="outline" className="mr-2">{label}</Badge>
      <span className="break-all font-mono text-[10px]">{url}</span>
    </div>
  </div>
);

export default ImageDiagnostics;
