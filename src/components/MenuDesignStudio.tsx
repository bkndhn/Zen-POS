import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from '@/hooks/use-toast';
import { Palette, LayoutTemplate, LayoutGrid, Type, Sparkles, Box, Check, RefreshCw } from 'lucide-react';

const COLOR_PRESETS = [
    { id: 'custom', label: 'Custom Colors (Use Pickers)', primary: '', secondary: '', bg: '', text: '' },
    { id: 'sunset', label: 'Sunset Warmth', primary: '#f97316', secondary: '#ea580c', bg: '#fffbeb', text: '#1c1917' },
    { id: 'forest', label: 'Forest Mint', primary: '#059669', secondary: '#047857', bg: '#f0fdf4', text: '#064e3b' },
    { id: 'ocean', label: 'Ocean Breeze', primary: '#0284c7', secondary: '#0369a1', bg: '#f0f9ff', text: '#0c4a6e' },
    { id: 'royal', label: 'Royal Amethyst', primary: '#7c3aed', secondary: '#6d28d9', bg: '#faf5ff', text: '#4c1d95' },
    { id: 'rose', label: 'Rose Gold', primary: '#db2777', secondary: '#be185d', bg: '#fff1f2', text: '#881337' },
    { id: 'midnight', label: 'Midnight Velvet (Dark Theme)', primary: '#a78bfa', secondary: '#c084fc', bg: '#0f172a', text: '#f8fafc' },
    { id: 'obsidian', label: 'Luxury Obsidian (Dark Theme)', primary: '#fbbf24', secondary: '#f59e0b', bg: '#18181b', text: '#f4f4f5' },
    { id: 'vintage', label: 'Vintage Diner', primary: '#dc2626', secondary: '#b91c1c', bg: '#fffaf0', text: '#450a0a' }
];

