import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

/**
 * send-push — delivers FCM notifications to every device registered by a user.
 *
 * Uses the FCM HTTP v1 REST API with a self-signed service-account JWT.
 * (The previous firebase-admin npm import is unreliable on Deno Edge.)
 *
 * Auth model:
 *  - service_role bearer (from process-push-queue / cron / triggers) → may target any user_id
 *  - end-user bearer (test button in Settings)                       → may only target themselves
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

// ── service account ────────────────────────────────────────────────────────

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cachedAccount: ServiceAccount | null = null;

async function loadServiceAccount(admin: ReturnType<typeof createClient>): Promise<ServiceAccount> {
  if (cachedAccount) return cachedAccount;

  let raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');

  if (!raw) {
    const { data, error } = await admin.rpc('vault_read_secret', {
      secret_name: 'firebase_service_account',
    });
    if (error || !data) {
      throw new Error(
        `Firebase service account not found (env + vault). ${error?.message ?? 'missing'}`,
      );
    }
    raw = typeof data === 'string' ? data : JSON.stringify(data);
  }

  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!parsed?.client_email || !parsed?.private_key || !parsed?.project_id) {
    throw new Error('Firebase service account JSON is missing required fields');
  }
  cachedAccount = parsed as ServiceAccount;
  return cachedAccount;
}

// ── OAuth token (RS256 JWT → Google token endpoint) ────────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null;

const b64url = (input: ArrayBuffer | string) => {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  );
  const assertion = `${header}.${claim}.${b64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const payload = await res.json();
  if (!res.ok || !payload.access_token) {
    throw new Error(`Google token exchange failed [${res.status}]: ${JSON.stringify(payload)}`);
  }

  cachedToken = { value: payload.access_token, expiresAt: Date.now() + 3500 * 1000 };
  return cachedToken.value;
}

// ── FCM send ───────────────────────────────────────────────────────────────

interface SendOutcome {
  token: string;
  ok: boolean;
  status?: number;
  error?: string;
  unregistered?: boolean;
}

async function sendToToken(
  projectId: string,
  accessToken: string,
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<SendOutcome> {
  const message = {
    message: {
      token,
      notification: { title, body },
      ...(Object.keys(data).length ? { data } : {}),
      android: {
        priority: 'HIGH',
        notification: {
          channel_id: 'zenpos_default',
          default_sound: true,
          default_vibrate_timings: true,
          notification_priority: 'PRIORITY_MAX',
        },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'default', badge: 1, 'mutable-content': 1 } },
      },
      webpush: {
        headers: { Urgency: 'high' },
        fcm_options: { link: data.url ? `https://zen-pos.vercel.app${data.url}` : 'https://zen-pos.vercel.app/' },
      },
    },
  };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    },
  );

  if (res.ok) return { token, ok: true };

  const text = await res.text();
  const unregistered =
    res.status === 404 ||
    text.includes('UNREGISTERED') ||
    text.includes('INVALID_ARGUMENT') && text.includes('registration');
  console.error(`[send-push] FCM send failed [${res.status}]: ${text}`);
  return { token, ok: false, status: res.status, error: text, unregistered };
}

// ── handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearer) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const payload = await req.json().catch(() => ({}));
    const record = payload.record ?? {};

    const title = String(payload.title ?? record.title ?? 'ZenPOS Alert').slice(0, 200);
    const body = String(payload.body ?? record.body ?? 'You have a new notification.').slice(0, 1000);
    let userId: string | undefined = payload.user_id ?? record.user_id;

    // Caller identity: service_role may target anyone, a signed-in user only themselves.
    const isServiceRole = bearer === SERVICE_ROLE_KEY;
    if (!isServiceRole) {
      const { data: authData, error: authError } = await admin.auth.getUser(bearer);
      if (authError || !authData?.user) return json({ error: 'Unauthorized' }, 401);
      userId = authData.user.id;
    }

    if (!userId) return json({ error: 'Missing user_id to target push notification' }, 400);

    const rawData = payload.data ?? record.data ?? {};
    const fcmData: Record<string, string> = {};
    if (rawData && typeof rawData === 'object') {
      for (const [k, v] of Object.entries(rawData)) fcmData[k] = String(v);
    }

    const { data: devices, error: deviceError } = await admin
      .from('user_devices')
      .select('device_token, platform')
      .eq('user_id', userId);

    if (deviceError) return json({ error: deviceError.message }, 500);
    if (!devices || devices.length === 0) {
      return json({ success: true, successCount: 0, failureCount: 0, message: 'No registered devices found for user.' });
    }

    const sa = await loadServiceAccount(admin);
    const accessToken = await getAccessToken(sa);

    const outcomes: SendOutcome[] = [];
    const batchSize = 20;
    const tokens = devices.map((d: any) => d.device_token).filter(Boolean);

    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((t: string) => sendToToken(sa.project_id, accessToken, t, title, body, fcmData)),
      );
      outcomes.push(...results);
    }

    const successCount = outcomes.filter((o) => o.ok).length;
    const failures = outcomes.filter((o) => !o.ok);
    const staleTokens = failures.filter((o) => o.unregistered).map((o) => o.token);

    if (staleTokens.length > 0) {
      await admin.from('user_devices').delete().in('device_token', staleTokens);
    }

    console.log(
      `[send-push] user=${userId} sent=${successCount} failed=${failures.length} cleaned=${staleTokens.length}`,
    );

    return json({
      success: successCount > 0,
      successCount,
      failureCount: failures.length,
      cleanedTokens: staleTokens.length,
      errors: failures.slice(0, 3).map((f) => ({ status: f.status, error: f.error?.slice(0, 400) })),
    });
  } catch (err: any) {
    console.error('[send-push] failed:', err?.message || err);
    return json({ error: err?.message || String(err) }, 500);
  }
});
