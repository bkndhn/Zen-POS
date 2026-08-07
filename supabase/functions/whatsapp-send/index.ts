import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { admin } from '../_shared/pg.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const digits = (s: string) => String(s || '').replace(/\D/g, '');

/**
 * Sends a WhatsApp message for an order / payment link.
 * mode = 'link'  -> returns a wa.me URL for the caller to open (no API cost)
 * mode = 'cloud' -> sends it through the client's own WhatsApp Cloud API credentials
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error } = await anon.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (error || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const to = digits(body.to);
    const message = String(body.message || '').slice(0, 4000);
    if (to.length < 10) return json({ error: 'Valid phone number required' }, 400);
    if (!message) return json({ error: 'Message is required' }, 400);
    const target = to.length === 10 ? `91${to}` : to;

    const sb = admin();
    const { data: profile } = await sb
      .from('profiles')
      .select('user_id, admin_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!profile) return json({ error: 'Profile not found' }, 403);
    const adminId = profile.admin_id || profile.user_id;

    const requestedMode = body.mode === 'cloud' ? 'cloud' : body.mode === 'link' ? 'link' : null;

    const { data: settings } = await sb
      .from('shop_settings')
      .select('whatsapp_ordering_mode')
      .eq('user_id', adminId)
      .maybeSingle();

    const mode =
      requestedMode || (settings?.whatsapp_ordering_mode === 'cloud' ? 'cloud' : 'link');

    if (mode === 'link') {
      return json({
        success: true,
        mode: 'link',
        wa_url: `https://api.whatsapp.com/send?phone=${target}&text=${encodeURIComponent(message)}`,
      });
    }

    const { data: creds } = await sb
      .from('shop_whatsapp_credentials')
      .select('whatsapp_business_api_token, whatsapp_business_phone_id')
      .eq('user_id', adminId)
      .maybeSingle();

    if (!creds?.whatsapp_business_api_token || !creds?.whatsapp_business_phone_id) {
      return json(
        { error: 'WhatsApp Cloud API is not configured. Add your token and phone number ID in WhatsApp settings.' },
        400,
      );
    }

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${creds.whatsapp_business_phone_id}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.whatsapp_business_api_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: target,
          type: 'text',
          text: { preview_url: true, body: message },
        }),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      console.error(`WhatsApp Cloud API failed [${res.status}]: ${text}`);
      return json({ error: 'WhatsApp send failed', status: res.status, details: text }, res.status);
    }

    return json({ success: true, mode: 'cloud', result: JSON.parse(text) });
  } catch (e) {
    console.error('whatsapp-send error:', e);
    return json({ error: (e as Error).message }, 400);
  }
});
