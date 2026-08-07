// Shared helpers for Razorpay / PhonePe payment gateway integration
import { createClient } from 'npm:@supabase/supabase-js@2';

export const admin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

export interface GatewayCreds {
  id: string;
  admin_id: string;
  branch_id: string | null;
  provider: 'razorpay' | 'phonepe';
  mode: 'test' | 'live';
  key_id: string | null;
  key_secret: string | null;
  webhook_secret: string | null;
  merchant_id: string | null;
  salt_key: string | null;
  salt_index: string | null;
}

/** Resolve the gateway credentials for an admin (branch specific first, then org-wide). */
export async function getCreds(
  adminId: string,
  provider?: string,
  branchId?: string | null,
): Promise<GatewayCreds> {
  const sb = admin();
  let q = sb
    .from('payment_gateway_credentials')
    .select('*')
    .eq('admin_id', adminId)
    .eq('is_active', true);
  if (provider) q = q.eq('provider', provider);
  const { data, error } = await q;
  if (error) throw new Error(`Credential lookup failed: ${error.message}`);
  if (!data?.length) throw new Error('No active payment gateway configured for this account.');

  const scored = (data as GatewayCreds[]).sort((a, b) => {
    const s = (c: GatewayCreds) =>
      (branchId && c.branch_id === branchId ? 4 : 0) + (c.branch_id === null ? 2 : 0);
    return s(b) - s(a);
  });
  return scored[0];
}

const enc = new TextEncoder();

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(payload: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(payload));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------- Razorpay ------------------------------- */

export function rzpAuth(c: GatewayCreds): string {
  if (!c.key_id || !c.key_secret) throw new Error('Razorpay Key ID / Secret missing.');
  return 'Basic ' + btoa(`${c.key_id}:${c.key_secret}`);
}

export async function rzpFetch(
  c: GatewayCreds,
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
) {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { Authorization: rzpAuth(c), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Razorpay [${res.status}]: ${text}`);
  return JSON.parse(text);
}

/* -------------------------------- PhonePe -------------------------------- */

export function phonepeHost(c: GatewayCreds): string {
  return c.mode === 'live'
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
}

export async function phonepePay(
  c: GatewayCreds,
  payload: Record<string, unknown>,
): Promise<{ redirectUrl: string; raw: unknown }> {
  if (!c.merchant_id || !c.salt_key) throw new Error('PhonePe Merchant ID / Salt Key missing.');
  const base64 = btoa(JSON.stringify(payload));
  const checksum =
    (await sha256Hex(base64 + '/pg/v1/pay' + c.salt_key)) + '###' + (c.salt_index || '1');

  const res = await fetch(`${phonepeHost(c)}/pg/v1/pay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-VERIFY': checksum,
      accept: 'application/json',
    },
    body: JSON.stringify({ request: base64 }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PhonePe [${res.status}]: ${text}`);
  const json = JSON.parse(text);
  const redirectUrl = json?.data?.instrumentResponse?.redirectInfo?.url;
  if (!redirectUrl) throw new Error(`PhonePe did not return a redirect URL: ${text}`);
  return { redirectUrl, raw: json };
}
