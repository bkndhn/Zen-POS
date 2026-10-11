import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, RotateCw, Loader2, Lock, Upload, ImageIcon, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { fetchFreeImage, toSmallWebp, make360Gif } from '@/utils/aiItemMedia';

interface Props {
  itemName?: string;
  category?: string;
  itemId?: string;
  onImage: (url: string) => void;
  onGif: (url: string) => void;
}

/** Super Admin must switch on "allow_ai_media" for the client; staff inherit it. */
export function useAiMediaAllowed(): boolean {
  const { profile, adminProfileId } = useAuth();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!profile) return;
    if (profile.role === 'super_admin') { setAllowed(true); return; }
    const own = (profile as any).client_permissions?.allow_ai_media;
    if (profile.role === 'admin') { setAllowed(own === true); return; }
    if (!adminProfileId) return;
    supabase.from('profiles').select('client_permissions').eq('id', adminProfileId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setAllowed((data as any)?.client_permissions?.allow_ai_media === true); });
    return () => { cancelled = true; };
  }, [profile, adminProfileId]);
  return allowed;
}

export const AiMediaGenerator: React.FC<Props> = ({ itemName, category, itemId, onImage, onGif }) => {
  const allowed = useAiMediaAllowed();
  const { adminProfileId } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState<'image' | 'gif' | 'upload' | 'enhance' | null>(null);
  const [uploadedBlob, setUploadedBlob] = useState<Blob | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = async (blob: Blob, ext: string) => {
    const name = `${adminProfileId}/${itemId || 'ai'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error } = await supabase.storage.from('item-images').upload(name, blob, { upsert: true, contentType: blob.type });
    if (error) throw error;
    return supabase.storage.from('item-images').getPublicUrl(name).data.publicUrl;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy('upload');
    try {
      const compressed = await toSmallWebp(file, 512, 0.85);
      setUploadedBlob(compressed);
      const prev = URL.createObjectURL(compressed);
      setUploadPreview(prev);
      toast({ title: 'Photo uploaded & compressed', description: 'Set it as dish photo or generate 360° view' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const setUploadedAsPhoto = async () => {
    if (!uploadedBlob) return;
    setBusy('upload');
    try {
      const url = await upload(uploadedBlob, 'webp');
      onImage(url);
      toast({ title: '✓ Dish photo set', description: 'Uploaded photo saved successfully' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const setUploadedAs360 = async () => {
    if (!uploadedBlob) return;
    setBusy('gif');
    try {
      const gif = await make360Gif(uploadedBlob);
      const url = await upload(gif, 'gif');
      onGif(url);
      toast({ title: '360° GIF created', description: `${Math.round(gif.size / 1024)}KB spinning view` });
    } catch (err: any) {
      toast({ title: 'GIF failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const studioEnhance = async () => {
    if (!itemName?.trim()) { toast({ title: 'Enter the item name first', variant: 'destructive' }); return; }
    setBusy('enhance');
    try {
      const raw = await fetchFreeImage(itemName, category);
      const url = await upload(await toSmallWebp(raw), 'webp');
      onImage(url);
      toast({ title: 'Studio Enhanced', description: `Professional photo created for "${itemName}"` });
    } catch (err: any) {
      toast({ title: 'Enhancement failed', description: err?.message || 'Please try again', variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const run = async (kind: 'image' | 'gif') => {
    if (!itemName?.trim()) { toast({ title: 'Enter the item name first', variant: 'destructive' }); return; }
    setBusy(kind);
    try {
      const raw = await fetchFreeImage(itemName, category);
      if (kind === 'image') {
        const url = await upload(await toSmallWebp(raw), 'webp');
        onImage(url);
        toast({ title: 'Photo created', description: `Made for "${itemName}"` });
      } else {
        const gif = await make360Gif(raw);
        const url = await upload(gif, 'gif');
        onGif(url);
        toast({ title: '360 GIF created', description: `${Math.round(gif.size / 1024)}KB spinning view` });
      }
    } catch (err: any) {
      toast({ title: 'Could not create', description: err?.message || 'Please try again', variant: 'destructive' });
    } finally { setBusy(null); }
  };

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground border border-dashed rounded-lg px-2 py-1.5">
        <Lock className="w-3 h-3" /> AI photo &amp; 360 GIF - ask Super Admin to enable
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Row 1: Upload + Studio Enhance */}
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />
        <Button
          type="button" size="sm" variant="outline"
          className="flex-1 h-8 text-xs"
          disabled={!!busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy === 'upload' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
          Upload Photo
        </Button>
        <Button
          type="button" size="sm" variant="outline"
          className="flex-1 h-8 text-xs"
          disabled={!!busy}
          onClick={studioEnhance}
        >
          {busy === 'enhance' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
          Studio Enhance
        </Button>
      </div>

      {/* Uploaded preview with Set Photo / Set 360 actions */}
      {uploadPreview && (
        <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card">
          <img src={uploadPreview} alt="preview" className="w-10 h-10 object-cover rounded flex-shrink-0" />
          <div className="flex gap-1.5 flex-1">
            <Button
              type="button" size="sm" variant="outline"
              className="flex-1 h-7 text-[10px]"
              disabled={!!busy}
              onClick={setUploadedAsPhoto}
            >
              {busy === 'upload' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-0.5" />}
              Set Photo
            </Button>
            <Button
              type="button" size="sm" variant="outline"
              className="flex-1 h-7 text-[10px]"
              disabled={!!busy}
              onClick={setUploadedAs360}
            >
              {busy === 'gif' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3 mr-0.5" />}
              360 GIF
            </Button>
          </div>
        </div>
      )}

      {/* Row 2: AI Generate */}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" className="flex-1 h-8 text-xs" disabled={!!busy} onClick={() => run('image')}>
          {busy === 'image' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <ImageIcon className="w-3 h-3 mr-1" />} AI Photo
        </Button>
        <Button type="button" size="sm" variant="outline" className="flex-1 h-8 text-xs" disabled={!!busy} onClick={() => run('gif')}>
          {busy === 'gif' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCw className="w-3 h-3 mr-1" />} AI 360 GIF
        </Button>
      </div>
    </div>
  );
};
