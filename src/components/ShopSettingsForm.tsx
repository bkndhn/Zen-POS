import { getAppBaseUrl } from '@/utils/urlUtils';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Store, Upload, X, Facebook, Instagram, Phone, Navigation, Link2, Eye, EyeOff, Check, AlertCircle, DollarSign } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { BOTTOM_NAV_OPTIONS, ALL_NAV_ITEMS } from '@/config/navItems';
import { sanitizeString } from '@/utils/sanitization';
import PushNotificationDeviceCard from '@/components/PushNotificationDeviceCard';



export const ShopSettingsForm = () => {
    const { profile , adminProfileId } = useAuth();
    const { operatingBranchId, branches, activeBranch, isAllBranchesView } = useBranch();
    const mainBranchId = branches.find(b => b.is_main)?.id || null;
    const { hasAccess, loading: permissionsLoading } = useUserPermissions();
    // Always use the admin's user_id for shop_settings (sub-users share the admin's settings)
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
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form State
    const [shopName, setShopName] = useState('');
    const [address, setAddress] = useState('');
    const [contactNumber, setContactNumber] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [printerWidth, setPrinterWidth] = useState<'58mm' | '80mm'>('58mm');

    const [autoCut, setAutoCut] = useState<boolean>(true);
    const [paperSavingMode, setPaperSavingMode] = useState<boolean>(false);
    const [upiId, setUpiId] = useState('');
    const [upiName, setUpiName] = useState('');
    const [qrPaymentEnabled, setQrPaymentEnabled] = useState(false);

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
    const [googleReviewUrl, setGoogleReviewUrl] = useState('');
    const [telegram, setTelegram] = useState('');
    const [receiptQrEnabled, setReceiptQrEnabled] = useState(false);
    const [receiptQrType, setReceiptQrType] = useState('payment');
    const [shiftManagementEnabled, setShiftManagementEnabled] = useState(false);
    const [shiftManagementUnlocked, setShiftManagementUnlocked] = useState(false);
    const [remoteOrderFlow, setRemoteOrderFlow] = useState('manual_settle');
    const [fcmUnlocked, setFcmUnlocked] = useState(false);
    const [fcmEnabled, setFcmEnabled] = useState(false);
    const [liveBillPushUnlocked, setLiveBillPushUnlocked] = useState(false);
    // Per-branch live bill push state: { branchId: boolean }
    const [liveBillBranchMap, setLiveBillBranchMap] = useState<Record<string, boolean>>({});
    const [liveBillBranchSettings, setLiveBillBranchSettings] = useState<Array<{id: string; name: string; live_bill_push_enabled: boolean; user_id: string}>>([]);
    const [liveBillDbSettings, setLiveBillDbSettings] = useState<any[]>([]);

    useEffect(() => {
        if (adminAuthUid && branches && branches.length > 0) {
            const merged = branches.map(b => ({
                id: b.id,
                name: b.name,
                live_bill_push_enabled: liveBillDbSettings.find(s => s.branch_id === b.id)?.live_bill_push_enabled ?? false,
                user_id: adminAuthUid
            }));
            setLiveBillBranchSettings(merged);
            const bMap: Record<string, boolean> = {};
            merged.forEach(b => { bMap[b.id] = b.live_bill_push_enabled; });
            setLiveBillBranchMap(bMap);
        }
    }, [branches, liveBillDbSettings, adminAuthUid]);

    const [dailySummaryTime, setDailySummaryTime] = useState<string | null>(null);
    const [nativeAppUnlocked, setNativeAppUnlocked] = useState(false);

    // Nav Settings
    const [visiblePages, setVisiblePages] = useState<string[]>([]);

    useEffect(() => {
        // 1. Instant load from localStorage cache (no loading state)
        const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
        const saved = localStorage.getItem(headerKey);
        
        const savedAutoCut = localStorage.getItem('hotel_pos_auto_cut');
        if (savedAutoCut !== null) {
            setAutoCut(savedAutoCut === 'true');
        }

        const savedPaperSaving = localStorage.getItem('hotel_pos_paper_saving_mode');
        if (savedPaperSaving !== null) {
            setPaperSavingMode(savedPaperSaving === 'true');
        }

        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setShopName(parsed.shopName || '');
                setAddress(parsed.address || '');
                setContactNumber(parsed.contactNumber || '');
                setLogoUrl(parsed.logoUrl || '');
                setPrinterWidth(parsed.printerWidth || '58mm');

                if (parsed.autoCut !== undefined) setAutoCut(parsed.autoCut);
                if (parsed.paperSavingMode !== undefined) setPaperSavingMode(parsed.paperSavingMode);
                setFacebook(parsed.facebook || '');
                setShowFacebook(parsed.showFacebook !== false);
                setInstagram(parsed.instagram || '');
                setShowInstagram(parsed.showInstagram !== false);
                setWhatsapp(parsed.whatsapp || '');
                setShowWhatsapp(parsed.showWhatsapp !== false);
                if (parsed.visiblePages && Array.isArray(parsed.visiblePages) && parsed.visiblePages.length > 0) {
                    setVisiblePages(parsed.visiblePages);
                } else {
                    setVisiblePages(ALL_NAV_ITEMS.filter(i => i.bottomNav).map(i => i.page as string));
                }
                if (parsed.menuSlug) setMenuSlug(parsed.menuSlug);
                if (parsed.menuShowShopName !== undefined) setMenuShowShopName(parsed.menuShowShopName);
                if (parsed.menuShowAddress !== undefined) setMenuShowAddress(parsed.menuShowAddress);
                if (parsed.menuShowPhone !== undefined) setMenuShowPhone(parsed.menuShowPhone);
                if (parsed.upiId) setUpiId(parsed.upiId);
                if (parsed.upiName) setUpiName(parsed.upiName);
                if (parsed.qrPaymentEnabled !== undefined) setQrPaymentEnabled(parsed.qrPaymentEnabled);
                if (parsed.telegram) setTelegram(parsed.telegram);
                if (parsed.receiptQrEnabled !== undefined) setReceiptQrEnabled(parsed.receiptQrEnabled);
                if (parsed.receiptQrType) setReceiptQrType(parsed.receiptQrType);
                if (parsed.shiftManagementEnabled !== undefined) setShiftManagementEnabled(parsed.shiftManagementEnabled);
                if (parsed.shiftManagementUnlocked !== undefined) setShiftManagementUnlocked(parsed.shiftManagementUnlocked);
                if (parsed.remoteOrderFlow) setRemoteOrderFlow(parsed.remoteOrderFlow);
            } catch (e) { /* ignore parse errors */ }
        }
        // Always show the form (with cached or empty values)
        setLoading(false);

        // 2. Background sync from Supabase (refetches when active branch changes)
        if (adminAuthUid && operatingBranchId) {
            fetchSettings();
        }
    }, [adminAuthUid, operatingBranchId]);

    const fetchSettings = async () => {
        try {
            // Fetch current branch slug from branches table
            let branchSlug = '';
            if (operatingBranchId) {
                const { data: branchData } = await supabase
                    .from('branches')
                    .select('menu_slug')
                    .eq('id', operatingBranchId)
                    .maybeSingle();
                if (branchData?.menu_slug) {
                    branchSlug = branchData.menu_slug;
                }
            }

            // Try current branch first
            let { data, error } = await supabase
                .from('shop_settings')
                .select('*')
                .eq('user_id', adminAuthUid)
                .eq('branch_id', operatingBranchId)
                .maybeSingle();

            let isFallback = false;
            // Fallback to main branch row if current branch has none
            if (!data && mainBranchId && mainBranchId !== operatingBranchId) {
                isFallback = true;
                const { data: mainRow } = await supabase
                    .from('shop_settings')
                    .select('*')
                    .eq('user_id', adminAuthUid)
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
                if (data.logo_url && data.logo_url.startsWith('http')) {
                    const img = new Image();
                    img.crossOrigin = 'Anonymous';
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(img, 0, 0);
                            try {
                                const base64DataUrl = canvas.toDataURL('image/png');
                                localStorage.setItem('cached_logo_base64', base64DataUrl);
                            } catch (e) {
                                console.error('Error caching logo base64:', e);
                            }
                        }
                    };
                    img.src = data.logo_url;
                }
                setPrinterWidth((data.printer_width as '58mm' | '80mm') || '58mm');


                setAutoCut(data.auto_cut ?? true);
                setFacebook(data.facebook || '');
                setShowFacebook(data.show_facebook !== false);
                setInstagram(data.instagram || '');
                setShowInstagram(data.show_instagram !== false);
                setWhatsapp(data.whatsapp || '');
                setShowWhatsapp(data.show_whatsapp !== false);
                setGoogleReviewUrl((data as any).google_review_url || localStorage.getItem(`hotel_pos_google_review_url_${operatingBranchId}`) || localStorage.getItem('hotel_pos_google_review_url') || '');
                setUpiId(data.upi_id || '');
                setUpiName(data.upi_name || '');
                setQrPaymentEnabled(data.qr_payment_enabled || false);
                setTelegram(data.telegram || '');
                setReceiptQrEnabled(data.receipt_qr_enabled || false);
                setReceiptQrType(data.receipt_qr_type || 'payment');
                setShiftManagementEnabled((data as any).shift_management_enabled ?? false);
                setShiftManagementUnlocked((data as any).shift_management_unlocked ?? false);
                setRemoteOrderFlow((data as any).remote_order_flow || 'manual_settle');
                setFcmUnlocked((data as any).fcm_unlocked ?? false);
                setFcmEnabled((data as any).fcm_enabled ?? false);
                setLiveBillPushUnlocked((data as any).live_bill_push_unlocked ?? false);
                // Load per-branch live bill settings
                if (adminAuthUid) {
                  const { data: allBranchSettings } = await supabase
                    .from('shop_settings')
                    .select('id, branch_id, live_bill_push_enabled, user_id')
                    .eq('user_id', adminAuthUid);
                  if (allBranchSettings) {
                    setLiveBillDbSettings(allBranchSettings);
                  }
                }
                setDailySummaryTime((data as any).daily_summary_time || null);
                setNativeAppUnlocked((data as any).native_app_unlocked ?? false);
                let resolvedVisiblePages: string[] = [];
                if ((data as any).visible_nav_pages && Array.isArray((data as any).visible_nav_pages) && (data as any).visible_nav_pages.length > 0) {
                    resolvedVisiblePages = (data as any).visible_nav_pages as string[];
                    const isOnlineOrdersAllowed = hasAccess('onlineOrders') && profile?.client_permissions?.['/online-orders'] !== false && profile?.client_permissions?.['allow_online_orders'] !== false;
                    const initKey = `online_orders_init_${adminAuthUid}`;
                    if (isOnlineOrdersAllowed && !resolvedVisiblePages.includes('onlineOrders') && localStorage.getItem(initKey) !== 'dismissed') {
                        resolvedVisiblePages = [...resolvedVisiblePages, 'onlineOrders'];
                    }
                } else {
                    resolvedVisiblePages = ALL_NAV_ITEMS.filter(i => i.bottomNav).map(i => i.page as string);
                }
                setVisiblePages(resolvedVisiblePages);

                // Menu settings
                const resolvedSlug = branchSlug || (isFallback ? '' : ((data as any).menu_slug || ''));
                setMenuSlug(resolvedSlug);
                
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
                    visiblePages: resolvedVisiblePages,
                    menuSlug: resolvedSlug,
                    menuShowShopName: (data as any).menu_show_shop_name !== false,
                    menuShowAddress: (data as any).menu_show_address !== false,
                    menuShowPhone: (data as any).menu_show_phone !== false,
                    upiId: data.upi_id || '',
                    upiName: data.upi_name || '',
                    qrPaymentEnabled: data.qr_payment_enabled || false,
                    telegram: data.telegram || '',
                    receiptQrEnabled: data.receipt_qr_enabled || false,
                    receiptQrType: data.receipt_qr_type || 'payment',
                    autoCut: data.auto_cut ?? true,
                    paperSavingMode: localStorage.getItem('hotel_pos_paper_saving_mode') === 'true',
                };
                const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
                localStorage.setItem(headerKey, JSON.stringify(cacheData));
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

            const adminId = adminProfileId;
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
                    localStorage.setItem('cached_logo_base64', dataUrl);
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
        if (!adminAuthUid) return;
        if (!operatingBranchId) {
            toast({ title: 'No branch selected', description: 'Pick a branch from the header first.', variant: 'destructive' });
            return;
        }

        if (qrPaymentEnabled && (!upiId || !upiId.trim() || !upiName || !upiName.trim())) {
            toast({
                title: "Incomplete UPI Details",
                description: "Merchant UPI ID and Merchant Name are required when UPI payments are enabled.",
                variant: "destructive"
            });
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
            const isMainBranch = operatingBranchId === mainBranchId;
            const initKey = `online_orders_init_${adminAuthUid}`;
            if (!visiblePages.includes('onlineOrders')) {
                localStorage.setItem(initKey, 'dismissed');
            } else {
                localStorage.setItem(initKey, 'auto_added');
            }

            const settingsData: any = {
                shop_name: sanitizeString(shopName || '', 200) || null,
                address: sanitizeString(address || '', 500) || null,
                contact_number: sanitizeString(contactNumber || '', 20) || null,
                logo_url: logoUrl || null,
                printer_width: printerWidth,

                auto_cut: autoCut,
                facebook: cleanUrl(facebook),
                show_facebook: showFacebook,
                instagram: cleanUrl(instagram),
                show_instagram: showInstagram,
                whatsapp: cleanUrl(whatsapp),
                show_whatsapp: showWhatsapp,
                visible_nav_pages: visiblePages,
                menu_slug: isMainBranch ? (menuSlug || null) : null,
                menu_show_shop_name: menuShowShopName,
                menu_show_address: menuShowAddress,
                menu_show_phone: menuShowPhone,
                upi_id: sanitizeString(upiId || '', 100) || null,
                upi_name: sanitizeString(upiName || '', 100) || null,
                qr_payment_enabled: qrPaymentEnabled,
                google_review_url: cleanUrl(googleReviewUrl),
                updated_at: new Date().toISOString()
            };

            if (operatingBranchId) {
                localStorage.setItem(`hotel_pos_google_review_url_${operatingBranchId}`, cleanUrl(googleReviewUrl));
            }
            localStorage.setItem('hotel_pos_google_review_url', cleanUrl(googleReviewUrl));

            // QR receipt fields — these require the migration to have been applied
            const qrFields: any = {
                telegram: cleanUrl(telegram),
                receipt_qr_enabled: receiptQrEnabled,
                receipt_qr_type: receiptQrType,
                    shift_management_enabled: shiftManagementEnabled,
                    remote_order_flow: remoteOrderFlow,
                    fcm_enabled: fcmEnabled,
                    daily_summary_time: dailySummaryTime,
            };

            // Find existing row for THIS branch only
            const { data: existing } = await supabase
                .from('shop_settings')
                .select('id')
                .eq('user_id', adminAuthUid)
                .eq('branch_id', operatingBranchId)
                .maybeSingle();

            // Try saving with QR fields first; if columns don't exist yet, retry without them
            const saveData = { ...settingsData, ...qrFields };
            let error: any = null;
            if (existing?.id) {
                ({ error } = await supabase
                    .from('shop_settings')
                    .update(saveData)
                    .eq('id', existing.id));
            } else {
                ({ error } = await supabase
                    .from('shop_settings')
                    .insert({ ...saveData, user_id: adminAuthUid, branch_id: operatingBranchId }));
            }

            // Fallback: if save failed (likely missing columns), retry without QR fields
            if (error) {
                console.warn('Save with QR fields failed, retrying without:', error.message);
                error = null;
                if (existing?.id) {
                    ({ error } = await supabase
                        .from('shop_settings')
                        .update(settingsData)
                        .eq('id', existing.id));
                } else {
                    ({ error } = await supabase
                        .from('shop_settings')
                        .insert({ ...settingsData, user_id: adminAuthUid, branch_id: operatingBranchId }));
                }
            }

            if (error) {
                console.error("Supabase Save Error Details:", error);
                throw error;
            }

            // Also mirror shop details onto the branch row (for branch-wise isolated print/view/share)
            await supabase.from('branches').update({
                shop_name: shopName || null,
                address: address || null,
                contact_number: contactNumber || null,
                logo_url: logoUrl || null,
                menu_slug: menuSlug || null
            }).eq('id', operatingBranchId);

            // Update Local Cache
            const cacheData = {
                shopName, address, contactNumber, logoUrl, printerWidth, autoCut, paperSavingMode,

                facebook, showFacebook, instagram, showInstagram, whatsapp, showWhatsapp, visiblePages,
                menuSlug, menuShowShopName, menuShowAddress, menuShowPhone,
                upiId, upiName, qrPaymentEnabled, telegram, receiptQrEnabled, receiptQrType
            };
            const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
            localStorage.setItem(headerKey, JSON.stringify(cacheData));
            localStorage.setItem('hotel_pos_printer_width', printerWidth);
            localStorage.setItem('hotel_pos_auto_cut', autoCut ? 'true' : 'false');
            localStorage.setItem('hotel_pos_paper_saving_mode', paperSavingMode ? 'true' : 'false');

            // Trigger global event
            window.dispatchEvent(new Event('shop-settings-updated'));
            window.dispatchEvent(new CustomEvent('nav-settings-updated', { detail: visiblePages }));

            toast({
                title: "Settings Saved",
                description: "Shop details updated successfully."
            });
        } catch (error: any) {
            console.error('Error saving shop settings:', error);
            toast({
                title: "Error",
                description: error?.message || error?.details || "Failed to save settings.",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div>Loading settings...</div>;

    // Get the admin ID for menu URL
    const adminId = adminProfileId;
    const menuUrl = menuSlug
        ? `${getAppBaseUrl()}/menu/${menuSlug}`
        : `${getAppBaseUrl()}/menu/${adminId}`;

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
                        <Label htmlFor="printerWidth">Printer Width</Label>
                        <Select value={printerWidth} onValueChange={(value: '58mm' | '80mm') => setPrinterWidth(value)}>
                            <SelectTrigger id="printerWidth">
                                <SelectValue placeholder="Select printer width" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="58mm">58mm</SelectItem>
                                <SelectItem value="80mm">80mm</SelectItem>
                            </SelectContent>
                        </Select>
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

                    <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Printer Auto Cut</Label>
                                <p className="text-xs text-muted-foreground">
                                    Send cut command at the end of the receipt. If disabled, prints compact spacing for manual tearing.
                                </p>
                            </div>
                            <Switch checked={autoCut} onCheckedChange={setAutoCut} />
                        </div>
                    </div>

                    <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Paper Saving Mode</Label>
                                <p className="text-xs text-muted-foreground">
                                    Omits address, separators, and footers, and prints an ultra-compact receipt to use less thermal paper.
                                </p>
                            </div>
                            <Switch checked={paperSavingMode} onCheckedChange={setPaperSavingMode} />
                        </div>
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

                    <div className="flex items-center gap-4 pt-2 border-t">
                        <div className="flex-1 space-y-1">
                            <Label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                <Navigation className="w-3.5 h-3.5 text-blue-600" />
                                Google Maps Place Review Link (Branch Isolated)
                            </Label>
                            <Input
                                placeholder="e.g. https://g.page/r/your-shop/review"
                                value={googleReviewUrl}
                                onChange={e => setGoogleReviewUrl(e.target.value)}
                                className="text-xs"
                            />
                            <p className="text-[11px] text-slate-500">
                                Prompts happy feedback customers to post a 5-star Google review for this branch!
                            </p>
                        </div>
                    </div>
                </div>

                {/* Dine-In QR Payments (UPI) */}
                <div className="space-y-4 pt-4 border-t">
                    <Label className="text-base font-semibold">Dine-In QR Payments (UPI)</Label>
                    <CardDescription>
                        Enable UPI payment checkouts for self-ordering guest tables. Guests can scan a dynamic QR code or deep-link to pay.
                    </CardDescription>

                    <div className="flex items-center gap-4">
                        <Switch checked={qrPaymentEnabled} onCheckedChange={setQrPaymentEnabled} />
                        <span className="text-sm font-medium">Enable Self-Payment (UPI) Checkout</span>
                    </div>

                    {qrPaymentEnabled && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-0 md:pl-2">
                            <div className="space-y-2">
                                <Label>Merchant UPI ID *</Label>
                                <Input
                                    placeholder="e.g. merchant@upi or 1234567890@okbizaxis"
                                    value={upiId}
                                    onChange={e => setUpiId(e.target.value)}
                                />
                                <p className="text-[10px] text-muted-foreground">
                                    Funds will be routed directly to this UPI address.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Merchant Name (Business Name) *</Label>
                                <Input
                                    placeholder="e.g. Zen Cafe"
                                    value={upiName}
                                    onChange={e => setUpiName(e.target.value)}
                                />
                                <p className="text-[10px] text-muted-foreground">
                                    Shown to customers on their UPI payment screens.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Custom Receipt QR Code */}
                {profile?.client_permissions?.['receipt_qr'] !== false && (
                    <div className="space-y-4 pt-4 border-t">
                        <Label className="text-base font-semibold">Custom Receipt QR Code</Label>
                        <CardDescription>
                            Print a custom QR code at the end of customer receipts for payments or social media follow-ups.
                        </CardDescription>

                        <div className="flex items-center gap-4">
                            <Switch checked={receiptQrEnabled} onCheckedChange={setReceiptQrEnabled} />
                            <span className="text-sm font-medium">Enable Custom QR on Receipt</span>
                        </div>

                        {receiptQrEnabled && (
                            <div className="space-y-4 pl-0 md:pl-2">
                                <div className="space-y-2">
                                    <Label>QR Code Type</Label>
                                    <Select value={receiptQrType} onValueChange={setReceiptQrType}>
                                        <SelectTrigger className="w-full max-w-sm"><SelectValue placeholder="Select type" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="payment">Payment (UPI)</SelectItem>
                                            <SelectItem value="social">Social Media / Website</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {receiptQrType === 'payment' && (
                                    <div className="space-y-3 p-3 bg-muted/30 rounded-md border text-sm">
                                        <p className="text-xs text-muted-foreground">
                                            Enter the <strong>Merchant UPI ID</strong> and <strong>Name</strong> below to generate a scannable payment code containing the exact bill amount.
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                            <div className="space-y-1">
                                                <Label className="text-xs">Merchant UPI ID *</Label>
                                                <Input
                                                    placeholder="e.g. merchant@upi or 1234567890@okbizaxis"
                                                    value={upiId}
                                                    onChange={e => setUpiId(e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Merchant Name (Business Name) *</Label>
                                                <Input
                                                    placeholder="e.g. Zen Cafe"
                                                    value={upiName}
                                                    onChange={e => setUpiName(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {receiptQrType === 'social' && (
                                    <div className="space-y-2 max-w-sm">
                                        <Label>Social / Custom Link URL *</Label>
                                        <Input
                                            placeholder="e.g. https://instagram.com/myhotel"
                                            value={telegram}
                                            onChange={e => setTelegram(e.target.value)}
                                        />
                                        <p className="text-[10px] text-muted-foreground">
                                            Enter a valid URL to encode in the QR code (e.g. WhatsApp chat link, Instagram profile, or Linktree).
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Navigation Menu Settings */}
                {!permissionsLoading && hasAccess('bottomNavCustomize') && (
                    <div className="space-y-4 pt-4 border-t">
                        <div className="flex items-center gap-2 mb-2">
                            <Navigation className="w-5 h-5" />
                            <Label className="text-base font-semibold">Customise Bottom Navigation</Label>
                        </div>
                        <CardDescription className="mb-4">
                            Select which pages should appear in the mobile bottom navigation bar.
                        </CardDescription>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {ALL_NAV_ITEMS.filter(i => i.bottomNav)
                                .filter(item => {
                                    if (profile?.client_permissions) {
                                        if (profile.client_permissions[item.to] === false) return false;
                                        if (item.page === 'onlineOrders' && profile.client_permissions['allow_online_orders'] === false) return false;
                                    }
                                    return true;
                                })
                                .map(item => ({ id: item.page, label: item.shortLabel || item.label }))
                                .filter((v,i,a)=>a.findIndex(t=>(t.id === v.id))===i)
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
                )}


                {/* Add-ons & Features */}
                <Card className="mb-6">
                    <CardHeader className="p-4 pb-2 border-b">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-orange-500" />
                            Add-ons & Features
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Label>Shift & Cash Management</Label>
                                    {!shiftManagementUnlocked && (
                                        <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-[10px]">PRO ADD-ON</Badge>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Require staff to open a shift with opening cash before billing.
                                </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <Switch
                                    checked={shiftManagementEnabled}
                                    onCheckedChange={setShiftManagementEnabled}
                                    disabled={!shiftManagementUnlocked}
                                />
                                {!shiftManagementUnlocked && (
                                    <span className="text-[10px] text-red-500 font-medium">Contact Super Admin to unlock</span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center justify-between pt-4 border-t">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Label>Web Orders Processing</Label>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Auto-Settle generates a bill immediately upon completion. Manual-Settle requires the cashier to settle the bill in POS.
                                </p>
                            </div>
                            <Select value={remoteOrderFlow} onValueChange={setRemoteOrderFlow}>
                                <SelectTrigger className="w-[140px] h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="manual_settle">Manual Settle</SelectItem>
                                    <SelectItem value="auto_settle">Auto Settle</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* Push Notifications (FCM) */}
                <Card className="mb-6">
                    <CardHeader className="p-4 pb-2 border-b">
                        <CardTitle className="text-lg flex items-center gap-2">
                            🔔 Push Notifications
                            {!fcmUnlocked && (
                                <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-[10px]">PRO ADD-ON</Badge>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label>Enable Push Notifications</Label>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Receive alerts for new orders, service requests, low stock and more — even when the app is closed.
                                </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <Switch
                                    checked={fcmEnabled}
                                    onCheckedChange={setFcmEnabled}
                                    disabled={!fcmUnlocked}
                                />
                                {!fcmUnlocked && (
                                    <span className="text-[10px] text-red-500 font-medium">Contact Super Admin to unlock</span>
                                )}
                            </div>
                        </div>
                        {fcmEnabled && fcmUnlocked && <PushNotificationDeviceCard />}
                        {fcmEnabled && fcmUnlocked && (

                            <div className="flex items-center justify-between pt-4 border-t">
                                <div>
                                    <Label>Daily Sales Summary</Label>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Get a summary of total sales, payment breakdown, and top items at your chosen time daily.
                                    </p>
                                </div>
                                <Select value={dailySummaryTime || 'off'} onValueChange={(v) => setDailySummaryTime(v === 'off' ? null : v)}>
                                    <SelectTrigger className="w-[120px] h-8 text-xs">
                                        <SelectValue placeholder="Off" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="off">Off</SelectItem>
                                        <SelectItem value="18:00">6:00 PM</SelectItem>
                                        <SelectItem value="19:00">7:00 PM</SelectItem>
                                        <SelectItem value="20:00">8:00 PM</SelectItem>
                                        <SelectItem value="21:00">9:00 PM</SelectItem>
                                        <SelectItem value="22:00">10:00 PM</SelectItem>
                                        <SelectItem value="23:00">11:00 PM</SelectItem>
                                        <SelectItem value="00:00">12:00 AM</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* 💰 Live Bill Push Per-Branch */}
                {liveBillPushUnlocked && (
                  <Card className="border-amber-200 dark:border-amber-900/40">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            💰 Live Bill Alerts
                            <span className="text-[10px] font-normal bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">Premium</span>
                          </CardTitle>
                          <p className="text-xs text-muted-foreground mt-1">
                            Get notified instantly when a new bill is created. Enable per-branch below.
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Select All / Deselect All */}
                      <div className="flex items-center justify-between p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200">
                        <span className="text-sm font-semibold text-amber-700">All Branches</span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="text-xs text-emerald-600 font-semibold underline"
                            onClick={async () => {
                              const newMap: Record<string, boolean> = {};
                              liveBillBranchSettings.forEach(b => { newMap[b.id] = true; });
                              setLiveBillBranchMap(newMap);
                              for (const b of liveBillBranchSettings) {
                                await (supabase as any).from('shop_settings').update({ live_bill_push_enabled: true }).eq('user_id', b.user_id).eq('branch_id', b.id);
                              }
                            }}
                          >Select All</button>
                          <span className="text-muted-foreground">|</span>
                          <button
                            type="button"
                            className="text-xs text-red-500 font-semibold underline"
                            onClick={async () => {
                              const newMap: Record<string, boolean> = {};
                              liveBillBranchSettings.forEach(b => { newMap[b.id] = false; });
                              setLiveBillBranchMap(newMap);
                              for (const b of liveBillBranchSettings) {
                                await (supabase as any).from('shop_settings').update({ live_bill_push_enabled: false }).eq('user_id', b.user_id).eq('branch_id', b.id);
                              }
                            }}
                          >Deselect All</button>
                        </div>
                      </div>
                      {/* Individual branch toggles */}
                      {liveBillBranchSettings.map(branch => (
                        <div key={branch.id} className="flex items-center justify-between p-3 rounded-lg border bg-slate-50 dark:bg-slate-800/50">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{branch.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {liveBillBranchMap[branch.id] ? '✅ Alerts ON' : '⭕ Alerts OFF'}
                            </span>
                          </div>
                          <Switch
                            checked={liveBillBranchMap[branch.id] ?? false}
                            onCheckedChange={async (val) => {
                              setLiveBillBranchMap(prev => ({ ...prev, [branch.id]: val }));
                              await (supabase as any).from('shop_settings').update({ live_bill_push_enabled: val }).eq('user_id', branch.user_id).eq('branch_id', branch.id);
                            }}
                          />
                        </div>
                      ))}
                      {liveBillBranchSettings.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">No branches found.</p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* ─── Mobile App ─── */}

                <Card className="border-orange-200 dark:border-orange-900/40">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            📱 Mobile App
                            {!nativeAppUnlocked && profile?.role !== 'super_admin' && (
                                <span className="text-[10px] bg-orange-500 text-white rounded-full px-2 py-0.5 font-bold uppercase">Pro Add-on</span>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {(nativeAppUnlocked || profile?.role === 'super_admin') ? (
                            <>
                                <p className="text-sm text-muted-foreground">
                                    Download and install the ZenPOS Android app for the best experience — instant notifications, offline billing, and Bluetooth printing.
                                </p>
                                <div className="flex flex-wrap gap-3">
                                    <Button
                                        variant="outline"
                                        className="gap-2"
                                        onClick={async () => {
                                            try {
                                                const { data } = await supabase.storage
                                                    .from('app-releases')
                                                    .createSignedUrl('zenpos-latest.apk', 3600);
                                                if (data?.signedUrl) {
                                                    window.open(data.signedUrl, '_blank');
                                                } else {
                                                    toast({ title: 'APK not available yet', description: 'Please contact support.', variant: 'destructive' });
                                                }
                                            } catch {
                                                toast({ title: 'Download failed', variant: 'destructive' });
                                            }
                                        }}
                                    >
                                        ⬇️ Download APK
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="gap-2 text-muted-foreground"
                                        onClick={async () => {
                                            try {
                                                const { data } = await supabase.storage
                                                    .from('app-releases')
                                                    .createSignedUrl('zenpos-latest.apk', 86400);
                                                if (data?.signedUrl) {
                                                    await navigator.clipboard.writeText(data.signedUrl);
                                                    toast({ title: 'Download link copied! Share with your staff.' });
                                                } else {
                                                    toast({ title: 'APK not available yet', variant: 'destructive' });
                                                }
                                            } catch {
                                                toast({ title: 'Failed to copy link', variant: 'destructive' });
                                            }
                                        }}
                                    >
                                        🔗 Share Link with Staff
                                    </Button>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    After downloading, open the APK file to install. You may need to enable &quot;Install from unknown sources&quot; in your device settings.
                                </p>
                            </>
                        ) : (
                            <p className="text-sm text-orange-600 dark:text-orange-400">
                                Contact Super Admin to unlock native app access for your account.
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Button onClick={handleSave} disabled={saving || isAllBranchesView} className="w-full md:w-auto">
                    {saving ? 'Saving...' : 'Save Shop Details'}
                </Button>

            </CardContent>
        </Card>
    );
};
