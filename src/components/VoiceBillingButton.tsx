import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, MicOff, Loader2, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

// Web Speech API isn't in default TS libs; type it loosely.
type SpeechRecognitionEvent = any;
type SpeechRecognition = any;

const LANG_OPTIONS = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'ta-IN', label: 'தமிழ் (Tamil)' },
  { code: 'hi-IN', label: 'हिन्दी (Hindi)' },
] as const;

export interface VoiceIntent {
  intent:
    | 'add_item' | 'set_payment' | 'set_order_type' | 'set_customer'
    | 'set_discount' | 'open_pay' | 'complete_payment' | 'clear_cart' | 'unknown';
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

interface CatalogItem { id: string; name: string; unit?: string | null }

interface Props {
  items: CatalogItem[];
  onIntent: (intent: VoiceIntent) => void;
  disabled?: boolean;
  className?: string;
}

/** Local rule-based fallback parser. Runs first — fast + free. */
function localParse(transcript: string, items: CatalogItem[]): VoiceIntent | null {
  const t = transcript.toLowerCase().trim();
  if (!t) return null;

  // Command intents
  if (/^(complete\s*(payment|billing)|finish\s*(payment|billing)?|done)$/i.test(t))
    return { intent: 'complete_payment', raw: transcript };
  if (/^(pay|payment|checkout)$/i.test(t))
    return { intent: 'open_pay', raw: transcript };
  if (/(clear|reset|empty)\s*(cart|bill)?/i.test(t))
    return { intent: 'clear_cart', raw: transcript };
  if (/(dine\s*in|dine-in)/i.test(t))
    return { intent: 'set_order_type', orderType: 'dine_in', raw: transcript };
  if (/(parcel|take\s*away|takeaway|packing)/i.test(t))
    return { intent: 'set_order_type', orderType: 'parcel', raw: transcript };

  // Payment: "upi 500", "cash 200", "card"
  const payMatch = t.match(/\b(upi|cash|card)\b[^\d]*(\d+(?:\.\d+)?)?/i);
  if (payMatch) {
    return {
      intent: 'set_payment',
      paymentMethod: payMatch[1].toLowerCase() as any,
      amount: payMatch[2] ? Number(payMatch[2]) : undefined,
      raw: transcript,
    };
  }

  // Discount
  const discMatch = t.match(/discount[^\d]*(\d+(?:\.\d+)?)/i);
  if (discMatch) return { intent: 'set_discount', discount: Number(discMatch[1]), raw: transcript };

  // Mobile
  const mobMatch = t.match(/\b([6-9]\d{9})\b/);
  if (mobMatch) return { intent: 'set_customer', mobile: mobMatch[1], raw: transcript };

  // Item + qty parsing (either order)
  // e.g. "milk 200ml", "200ml milk", "chicken briyani 1.5kg", "2 dosa"
  const unitRegex = /(\d+(?:\.\d+)?)\s*(kg|g|ml|l|pc|pcs|nos?)?/i;
  const numMatch = t.match(unitRegex);
  let qty: number | undefined;
  let unit: string | undefined;
  let nameQuery = t;
  if (numMatch) {
    qty = Number(numMatch[1]);
    unit = numMatch[2]?.toLowerCase().replace(/^pcs$|^nos?$/, 'pc');
    nameQuery = t.replace(numMatch[0], '').trim();
  }

  if (!nameQuery) return null;

  // Fuzzy match: token overlap score
  const tokens = nameQuery.split(/\s+/).filter(Boolean);
  const scored = items.map(it => {
    const nl = it.name.toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (!tok) continue;
      if (nl === tok) score += 5;
      else if (nl.startsWith(tok)) score += 3;
      else if (nl.includes(tok)) score += 2;
    }
    return { it, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  if (scored.length === 1 || scored[0].score >= (scored[1]?.score ?? 0) + 2) {
    return {
      intent: 'add_item',
      itemId: scored[0].it.id,
      itemName: scored[0].it.name,
      qty: qty ?? 1,
      unit,
      raw: transcript,
    };
  }

  return {
    intent: 'add_item',
    qty: qty ?? 1,
    unit,
    candidates: scored.slice(0, 5).map(x => ({ id: x.it.id, name: x.it.name })),
    raw: transcript,
  };
}

export const VoiceBillingButton: React.FC<Props> = ({ items, onIntent, disabled, className }) => {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [lang, setLang] = useState<string>(() => localStorage.getItem('voice_billing_lang') || 'en-IN');
  const recRef = useRef<SpeechRecognition | null>(null);

  const SR: any = typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;
  const supported = !!SR;

  useEffect(() => {
    localStorage.setItem('voice_billing_lang', lang);
  }, [lang]);

  const handleTranscript = useCallback(async (transcript: string) => {
    if (!transcript) return;
    setProcessing(true);

    // 1) Local fast path
    const local = localParse(transcript, items);
    if (local && local.intent !== 'unknown') {
      onIntent(local);
      setProcessing(false);
      return;
    }

    // 2) AI fallback (best effort)
    try {
      const { data, error } = await supabase.functions.invoke('voice-parse', {
        body: {
          transcript,
          lang,
          items: items.slice(0, 400).map(i => ({ id: i.id, name: i.name, unit: i.unit ?? null })),
        },
      });
      if (error) throw error;
      if (data?.intent && data.intent !== 'unknown') {
        onIntent(data as VoiceIntent);
      } else {
        toast({
          title: 'Didn\'t catch that',
          description: `"${transcript}" — try again or say a clearer item name.`,
        });
      }
    } catch (e: any) {
      console.warn('[voice] AI parse failed', e);
      // Surface local candidates if any, else generic miss
      if (local?.candidates?.length) onIntent(local);
      else toast({ title: 'Voice unavailable', description: 'Please try typing.' });
    } finally {
      setProcessing(false);
    }
  }, [items, lang, onIntent]);

  const start = useCallback(() => {
    if (!SR) {
      toast({
        title: 'Voice not supported',
        description: 'Your browser does not support voice input. Try Chrome or Android.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const rec = new SR();
      rec.lang = lang;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      rec.onresult = (e: SpeechRecognitionEvent) => {
        const transcript = e.results?.[0]?.[0]?.transcript || '';
        handleTranscript(transcript);
      };
      rec.onerror = (e: any) => {
        console.warn('[voice] error', e.error);
        setListening(false);
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          toast({ title: 'Microphone blocked', description: 'Allow mic access to use voice.', variant: 'destructive' });
        }
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch (err) {
      console.error('[voice] start failed', err);
      setListening(false);
    }
  }, [SR, lang, handleTranscript]);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  }, []);

  if (!supported) return null; // hide gracefully

  return (
    <div className={`flex items-center gap-1 ${className || ''}`}>
      <Button
        type="button"
        size="icon"
        variant={listening ? 'default' : 'outline'}
        className={`h-9 w-9 ${listening ? 'animate-pulse bg-red-500 hover:bg-red-600 text-white' : ''}`}
        onClick={listening ? stop : start}
        disabled={disabled || processing}
        title={listening ? 'Stop listening' : `Voice input (${lang})`}
        aria-label="Voice input"
      >
        {processing ? <Loader2 className="w-4 h-4 animate-spin" /> :
         listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon" variant="ghost" className="h-9 w-7" title="Voice language">
            <Languages className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {LANG_OPTIONS.map(l => (
            <DropdownMenuItem key={l.code} onClick={() => setLang(l.code)}>
              {lang === l.code ? '✓ ' : '  '}{l.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default VoiceBillingButton;
