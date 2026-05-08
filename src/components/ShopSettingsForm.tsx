import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Store, Upload, X, Facebook, Instagram, Phone, Navigation, Link2, Eye, EyeOff, Check, AlertCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

export const ShopSettingsForm = () => {
    const { profile } = useAuth();
    const { operatingBranchId, branches, activeBranch } = useBranch();
    const mainBranchId = branches.find(b => b.is_main)?.id || null;
    const { hasAccess } = useUserPermissions();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form State
    const [shopName, setShopName] = useState('');
    const [address, setAddress] = useState('');
    const [contactNumber, setContactNumber] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [printerWidth, setPrinterWidth] = useState<'58mm' | '80mm'>('58mm');

    // Menu Slug State
    const [menuSlug, setMenuSlug] = useState('');
    const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

    // Menu Display Options
    const [menuShowShopName, setMenuShowShopName] = useState(true);
    const [menuShowAddress, setMenuShowAddress] = useState(true);
    const [menuShowPhone, setMenuShowPhone] = useState(true);

    // Social Media State
    const [facebook, setFacebook] = useState('');
    const [showFacebook, setShowFacebook] = useState(true);
    const [instagram, setInstagram] = useState('');
    const [showInstagram, setShowInstagram] = useState(true);
    const [whatsapp, setWhatsapp] = useState('');
    const [showWhatsapp, setShowWhatsapp] = useState(true);

    // Nav Settings
    const [visiblePages, setVisiblePages] = useState<string[]>(['dashboard', 'billing', 'serviceArea', 'kitchen', 'tables', 'tableBilling', 'items', 'reports', 'settings', 'customers', 'expenses']);

    useEffect(() => {
        // 1. Instant load from localStorage cache (no loading state)
        const saved = localStorage.getItem('hotel_pos_bill_header');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setShopName(parsed.shopName || '');
                setAddress(parsed.address || '');
                setContactNumber(parsed.contactNumber || '');
                setLogoUrl(parsed.logoUrl || '');
                setPrinterWidth(parsed.printerWidth || '58mm');
                setFacebook(parsed.facebook || '');
                setShowFacebook(parsed.showFacebook !== false);
                setInstagram(parsed.instagram || '');
                setShowInstagram(parsed.showInstagram !== false);
                setWhatsapp(parsed.whatsapp || '');
                setShowWhatsapp(parsed.showWhatsapp !== false);
                if (parsed.visiblePages) setVisiblePages(parsed.visiblePages);
                if (parsed.menuSlug) setMenuSlug(parsed.menuSlug);
                if (parsed.menuShowShopName !== undefined) setMenuShowShopName(parsed.menuShowShopName);
                if (parsed.menuShowAddress !== undefined) setMenuShowAddress(parsed.menuShowAddress);
                if (parsed.menuShowPhone !== undefined) setMenuShowPhone(parsed.menuShowPhone);
            } catch (e) { /* ignore parse errors */ }
        }
        // Always show the form (with cached or empty values)
        setLoading(false);

        // 2. Background sync from Supabase (refetches when active branch changes)
        if (profile?.user_id && operatingBranchId) {
            fetchSettings();
        }
    }, [profile?.user_id, operatingBranchId]);

    const fetchSettings = async () => {
        try {
            // Try current branch first
            let { data, error } = await supabase
                .from('shop_settings')
                .select('*')
                .eq('user_id', profile?.user_id)
                .eq('branch_id', operatingBranchId)
                .maybeSingle();

            // Fallback to main branch row if current branch has none
            if (!data && mainBranchId && mainBranchId !== operatingBranchId) {
                const { data: mainRow } = await supabase
                    .from('shop_settings')
                    .select('*')
                    .eq('user_id', profile?.user_id)
                    .eq('branch_id', mainBranchId)
                    .maybeSingle();
                data = mainRow as any;
            }

            if (error && (error as any).code !== 'PGRST116') throw error;

            if (data) {
                setShopName(data.shop_name || '');
                setAddress(data.address || '');
                setContactNumber(data.contact_number || '');
                setLogoUrl(data.logo_url || '');
                setPrinterWidth((data.printer_width as '58mm' | '80mm') || '58mm');

                setFacebook(data.facebook || '');
                setShowFacebook(data.show_facebook !== false);
                setInstagram(data.instagram || '');
                setShowInstagram(data.show_instagram !== false);
                setWhatsapp(data.whatsapp || '');
                setShowWhatsapp(data.show_whatsapp !== false);
                if ((data as any).visible_nav_pages && Array.isArray((data as any).visible_nav_pages)) {
                    const savedPages = (data as any).visible_nav_pages as string[];
                    // Auto-inject any new pages that didn't exist when the user last saved
                    const requiredNewPages = ['tableBilling'];
                    const updated = [...savedPages];
                    requiredNewPages.forEach(p => { if (!updated.includes(p)) updated.push(p); });
                    setVisiblePages(updated);
                }

                // Menu settings
                if ((data as any).menu_slug) setMenuSlug((data as any).menu_slug);
                if ((data as any).menu_show_shop_name !== undefined) setMenuShowShopName((data as any).menu_show_shop_name);
                if ((data as any).menu_show_address !== undefined) setMenuShowAddress((data as any).menu_show_address);
                if ((data as any).menu_show_phone !== undefined) setMenuShowPhone((data as any).menu_show_phone);

                // Update cache with fresh data from Supabase
                const cacheData = {
                    shopName: data.shop_name || '',
                    address: data.address || '',
                    contactNumber: data.contact_number || '',
                    logoUrl: data.logo_url || '',
                    printerWidth: data.printer_width || '58mm',
                    facebook: data.facebook || '',
                    showFacebook: data.show_facebook !== false,
                    instagram: data.instagram || '',
                    showInstagram: data.show_instagram !== false,
                    whatsapp: data.whatsapp || '',
                    showWhatsapp: data.show_whatsapp !== false,
                    visiblePages: (data as any).visible_nav_pages || ['dashboard', 'billing', 'serviceArea', 'kitchen', 'tables', 'tableBilling', 'items', 'reports', 'settings', 'customers', 'expenses'],
                    menuSlug: (data as any).menu_slug || '',
                    menuShowShopName: (data as any).menu_show_shop_name !== false,
                    menuShowAddress: (data as any).menu_show_address !== false,
                    menuShowPhone: (data as any).menu_show_phone !== false,
                };
                localStorage.setItem('hotel_pos_bill_header', JSON.stringify(cacheData));
            }
        } catch (error) {
            console.error('Error fetching shop settings:', error);
        } finally {
            setLoading(false);
        }
    };

    // Generate slug from shop name
    const generateSlugFromName = () => {
        if (!shopName) return;
        const slug = shopName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 50);
        setMenuSlug(slug);
        checkSlugAvailability(slug);
    };

    // Check if slug is available
    const checkSlugAvailability = async (slug: string) => {
        if (!slug || slug.length < 3) {
            setSlugStatus('idle');
            return;
        }

        setSlugStatus('checking');
        try {
            // Check both shop_settings and branches tables for slug collisions
            const [{ data: ssRows }, { data: brRows }] = await Promise.all([
                supabase.from('shop_settings').select('user_id, branch_id').eq('menu_slug', slug),
                supabase.from('branches').select('id, admin_id').eq('menu_slug', slug),
            ]);

            const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;
            const ssTaken = (ssRows || []).some(
                (r: any) => !(r.user_id === profile?.user_id && r.branch_id === operatingBranchId)
            );
            const brTaken = (brRows || []).some(
                (r: any) => !(r.admin_id === adminId && r.id === operatingBranchId)
            );

            setSlugStatus(ssTaken || brTaken ? 'taken' : 'available');
        } catch (error) {
            console.error('Error checking slug:', error);
            setSlugStatus('idle');
        }
    };

    // Debounced slug check
    useEffect(() => {
        const timer = setTimeout(() => {
            if (menuSlug && menuSlug.length >= 3) {
                checkSlugAvailability(menuSlug);
            } else {
                setSlugStatus('idle');
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [menuSlug]);

    const handleSlugChange = (value: string) => {
        // Only allow lowercase letters, numbers, and hyphens
        const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
        setMenuSlug(sanitized);
    };

    const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) { // 5MB input limit
            toast({
                title: "File too large",
                description: "Please select an image under 5MB",
                variant: "destructive"
            });
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Resize image to max 512px width
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 512;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height = (height * MAX_WIDTH) / width;
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);

                    // Compress to ≤100KB using iterative JPEG quality reduction
                    const TARGET_SIZE = 100 * 1024; // 100KB
                    let quality = 0.9;
                    let dataUrl = canvas.toDataURL('image/jpeg', quality);

                    while (dataUrl.length > TARGET_SIZE * 1.37 && quality > 0.1) {
                        quality -= 0.1;
                        dataUrl = canvas.toDataURL('image/jpeg', quality);
                    }

                    // If still too large, reduce dimensions further
                    if (dataUrl.length > TARGET_SIZE * 1.37 && width > 256) {
                        const scale = 256 / width;
                        canvas.width = 256;
                        canvas.height = height * scale;
                        ctx.drawImage(img, 0, 0, 256, height * scale);
                        dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    }

                    const sizeKB = Math.round(dataUrl.length * 0.75 / 1024);
                    setLogoUrl(dataUrl);
                    toast({
                        title: "✅ Logo Ready",
                        description: `Compressed to ${sizeKB}KB. Shown on menu, bills & receipts.`
                    });
                }
            };
            img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const removeLogo = () => {
        setLogoUrl('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const cleanUrl = (url: string) => {
        if (!url) return '';
        // allow simple usernames or full urls? 
        // User might paste "facebook.com/page" or just "page"
        return url.trim();
    };

    const handleSave = async () => {
        if (!profile?.user_id) return;
        if (!operatingBranchId) {
            toast({ title: 'No branch selected', description: 'Pick a branch from the header first.', variant: 'destructive' });
            return;
        }

        if (menuSlug && slugStatus === 'taken') {
            toast({
                title: "Slug Not Available",
                description: "Please choose a different custom URL",
                variant: "destructive"
            });
            return;
        }

        setSaving(true);

        try {
            const settingsData: any = {
                shop_name: shopName || null,
                address: address || null,
                contact_number: contactNumber || null,
                logo_url: logoUrl || null,
                printer_width: printerWidth,
                facebook: cleanUrl(facebook),
                show_facebook: showFacebook,
                instagram: cleanUrl(instagram),
                show_instagram: showInstagram,
                whatsapp: cleanUrl(whatsapp),
                show_whatsapp: showWhatsapp,
                visible_nav_pages: visiblePages,
                menu_slug: menuSlug || null,
                menu_show_shop_name: menuShowShopName,
                menu_show_address: menuShowAddress,
                menu_show_phone: menuShowPhone,
                updated_at: new Date().toISOString()
            };

            // Find existing row for THIS branch only
            const { data: existing } = await supabase
                .from('shop_settings')
                .select('id')
                .eq('user_id', profile.user_id)
                .eq('branch_id', operatingBranchId)
                .maybeSingle();

            let error: any = null;
            if (existing?.id) {
                ({ error } = await supabase
                    .from('shop_settings')
                    .update(settingsData)
                    .eq('id', existing.id));
            } else {
                ({ error } = await supabase
                    .from('shop_settings')
                    .insert({ ...settingsData, user_id: profile.user_id, branch_id: operatingBranchId }));
            }

            if (error) throw error;

            // Also mirror slug onto the branch row (so /menu/<branch-slug> resolves)
            if (menuSlug) {
                await supabase.from('branches').update({ menu_slug: menuSlug }).eq('id', operatingBranchId);
            }

            // Update Local Cache
            const cacheData = {
                shopName, address, contactNumber, logoUrl, printerWidth,
                facebook, showFacebook, instagram, showInstagram, whatsapp, showWhatsapp, visiblePages,
                menuSlug, menuShowShopName, menuShowAddress, menuShowPhone
            };
            localStorage.setItem('hotel_pos_bill_header', JSON.stringify(cacheData));
            localStorage.setItem('hotel_pos_printer_width', printerWidth);

            // Trigger global event
            window.dispatchEvent(new Event('shop-settings-updated'));
            window.dispatchEvent(new CustomEvent('nav-settings-updated', { detail: visiblePages }));

            toast({
                title: "Settings Saved",
                description: "Shop details updated successfully."
            });
        } catch (error) {
            console.error('Error saving shop settings:', error);
            toast({
                title: "Error",
                description: "Failed to save settings.",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div>Loading settings...</div>;

    // Get the admin ID for menu URL
    const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;
    const menuUrl = menuSlug
        ? `${window.location.origin}/menu/${menuSlug}`
        : `${window.location.origin}/menu/${adminId}`;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Store className="w-5 h-5" />
                    Shop Details & Bill Header
                </CardTitle>
                <CardDescription>
                    Configure how your shop appears on printed receipts.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Shop Name</Label>
                        <Input
                            placeholder="e.g. My Awesome Cafe"
                            value={shopName}
                            onChange={e => setShopName(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Contact Number</Label>
                        <Input
                            placeholder="e.g. +91 98765 43210"
                            value={contactNumber}
                            onChange={e => setContactNumber(e.target.value)}
                        />
                    </div>
                    <div className="col-span-1 md:col-span-2 space-y-2">
                        <Label>Address</Label>
                        <Input
                            placeholder="Shop No. 1, Main Street, City"
                            value={address}
                            onChange={e => setAddress(e.target.value)}
                        />
                    </div>
                </div>

                {/* Logo & Printer Width */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                    <div className="space-y-2">
                        <Label>Shop Logo</Label>
                        <div className="flex items-start gap-4">
                            {logoUrl ? (
                                <div className="relative border rounded-md p-1 w-24 h-24 flex items-center justify-center bg-white">
                                    <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                                    <button
                                        onClick={removeLogo}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow hover:bg-red-600"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-24 h-24 border-2 border-dashed rounded-md flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50"
                                >
                                    <Upload className="w-6 h-6 text-slate-400 mb-1" />
                                    <span className="text-xs text-slate-500">Upload</span>
                                </div>
                            )}
                            <div className="flex-1 space-y-2">
                                <Input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    ref={fileInputRef}
                                    onChange={handleLogoUpload}
                                />
                                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                                    {logoUrl ? "Change Logo" : "Select Image"}
                                </Button>
                                <p className="text-[10px] text-muted-foreground">
                                    Max 5MB input. Auto-compressed to ~100KB.
                                    <br />Used in public menu, bills & receipts.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Printer Paper Width</Label>
                        <Select value={printerWidth} onValueChange={(v: '58mm' | '80mm') => setPrinterWidth(v)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="58mm">58mm (2 inch)</SelectItem>
                                <SelectItem value="80mm">80mm (3 inch)</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            Choose the width of your thermal paper roll.
                        </p>
                    </div>
                </div>

                {/* Social Media Links */}
                <div className="space-y-4 pt-4 border-t">
                    <Label className="text-base font-semibold">Social Media Links on Receipt</Label>

                    <div className="flex items-center gap-4">
                        <Switch checked={showFacebook} onCheckedChange={setShowFacebook} />
                        <div className="flex-1 relative">
                            <Facebook className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Facebook Page Name/Link"
                                value={facebook}
                                onChange={e => setFacebook(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <Switch checked={showInstagram} onCheckedChange={setShowInstagram} />
                        <div className="flex-1 relative">
                            <Instagram className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Instagram Handle (e.g. @mycafe)"
                                value={instagram}
                                onChange={e => setInstagram(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <Switch checked={showWhatsapp} onCheckedChange={setShowWhatsapp} />
                        <div className="flex-1 relative">
                            <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="WhatsApp Number"
                                value={whatsapp}
                                onChange={e => setWhatsapp(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>
                </div>

                {/* Navigation Menu Settings */}
                <div className="space-y-4 pt-4 border-t">
                    <div className="flex items-center gap-2 mb-2">
                        <Navigation className="w-5 h-5" />
                        <Label className="text-base font-semibold">Customise Bottom Navigation</Label>
                    </div>
                    <CardDescription className="mb-4">
                        Select which pages should appear in the mobile bottom navigation bar.
                    </CardDescription>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {[
                            { id: 'analytics', label: 'Analytics' },
                            { id: 'billing', label: 'Billing' },
                            { id: 'serviceArea', label: 'Service' },
                            { id: 'kitchen', label: 'Kitchen' },
                            { id: 'tables', label: 'Tables' },
                            { id: 'tableBilling', label: 'Table Billing' },
                            { id: 'items', label: 'Items' },
                            { id: 'expenses', label: 'Expenses' },
                            { id: 'reports', label: 'Reports' },
                            { id: 'customers', label: 'CRM' },
                            { id: 'qrMenu', label: 'QR Menu' },
                            { id: 'settings', label: 'Settings' }
                        ]
                            .filter(page => hasAccess(page.id as any))
                            .map((page) => (
                                <div key={page.id} className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                                    <Checkbox
                                        id={`nav-${page.id}`}
                                        checked={visiblePages.includes(page.id)}
                                        onCheckedChange={(checked) => {
                                            if (checked) {
                                                setVisiblePages([...visiblePages, page.id]);
                                            } else {
                                                setVisiblePages(visiblePages.filter(p => p !== page.id));
                                            }
                                        }}
                                    />
                                    <Label htmlFor={`nav-${page.id}`} className="cursor-pointer flex-1">
                                        {page.label}
                                    </Label>
                                </div>
                            ))}
                    </div>
                </div>

                <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto">
                    {saving ? "Saving..." : "Save Shop Details"}
                </Button>

            </CardContent>
        </Card>
    );
};