export const MenuDesignStudio = () => {
    const { profile } = useAuth();
    const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
    const { operatingBranchId, branches } = useBranch();
    const isMainBranch = branches.find(b => b.id === operatingBranchId)?.is_main;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Layout Settings
    const [layoutStyle, setLayoutStyle] = useState('classic');
    const [menuItemsPerRow, setMenuItemsPerRow] = useState(1);
    
    // Typography Settings
    const [fontFamily, setFontFamily] = useState('Inter');
    
    // Aesthetics Settings
    const [borderRadius, setBorderRadius] = useState('md');
    const [cardElevation, setCardElevation] = useState('subtle');
    const [glassmorphism, setGlassmorphism] = useState(false);
    
    // AI Settings
    const [aiEnabled, setAiEnabled] = useState(false);
    
    // Store original shop settings to preserve them during save
    const [shopDetails, setShopDetails] = useState<any>(null);

    // Color Settings & Preset
    const [colorPreset, setColorPreset] = useState('custom');
    const [primaryColor, setPrimaryColor] = useState('#f97316');
    const [secondaryColor, setSecondaryColor] = useState('#ea580c');
    const [backgroundColor, setBackgroundColor] = useState('#fffbeb');
    const [textColor, setTextColor] = useState('#1c1917');

    // Preset selection change handler
    const handlePresetChange = (presetId: string) => {
        setColorPreset(presetId);
        const preset = COLOR_PRESETS.find(p => p.id === presetId);
        if (preset && presetId !== 'custom') {
            setPrimaryColor(preset.primary);
            setSecondaryColor(preset.secondary);
            setBackgroundColor(preset.bg);
            setTextColor(preset.text);
        }
    };

    // Dynamically load Google Font in studio for previewing
    useEffect(() => {
        if (!fontFamily || fontFamily === 'Inter') {
            return;
        }

        const fontName = fontFamily.split(',')[0].replace(/['"]/g, '').trim();
        const fontId = `google-font-studio-${fontName.toLowerCase().replace(/\s+/g, '-')}`;

        if (document.getElementById(fontId)) return;

        const link = document.createElement('link');
        link.id = fontId;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;500;600;700;800&display=swap`;
        document.head.appendChild(link);
    }, [fontFamily]);

    const [adminAuthUid, setAdminAuthUid] = useState<string | null>(null);

    useEffect(() => {
        const resolveAuthUid = async () => {
            if (!profile) return;
            if (profile.role === 'admin') {
                setAdminAuthUid(profile.user_id);
            } else if (profile.admin_id) {
                const { data } = await supabase
                    .from('profiles')
                    .select('user_id')
                    .eq('id', profile.admin_id)
                    .maybeSingle();
                if (data?.user_id) setAdminAuthUid(data.user_id);
            }
        };
        resolveAuthUid();
    }, [profile]);

    useEffect(() => {
        if (adminAuthUid) {
            loadSettings();
        }
    }, [adminAuthUid, operatingBranchId]);

    const loadSettings = async () => {
        if (!adminAuthUid) return;
        setLoading(true);
        try {
            // Fetch branch-specific settings or fallback to main
            let { data } = await supabase
                .from('shop_settings')
                .select('*')
                .eq('user_id', adminAuthUid)
                .eq('branch_id', operatingBranchId)
                .maybeSingle();

            if (!data) {
                const { data: fb } = await supabase
                    .from('shop_settings')
                    .select('*')
                    .eq('user_id', adminAuthUid)
                    .order('branch_id', { nullsFirst: false })
                    .limit(1)
                    .maybeSingle();
                data = fb;
            }

            if (data) {
                // Keep a copy of non-design-studio settings
                setShopDetails({
                    shop_name: data.shop_name,
                    address: data.address,
                    contact_number: data.contact_number,
                    logo_url: data.logo_url,
                    printer_width: data.printer_width,
                    facebook: data.facebook,
                    show_facebook: data.show_facebook,
                    instagram: data.instagram,
                    show_instagram: data.show_instagram,
                    whatsapp: data.whatsapp,
                    show_whatsapp: data.show_whatsapp,
                    upi_id: data.upi_id,
                    upi_name: data.upi_name,
                    qr_payment_enabled: data.qr_payment_enabled,
                    gst_enabled: data.gst_enabled,
                    gstin: data.gstin,
                    is_composition_scheme: data.is_composition_scheme,
                    composition_rate: data.composition_rate,
                    visible_nav_pages: data.visible_nav_pages
                });

                if (data.menu_layout_style) {
                    const parts = data.menu_layout_style.split(':');
                    setLayoutStyle(parts[0]);
                    setCardElevation(parts[1] || 'subtle');
                }
                if (data.menu_font_family) setFontFamily(data.menu_font_family);
                if (data.menu_border_radius) setBorderRadius(data.menu_border_radius);
                if (data.menu_glassmorphism !== null) setGlassmorphism(data.menu_glassmorphism);
                if (data.menu_ai_features_enabled !== null) setAiEnabled(data.menu_ai_features_enabled);
                if (data.menu_items_per_row) setMenuItemsPerRow(data.menu_items_per_row);
                
                // Color settings
                if (data.menu_primary_color) setPrimaryColor(data.menu_primary_color);
                if (data.menu_secondary_color) setSecondaryColor(data.menu_secondary_color);
                if (data.menu_background_color) setBackgroundColor(data.menu_background_color);
                if (data.menu_text_color) setTextColor(data.menu_text_color);

                // Determine if preset matches loaded colors
                const matchedPreset = COLOR_PRESETS.find(p => 
                    p.id !== 'custom' &&
                    p.primary.toLowerCase() === (data.menu_primary_color || '').toLowerCase() &&
                    p.secondary.toLowerCase() === (data.menu_secondary_color || '').toLowerCase() &&
                    p.bg.toLowerCase() === (data.menu_background_color || '').toLowerCase() &&
                    p.text.toLowerCase() === (data.menu_text_color || '').toLowerCase()
                );
                if (matchedPreset) {
                    setColorPreset(matchedPreset.id);
                } else {
                    setColorPreset('custom');
                }
            }
        } catch (error) {
            console.error('Error loading menu design settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!adminAuthUid) return;
        setSaving(true);
        try {
            const payload: any = {
                user_id: adminAuthUid,
                branch_id: operatingBranchId,
                menu_layout_style: `${layoutStyle}:${cardElevation}`,
                menu_font_family: fontFamily,
                menu_border_radius: borderRadius,
                menu_glassmorphism: glassmorphism,
                menu_ai_features_enabled: aiEnabled,
                menu_primary_color: primaryColor,
                menu_secondary_color: secondaryColor,
                menu_background_color: backgroundColor,
                menu_text_color: textColor,
                menu_items_per_row: menuItemsPerRow
            };

            // If we have loaded shop details, merge them to avoid wiping them out
            if (shopDetails) {
                payload.shop_name = shopDetails.shop_name;
                payload.address = shopDetails.address;
                payload.contact_number = shopDetails.contact_number;
                payload.logo_url = shopDetails.logo_url;
                payload.printer_width = shopDetails.printer_width;
                payload.facebook = shopDetails.facebook;
                payload.show_facebook = shopDetails.show_facebook;
                payload.instagram = shopDetails.instagram;
                payload.show_instagram = shopDetails.show_instagram;
                payload.whatsapp = shopDetails.whatsapp;
                payload.show_whatsapp = shopDetails.show_whatsapp;
                payload.upi_id = shopDetails.upi_id;
                payload.upi_name = shopDetails.upi_name;
                payload.qr_payment_enabled = shopDetails.qr_payment_enabled;
                payload.gst_enabled = shopDetails.gst_enabled;
                payload.gstin = shopDetails.gstin;
                payload.is_composition_scheme = shopDetails.is_composition_scheme;
                payload.composition_rate = shopDetails.composition_rate;
                payload.visible_nav_pages = shopDetails.visible_nav_pages;
            }

            const { data: existing } = await supabase
                .from('shop_settings')
                .select('id')
                .eq('user_id', adminAuthUid)
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
            
            // Broadcast so preview updates immediately (match event name in PublicMenu.tsx)
            const channel = supabase.channel(`menu-settings-${adminId}`);
            await channel.send({
                type: 'broadcast',
                event: 'menu-settings-updated',
                payload: {
                    menu_primary_color: primaryColor,
                    menu_secondary_color: secondaryColor,
                    menu_background_color: backgroundColor,
                    menu_text_color: textColor,
                    menu_layout_style: `${layoutStyle}:${cardElevation}`,
                    menu_font_family: fontFamily,
                    menu_border_radius: borderRadius,
                    menu_glassmorphism: glassmorphism,
                    menu_ai_features_enabled: aiEnabled,
                    menu_items_per_row: menuItemsPerRow
                }
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

                        {/* Items Per Row */}
                        <div className="pt-4 border-t border-border mt-4">
                            <div className="flex items-center gap-2 mb-2">
                                <LayoutGrid className="w-4 h-4 text-blue-600" />
                                <Label className="text-sm font-medium">Items Per Row</Label>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                {[
                                    { val: 1, label: '1 Item' },
                                    { val: 2, label: '2 Items' },
                                    { val: 3, label: '3 Items' },
                                    { val: 4, label: '↔ Scroll' },
                                ].map(opt => (
                                    <Button
                                        key={opt.val}
                                        variant={menuItemsPerRow === opt.val ? 'default' : 'outline'}
                                        size="sm"
                                        className="flex-1 min-w-[60px]"
                                        onClick={() => setMenuItemsPerRow(opt.val)}
                                    >
                                        {opt.label}
                                    </Button>
                                ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2">
                                For mobile devices, 1 or 2 items work best. Scroll mode creates a horizontal carousel.
                            </p>
                        </div>
                    </div>

                    {/* Color Theme & Branding */}
                    <div className="space-y-4 pt-4 border-t">
                        <div className="flex items-center gap-2 mb-2">
                            <Palette className="w-5 h-5 text-purple-600" />
                            <h3 className="font-semibold text-lg">Color Theme & Branding</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2 md:col-span-1">
                                <Label>Preset Theme Palette</Label>
                                <Select value={colorPreset} onValueChange={handlePresetChange}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Palette" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {COLOR_PRESETS.map(preset => (
                                            <SelectItem key={preset.id} value={preset.id}>
                                                {preset.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Select a predefined palette or fine-tune custom colors using the pickers.
                                </p>
                            </div>
                            
                            <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs">Primary Color</Label>
                                    <div className="flex gap-1.5">
                                        <Input 
                                            type="color" 
                                            value={primaryColor} 
                                            onChange={(e) => {
                                                setPrimaryColor(e.target.value);
                                                setColorPreset('custom');
                                            }}
                                            className="w-8 h-8 p-1 border rounded cursor-pointer flex-shrink-0" 
                                        />
                                        <Input 
                                            type="text" 
                                            value={primaryColor} 
                                            onChange={(e) => {
                                                setPrimaryColor(e.target.value);
                                                setColorPreset('custom');
                                            }}
                                            className="text-[10px] font-mono h-8 px-1.5" 
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">Accent Color</Label>
                                    <div className="flex gap-1.5">
                                        <Input 
                                            type="color" 
                                            value={secondaryColor} 
                                            onChange={(e) => {
                                                setSecondaryColor(e.target.value);
                                                setColorPreset('custom');
                                            }}
                                            className="w-8 h-8 p-1 border rounded cursor-pointer flex-shrink-0" 
                                        />
                                        <Input 
                                            type="text" 
                                            value={secondaryColor} 
                                            onChange={(e) => {
                                                setSecondaryColor(e.target.value);
                                                setColorPreset('custom');
                                            }}
                                            className="text-[10px] font-mono h-8 px-1.5" 
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">Background</Label>
                                    <div className="flex gap-1.5">
                                        <Input 
                                            type="color" 
                                            value={backgroundColor} 
                                            onChange={(e) => {
                                                setBackgroundColor(e.target.value);
                                                setColorPreset('custom');
                                            }}
                                            className="w-8 h-8 p-1 border rounded cursor-pointer flex-shrink-0" 
                                        />
                                        <Input 
                                            type="text" 
                                            value={backgroundColor} 
                                            onChange={(e) => {
                                                setBackgroundColor(e.target.value);
                                                setColorPreset('custom');
                                            }}
                                            className="text-[10px] font-mono h-8 px-1.5" 
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">Text Color</Label>
                                    <div className="flex gap-1.5">
                                        <Input 
                                            type="color" 
                                            value={textColor} 
                                            onChange={(e) => {
                                                setTextColor(e.target.value);
                                                setColorPreset('custom');
                                            }}
                                            className="w-8 h-8 p-1 border rounded cursor-pointer flex-shrink-0" 
                                        />
                                        <Input 
                                            type="text" 
                                            value={textColor} 
                                            onChange={(e) => {
                                                setTextColor(e.target.value);
                                                setColorPreset('custom');
                                            }}
                                            className="text-[10px] font-mono h-8 px-1.5" 
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t">
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
                                        <SelectItem value="'Poppins', sans-serif"><span style={{fontFamily: "'Poppins', sans-serif"}}>Poppins (Sleek, Geometric)</span></SelectItem>
                                        <SelectItem value="'Montserrat', sans-serif"><span style={{fontFamily: "'Montserrat', sans-serif"}}>Montserrat (Modern, Strong)</span></SelectItem>
                                        <SelectItem value="'Cinzel', serif"><span style={{fontFamily: "'Cinzel', serif"}}>Cinzel (Luxury Classic)</span></SelectItem>
                                        <SelectItem value="'Cormorant Garamond', serif"><span style={{fontFamily: "'Cormorant Garamond', serif"}}>Cormorant Garamond (Prestige Serifs)</span></SelectItem>
                                        <SelectItem value="'Dancing Script', cursive"><span style={{fontFamily: "'Dancing Script', cursive"}}>Dancing Script (Handwritten)</span></SelectItem>
                                        <SelectItem value="'Pacifico', cursive"><span style={{fontFamily: "'Pacifico', cursive"}}>Pacifico (Fun, Bold Retro)</span></SelectItem>
                                        <SelectItem value="'Josefin Sans', sans-serif"><span style={{fontFamily: "'Josefin Sans', sans-serif"}}>Josefin Sans (Art Deco, Elegant)</span></SelectItem>
                                        <SelectItem value="'Quicksand', sans-serif"><span style={{fontFamily: "'Quicksand', sans-serif"}}>Quicksand (Friendly, Soft)</span></SelectItem>
                                        <SelectItem value="'Abril Fatface', serif"><span style={{fontFamily: "'Abril Fatface', serif"}}>Abril Fatface (Bold Headline)</span></SelectItem>
                                        <SelectItem value="'Lobster', cursive"><span style={{fontFamily: "'Lobster', cursive"}}>Lobster (Vintage Script)</span></SelectItem>
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                                <div className="space-y-2">
                                    <Label>Card Elevation (Shadows)</Label>
                                    <Select value={cardElevation} onValueChange={setCardElevation}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Flat (No Shadow)</SelectItem>
                                            <SelectItem value="subtle">Subtle Shadow</SelectItem>
                                            <SelectItem value="glow">Elegant Brand Glow</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-3 border rounded-lg bg-background mt-2">
                                <div className="space-y-0.5">
                                    <Label>Glassmorphism UI</Label>
                                    <p className="text-xs text-muted-foreground">Applies frosted glass effect to navigation</p>
                                </div>
                                <Switch checked={glassmorphism} onCheckedChange={setGlassmorphism} />
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
