import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from '@/hooks/use-toast';
import { Palette, LayoutTemplate, Type, Sparkles, Box, Check, RefreshCw } from 'lucide-react';

export const MenuDesignStudio = () => {
    const { profile } = useAuth();
    const { operatingBranchId, branches } = useBranch();
    const isMainBranch = branches.find(b => b.id === operatingBranchId)?.is_main;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Layout Settings
    const [layoutStyle, setLayoutStyle] = useState('classic');
    
    // Typography Settings
    const [fontFamily, setFontFamily] = useState('Inter');
    
    // Aesthetics Settings
    const [borderRadius, setBorderRadius] = useState('md');
    const [glassmorphism, setGlassmorphism] = useState(false);
    
    // AI Settings
    const [aiEnabled, setAiEnabled] = useState(false);

    useEffect(() => {
        loadSettings();
    }, [profile?.user_id, operatingBranchId]);

    const loadSettings = async () => {
        if (!profile?.user_id) return;
        setLoading(true);
        try {
            // Fetch branch-specific settings or fallback to main
            let { data } = await supabase
                .from('shop_settings')
                .select('menu_layout_style, menu_font_family, menu_border_radius, menu_glassmorphism, menu_ai_features_enabled')
                .eq('user_id', profile.user_id)
                .eq('branch_id', operatingBranchId)
                .maybeSingle();

            if (!data) {
                const { data: fb } = await supabase
                    .from('shop_settings')
                    .select('menu_layout_style, menu_font_family, menu_border_radius, menu_glassmorphism, menu_ai_features_enabled')
                    .eq('user_id', profile.user_id)
                    .order('branch_id', { nullsFirst: false })
                    .limit(1)
                    .maybeSingle();
                data = fb;
            }

            if (data) {
                if (data.menu_layout_style) setLayoutStyle(data.menu_layout_style);
                if (data.menu_font_family) setFontFamily(data.menu_font_family);
                if (data.menu_border_radius) setBorderRadius(data.menu_border_radius);
                if (data.menu_glassmorphism !== null) setGlassmorphism(data.menu_glassmorphism);
                if (data.menu_ai_features_enabled !== null) setAiEnabled(data.menu_ai_features_enabled);
            }
        } catch (error) {
            console.error('Error loading menu design settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!profile?.user_id) return;
        setSaving(true);
        try {
            const payload = {
                user_id: profile.user_id,
                branch_id: operatingBranchId,
                menu_layout_style: layoutStyle,
                menu_font_family: fontFamily,
                menu_border_radius: borderRadius,
                menu_glassmorphism: glassmorphism,
                menu_ai_features_enabled: aiEnabled
            };

            const { data: existing } = await supabase
                .from('shop_settings')
                .select('id')
                .eq('user_id', profile.user_id)
                .eq('branch_id', operatingBranchId)
                .maybeSingle();

            if (existing?.id) {
                await supabase.from('shop_settings').update(payload).eq('id', existing.id);
            } else {
                await supabase.from('shop_settings').insert(payload);
            }

            toast({
                title: "Settings Saved",
                description: "Your customer portal has been updated.",
            });
            
            // Broadcast so preview updates immediately
            const channel = supabase.channel(`menu-settings-${profile.id}`);
            await channel.send({
                type: 'broadcast',
                event: 'menu-design-updated',
                payload
            });
            supabase.removeChannel(channel);

        } catch (error: any) {
            toast({
                title: "Error saving settings",
                description: error.message,
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center animate-pulse">Loading design studio...</div>;

    return (
        <div className="space-y-6">
            <Card className="border-purple-500/20 shadow-sm bg-gradient-to-br from-purple-50/50 to-background dark:from-purple-950/10">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Palette className="w-6 h-6 text-purple-600" />
                        Menu Design Studio
                    </CardTitle>
                    <CardDescription>
                        Completely transform the way your customers view and interact with your digital menu.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                    
                    {/* Layout Style */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <LayoutTemplate className="w-5 h-5 text-blue-500" />
                            <h3 className="font-semibold text-lg">Layout Architecture</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[
                                { id: 'classic', label: 'Classic List', desc: 'Clean, traditional row layout.' },
                                { id: 'modern_cards', label: 'Modern Cards', desc: 'Large imagery, beautiful shadow cards.' },
                                { id: 'image_grid', label: 'Masonry Grid', desc: 'Compact grid focusing on visuals.' }
                            ].map(layout => (
                                <div 
                                    key={layout.id}
                                    onClick={() => setLayoutStyle(layout.id)}
                                    className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${layoutStyle === layout.id ? 'border-primary bg-primary/5 shadow-md' : 'border-border hover:border-primary/50'}`}
                                >
                                    {layoutStyle === layout.id && <Check className="absolute top-3 right-3 w-4 h-4 text-primary" />}
                                    <p className="font-bold">{layout.label}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{layout.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Typography */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Type className="w-5 h-5 text-pink-500" />
                                <h3 className="font-semibold text-lg">Typography</h3>
                            </div>
                            <div className="space-y-2">
                                <Label>Font Family</Label>
                                <Select value={fontFamily} onValueChange={setFontFamily}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Font" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Inter"><span style={{fontFamily: 'Inter, sans-serif'}}>Inter (Default, Clean)</span></SelectItem>
                                        <SelectItem value="'Playfair Display', serif"><span style={{fontFamily: "'Playfair Display', serif"}}>Playfair Display (Elegant, Fine Dining)</span></SelectItem>
                                        <SelectItem value="'Outfit', sans-serif"><span style={{fontFamily: "'Outfit', sans-serif"}}>Outfit (Modern, Geometric)</span></SelectItem>
                                        <SelectItem value="'Caveat', cursive"><span style={{fontFamily: "'Caveat', cursive"}}>Caveat (Playful, Cafe style)</span></SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Aesthetics */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Box className="w-5 h-5 text-teal-500" />
                                <h3 className="font-semibold text-lg">Aesthetics</h3>
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Border Radius</Label>
                                    <Select value={borderRadius} onValueChange={setBorderRadius}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Sharp (0px)</SelectItem>
                                            <SelectItem value="sm">Subtle (4px)</SelectItem>
                                            <SelectItem value="md">Rounded (8px)</SelectItem>
                                            <SelectItem value="lg">Soft (16px)</SelectItem>
                                            <SelectItem value="full">Pill (9999px)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center justify-between p-3 border rounded-lg bg-background">
                                    <div className="space-y-0.5">
                                        <Label>Glassmorphism UI</Label>
                                        <p className="text-xs text-muted-foreground">Applies frosted glass effect to navigation</p>
                                    </div>
                                    <Switch checked={glassmorphism} onCheckedChange={setGlassmorphism} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* AI Customer Experience */}
                    <div className="space-y-4 pt-4 border-t">
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="w-5 h-5 text-amber-500" />
                            <h3 className="font-semibold text-lg">AI Customer Experience</h3>
                        </div>
                        <div className="flex items-center justify-between p-4 border-2 border-amber-500/20 rounded-xl bg-gradient-to-r from-amber-500/5 to-transparent">
                            <div className="space-y-1 max-w-[80%]">
                                <Label className="text-base font-bold text-amber-700 dark:text-amber-400">Free AI "Smart Waiter"</Label>
                                <p className="text-sm text-muted-foreground">
                                    Adds a floating chat button to your menu. Our free internal algorithm will automatically recommend dishes based on taste profiles (spicy, vegan, sweet) when customers search.
                                </p>
                            </div>
                            <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
                        </div>
                    </div>

                    <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto mt-6">
                        {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Palette className="w-4 h-4 mr-2" />}
                        Apply New Design
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};
