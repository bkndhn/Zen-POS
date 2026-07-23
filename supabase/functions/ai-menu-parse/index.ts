// AI Menu Parse — parses menu images/photos into structured item rows using
// Gemini vision via Lovable AI Gateway. Enforces per-admin AI usage limits.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_KEY = Deno.env.get('LOVABLE_API_KEY');

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

interface Body {
  images?: string[];   // data URLs or https URLs
  text?: string;       // optional raw pasted menu text
  hint_category?: string;
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

  const { data: prof } = await svc.from('profiles').select('id, role, admin_id').eq('user_id', userId).maybeSingle();
  if (!prof) return json({ error: 'no_profile' }, 403);
  const adminId = prof.role === 'admin' ? prof.id : prof.admin_id;
  if (!adminId) return json({ error: 'no_admin' }, 403);

  let body: Body = {};
  try { body = await req.json(); } catch {}
  const imgs = (body.images || []).slice(0, 6);
  const text = (body.text || '').slice(0, 20000);
  if (!imgs.length && !text.trim()) return json({ error: 'no_input', message: 'Provide at least one image or text' }, 400);

  // Quota check (shares ai_usage_limits table with AI Insights)
  let { data: limit } = await svc.from('ai_usage_limits').select('*').eq('admin_id', adminId).maybeSingle();
  if (!limit) {
    const ins = await svc.from('ai_usage_limits').insert({ admin_id: adminId }).select('*').single();
    limit = ins.data;
  }
  if (!limit) return json({ error: 'limit_init_failed' }, 500);
  if (!limit.enabled) return json({ error: 'ai_disabled', message: 'AI features are disabled. Contact Super Admin.' }, 403);
  if ((limit.used_count ?? 0) >= (limit.quota ?? 0)) {
    return json({ error: 'quota_exceeded', message: `AI quota reached (${limit.quota}/${limit.period}). Contact Super Admin.` }, 429);
  }
  if (limit.lifetime_quota != null && (limit.lifetime_used ?? 0) >= limit.lifetime_quota) {
    return json({ error: 'lifetime_exceeded', message: 'Lifetime AI quota reached.' }, 429);
  }

  if (!LOVABLE_KEY) return json({ error: 'ai_not_configured' }, 500);

  const systemPrompt = `You are an expert restaurant menu parser. Read the provided menu photo(s) or text and extract EVERY item you can see, no matter how many.
Return ONLY a compact JSON object matching this exact shape:
{
  "items": [
    {
      "name": string,                      // clean, title-cased dish/product name
      "price": number,                     // INR, numeric only. 0 if unclear
      "category": string,                  // e.g. "Starters", "Main Course", "Beverages", "Desserts"
      "description": string | null,        // short desc if visible on menu, else null
      "selling_unit": "Piece (pc)" | "Plate" | "Cup" | "Glass" | "Pack" | "Box" | "Kilogram (kg)" | "Gram (g)" | "Liter (l)" | "Milliliter (ml)",
      "selling_quantity": number,          // usually 1
      "is_veg": boolean | null             // infer from name/context if possible
    }
  ]
}
Rules:
- Extract ALL visible items. Never truncate.
- Prices must be numeric only, no currency symbols.
- If a section header exists, use it as category for items under it.
- Default selling_unit "Piece (pc)" and selling_quantity 1 unless clearly liquid (ml/L for drinks, glass for lassi, cup for tea/coffee).
- No markdown, no commentary, no code fences. Only the JSON object.`;

  const userContent: any[] = [];
  if (text.trim()) userContent.push({ type: 'text', text: `Menu text:\n${text}` });
  for (const url of imgs) {
    userContent.push({ type: 'image_url', image_url: { url } });
  }
  if (!userContent.length) userContent.push({ type: 'text', text: 'Extract items.' });

  let parsedItems: any[] = [];
  let modelErr: string | null = null;
  try {
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LOVABLE_KEY}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });
    if (r.status === 429) return json({ error: 'ai_rate_limited', message: 'AI busy. Try again shortly.' }, 429);
    if (r.status === 402) return json({ error: 'ai_credits', message: 'AI credits exhausted.' }, 402);
    if (!r.ok) {
      modelErr = `AI error ${r.status}`;
    } else {
      const j = await r.json();
      const content = j?.choices?.[0]?.message?.content ?? '{}';
      try {
        const parsed = JSON.parse(content);
        parsedItems = Array.isArray(parsed?.items) ? parsed.items : [];
      } catch {
        modelErr = 'Invalid AI response';
      }
    }
  } catch (e) {
    modelErr = 'AI request failed';
    console.error('[ai-menu-parse]', e);
  }

  if (modelErr) return json({ error: 'ai_failed', message: modelErr }, 500);

  // Normalise + validate
  const ALLOWED_UNITS = new Set(['Piece (pc)', 'Plate', 'Cup', 'Glass', 'Pack', 'Box', 'Kilogram (kg)', 'Gram (g)', 'Liter (l)', 'Milliliter (ml)']);
  const cleaned = parsedItems.map((it) => {
    const nm = String(it?.name || '').trim().slice(0, 100);
    const price = Number(it?.price);
    const unit = ALLOWED_UNITS.has(it?.selling_unit) ? it.selling_unit : 'Piece (pc)';
    const qty = Number(it?.selling_quantity) > 0 ? Number(it.selling_quantity) : 1;
    return {
      name: nm,
      price: isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : 0,
      category: String(it?.category || body.hint_category || 'General').trim().slice(0, 50) || 'General',
      description: it?.description ? String(it.description).slice(0, 300) : null,
      selling_unit: unit,
      selling_quantity: qty,
      is_veg: typeof it?.is_veg === 'boolean' ? it.is_veg : null,
    };
  }).filter((i) => i.name.length >= 2);

  // Increment usage
  await svc.from('ai_usage_limits').update({
    used_count: (limit.used_count ?? 0) + 1,
    lifetime_used: (limit.lifetime_used ?? 0) + 1,
    last_used_at: new Date().toISOString(),
  }).eq('admin_id', adminId);

  return json({ items: cleaned, count: cleaned.length });
});
