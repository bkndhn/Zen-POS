// Voice-command parser for the POS billing screen.
// Takes a raw transcript + a compact item catalog and returns a structured
// intent. Uses Lovable AI Gateway (Gemini) with graceful fallback.
//
// IMPORTANT: keep the request/response shape stable — the client parser
// (VoiceBillingButton.tsx) has a local rule-based fallback that speaks the
// same shape.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface CatalogItem { id: string; name: string; unit?: string | null }

interface ParseRequest {
  transcript: string;
  lang?: string;
  items: CatalogItem[]; // caller MUST cap this list — we only send ≤ 400 names
}

interface ParseResponse {
  intent:
    | 'add_item'
    | 'set_payment'
    | 'set_order_type'
    | 'set_customer'
    | 'set_discount'
    | 'open_pay'
    | 'complete_payment'
    | 'clear_cart'
    | 'unknown';
  itemId?: string;
  itemName?: string;
  qty?: number;
  unit?: string;
  paymentMethod?: 'cash' | 'card' | 'upi';
  amount?: number;
  orderType?: 'dine_in' | 'parcel';
  mobile?: string;
  discount?: number;
  candidates?: { id: string; name: string }[];
  raw?: string;
}

const SYSTEM = `You are a POS voice command parser for an Indian restaurant/shop.
The user speaks in English, Tamil, Hindi or a mix. Numbers may be words or digits (English/Tamil).
Return ONLY a compact JSON object matching this TypeScript type — no prose, no markdown fence:
{
 "intent": "add_item"|"set_payment"|"set_order_type"|"set_customer"|"set_discount"|"open_pay"|"complete_payment"|"clear_cart"|"unknown",
 "itemId"?: string,       // MUST be an id from the provided catalog if intent=add_item
 "itemName"?: string,
 "qty"?: number,          // default 1
 "unit"?: "ml"|"l"|"g"|"kg"|"pc",
 "paymentMethod"?: "cash"|"card"|"upi",
 "amount"?: number,       // rupees, no symbols
 "orderType"?: "dine_in"|"parcel",
 "mobile"?: string,       // 10-digit Indian number only if clearly spoken
 "discount"?: number,     // rupees or percent — pass the raw number
 "candidates"?: [{ "id": string, "name": string }]  // if ambiguous, list up to 5 catalog matches
}
Rules:
- Match the item fuzzily against the catalog. If exactly one strong match, set itemId + itemName.
- If several plausible matches (>1), leave itemId empty and fill candidates.
- Recognise phrases: "pay"/"payment" → open_pay. "complete payment"/"finish" → complete_payment.
  "dine in"/"parcel"/"takeaway" → set_order_type. "clear cart"/"reset" → clear_cart.
  "upi 500" → set_payment upi + amount 500. "cash 200" → cash. "discount 50" → set_discount.
  "mobile 9xxxxxxxxx" → set_customer.
- If unsure, intent="unknown".`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: ParseRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const transcript = (body.transcript || '').toString().slice(0, 500).trim();
  if (!transcript) {
    return new Response(JSON.stringify({ intent: 'unknown' } as ParseResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const catalog = Array.isArray(body.items) ? body.items.slice(0, 400) : [];
  const lang = body.lang || 'en-IN';

  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    // No key — client will fall back to local parser.
    return new Response(JSON.stringify({ intent: 'unknown', raw: transcript, error: 'ai_unavailable' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userMsg = `Language: ${lang}
Transcript: "${transcript}"
Catalog (id — name — unit):
${catalog.map(i => `${i.id} — ${i.name}${i.unit ? ` — ${i.unit}` : ''}`).join('\n')}`;

  try {
    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userMsg },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (aiRes.status === 429 || aiRes.status === 402) {
      const errText = await aiRes.text().catch(() => '');
      return new Response(JSON.stringify({
        intent: 'unknown',
        raw: transcript,
        error: aiRes.status === 429 ? 'rate_limited' : 'credits_exhausted',
        detail: errText.slice(0, 200),
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '');
      console.error('[voice-parse] AI gateway error', aiRes.status, errText);
      return new Response(JSON.stringify({ intent: 'unknown', raw: transcript, error: 'ai_error' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const json = await aiRes.json();
    const content = json?.choices?.[0]?.message?.content ?? '{}';
    let parsed: ParseResponse;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { intent: 'unknown', raw: content };
    }
    parsed.raw = transcript;
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[voice-parse] fatal', err);
    return new Response(JSON.stringify({ intent: 'unknown', raw: transcript, error: 'exception' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
