import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, TrendingUp, AlertTriangle, CheckCircle2, Info, Package, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface Highlight { title: string; detail: string; type: 'good' | 'warning' | 'info' }
interface Improvement { action: string; why: string; impact: 'high' | 'medium' | 'low' }
interface Overview {
  highlights?: Highlight[];
  improvements?: Improvement[];
  peak_day?: string; slow_day?: string;
  revenue_health?: string; one_line_verdict?: string;
}
interface StockRec { item: string; day: string; keep_stock: number; unit: string; reason: string }
interface Forecast { recommendations?: StockRec[]; warnings?: string[]; summary_line?: string }

interface Response {
  ok: boolean;
  ai: Overview | Forecast;
  summary: any;
  quota: { period: string; quota: number; used: number; remaining: number };
}

const AiInsights: React.FC = () => {
  const { session } = useAuth();
  const { operatingBranchId } = useBranch();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [quota, setQuota] = useState<Response['quota'] | null>(null);
  const [loading, setLoading] = useState<null | 'overview' | 'stock_forecast'>(null);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);

  const run = async (kind: 'overview' | 'stock_forecast') => {
    if (!session) return;
    setLoading(kind); setError(null);
    try {
      const { data, error } = await supabase.functions.invoke<Response>('ai-insights', {
        body: { kind, branch_id: operatingBranchId ?? null },
      });
      if (error) {
        const msg = (error as any)?.context?.body ? await (error as any).context.text() : error.message;
        try {
          const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg;
          if (parsed?.error === 'ai_disabled') setDisabled(true);
          setError(parsed?.message || parsed?.error || error.message);
        } catch { setError(error.message); }
        return;
      }
      if (!data) { setError('No data'); return; }
      if (kind === 'overview') setOverview(data.ai as Overview);
      else setForecast(data.ai as Forecast);
      setQuota(data.quota);
      toast.success('AI insights refreshed');
    } catch (e: any) {
      setError(e.message || 'Failed to load insights');
    } finally { setLoading(null); }
  };

  useEffect(() => {
    if (session) run('overview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, operatingBranchId]);

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4 animate-fadeInUp">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" /> AI Business Insights
          </h1>
          <p className="text-sm text-muted-foreground">Powered by Gemini · analysing your last 30 days</p>
        </div>
        {quota && (
          <Badge variant="outline" className="text-xs">
            {quota.used}/{quota.quota} used · {quota.period}
          </Badge>
        )}
      </div>

      {disabled && (
        <Card className="border-red-500 border-2 bg-red-50 dark:bg-red-950/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Lock className="w-5 h-5 text-red-600" />
            <div className="text-sm">
              <strong>AI Insights is disabled for your account.</strong>
              <p>This is a paid add-on. Contact Super Admin to enable.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {error && !disabled && (
        <Card className="border-amber-500 border bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="p-3 text-sm text-amber-900 dark:text-amber-200">{error}</CardContent>
        </Card>
      )}

      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => run('overview')} disabled={loading !== null || disabled}>
          {loading === 'overview' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TrendingUp className="w-4 h-4 mr-2" />}
          Business Overview
        </Button>
        <Button onClick={() => run('stock_forecast')} disabled={loading !== null || disabled} variant="secondary">
          {loading === 'stock_forecast' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Package className="w-4 h-4 mr-2" />}
          Stock Forecast
        </Button>
      </div>

      {overview && (
        <>
          {overview.one_line_verdict && (
            <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30">
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Verdict</div>
                <div className="text-lg font-semibold">{overview.one_line_verdict}</div>
                <div className="text-xs mt-1 flex gap-3 text-muted-foreground">
                  {overview.peak_day && <span>Peak: <strong>{overview.peak_day}</strong></span>}
                  {overview.slow_day && <span>Slow: <strong>{overview.slow_day}</strong></span>}
                  {overview.revenue_health && <span>Health: <strong className="capitalize">{overview.revenue_health}</strong></span>}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Highlights</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {overview.highlights?.map((h, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/40">
                    {h.type === 'good' ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" /> :
                     h.type === 'warning' ? <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" /> :
                     <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />}
                    <div>
                      <div className="font-medium">{h.title}</div>
                      <div className="text-xs text-muted-foreground">{h.detail}</div>
                    </div>
                  </div>
                ))}
                {!overview.highlights?.length && <div className="text-xs text-muted-foreground">No highlights.</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Improvements</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {overview.improvements?.map((im, i) => (
                  <div key={i} className="p-2 rounded-md bg-muted/40">
                    <div className="flex items-center gap-2">
                      <Badge variant={im.impact === 'high' ? 'default' : im.impact === 'medium' ? 'secondary' : 'outline'} className="text-[10px]">
                        {im.impact}
                      </Badge>
                      <div className="font-medium">{im.action}</div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{im.why}</div>
                  </div>
                ))}
                {!overview.improvements?.length && <div className="text-xs text-muted-foreground">No suggestions.</div>}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {forecast && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4" /> Stock Forecast</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {forecast.summary_line && <div className="text-sm font-medium">{forecast.summary_line}</div>}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="py-1 pr-2">Item</th><th className="pr-2">Day</th><th className="pr-2">Keep</th><th>Reason</th></tr>
                </thead>
                <tbody>
                  {forecast.recommendations?.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1 pr-2 font-medium">{r.item}</td>
                      <td className="pr-2">{r.day}</td>
                      <td className="pr-2 whitespace-nowrap">{r.keep_stock} {r.unit}</td>
                      <td className="text-muted-foreground">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!!forecast.warnings?.length && (
              <div className="mt-3 space-y-1">
                {forecast.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5" /><span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AiInsights;
