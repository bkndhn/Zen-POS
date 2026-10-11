import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, RotateCw, Loader2, Lock } from 'lucide-react';
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
  const [busy, setBusy] = useState<'image' | 'gif' | null>(null);

  const upload = async (blob: Blob, ext: string) => {
    const name = `${adminProfileId}/${itemId || 'ai'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error } = await supabase.storage.from('item-images').upload(name, blob, { upsert: true, contentType: blob.type });
    if (error) throw error;
    return supabase.storage.from('item-images').getPublicUrl(name).data.publicUrl;
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
        toast({ title: '360° GIF created', description: `${Math.round(gif.size / 1024)}KB spinning view` });
      }
    } catch (e: any) {
      toast({ title: 'Could not create', description: e?.message || 'Please try again', variant: 'destructive' });
    } finally { setBusy(null); }
  };

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground border border-dashed rounded-lg px-2 py-1.5">
        <Lock className="w-3 h-3" /> AI photo & 360° GIF — ask Super Admin to enable
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button type="button" size="sm" variant="outline" className="flex-1 h-8 text-xs" disabled={!!busy} onClick={() => run('image')}>
        {busy === 'image' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />} AI Photo
      </Button>
      <Button type="button" size="sm" variant="outline" className="flex-1 h-8 text-xs" disabled={!!busy} onClick={() => run('gif')}>
        {busy === 'gif' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCw className="w-3 h-3 mr-1" />} AI 360° GIF
      </Button>
    </div>
  );
};
