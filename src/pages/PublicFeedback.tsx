import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Star, CheckCircle2, AlertCircle, QrCode } from 'lucide-react';

interface Field {
  id: string;
  field_key: string;
  label: string;
  placeholder?: string | null;
  helper_text?: string | null;
  field_type: string;
  options: any[];
  validation: Record<string, any>;
  is_required: boolean;
}

interface FormPayload {
  form: any;
  fields: Field[];
  shop: any;
}

const SESSION_KEY = 'zenpos_feedback_session';
const getSessionId = () => {
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = `sess_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
};

const PublicFeedback: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const src = params.get('src');

  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<FormPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ ok: boolean; message: string } | null>(null);

  // QR-only enforcement (best effort): allow if src=qr, or referrer empty (fresh scan), else block direct type-ins from another site.
  const qrGate = useMemo(() => {
    if (src === 'qr') return true;
    // Allow when opened as a bare tab (no referrer). Block when opened by clicking a link from elsewhere.
    if (!document.referrer) return true;
    try {
      const ref = new URL(document.referrer);
      if (ref.origin === window.location.origin) return true;
    } catch { /* ignore */ }
    return false;
  }, [src]);

  useEffect(() => {
    if (!slug || !qrGate) { setLoading(false); return; }
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc('get_public_feedback_form', { p_slug: slug });
        if (error) throw error;
        if (!data) { setError('This feedback form is unavailable.'); return; }
        setPayload(data as FormPayload);
      } catch (e: any) {
        setError(e.message || 'Failed to load form');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, qrGate]);

  const setResp = (key: string, val: any) => setResponses(prev => ({ ...prev, [key]: val }));

  const validate = (): string | null => {
    if (!/^[6-9][0-9]{9}$/.test(mobile.trim())) return 'Enter a valid 10-digit mobile number';
    for (const f of payload?.fields || []) {
      if (!f.is_required) continue;
      const v = responses[f.field_key];
      if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) {
        return `Please fill: ${f.label}`;
      }
    }
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) { setDone({ ok: false, message: err }); return; }
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc('submit_public_feedback', {
        p_slug: slug,
        p_mobile: mobile.trim(),
        p_customer_name: name.trim(),
        p_responses: responses,
        p_session_id: getSessionId(),
        p_user_agent: navigator.userAgent.slice(0, 200),
      });
      if (error) throw error;
      if (!data?.ok) {
        const reason = data?.reason || 'error';
        const msg = reason === 'cooldown'
          ? "You've already shared feedback with us recently. Thank you!"
          : reason === 'rate_limited'
          ? 'Too many attempts. Please try again in a while.'
          : reason === 'disabled'
          ? 'This feedback form is currently disabled.'
          : reason === 'invalid_mobile'
          ? 'Please enter a valid mobile number.'
          : 'Something went wrong. Please try again.';
        setDone({ ok: false, message: msg });
      } else {
        setDone({ ok: true, message: data.thank_you || 'Thank you for your feedback!' });
      }
    } catch (e: any) {
      setDone({ ok: false, message: e.message || 'Failed to submit' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!qrGate) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-sm w-full bg-white rounded-2xl p-6 shadow text-center space-y-3">
          <QrCode className="w-10 h-10 mx-auto text-slate-400" />
          <h1 className="text-lg font-bold">Please scan the QR code</h1>
          <p className="text-sm text-muted-foreground">This feedback form is available only through the QR code at the store.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (error || !payload) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-3">
          <AlertCircle className="w-10 h-10 mx-auto text-red-500" />
          <p className="text-sm text-muted-foreground">{error || 'Form not available.'}</p>
        </div>
      </div>
    );
  }

  const { form, fields, shop } = payload;
  const style: React.CSSProperties = {
    backgroundColor: form.background_color,
    color: form.text_color,
    fontFamily: form.font_family,
    minHeight: '100vh',
  };
  const primary = form.primary_color;
  const radius = form.border_radius;

  if (done?.ok) {
    return (
      <div style={style} className="flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full space-y-4">
          <CheckCircle2 className="w-16 h-16 mx-auto" style={{ color: primary }} />
          <h1 className="text-2xl font-bold">Thank you!</h1>
          <p className="opacity-80">{done.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={style} className="p-4 pb-16">
      <div className="max-w-md mx-auto space-y-4">
        {form.show_shop_header && shop && (
          <div className="text-center pt-4 pb-2">
            {(form.header_logo_url || shop.logo_url) && (
              <img src={form.header_logo_url || shop.logo_url} alt="" className="w-16 h-16 mx-auto object-contain rounded-full" />
            )}
            <h2 className="text-lg font-bold mt-2">{shop.shop_name}</h2>
            {shop.address && <p className="text-xs opacity-70">{shop.address}</p>}
          </div>
        )}

        <div style={{ backgroundColor: '#ffffff10', borderRadius: radius }} className="p-4 backdrop-blur">
          <h1 className="text-xl font-bold">{form.title}</h1>
          {form.subtitle && <p className="text-sm opacity-80 mt-1">{form.subtitle}</p>}
        </div>

        {done && !done.ok && (
          <div className="p-3 rounded-md bg-red-100 text-red-700 text-sm">{done.message}</div>
        )}

        <div style={{ backgroundColor: '#ffffff10', borderRadius: radius }} className="p-4 space-y-4">
          <div>
            <Label className="text-sm">Mobile Number *</Label>
            <Input
              inputMode="numeric"
              pattern="[6-9][0-9]{9}"
              maxLength={10}
              value={mobile}
              onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile"
              className="mt-1"
              style={{ borderRadius: radius }}
            />
          </div>
          <div>
            <Label className="text-sm">Your Name (optional)</Label>
            <Input value={name} onChange={e => setName(e.target.value.slice(0, 60))} placeholder="Name" className="mt-1" style={{ borderRadius: radius }} />
          </div>

          {fields.map(f => (
            <FieldRow key={f.id} field={f} value={responses[f.field_key]} onChange={v => setResp(f.field_key, v)} primary={primary} radius={radius} />
          ))}
        </div>

        <Button
          onClick={submit}
          disabled={submitting}
          className="w-full h-12 text-base font-semibold"
          style={{ backgroundColor: primary, color: '#fff', borderRadius: radius }}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (form.submit_button_label || 'Submit')}
        </Button>

        <p className="text-[10px] text-center opacity-60 pt-2">Powered by ZenPOS</p>
      </div>
    </div>
  );
};

const FieldRow: React.FC<{ field: Field; value: any; onChange: (v: any) => void; primary: string; radius: string; }> = ({ field, value, onChange, primary, radius }) => {
  const req = field.is_required ? <span className="text-red-500 ml-0.5">*</span> : null;
  const base = { borderRadius: radius } as React.CSSProperties;

  const render = () => {
    switch (field.field_type) {
      case 'long_text':
        return <Textarea rows={3} placeholder={field.placeholder || ''} value={value || ''} onChange={e => onChange(e.target.value.slice(0, 1000))} style={base} />;
      case 'number':
        return <Input type="number" placeholder={field.placeholder || ''} value={value || ''} onChange={e => onChange(e.target.value)} style={base} />;
      case 'date':
        return <Input type="date" value={value || ''} onChange={e => onChange(e.target.value)} style={base} />;
      case 'email':
        return <Input type="email" placeholder={field.placeholder || 'you@example.com'} value={value || ''} onChange={e => onChange(e.target.value.slice(0, 120))} style={base} />;
      case 'phone':
        return <Input inputMode="numeric" maxLength={15} placeholder={field.placeholder || ''} value={value || ''} onChange={e => onChange(e.target.value.replace(/\D/g, ''))} style={base} />;
      case 'yes_no':
        return (
          <div className="flex gap-2">
            {['Yes', 'No'].map(o => (
              <Button key={o} type="button" variant={value === o ? 'default' : 'outline'} onClick={() => onChange(o)}
                style={{ ...(value === o ? { backgroundColor: primary, color: '#fff' } : {}), borderRadius: radius }} className="flex-1">
                {o}
              </Button>
            ))}
          </div>
        );
      case 'dropdown':
        return (
          <select className="w-full h-10 px-3 border rounded bg-transparent" style={base} value={value || ''} onChange={e => onChange(e.target.value)}>
            <option value="">-- Select --</option>
            {(field.options || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      case 'radio':
        return (
          <div className="space-y-1.5">
            {(field.options || []).map((o: string) => (
              <label key={o} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name={field.field_key} checked={value === o} onChange={() => onChange(o)} />
                {o}
              </label>
            ))}
          </div>
        );
      case 'checkbox':
        return (
          <div className="space-y-1.5">
            {(field.options || []).map((o: string) => {
              const arr: string[] = Array.isArray(value) ? value : [];
              const on = arr.includes(o);
              return (
                <label key={o} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={on} onChange={() => onChange(on ? arr.filter(x => x !== o) : [...arr, o])} />
                  {o}
                </label>
              );
            })}
          </div>
        );
      case 'rating':
        return (
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => onChange(n)} className="p-1">
                <Star className={`w-8 h-8 transition-transform ${value >= n ? 'scale-110' : 'opacity-30'}`}
                  style={{ color: primary, fill: value >= n ? primary : 'transparent' }} />
              </button>
            ))}
          </div>
        );
      default:
        return <Input placeholder={field.placeholder || ''} value={value || ''} onChange={e => onChange(e.target.value.slice(0, 300))} style={base} />;
    }
  };

  return (
    <div>
      <Label className="text-sm">{field.label}{req}</Label>
      {field.helper_text && <p className="text-[11px] opacity-70 mb-1">{field.helper_text}</p>}
      <div className="mt-1">{render()}</div>
    </div>
  );
};

export default PublicFeedback;
