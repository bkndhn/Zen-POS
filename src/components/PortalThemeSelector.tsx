import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useBranchContext } from '@/hooks/useBranchContext';
import { PORTAL_THEMES, getPortalTheme, PortalTheme } from '@/lib/portalThemes';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, Palette } from 'lucide-react';
import { toast } from 'sonner';

export function PortalThemeSelector() {
  const { user } = useAuth();
  const { mainBranchId } = useBranchContext();
  const [selectedId, setSelectedId] = useState<string>('emerald-fresh');
  const [savedId, setSavedId] = useState<string>('emerald-fresh');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load current theme from shop_settings
  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('shop_settings')
        .select('portal_theme_id')
        .eq('admin_id', user.id)
        .eq('branch_id', mainBranchId ?? '')
        .maybeSingle();
      const id = (data as any)?.portal_theme_id ?? 'emerald-fresh';
      setSelectedId(id);
      setSavedId(id);
      setLoading(false);
    };
    load();
  }, [user?.id, mainBranchId]);

  const handleSave = useCallback(async () => {
    if (!user?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('shop_settings')
      .update({ portal_theme_id: selectedId } as any)
      .eq('admin_id', user.id)
      .eq('branch_id', mainBranchId ?? '');
    if (error) {
      toast.error('Failed to save theme: ' + error.message);
    } else {
      setSavedId(selectedId);
      toast.success('Portal theme saved! Customers will see the new look immediately.');
    }
    setSaving(false);
  }, [user?.id, mainBranchId, selectedId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading theme settings…
      </div>
    );
  }

  const activeTheme = getPortalTheme(selectedId);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">Portal Visual Theme</p>
            <p className="text-xs text-muted-foreground">
              Choose how your public menu portal looks for customers — each shop can have a unique style.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || selectedId === savedId}
          className="shrink-0"
          style={{ background: activeTheme.defaultPrimary }}
        >
          {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Saving…</> : 'Save Theme'}
        </Button>
      </div>

      {/* Live preview strip */}
      <div
        className="rounded-xl overflow-hidden border shadow-sm"
        style={{ background: activeTheme.heroBg }}
      >
        <div className="flex flex-col items-center justify-center gap-1 py-5 px-4 text-center">
          <span className="text-4xl">{activeTheme.emoji}</span>
          <p className="font-bold text-base" style={{ color: activeTheme.heroTextColor }}>
            Your Restaurant Name
          </p>
          <p className="text-xs" style={{ color: activeTheme.heroSubColor }}>
            {activeTheme.tagline}
          </p>
        </div>
        {/* Thumb preview row */}
        <div className="flex border-t border-white/10">
          {activeTheme.thumb.backgrounds.slice(0, 6).map((bg, i) => (
            <div
              key={i}
              className="flex-1 h-10 flex items-center justify-center text-sm"
              style={{ background: bg, color: activeTheme.thumb.textColor }}
            >
              {activeTheme.thumb.showEmoji
                ? (['🍳', '🍱', '🍟', '🥤', '🍮', '🍽️'][i])
                : '•'}
            </div>
          ))}
        </div>
      </div>

      {/* 20-card grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {PORTAL_THEMES.map((theme: PortalTheme) => {
          const isSelected = theme.id === selectedId;
          return (
            <button
              key={theme.id}
              onClick={() => setSelectedId(theme.id)}
              className={`relative rounded-xl overflow-hidden border-2 transition-all text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 hover:scale-[1.02] active:scale-[0.98] ${
                isSelected
                  ? 'border-[#10b981] shadow-md shadow-emerald-200 dark:shadow-emerald-900'
                  : 'border-transparent hover:border-gray-200 dark:hover:border-gray-700'
              }`}
              title={theme.bestFor}
            >
              {/* Mini hero */}
              <div
                className="w-full flex flex-col items-center justify-center gap-0.5 py-3 px-2"
                style={{ background: theme.heroBg, minHeight: 64 }}
              >
                <span className="text-2xl leading-none">{theme.emoji}</span>
                <span
                  className="text-[10px] font-bold leading-tight text-center mt-0.5"
                  style={{ color: theme.heroTextColor }}
                >
                  {theme.name}
                </span>
              </div>
              {/* Info */}
              <div className="bg-white dark:bg-gray-900 px-2 py-1.5">
                <p className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight line-clamp-1">
                  {theme.tagline}
                </p>
                <p className="text-[8px] text-gray-400 dark:text-gray-500 leading-tight mt-0.5 line-clamp-1">
                  {theme.bestFor}
                </p>
              </div>
              {/* Selected badge */}
              {isSelected && (
                <div className="absolute top-1.5 right-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-500 drop-shadow-sm" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedId !== savedId && (
        <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
          ⚠ Unsaved — click <strong>Save Theme</strong> to apply changes.
        </p>
      )}
    </div>
  );
}
