import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import {
  Download, Palette, FileImage, FileText, Save, Sparkles, Star,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';

/* -------------------------------------------------------------------------- */
/*  Template catalog                                                           */
/* -------------------------------------------------------------------------- */

export interface PosterConfig {
  templateId: string;
  title: string;
  subtitle: string;
  footer: string;
  primary: string;
  accent: string;
  background: string;
  text: string;
  fontFamily: string;
  qrStyle: 'squares' | 'rounded';
  logoDataUrl?: string;
  backgroundImage?: string;
}

interface Template {
  id: string;
  label: string;
  defaults: Partial<PosterConfig>;
  render: (cfg: PosterConfig, qrDataUrl: string) => React.ReactNode;
}

const FONT_OPTIONS = [
  { value: 'Inter, system-ui, sans-serif', label: 'Modern (Inter)' },
  { value: 'Poppins, sans-serif', label: 'Poppins' },
  { value: 'Playfair Display, serif', label: 'Elegant Serif' },
  { value: 'Montserrat, sans-serif', label: 'Montserrat' },
  { value: 'Georgia, serif', label: 'Classic Serif' },
  { value: '"Courier New", monospace', label: 'Retro Mono' },
];

// --- Individual template renderers ---------------------------------------

const T = {
  scanToOrder: (c: PosterConfig, qr: string) => (
    <div style={{
      width: '100%', height: '100%', background: c.background, color: c.text,
      fontFamily: c.fontFamily, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'space-between', padding: 40, boxSizing: 'border-box',
    }}>
      <div style={{ textAlign: 'center' }}>
        {c.logoDataUrl && <img src={c.logoDataUrl} alt="" style={{ width: 80, height: 80, objectFit: 'contain', margin: '0 auto 12px' }} />}
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1, color: c.primary }}>{c.title}</div>
        <div style={{ fontSize: 18, marginTop: 8, opacity: 0.75 }}>{c.subtitle}</div>
      </div>
      <div style={{ background: '#fff', padding: 22, borderRadius: 24, boxShadow: `0 20px 60px ${c.primary}25`, width: 304, height: 304, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={qr} alt="QR" style={{ width: 260, height: 260, display: 'block', objectFit: 'contain', aspectRatio: '1/1' }} />
      </div>
      <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: c.accent }}>{c.footer}</div>
    </div>
  ),

  tableTent: (c: PosterConfig, qr: string) => (
    <div style={{
      width: '100%', height: '100%', background: `linear-gradient(135deg, ${c.primary}, ${c.accent})`,
      color: c.text, fontFamily: c.fontFamily, padding: 32, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
    }}>
      <div style={{ color: '#fff', fontSize: 26, fontWeight: 700, textAlign: 'center' }}>{c.title}</div>
      <div style={{ background: '#fff', padding: 18, borderRadius: 16, width: 276, height: 276, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={qr} alt="QR" style={{ width: 240, height: 240, display: 'block', objectFit: 'contain', aspectRatio: '1/1' }} />
      </div>
      <div style={{ color: '#fff', fontSize: 16, textAlign: 'center', opacity: 0.95 }}>{c.subtitle}</div>
      <div style={{ color: '#fff', fontSize: 13, opacity: 0.8 }}>{c.footer}</div>
    </div>
  ),

  minimal: (c: PosterConfig, qr: string) => (
    <div style={{
      width: '100%', height: '100%', background: c.background, color: c.text,
      fontFamily: c.fontFamily, padding: 60, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40,
      border: `2px solid ${c.text}20`,
    }}>
      <div style={{ fontSize: 40, fontWeight: 300, letterSpacing: 4, textTransform: 'uppercase' }}>{c.title}</div>
      <div style={{ width: 60, height: 2, background: c.primary }} />
      <img src={qr} alt="QR" style={{ width: 280, height: 280, display: 'block', objectFit: 'contain', aspectRatio: '1/1' }} />
      <div style={{ fontSize: 12, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.6 }}>{c.footer}</div>
    </div>
  ),

  neon: (c: PosterConfig, qr: string) => (
    <div style={{
      width: '100%', height: '100%', background: '#0a0a1a', color: '#fff',
      fontFamily: c.fontFamily, padding: 40, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ fontSize: 46, fontWeight: 900, color: c.primary, textShadow: `0 0 20px ${c.primary}`, textAlign: 'center' }}>{c.title}</div>
      <div style={{ background: '#000', padding: 20, borderRadius: 20, border: `2px solid ${c.primary}`, boxShadow: `0 0 40px ${c.primary}80`, width: 300, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={qr} alt="QR" style={{ width: 260, height: 260, display: 'block', objectFit: 'contain', aspectRatio: '1/1' }} />
      </div>
      <div style={{ fontSize: 18, color: c.accent, textShadow: `0 0 10px ${c.accent}` }}>{c.subtitle}</div>
      <div style={{ fontSize: 12, opacity: 0.6 }}>{c.footer}</div>
    </div>
  ),

  retro: (c: PosterConfig, qr: string) => (
    <div style={{
      width: '100%', height: '100%', background: c.background, color: c.text,
      fontFamily: c.fontFamily, padding: 32, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-around',
      backgroundImage: `repeating-linear-gradient(45deg, ${c.primary}10 0 10px, transparent 10px 20px)`,
    }}>
      <div style={{ background: c.primary, color: '#fff', padding: '10px 24px', fontSize: 30, fontWeight: 900, transform: 'rotate(-2deg)', letterSpacing: 2 }}>
        {c.title}
      </div>
      <div style={{ background: '#fff', padding: 16, boxShadow: `8px 8px 0 ${c.accent}`, width: 292, height: 292, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={qr} alt="QR" style={{ width: 260, height: 260, display: 'block', objectFit: 'contain', aspectRatio: '1/1' }} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>{c.subtitle}</div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{c.footer}</div>
    </div>
  ),

  festive: (c: PosterConfig, qr: string) => (
    <div style={{
      width: '100%', height: '100%', background: `radial-gradient(circle at top, ${c.accent}, ${c.background})`,
      color: c.text, fontFamily: c.fontFamily, padding: 40, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ fontSize: 20, color: c.primary }}>✦ ✦ ✦</div>
      <div style={{ fontSize: 42, fontWeight: 800, color: c.primary, textAlign: 'center' }}>{c.title}</div>
      <div style={{ background: '#fff', padding: 20, borderRadius: 20, border: `4px double ${c.primary}`, width: 290, height: 290, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={qr} alt="QR" style={{ width: 250, height: 250, display: 'block', objectFit: 'contain', aspectRatio: '1/1' }} />
      </div>
      <div style={{ fontSize: 18, color: c.accent, fontWeight: 600 }}>{c.subtitle}</div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{c.footer}</div>
    </div>
  ),

  luxeGold: (c: PosterConfig, qr: string) => (
    <div style={{
      width: '100%', height: '100%', background: '#0d0d0d', color: '#f5d97a',
      fontFamily: c.fontFamily, padding: 40, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
      border: '3px solid #d4af37',
    }}>
      <div style={{ fontSize: 20, letterSpacing: 6, textTransform: 'uppercase' }}>{c.subtitle}</div>
      <div style={{ fontSize: 44, fontWeight: 700, textAlign: 'center', letterSpacing: 3, color: '#d4af37' }}>{c.title}</div>
      <div style={{ background: '#fff', padding: 18, borderRadius: 4, border: '2px solid #d4af37', width: 288, height: 288, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={qr} alt="QR" style={{ width: 250, height: 250, display: 'block', objectFit: 'contain', aspectRatio: '1/1' }} />
      </div>
      <div style={{ fontSize: 12, letterSpacing: 4, textTransform: 'uppercase' }}>{c.footer}</div>
    </div>
  ),

  kids: (c: PosterConfig, qr: string) => (
    <div style={{
      width: '100%', height: '100%', background: c.background,
      color: c.text, fontFamily: c.fontFamily, padding: 30, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-around',
    }}>
      <div style={{ fontSize: 38, fontWeight: 900, color: c.primary, textAlign: 'center' }}>
        🎈 {c.title} 🎉
      </div>
      <div style={{ background: '#fff', padding: 20, borderRadius: 30, border: `5px dashed ${c.accent}`, width: 290, height: 290, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={qr} alt="QR" style={{ width: 250, height: 250, display: 'block', objectFit: 'contain', aspectRatio: '1/1' }} />
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: c.accent, textAlign: 'center' }}>⭐ {c.subtitle} ⭐</div>
      <div style={{ fontSize: 13, opacity: 0.7 }}>{c.footer}</div>
    </div>
  ),

  coffee: (c: PosterConfig, qr: string) => (
    <div style={{
      width: '100%', height: '100%', background: c.background,
      color: c.text, fontFamily: c.fontFamily, padding: 40, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ fontSize: 36, textAlign: 'center' }}>☕</div>
      <div style={{ fontSize: 34, fontWeight: 700, color: c.primary, textAlign: 'center', fontStyle: 'italic' }}>{c.title}</div>
      <div style={{ height: 1, width: 120, background: c.text, opacity: 0.3 }} />
      <div style={{ background: '#fff', padding: 18, borderRadius: 12, boxShadow: `0 6px 30px ${c.primary}30`, width: 296, height: 296, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={qr} alt="QR" style={{ width: 260, height: 260, display: 'block', objectFit: 'contain', aspectRatio: '1/1' }} />
      </div>
      <div style={{ fontSize: 16, opacity: 0.8, textAlign: 'center' }}>{c.subtitle}</div>
      <div style={{ fontSize: 12, opacity: 0.6 }}>{c.footer}</div>
    </div>
  ),

  bakery: (c: PosterConfig, qr: string) => (
    <div style={{
      width: '100%', height: '100%', background: c.background,
      color: c.text, fontFamily: c.fontFamily, padding: 34, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ fontSize: 40, fontWeight: 700, color: c.primary, textAlign: 'center' }}>🥐 {c.title}</div>
      <div style={{ fontSize: 16, opacity: 0.8, textAlign: 'center', maxWidth: 320 }}>{c.subtitle}</div>
      <div style={{ background: '#fff', padding: 16, borderRadius: 20, border: `3px solid ${c.accent}`, width: 282, height: 282, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={qr} alt="QR" style={{ width: 250, height: 250, display: 'block', objectFit: 'contain', aspectRatio: '1/1' }} />
      </div>
      <div style={{ fontSize: 12, opacity: 0.6 }}>{c.footer}</div>
    </div>
  ),

  custom: (c: PosterConfig, qr: string) => (
    <div style={{
      width: '100%', height: '100%',
      background: c.backgroundImage ? `url(${c.backgroundImage}) center/cover no-repeat, ${c.background}` : c.background,
      color: c.text, fontFamily: c.fontFamily, padding: 40, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
    }}>
      {c.logoDataUrl && <img src={c.logoDataUrl} alt="" style={{ width: 70, height: 70, objectFit: 'contain' }} />}
      <div style={{ fontSize: 40, fontWeight: 800, color: c.primary, textAlign: 'center', textShadow: c.backgroundImage ? '0 2px 12px rgba(0,0,0,0.4)' : 'none' }}>{c.title}</div>
      <div style={{ background: '#fff', padding: 18, borderRadius: 18, width: 296, height: 296, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={qr} alt="QR" style={{ width: 260, height: 260, display: 'block', objectFit: 'contain', aspectRatio: '1/1' }} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: c.accent }}>{c.subtitle}</div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{c.footer}</div>
    </div>
  ),
};

const TEMPLATES: Template[] = [
  { id: 'scan',   label: 'Scan to Order', defaults: { primary: '#f97316', accent: '#ea580c', background: '#fffbeb', text: '#1c1917' }, render: T.scanToOrder },
  { id: 'tent',   label: 'Table Tent',    defaults: { primary: '#7c3aed', accent: '#a78bfa', background: '#faf5ff', text: '#1e1b4b' }, render: T.tableTent },
  { id: 'min',    label: 'Minimal',       defaults: { primary: '#111', accent: '#666', background: '#fff', text: '#111', fontFamily: 'Georgia, serif' }, render: T.minimal },
  { id: 'neon',   label: 'Neon',          defaults: { primary: '#22d3ee', accent: '#ec4899', background: '#0a0a1a', text: '#fff' }, render: T.neon },
  { id: 'retro',  label: 'Retro',         defaults: { primary: '#dc2626', accent: '#facc15', background: '#fef3c7', text: '#1c1917', fontFamily: '"Courier New", monospace' }, render: T.retro },
  { id: 'fest',   label: 'Festive',       defaults: { primary: '#b91c1c', accent: '#f59e0b', background: '#fff7ed', text: '#450a0a' }, render: T.festive },
  { id: 'luxe',   label: 'Luxe Gold',     defaults: { primary: '#d4af37', accent: '#8a6d18', background: '#0d0d0d', text: '#f5d97a', fontFamily: 'Playfair Display, serif' }, render: T.luxeGold },
  { id: 'kids',   label: 'Kids',          defaults: { primary: '#ec4899', accent: '#8b5cf6', background: '#fef3c7', text: '#1c1917', fontFamily: 'Poppins, sans-serif' }, render: T.kids },
  { id: 'coffee', label: 'Coffee Shop',   defaults: { primary: '#78350f', accent: '#a16207', background: '#fef3c7', text: '#1c1917', fontFamily: 'Georgia, serif' }, render: T.coffee },
  { id: 'bakery', label: 'Bakery',        defaults: { primary: '#be185d', accent: '#f472b6', background: '#fdf2f8', text: '#500724', fontFamily: 'Poppins, sans-serif' }, render: T.bakery },
  { id: 'custom', label: '✨ Custom',      defaults: { primary: '#3b82f6', accent: '#8b5cf6', background: '#ffffff', text: '#111827' }, render: T.custom },
];

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

interface Props { menuUrl: string; shopName?: string; }

const STORAGE_KEY = 'qr_poster_config_v1';

export const QRPosterStudio: React.FC<Props> = ({ menuUrl, shopName }) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [config, setConfig] = useState<PosterConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* noop */ }
    return {
      templateId: 'scan',
      title: shopName || 'Scan to Order',
      subtitle: 'View our menu on your phone',
      footer: 'Powered by Zen POS',
      primary: '#f97316',
      accent: '#ea580c',
      background: '#fffbeb',
      text: '#1c1917',
      fontFamily: FONT_OPTIONS[0].value,
      qrStyle: 'squares',
    };
  });

  const template = useMemo(() => TEMPLATES.find(t => t.id === config.templateId) || TEMPLATES[0], [config.templateId]);

  // Generate QR when URL / style changes
  useEffect(() => {
    if (!menuUrl) return;
    QRCode.toDataURL(menuUrl, {
      width: 600,
      margin: 1,
      color: { dark: '#1a1a6c', light: '#ffffff' },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(''));
  }, [menuUrl]);

  const pickTemplate = (id: string) => {
    const tpl = TEMPLATES.find(t => t.id === id);
    if (!tpl) return;
    setConfig(prev => ({ ...prev, ...tpl.defaults, templateId: id }));
  };

  const update = <K extends keyof PosterConfig>(key: K, value: PosterConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const setAsDefault = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    toast({ title: 'Saved as default', description: 'This poster style will load next time.' });
  };

  const uploadImage = (key: 'logoDataUrl' | 'backgroundImage') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Please pick an image under 2 MB.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update(key, reader.result as string);
    reader.readAsDataURL(file);
  };

  const download = async (format: 'png' | 'jpg' | 'svg' | 'pdf') => {
    if (!previewRef.current) return;
    try {
      if (format === 'svg') {
        // Render an SVG that embeds the QR + basic title (simple, portable)
        const svg = buildSvg(config, qrDataUrl);
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        triggerDownload(URL.createObjectURL(blob), `qr-poster-${config.templateId}.svg`);
        return;
      }
      if (format === 'pdf') {
        // Simple print-based PDF path (no jspdf dep)
        const canvas = await html2canvas(previewRef.current, { scale: 2, backgroundColor: null, width: 400, height: 566 });
        const dataUrl = canvas.toDataURL('image/png');
        const win = window.open('', '_blank');
        if (!win) return;
        win.document.write(`<html><head><title>QR Poster</title>
          <style>@page{size:A4;margin:0}body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh}
          img{max-width:90vw;max-height:90vh;object-fit:contain}</style></head>
          <body><img src="${dataUrl}" onload="setTimeout(()=>window.print(),300)"/></body></html>`);
        win.document.close();
        return;
      }
      const canvas = await html2canvas(previewRef.current, { scale: 3, backgroundColor: null, width: 400, height: 566 });
      const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
      const url = canvas.toDataURL(mime, 0.95);
      triggerDownload(url, `qr-poster-${config.templateId}.${format}`);
    } catch (e) {
      console.error('[QRPosterStudio] download failed', e);
      toast({ title: 'Download failed', description: 'Please try a different format.', variant: 'destructive' });
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="w-4 h-4 text-primary" />
          QR Poster Studio
          <Badge variant="secondary" className="text-[10px]">10+ Templates</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Template picker */}
        <div>
          <Label className="text-xs mb-2 block">Template</Label>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTemplate(t.id)}
                className={`px-2 py-2 rounded-lg border text-[11px] font-medium transition-all
                  ${config.templateId === t.id ? 'border-primary bg-primary/10 text-primary shadow-sm' : 'border-border hover:border-primary/50'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Editable fields */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={config.title} onChange={e => update('title', e.target.value)} maxLength={40} />
          </div>
          <div>
            <Label className="text-xs">Subtitle</Label>
            <Input value={config.subtitle} onChange={e => update('subtitle', e.target.value)} maxLength={60} />
          </div>
          <div>
            <Label className="text-xs">Footer</Label>
            <Input value={config.footer} onChange={e => update('footer', e.target.value)} maxLength={60} />
          </div>
          <div>
            <Label className="text-xs">Font</Label>
            <select
              value={config.fontFamily}
              onChange={e => update('fontFamily', e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            >
              {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        </div>

        {/* Colors */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['primary', 'accent', 'background', 'text'] as const).map(k => (
            <div key={k}>
              <Label className="text-xs capitalize">{k}</Label>
              <div className="flex items-center gap-1">
                <input type="color" value={config[k]} onChange={e => update(k, e.target.value)}
                  className="w-8 h-8 rounded border cursor-pointer" />
                <Input value={config[k]} onChange={e => update(k, e.target.value)} className="h-8 text-xs font-mono flex-1" />
              </div>
            </div>
          ))}
        </div>

        {/* Assets */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Logo (optional)</Label>
            <Input type="file" accept="image/*" onChange={uploadImage('logoDataUrl')} className="h-9 text-xs" />
            {config.logoDataUrl && (
              <button type="button" onClick={() => update('logoDataUrl', undefined)} className="text-[10px] text-muted-foreground underline mt-1">Remove logo</button>
            )}
          </div>
          {config.templateId === 'custom' && (
            <div>
              <Label className="text-xs">Background image (custom template)</Label>
              <Input type="file" accept="image/*" onChange={uploadImage('backgroundImage')} className="h-9 text-xs" />
              {config.backgroundImage && (
                <button type="button" onClick={() => update('backgroundImage', undefined)} className="text-[10px] text-muted-foreground underline mt-1">Remove background</button>
              )}
            </div>
          )}
        </div>

        {/* Live preview */}
        <div className="bg-muted/40 rounded-lg p-4 flex justify-center overflow-auto">
          <div
            ref={previewRef}
            style={{ width: 400, height: 566 /* A4-ish ratio */ }}
            className="shadow-xl rounded-lg overflow-hidden"
          >
            {template.render(config, qrDataUrl)}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => download('png')}><Download className="w-4 h-4 mr-1" />PNG</Button>
          <Button size="sm" variant="outline" onClick={() => download('jpg')}><FileImage className="w-4 h-4 mr-1" />JPG</Button>
          <Button size="sm" variant="outline" onClick={() => download('pdf')}><FileText className="w-4 h-4 mr-1" />PDF</Button>
          <Button size="sm" variant="outline" onClick={() => download('svg')}><Palette className="w-4 h-4 mr-1" />SVG</Button>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" onClick={setAsDefault}>
            <Star className="w-4 h-4 mr-1" />Set as default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildSvg(c: PosterConfig, qrDataUrl: string): string {
  const w = 800, h = 1131;
  const esc = (s: string) => s.replace(/[<>&"']/g, ch => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[ch]!));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${c.background}"/>
  <text x="${w/2}" y="140" text-anchor="middle" font-family="${esc(c.fontFamily)}" font-size="64" font-weight="800" fill="${c.primary}">${esc(c.title)}</text>
  <text x="${w/2}" y="200" text-anchor="middle" font-family="${esc(c.fontFamily)}" font-size="28" fill="${c.text}" opacity="0.75">${esc(c.subtitle)}</text>
  ${qrDataUrl ? `<image href="${qrDataUrl}" x="${(w-500)/2}" y="300" width="500" height="500"/>` : ''}
  <text x="${w/2}" y="${h-80}" text-anchor="middle" font-family="${esc(c.fontFamily)}" font-size="24" fill="${c.accent}" font-weight="600">${esc(c.footer)}</text>
</svg>`;
}

export default QRPosterStudio;
