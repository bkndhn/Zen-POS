import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Auth: internal secret (DB trigger) OR a signed-in user firing a test ping
  let adminId: string | null = null;
  let branchId: string | null = null;
  let event = '';
  let payload: Record<string, unknown> = {};
  let isTest = false;

  try {
    const body = await req.json();
    event = String(body.event || '');
    payload = body.payload || {};
    branchId = body.branch_id ?? null;
    adminId = body.admin_id ?? null;
    isTest = !!body.test;

    const provided = req.headers.get('x-internal-secret') || '';
    let authorized = false;
    if (provided) {
      const { data: expected } = await supabase.rpc('get_internal_secret', { p_name: 'push_queue_cron' });
      authorized = !!expected && provided === expected;
    }

    if (!authorized) {
      // user-initiated test ping
      const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
      if (!jwt) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
      const { data: userRes } = await userClient.auth.getUser();
      if (!userRes?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { data: myAdmin } = await userClient.rpc('get_my_admin_id');
      if (!myAdmin) return new Response(JSON.stringify({ error: 'No tenant' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      adminId = myAdmin as string; // never trust client-supplied admin_id
      isTest = true;
      if (!event) event = 'test.ping';
    }

    if (!adminId || !event) {
      return new Response(JSON.stringify({ error: 'Missing admin_id or event' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let q = supabase.from('client_webhook_endpoints').select('*').eq('admin_id', adminId).eq('is_active', true);
    const { data: endpoints } = await q;
    const targets = (endpoints || []).filter((e: any) =>
      (isTest || (e.events || []).includes(event)) &&
      (!e.branch_id || !branchId || e.branch_id === branchId)
    );

    const results: unknown[] = [];
    for (const ep of targets) {
      const bodyStr = JSON.stringify({ event, sent_at: new Date().toISOString(), data: payload });
      const signature = await sign(ep.secret, bodyStr);
      const started = Date.now();
      let status = 0;
      let text = '';
      let ok = false;
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(ep.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-ZenPOS-Event': event,
            'X-ZenPOS-Signature': `sha256=${signature}`,
          },
          body: bodyStr,
          signal: controller.signal,
        });
        clearTimeout(t);
        status = res.status;
        text = (await res.text()).slice(0, 500);
        ok = res.ok;
      } catch (err) {
        text = String(err).slice(0, 500);
      }
      const duration = Date.now() - started;
      await supabase.from('client_webhook_logs').insert({
        admin_id: adminId,
        endpoint_id: ep.id,
        event_type: event,
        payload,
        status_code: status || null,
        response_body: text,
        duration_ms: duration,
        success: ok,
      });
      results.push({ endpoint: ep.url, status, ok, duration });
    }

    return new Response(JSON.stringify({ delivered: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
