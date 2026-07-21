// AI Business Insights — enforces per-admin usage limits then calls Gemini
// via Lovable AI Gateway. Aggregates 30d bill data server-side so the model
// only sees compact summaries (fast + cheap + isolated per admin/branch).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_KEY = Deno.env.get('LOVABLE_API_KEY');

interface Body {
  kind?: 'overview' | 'stock_forecast';
  branch_id?: string | null;
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function periodMs(period: string) {
  switch (period) {
    case 'daily': return 24 * 3600 * 1000;
    case 'weekly': return 7 * 24 * 3600 * 1000;
    case 'monthly': return 30 * 24 * 3600 * 1000;
    default: return null; // lifetime
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const svc = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: claims, error: claimErr } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
  if (claimErr || !claims?.claims?.sub) return json({ error: 'unauthorized' }, 401);
  const userId = claims.claims.sub as string;

  // Resolve admin_id (own if admin, else parent)
  const { data: prof } = await svc.from('profiles').select('id, role, admin_id').eq('user_id', userId).maybeSingle();
  if (!prof) return json({ error: 'no_profile' }, 403);
  const adminId = prof.role === 'admin' ? prof.id : prof.admin_id;
  if (!adminId) return json({ error: 'no_admin' }, 403);

  // Body
  let body: Body = {};
  try { body = await req.json(); } catch {}
  const kind = body.kind === 'stock_forecast' ? 'stock_forecast' : 'overview';

  // === Quota check ===
  let { data: limit } = await svc.from('ai_usage_limits').select('*').eq('admin_id', adminId).maybeSingle();
  if (!limit) {
    const ins = await svc.from('ai_usage_limits').insert({ admin_id: adminId }).select('*').single();
    limit = ins.data;
  }
  if (!limit) return json({ error: 'limit_init_failed' }, 500);

  if (!limit.enabled) {
    return json({ error: 'ai_disabled', message: 'AI Insights is disabled. Contact Super Admin.' }, 403);
  }

  // Roll period if expired
  const ms = periodMs(limit.period);
  let used = limit.used_count ?? 0;
  const periodStart = new Date(limit.period_started_at).getTime();
  if (ms !== null && Date.now() - periodStart >= ms) {
    used = 0;
    await svc.from('ai_usage_limits').update({ used_count: 0, period_started_at: new Date().toISOString() }).eq('admin_id', adminId);
  }

  if (used >= (limit.quota ?? 0)) {
    return json({ error: 'quota_exceeded', message: `Quota reached (${limit.quota} per ${limit.period}). Contact Super Admin to reset.` }, 429);
  }
  if (limit.lifetime_quota != null && (limit.lifetime_used ?? 0) >= limit.lifetime_quota) {
    return json({ error: 'lifetime_exceeded', message: 'Lifetime AI quota reached. Contact Super Admin.' }, 429);
  }

  // === Aggregate business data ===
  const periodDays = Math.min(Math.max(Number(body.days) || 30, 1), 90);
  const since = new Date(Date.now() - periodDays * 24 * 3600 * 1000).toISOString();
  let billsQuery = svc.from('bills')
    .select('id, date, total_amount, discount, order_type, created_at, branch_id, bill_items(quantity, price, total, items(name, category, unit))')
    .eq('admin_id', adminId)
    .gte('created_at', since)
    .eq('is_deleted', false)
    .limit(2000);
  if (body.branch_id) billsQuery = billsQuery.eq('branch_id', body.branch_id);
  const { data: bills } = await billsQuery;

  // Aggregate metrics
  const dow = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat totals
  const dowOrders = [0, 0, 0, 0, 0, 0, 0];
  const itemStats: Record<string, { name: string; unit?: string; qty: number; revenue: number; byDow: number[] }> = {};
  let totalRevenue = 0;
  let totalDiscount = 0;
  let orderCount = 0;
  const orderTypeCount: Record<string, number> = {};

  for (const b of bills ?? []) {
    const d = new Date(b.created_at as string);
    const dayIdx = d.getDay();
    totalRevenue += Number(b.total_amount ?? 0);
    totalDiscount += Number(b.discount ?? 0);
    orderCount += 1;
    dow[dayIdx] += Number(b.total_amount ?? 0);
    dowOrders[dayIdx] += 1;
    const ot = (b.order_type as string) || 'dine_in';
    orderTypeCount[ot] = (orderTypeCount[ot] || 0) + 1;
    const items = (b as any).bill_items || [];
    for (const bi of items) {
      const it = bi.items;
      if (!it) continue;
      const key = it.name;
      const rec = itemStats[key] || { name: it.name, unit: it.unit, qty: 0, revenue: 0, byDow: [0, 0, 0, 0, 0, 0, 0] };
      rec.qty += Number(bi.quantity ?? 0);
      rec.revenue += Number(bi.total ?? 0);
      rec.byDow[dayIdx] += Number(bi.quantity ?? 0);
      itemStats[key] = rec;
    }
  }

  const topItems = Object.values(itemStats).sort((a, b) => b.qty - a.qty).slice(0, 15);
  const avgTicket = orderCount ? totalRevenue / orderCount : 0;

  // Get current stock for top items
  const topNames = topItems.map(i => i.name);
  let stockMap: Record<string, { stock: number; unit: string; unlimited: boolean }> = {};
  if (topNames.length) {
    let stockQ = svc.from('items').select('name, stock_quantity, unit, unlimited_stock').eq('admin_id', adminId).in('name', topNames);
    if (body.branch_id) stockQ = stockQ.eq('branch_id', body.branch_id);
    const { data: stockRows } = await stockQ;
    for (const s of stockRows ?? []) {
      stockMap[s.name as string] = { stock: Number(s.stock_quantity ?? 0), unit: s.unit as string, unlimited: !!s.unlimited_stock };
    }
  }

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const summary = {
    period_days: periodDays,
    total_orders: orderCount,
    total_revenue_inr: Math.round(totalRevenue),
    total_discount_inr: Math.round(totalDiscount),
    avg_ticket_inr: Math.round(avgTicket),
    revenue_by_day_of_week: daysOfWeek.reduce((acc, d, i) => ({ ...acc, [d]: Math.round(dow[i]) }), {}),
    orders_by_day_of_week: daysOfWeek.reduce((acc, d, i) => ({ ...acc, [d]: dowOrders[i] }), {}),
    order_type_split: orderTypeCount,
    top_items: topItems.map(i => ({
      name: i.name,
      unit: i.unit,
      [`qty_sold_${periodDays}d`]: Math.round(i.qty * 100) / 100,
      [`revenue_${periodDays}d`]: Math.round(i.revenue),
      by_day_of_week: daysOfWeek.reduce((acc, d, idx) => ({ ...acc, [d]: Math.round(i.byDow[idx] * 100) / 100 }), {}),
      current_stock: stockMap[i.name]?.unlimited ? 'unlimited' : (stockMap[i.name]?.stock ?? 'unknown'),
      stock_unit: stockMap[i.name]?.unit ?? i.unit,
    })),
  };

  // === Call Gemini via Lovable AI Gateway ===
  if (!LOVABLE_KEY) return json({ error: 'ai_not_configured' }, 500);

  const prompt = kind === 'stock_forecast'
    ? `You are a restaurant/retail inventory advisor for an Indian business. Based on this ${periodDays}-day sales summary, output ONLY valid JSON with:
{
  "recommendations": [
    { "item": string, "day": "Mon"|"Tue"|..., "keep_stock": number, "unit": string, "reason": string }
  ],
  "warnings": [string],
  "summary_line": string
}
Rules: recommend keep_stock per top day per top item; cite the day-of-week pattern in reason briefly; give practical INR-friendly advice. Max 15 recommendations, max 5 warnings.
DATA:
${JSON.stringify(summary)}`
    : `You are a business intelligence advisor for an Indian POS user. Analyse this ${periodDays}-day summary and reply as ONLY valid JSON:
{
  "highlights": [ { "title": string, "detail": string, "type": "good"|"warning"|"info" } ],
  "improvements": [ { "action": string, "why": string, "impact": "high"|"medium"|"low" } ],
  "peak_day": string,
  "slow_day": string,
  "revenue_health": "strong"|"steady"|"weak",
  "one_line_verdict": string
}
Rules: 5–7 highlights, 4–6 improvements. Be specific with numbers (₹, qty, day names). No fluff.
DATA:
${JSON.stringify(summary)}`;

  let aiOutput: any = null;
  let aiError: string | null = null;
  try {
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LOVABLE_KEY}` },
      body: JSON.stringify({
        model: 'google/gemini-3.5-flash',
        messages: [
          { role: 'system', content: 'You output only valid compact JSON. No markdown, no code fences.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
    });
    if (r.status === 429) aiError = 'AI rate limited. Try again in a minute.';
    else if (r.status === 402) aiError = 'AI credits exhausted for this workspace.';
    else if (!r.ok) aiError = `AI error ${r.status}`;
    else {
      const j = await r.json();
      const content = j?.choices?.[0]?.message?.content ?? '{}';
      try { aiOutput = JSON.parse(content); } catch { aiOutput = { raw: content }; }
    }
  } catch (e) {
    aiError = 'AI request failed';
    console.error('[ai-insights]', e);
  }

  if (aiError && !aiOutput) return json({ error: 'ai_error', message: aiError, summary }, 502);

  // === Increment usage + log ===
  await svc.from('ai_usage_limits').update({
    used_count: used + 1,
    lifetime_used: (limit.lifetime_used ?? 0) + 1,
    last_used_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('admin_id', adminId);

  await svc.from('ai_insights_log').insert({
    admin_id: adminId,
    user_id: userId,
    branch_id: body.branch_id ?? null,
    kind,
  });

  return json({
    ok: true,
    kind,
    ai: aiOutput,
    summary,
    quota: { period: limit.period, quota: limit.quota, used: used + 1, remaining: (limit.quota ?? 0) - used - 1 },
  });
});
