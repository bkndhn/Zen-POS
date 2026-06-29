import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import {
    QrCode,
    Copy,
    Download,
    Share2,
    ExternalLink,
    Table2,
    Printer,
    Check,
    Link2,
    Eye,
    AlertCircle,
    Store,
    MapPin,
    Phone,
    Palette,
    LayoutGrid,
    Navigation,
    X,
    Loader2
} from 'lucide-react';
import { PromoBannerManager } from '@/components/PromoBannerManager';
import { MenuDesignStudio } from '@/components/MenuDesignStudio';

// Simple QR Code generator using a public API
const generateQRCodeUrl = (text: string, size: number = 300, fgColor: string = '1a1a6c', bgColor: string = 'ffffff'): string => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&margin=10&color=${fgColor}&bgcolor=${bgColor}`;
};

const QRCodeSettings = () => {
    const { profile } = useAuth();
    const { operatingBranchId, branches } = useBranch();
    const operatingBranch = branches.find(b => b.id === operatingBranchId) || null;
    const isMainBranch = !!operatingBranch?.is_main;
    const [copied, setCopied] = useState(false);
    const [tableMode, setTableMode] = useState(false);
    const [dbTables, setDbTables] = useState<any[]>([]);
    const [tablesLoading, setTablesLoading] = useState(false);
    const [selectedTable, setSelectedTable] = useState<number | null>(null);
    const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
    const [qrDownloadMode, setQrDownloadMode] = useState<'poster' | 'qr_only'>('poster');
    const qrRef = useRef<HTMLImageElement>(null);

    // Custom URL State
    const [menuSlug, setMenuSlug] = useState('');
    const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
    const slugTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Menu Display Options
    const [menuShowShopName, setMenuShowShopName] = useState(true);
    const [menuShowAddress, setMenuShowAddress] = useState(true);
    const [menuShowPhone, setMenuShowPhone] = useState(true);

    // Menu Appearance Options
    const [menuPrimaryColor, setMenuPrimaryColor] = useState('#f97316');
    const [menuSecondaryColor, setMenuSecondaryColor] = useState('#ea580c');
    const [menuBackgroundColor, setMenuBackgroundColor] = useState('#fffbeb');
    const [menuTextColor, setMenuTextColor] = useState('#1c1917');
    const [menuItemsPerRow, setMenuItemsPerRow] = useState(1);

    // Shop Location for Google Maps
    const [shopLatitude, setShopLatitude] = useState<number | null>(null);
    const [shopLongitude, setShopLongitude] = useState<number | null>(null);
    const [locationLoading, setLocationLoading] = useState(false);
    const [locationError, setLocationError] = useState<string | null>(null);

    // Determine the admin ID to use for the menu URL
    const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;

    // Base menu URL (uses custom slug if available, otherwise admin ID)
    const baseUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/menu/${menuSlug || adminId}`
        : '';

    // Current QR URL (with optional table and seat)
    const currentQrUrl = selectedTable
        ? (selectedSeat ? `${baseUrl}?table=${selectedTable}&seat=${selectedSeat}` : `${baseUrl}?table=${selectedTable}`)
        : baseUrl;

    // Load settings from localStorage and Supabase
    useEffect(() => {
        const loadSettings = async () => {
            // First load from localStorage for instant display
            const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
            const saved = localStorage.getItem(headerKey) ?? localStorage.getItem('hotel_pos_bill_header');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed.menuSlug) setMenuSlug(parsed.menuSlug);
                    if (parsed.menuShowShopName !== undefined) setMenuShowShopName(parsed.menuShowShopName);
                    if (parsed.menuShowAddress !== undefined) setMenuShowAddress(parsed.menuShowAddress);
                    if (parsed.menuShowPhone !== undefined) setMenuShowPhone(parsed.menuShowPhone);
                } catch (e) { /* ignore */ }
            }

            // Then sync from Supabase (branch-scoped read with fallback to main branch)
            if (adminId) {
                let { data } = await (supabase as any)
                    .from('shop_settings')
                    .select('menu_slug, menu_show_shop_name, menu_show_address, menu_show_phone, menu_primary_color, menu_secondary_color, menu_background_color, menu_text_color, menu_items_per_row, shop_latitude, shop_longitude')
                    .eq('user_id', adminId)
                    .eq('branch_id', operatingBranchId)
                    .maybeSingle();

                // Fallback: any row for this user (legacy / main-branch values)
                if (!data) {
                    const { data: fb } = await (supabase as any)
                        .from('shop_settings')
                        .select('menu_slug, menu_show_shop_name, menu_show_address, menu_show_phone, menu_primary_color, menu_secondary_color, menu_background_color, menu_text_color, menu_items_per_row, shop_latitude, shop_longitude')
                        .eq('user_id', adminId)
                        .order('branch_id', { nullsFirst: false })
                        .limit(1)
                        .maybeSingle();
                    data = fb;
                }

                if (data) {
                    if (data.menu_show_shop_name !== undefined) setMenuShowShopName(data.menu_show_shop_name);
                    if (data.menu_show_address !== undefined) setMenuShowAddress(data.menu_show_address);
                    if (data.menu_show_phone !== undefined) setMenuShowPhone(data.menu_show_phone);
                    if (data.menu_primary_color) setMenuPrimaryColor(data.menu_primary_color);
                    if (data.menu_secondary_color) setMenuSecondaryColor(data.menu_secondary_color);
                    if (data.menu_background_color) setMenuBackgroundColor(data.menu_background_color);
                    if (data.menu_text_color) setMenuTextColor(data.menu_text_color);
                    if (data.menu_items_per_row) setMenuItemsPerRow(data.menu_items_per_row);
                    if (data.shop_latitude) setShopLatitude(data.shop_latitude);
                    if (data.shop_longitude) setShopLongitude(data.shop_longitude);
                }

                // Slug source depends on branch:
                // - Main branch → shop_settings.menu_slug (legacy admin-wide)
                // - Sub-branch → branches.menu_slug (per-branch)
                if (operatingBranchId) {
                    if (isMainBranch) {
                        if (data?.menu_slug) setMenuSlug(data.menu_slug);
                    } else {
                        const { data: br } = await (supabase as any)
                            .from('branches')
                            .select('menu_slug')
                            .eq('id', operatingBranchId)
                            .maybeSingle();
                        setMenuSlug(br?.menu_slug || '');
                    }
                }
            }
            setTimeout(() => { isAppearanceLoadedRef.current = true; }, 200);
        };
        loadSettings();
    }, [profile?.user_id, operatingBranchId, isMainBranch]);

    // Fetch tables from database (single source of truth = Table Management) — branch-scoped
    const fetchTables = useCallback(async () => {
        if (!adminId) return;
        setTablesLoading(true);
        try {
            let q: any = (supabase as any)
                .from('tables')
                .select('id, table_number, branch_id, has_seats, seat_count, seat_configuration')
                .eq('admin_id', adminId)
                .eq('is_active', true);
            if (operatingBranchId) q = q.eq('branch_id', operatingBranchId);
            const { data } = await q.order('table_number', { ascending: true });
            if (data) setDbTables(data);
        } catch (e) {
            console.warn('[QRSettings] Failed to fetch tables:', e);
        } finally {
            setTablesLoading(false);
        }
    }, [adminId, operatingBranchId]);

    useEffect(() => {
        if (tableMode) fetchTables();
    }, [tableMode, fetchTables]);

    // Save settings when changed (branch-scoped)
    const saveSettings = async () => {
        if (!adminAuthUid) return;
        // Save to localStorage immediately
        const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
        const saved = localStorage.getItem(headerKey) ?? localStorage.getItem('hotel_pos_bill_header');
        const parsed = saved ? JSON.parse(saved) : {};
        parsed.menuSlug = menuSlug;
        parsed.menuShowShopName = menuShowShopName;
        parsed.menuShowAddress = menuShowAddress;
        parsed.menuShowPhone = menuShowPhone;
        localStorage.setItem(headerKey, JSON.stringify(parsed));

        if (!profile?.user_id) return;

        // Persist appearance + display settings to shop_settings (per-branch row)
        // Only the main branch keeps the slug in shop_settings (legacy admin-wide).
        const ssPayload: any = {
            user_id: adminAuthUid || profile.user_id,
            branch_id: operatingBranchId,
            menu_show_shop_name: menuShowShopName,
            menu_show_address: menuShowAddress,
            menu_show_phone: menuShowPhone,
            menu_primary_color: menuPrimaryColor,
            menu_secondary_color: menuSecondaryColor,
            menu_background_color: menuBackgroundColor,
            menu_text_color: menuTextColor,
            menu_items_per_row: menuItemsPerRow,
            shop_latitude: shopLatitude,
            shop_longitude: shopLongitude,
        };
        if (isMainBranch) ssPayload.menu_slug = menuSlug || null;

        // Find existing branch row to update; otherwise insert
        const { data: existing } = await (supabase as any)
            .from('shop_settings')
            .select('id')
            .eq('user_id', adminAuthUid || profile.user_id)
            .eq('branch_id', operatingBranchId)
            .maybeSingle();

        if (existing?.id) {
            await (supabase as any).from('shop_settings').update(ssPayload).eq('id', existing.id);
        } else {
            await (supabase as any).from('shop_settings').insert(ssPayload);
        }

        // Sub-branch slug → store on branches.menu_slug
        if (operatingBranchId && !isMainBranch) {
            await (supabase as any)
                .from('branches')
                .update({ menu_slug: menuSlug || null })
                .eq('id', operatingBranchId);
        }

        // Broadcast settings change to all PublicMenu listeners
        const settingsChannel = supabase.channel(`menu-settings-${profile.id}`);
        await settingsChannel.send({
            type: 'broadcast',
            event: 'menu-settings-updated',
            payload: {
                menu_show_shop_name: menuShowShopName,
                menu_show_address: menuShowAddress,
                menu_show_phone: menuShowPhone,
                menu_primary_color: menuPrimaryColor,
                menu_secondary_color: menuSecondaryColor,
                menu_background_color: menuBackgroundColor,
                menu_text_color: menuTextColor,
                menu_items_per_row: menuItemsPerRow,
            }
        });
        supabase.removeChannel(settingsChannel);
    };

    // Get current location using browser geo-location with progressive retry
    const pinCurrentLocation = async () => {
        // First check if geolocation is supported
        if (!navigator.geolocation) {
            setLocationError('Geolocation is not supported by your browser. Use manual entry below.');
            toast({ title: 'Error', description: 'Geolocation not supported. Use manual entry.', variant: 'destructive' });
            return;
        }

        setLocationLoading(true);
        setLocationError(null);

        // Helper to get position as a promise
        const getPosition = (highAccuracy: boolean, timeout: number): Promise<GeolocationPosition> => {
            return new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: highAccuracy,
                    timeout,
                    maximumAge: 60000
                });
            });
        };

        try {
            // Try 1: Network location (fast)
            let position: GeolocationPosition;
            try {
                position = await getPosition(false, 10000);
            } catch (err1: any) {
                if (err1?.code === 1) {
                    // Permission denied — try to re-request by building a fresh prompt
                    // On some browsers, we can trigger re-prompt by catching and retrying
                    throw err1; // Don't retry if denied
                }
                // Try 2: GPS (more accurate, slower)
                try {
                    position = await getPosition(true, 20000);
                } catch (err2: any) {
                    throw err2;
                }
            }

            setShopLatitude(position.coords.latitude);
            setShopLongitude(position.coords.longitude);
            setLocationLoading(false);
            setLocationError(null);
            toast({ title: '📍 Location Pinned!', description: `Lat: ${position.coords.latitude.toFixed(5)}, Lng: ${position.coords.longitude.toFixed(5)}` });
            setTimeout(() => saveSettings(), 500);
        } catch (error: any) {
            setLocationLoading(false);
            if (error?.code === 1) {
                // Permission denied
                setLocationError('Location permission denied. Please allow location access:');
                toast({
                    title: 'Permission Denied',
                    description: 'Tap the lock icon (🔒) in your browser address bar → Permissions → Location → Allow, then try again.',
                    variant: 'destructive',
                    duration: 8000
                });
            } else if (error?.code === 2) {
                setLocationError('GPS unavailable. Please enable GPS/Location in your phone settings, or use manual entry below.');
                toast({ title: 'GPS Unavailable', description: 'Enable GPS in phone settings or enter manually.', variant: 'destructive' });
            } else {
                setLocationError('Location request timed out. Ensure GPS is enabled, then try again. Or use manual entry.');
                toast({ title: 'Timeout', description: 'Please try again or enter coordinates manually.', variant: 'destructive' });
            }
        }
    };

    const clearLocation = () => {
        setShopLatitude(null);
        setShopLongitude(null);
        toast({ title: 'Location Cleared', description: 'Shop location has been removed' });
        setTimeout(() => saveSettings(), 500);
    };

    // Debounced slug availability check
    const checkSlugAvailability = async (slug: string) => {
        if (!slug || slug.length < 2) {
            setSlugStatus('idle');
            return;
        }

        setSlugStatus('checking');

        try {
            // Check shop_settings (admin-wide / main-branch slugs)
            const { data: ssRow } = await (supabase as any)
                .from('shop_settings')
                .select('user_id')
                .eq('menu_slug', slug)
                .neq('user_id', adminId || profile?.user_id || '')
                .maybeSingle();

            // Check branches (per-branch slugs)
            let brQ: any = (supabase as any)
                .from('branches')
                .select('id')
                .eq('menu_slug', slug);
            if (operatingBranchId) brQ = brQ.neq('id', operatingBranchId);
            const { data: brRow } = await brQ.maybeSingle();

            if (ssRow || brRow) setSlugStatus('taken');
            else setSlugStatus('available');
        } catch (err) {
            console.error('Error checking slug:', err);
            setSlugStatus('idle');
        }
    };

    const handleSlugChange = (value: string) => {
        // Sanitize slug: lowercase, no spaces, alphanumeric and hyphens only
        const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
        setMenuSlug(sanitized);

        // Debounce the availability check
        if (slugTimeoutRef.current) clearTimeout(slugTimeoutRef.current);
        slugTimeoutRef.current = setTimeout(() => {
            checkSlugAvailability(sanitized);
        }, 500);
    };

    const generateSlugFromName = async () => {
        // Get shop name from localStorage
        const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
        const saved = localStorage.getItem(headerKey) ?? localStorage.getItem('hotel_pos_bill_header');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.shopName) {
                const slug = parsed.shopName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
                handleSlugChange(slug);
            }
        }
    };

    // Handle toggle changes with auto-save
    const handleDisplayOptionChange = async (option: 'shopName' | 'address' | 'phone', value: boolean) => {
        if (option === 'shopName') setMenuShowShopName(value);
        if (option === 'address') setMenuShowAddress(value);
        if (option === 'phone') setMenuShowPhone(value);

        // Auto-save after a short delay
        setTimeout(() => saveSettings(), 100);
    };

    // Save slug when it changes and is available
    useEffect(() => {
        if (slugStatus === 'available') {
            saveSettings();
        }
    }, [slugStatus]);

    // Auto-save appearance settings when changed (after initial load)
    const isAppearanceLoadedRef = useRef(false);
    useEffect(() => {
        // Skip saves until initial data has been loaded from DB
        if (!isAppearanceLoadedRef.current) return;
        // Save when any appearance setting changes
        saveSettings();
    }, [menuPrimaryColor, menuSecondaryColor, menuBackgroundColor, menuTextColor, menuItemsPerRow]);

    // Copy link to clipboard
    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(currentQrUrl);
            setCopied(true);
            toast({
                title: "Link copied!",
                description: "Menu link copied to clipboard",
            });
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            toast({
                title: "Copy failed",
                description: "Please copy the link manually",
                variant: "destructive"
            });
        }
    };

    // Download QR code as a premium branded card
    const handleDownloadQR = async () => {
        try {
            const qrSize = 600;
            const qrUrl = generateQRCodeUrl(currentQrUrl, qrSize, '1a1a6c');

            const img = new Image();
            img.crossOrigin = 'anonymous';

            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = qrUrl;
            });

            // Create canvas for 10x18 inch poster (1080x1944 pixels)
            const cardWidth = 1080;
            const cardHeight = 1944;
            
            // Handle QR Only Mode
            if (qrDownloadMode === 'qr_only') {
                const qrCanvas = document.createElement('canvas');
                qrCanvas.width = qrSize;
                qrCanvas.height = qrSize;
                const qrCtx = qrCanvas.getContext('2d');
                if (qrCtx) qrCtx.drawImage(img, 0, 0, qrSize, qrSize);

                qrCanvas.toBlob((blob) => {
                    if (!blob) throw new Error('Could not create blob');
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = selectedTable
                        ? (selectedSeat ? `raw-qr-table-${selectedTable}-seat-${selectedSeat}.png` : `raw-qr-table-${selectedTable}.png`)
                        : 'raw-qr-code.png';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    toast({ title: "Downloaded!", description: `Raw QR saved as ${a.download}` });
                }, 'image/png');
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = cardWidth;
            canvas.height = cardHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas not supported');

            // 1. Draw Background Gradient using custom Theme Colors
            const grad = ctx.createLinearGradient(0, 0, 0, cardHeight);
            grad.addColorStop(0, menuPrimaryColor); // Primary Brand Color
            grad.addColorStop(1, menuSecondaryColor); // Secondary Brand Color
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, cardWidth, cardHeight);

            // 2. Draw Top Curved Header (White)
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(cardWidth, 0);
            ctx.lineTo(cardWidth, 400);
            ctx.quadraticCurveTo(cardWidth / 2, 550, 0, 400); // Curved bottom
            ctx.fill();

            // 3. Draw Shop Name in Header
            const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
            const shopNameStr = localStorage.getItem(headerKey) ?? localStorage.getItem('hotel_pos_bill_header');
            let displayName = 'Our Restaurant';
            if (shopNameStr) {
                try {
                    const parsed = JSON.parse(shopNameStr);
                    if (parsed.shopName) displayName = parsed.shopName;
                } catch { }
            }
            
            ctx.fillStyle = '#1e293b'; // Slate 800
            ctx.font = 'bold 72px Arial, sans-serif';
            ctx.textAlign = 'center';
            // Handle long names
            const maxTextWidth = cardWidth - 100;
            if (ctx.measureText(displayName).width > maxTextWidth) {
                ctx.font = 'bold 56px Arial, sans-serif';
            }
            ctx.fillText(displayName.toUpperCase(), cardWidth / 2, 220);
            
            // "Scan & Order" text
            ctx.fillStyle = '#f97316';
            ctx.font = 'bold 36px Arial, sans-serif';
            ctx.fillText('SCAN & ORDER', cardWidth / 2, 300);

            // 4. Draw QR Code Container (White Rounded Box with Shadow)
            const containerW = qrSize + 100;
            const containerH = qrSize + 100;
            const containerX = (cardWidth - containerW) / 2;
            const containerY = 700;
            const radius = 40;

            ctx.shadowColor = 'rgba(0,0,0,0.3)';
            ctx.shadowBlur = 30;
            ctx.shadowOffsetY = 15;
            ctx.fillStyle = '#ffffff';
            
            ctx.beginPath();
            ctx.moveTo(containerX + radius, containerY);
            ctx.lineTo(containerX + containerW - radius, containerY);
            ctx.quadraticCurveTo(containerX + containerW, containerY, containerX + containerW, containerY + radius);
            ctx.lineTo(containerX + containerW, containerY + containerH - radius);
            ctx.quadraticCurveTo(containerX + containerW, containerY + containerH, containerX + containerW - radius, containerY + containerH);
            ctx.lineTo(containerX + radius, containerY + containerH);
            ctx.quadraticCurveTo(containerX, containerY + containerH, containerX, containerY + containerH - radius);
            ctx.lineTo(containerX, containerY + radius);
            ctx.quadraticCurveTo(containerX, containerY, containerX + radius, containerY);
            ctx.closePath();
            ctx.fill();

            // Reset shadow
            ctx.shadowColor = 'transparent';


            // 5. Draw QR code
            ctx.drawImage(img, containerX + 50, containerY + 50, qrSize, qrSize);

            // 6. Draw Table and Seat Number
            if (selectedTable) {
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 80px Arial, sans-serif';
                ctx.textAlign = 'center';
                const labelText = selectedSeat ? `TABLE ${selectedTable} - SEAT ${selectedSeat}` : `TABLE ${selectedTable}`;
                ctx.fillText(labelText, cardWidth / 2, 1600);
            }

            // 7. Footer Instructions
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.font = 'bold 42px Arial, sans-serif';
            ctx.fillText('HOW TO VIEW MENU', cardWidth / 2, 1750);
            
            ctx.font = '28px Arial, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.fillText('1. Open Camera or Google Lens', cardWidth / 2, 1810);
            ctx.fillText('2. Scan the QR Code above', cardWidth / 2, 1855);
            ctx.fillText('3. Tap the link to view Menu & Order', cardWidth / 2, 1900);

            // Convert to blob and download
            canvas.toBlob((blob) => {
                if (!blob) throw new Error('Could not create blob');
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = selectedTable
                    ? (selectedSeat ? `menu-qr-table-${selectedTable}-seat-${selectedSeat}.png` : `menu-qr-table-${selectedTable}.png`)
                    : 'menu-qr-code.png';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                toast({
                    title: "Downloaded!",
                    description: `QR code saved as ${a.download}`,
                });
            }, 'image/png');
        } catch (err) {
            console.error('QR download error:', err);
            window.open(generateQRCodeUrl(currentQrUrl, 500), '_blank');
            toast({
                title: "Manual Download",
                description: "Right-click the image and save it",
            });
        }
    };

    // Download all table QR codes as premium branded cards
    const handleDownloadAllTableQRs = async () => {
        if (dbTables.length === 0) return;

        // Calculate total count (tables + seats)
        let totalQRs = 0;
        dbTables.forEach(t => {
            if (t.has_seats && Array.isArray(t.seat_configuration) && t.seat_configuration.length > 0) {
                totalQRs += t.seat_configuration.length;
            } else {
                totalQRs += 1;
            }
        });

        toast({
            title: "Downloading...",
            description: `Generating ${totalQRs} premium QR cards with table and seat numbers`,
        });

        let successCount = 0;

        // Color schemes for table QRs (cycle through)
        const tableColors = [
            { grad1: '#667eea', grad2: '#764ba2', qr: '1a1a6c' },
            { grad1: '#f093fb', grad2: '#f5576c', qr: '8b1a6c' },
            { grad1: '#4facfe', grad2: '#00f2fe', qr: '0a4a6c' },
            { grad1: '#43e97b', grad2: '#38f9d7', qr: '0a6c3a' },
            { grad1: '#fa709a', grad2: '#fee140', qr: '6c1a2a' },
            { grad1: '#a18cd1', grad2: '#fbc2eb', qr: '4a1a6c' },
            { grad1: '#fccb90', grad2: '#d57eeb', qr: '6c4a1a' },
            { grad1: '#e0c3fc', grad2: '#8ec5fc', qr: '2a1a6c' },
        ];

        // Get shop name
        const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
        const shopNameStr = localStorage.getItem(headerKey) ?? localStorage.getItem('hotel_pos_bill_header');
        let displayName = 'Scan Our Menu';
        if (shopNameStr) {
            try {
                const parsed = JSON.parse(shopNameStr);
                if (parsed.shopName) displayName = parsed.shopName;
            } catch { }
        }

        for (let idx = 0; idx < dbTables.length; idx++) {
            const tbl = dbTables[idx];
            const tableNum = tbl.table_number;
            
            const seats = tbl.has_seats && Array.isArray(tbl.seat_configuration) ? (tbl.seat_configuration as string[]) : [];
            const targets = seats.length > 0
                ? seats.map(s => ({ seat: s, url: `${baseUrl}?table=${tableNum}&seat=${s}`, label: `Table ${tableNum} - Seat ${s}`, file: `menu-qr-table-${tableNum}-seat-${s}.png` }))
                : [{ seat: null, url: `${baseUrl}?table=${tableNum}`, label: `Table ${tableNum}`, file: `menu-qr-table-${tableNum}.png` }];

            for (const target of targets) {
                const color = tableColors[successCount % tableColors.length];
                const qrSize = 600;
                try {
                    const qrUrl = generateQRCodeUrl(target.url, qrSize, color.qr);

                    const img = new Image();
                    img.crossOrigin = 'anonymous';

                    await new Promise<void>((resolve, reject) => {
                        img.onload = () => resolve();
                        img.onerror = reject;
                        img.src = qrUrl;
                    });

                    const cardWidth = 1080;
                    const cardHeight = 1944;
                    
                    // Handle QR Only Mode
                    if (qrDownloadMode === 'qr_only') {
                        const qrCanvas = document.createElement('canvas');
                        qrCanvas.width = qrSize;
                        qrCanvas.height = qrSize;
                        const qrCtx = qrCanvas.getContext('2d');
                        if (qrCtx) qrCtx.drawImage(img, 0, 0, qrSize, qrSize);

                        await new Promise<void>((resolve) => {
                            qrCanvas.toBlob((blob) => {
                                if (blob) {
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `raw-${target.file}`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                    successCount++;
                                }
                                resolve();
                            }, 'image/png');
                        });
                        
                        await new Promise(r => setTimeout(r, 300));
                        continue;
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = cardWidth;
                    canvas.height = cardHeight;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error('Canvas not supported');

                    // Background Gradient using Custom Theme Colors
                    const grad = ctx.createLinearGradient(0, 0, 0, cardHeight);
                    grad.addColorStop(0, menuPrimaryColor);
                    grad.addColorStop(1, menuSecondaryColor);
                    ctx.fillStyle = grad;
                    ctx.fillRect(0, 0, cardWidth, cardHeight);

                    // Top Curved Header
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(cardWidth, 0);
                    ctx.lineTo(cardWidth, 400);
                    ctx.quadraticCurveTo(cardWidth / 2, 550, 0, 400);
                    ctx.fill();

                    // Shop Name
                    ctx.fillStyle = '#1e293b';
                    ctx.font = 'bold 72px Arial, sans-serif';
                    ctx.textAlign = 'center';
                    const maxTextWidth = cardWidth - 100;
                    if (ctx.measureText(displayName).width > maxTextWidth) {
                        ctx.font = 'bold 56px Arial, sans-serif';
                    }
                    ctx.fillText(displayName.toUpperCase(), cardWidth / 2, 220);
                    
                    ctx.fillStyle = color.grad1;
                    ctx.font = 'bold 36px Arial, sans-serif';
                    ctx.fillText('SCAN & ORDER', cardWidth / 2, 300);

                    // QR Container
                    const containerW = qrSize + 100;
                    const containerH = qrSize + 100;
                    const containerX = (cardWidth - containerW) / 2;
                    const containerY = 700;
                    const radius = 40;

                    ctx.shadowColor = 'rgba(0,0,0,0.3)';
                    ctx.shadowBlur = 30;
                    ctx.shadowOffsetY = 15;
                    ctx.fillStyle = '#ffffff';
                    
                    ctx.beginPath();
                    ctx.moveTo(containerX + radius, containerY);
                    ctx.lineTo(containerX + containerW - radius, containerY);
                    ctx.quadraticCurveTo(containerX + containerW, containerY, containerX + containerW, containerY + radius);
                    ctx.lineTo(containerX + containerW, containerY + containerH - radius);
                    ctx.quadraticCurveTo(containerX + containerW, containerY + containerH, containerX + containerW - radius, containerY + containerH);
                    ctx.lineTo(containerX + radius, containerY + containerH);
                    ctx.quadraticCurveTo(containerX, containerY + containerH, containerX, containerY + containerH - radius);
                    ctx.lineTo(containerX, containerY + radius);
                    ctx.quadraticCurveTo(containerX, containerY, containerX + radius, containerY);
                    ctx.closePath();
                    ctx.fill();

                    ctx.shadowColor = 'transparent';

                    // QR Image
                    ctx.drawImage(img, containerX + 50, containerY + 50, qrSize, qrSize);

                    // Table Label
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 80px Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(target.label.toUpperCase(), cardWidth / 2, 1600);

                    // Footer Instructions
                    ctx.fillStyle = 'rgba(255,255,255,0.95)';
                    ctx.font = 'bold 42px Arial, sans-serif';
                    ctx.fillText('HOW TO VIEW MENU', cardWidth / 2, 1750);
                    
                    ctx.font = '28px Arial, sans-serif';
                    ctx.fillStyle = 'rgba(255,255,255,0.8)';
                    ctx.fillText('1. Open Camera or Google Lens', cardWidth / 2, 1810);
                    ctx.fillText('2. Scan the QR Code above', cardWidth / 2, 1855);
                    ctx.fillText('3. Tap the link to view Menu & Order', cardWidth / 2, 1900);

                    // Convert to blob and download
                    await new Promise<void>((resolve) => {
                        canvas.toBlob((blob) => {
                            if (blob) {
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = target.file;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                                successCount++;
                            }
                            resolve();
                        }, 'image/png');
                    });

                    // Small delay between downloads
                    await new Promise(r => setTimeout(r, 300));
                } catch (err) {
                    console.error(`Failed to download QR for ${target.label}`, err);
                }
            }
        }

        toast({
            title: successCount > 0 ? "Download Complete!" : "Download Failed",
            description: successCount > 0
                ? `${successCount} of ${totalQRs} premium QR cards saved`
                : "Could not download QR codes. Try downloading individually.",
            variant: successCount > 0 ? "default" : "destructive"
        });
    };

    // Share link
    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'View Our Menu',
                    text: 'Check out our menu!',
                    url: currentQrUrl,
                });
            } catch (err) {
                console.log('Share cancelled');
            }
        } else {
            handleCopyLink();
        }
    };

    // Print QR card
    const handlePrintQR = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast({
                title: "Popup blocked",
                description: "Please allow popups to print QR code",
                variant: "destructive"
            });
            return;
        }

        const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
        const shopNameStr = localStorage.getItem(headerKey) ?? localStorage.getItem('hotel_pos_bill_header');
        let displayName = 'Your Restaurant';
        if (shopNameStr) {
            try {
                const parsed = JSON.parse(shopNameStr);
                if (parsed.shopName) displayName = parsed.shopName;
            } catch { }
        }
        const shopName = displayName;
        const tableLabel = selectedTable 
            ? (selectedSeat ? `Table ${selectedTable} - Seat ${selectedSeat}` : `Table ${selectedTable}`) 
            : 'Scan for Menu';

        printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Menu QR Code</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .card {
            background: white;
            border-radius: 16px;
            padding: 32px;
            text-align: center;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            max-width: 300px;
          }
          h1 { font-size: 24px; margin: 0 0 8px 0; color: #ea580c; }
          h2 { font-size: 18px; margin: 0 0 24px 0; color: #666; font-weight: normal; }
          img { width: 200px; height: 200px; margin: 0 auto 16px; }
          .instructions { font-size: 14px; color: #888; margin-top: 16px; }
          @media print { body { background: white; } .card { box-shadow: none; } }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>${shopName}</h1>
          <h2>${tableLabel}</h2>
          <img src="${generateQRCodeUrl(currentQrUrl, 200)}" alt="QR Code" />
          <p class="instructions">Scan with your phone camera<br/>to view our menu</p>
        </div>
        <script>
          window.onload = function() { setTimeout(function() { window.print(); }, 500); };
        </script>
      </body>
      </html>
    `);
        printWindow.document.close();
    };

    if (!adminId) {
        return (
            <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                    Unable to generate menu link. Please ensure you're logged in.
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Custom Menu URL Card */}
            <Card>
                <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="flex items-center space-x-2">
                        <Link2 className="w-5 h-5" />
                        <span className="text-base sm:text-lg">Custom Menu URL</span>
                    </CardTitle>
                    <CardDescription>
                        Create a memorable URL for your online menu (e.g., /menu/your-shop-name)
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 space-y-4">
                    {/* Custom Slug Input */}
                    <div className="space-y-3">
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">/menu/</span>
                                <Input
                                    value={menuSlug}
                                    onChange={(e) => handleSlugChange(e.target.value)}
                                    placeholder="your-shop-name"
                                    className="pl-16"
                                    maxLength={50}
                                />
                                {slugStatus === 'checking' && (
                                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">Checking...</span>
                                )}
                                {slugStatus === 'available' && (
                                    <Check className="absolute right-3 top-2.5 w-4 h-4 text-green-500" />
                                )}
                                {slugStatus === 'taken' && (
                                    <AlertCircle className="absolute right-3 top-2.5 w-4 h-4 text-red-500" />
                                )}
                            </div>
                            <Button variant="outline" size="sm" onClick={generateSlugFromName}>
                                Auto
                            </Button>
                        </div>
                        {slugStatus === 'taken' && (
                            <p className="text-xs text-red-500">This URL is already taken. Please choose another.</p>
                        )}
                        {slugStatus === 'available' && menuSlug && (
                            <p className="text-xs text-green-600">✓ This URL is available!</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                            Your menu will be accessible at: <code className="bg-muted px-1 py-0.5 rounded">{baseUrl}</code>
                        </p>
                    </div>

                    {/* Menu Display Options */}
                    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                        <Label className="text-sm font-medium">What to show on public menu:</Label>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Store className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm">Shop Name</span>
                                </div>
                                <Switch
                                    checked={menuShowShopName}
                                    onCheckedChange={(v) => handleDisplayOptionChange('shopName', v)}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm">Address</span>
                                </div>
                                <Switch
                                    checked={menuShowAddress}
                                    onCheckedChange={(v) => handleDisplayOptionChange('address', v)}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Phone className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm">Phone Number</span>
                                </div>
                                <Switch
                                    checked={menuShowPhone}
                                    onCheckedChange={(v) => handleDisplayOptionChange('phone', v)}
                                />
                            </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            Toggle what customers see on your public menu page
                        </p>
                    </div>

                    {/* Shop Location for Google Maps */}
                    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                        <Label className="text-sm font-medium flex items-center gap-2">
                            <Navigation className="w-4 h-4" />
                            Shop Location (Google Maps)
                        </Label>
                        {shopLatitude && shopLongitude ? (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm text-green-600">
                                    <Check className="w-4 h-4" />
                                    <span>Location pinned: {shopLatitude.toFixed(5)}, {shopLongitude.toFixed(5)}</span>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.open(`https://www.google.com/maps?q=${shopLatitude},${shopLongitude}`, '_blank')}
                                    >
                                        <ExternalLink className="w-3 h-3 mr-1" />
                                        View on Map
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={clearLocation}
                                        className="text-red-600 hover:text-red-700"
                                    >
                                        <X className="w-3 h-3 mr-1" />
                                        Clear
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={pinCurrentLocation}
                                    disabled={locationLoading}
                                >
                                    {locationLoading ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <MapPin className="w-4 h-4 mr-2" />
                                    )}
                                    {locationLoading ? 'Getting Location...' : 'Pin Current Location'}
                                </Button>

                                {/* Location Error Display */}
                                {locationError && (
                                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                                        <div className="flex items-start gap-2">
                                            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1">
                                                <p className="text-red-700 text-xs">{locationError}</p>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-600 hover:text-red-700 mt-1 h-7 px-2"
                                                    onClick={pinCurrentLocation}
                                                >
                                                    Try Again
                                                </Button>
                                            </div>
                                        </div>
                                        {/* Manual entry fallback */}
                                        <div className="mt-3 pt-3 border-t border-red-200">
                                            <p className="text-xs font-medium text-gray-700 mb-2">📍 Manual Entry (from Google Maps):</p>
                                            <div className="flex gap-2">
                                                <Input
                                                    type="number"
                                                    step="any"
                                                    placeholder="Latitude"
                                                    className="flex-1 h-8 text-xs"
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        if (!isNaN(val) && val >= -90 && val <= 90) setShopLatitude(val);
                                                    }}
                                                />
                                                <Input
                                                    type="number"
                                                    step="any"
                                                    placeholder="Longitude"
                                                    className="flex-1 h-8 text-xs"
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        if (!isNaN(val) && val >= -180 && val <= 180) setShopLongitude(val);
                                                    }}
                                                />
                                                <Button size="sm" className="h-8 px-3 text-xs" onClick={() => {
                                                    if (shopLatitude && shopLongitude) {
                                                        setLocationError(null);
                                                        toast({ title: 'Location Saved', description: 'Manual coordinates applied!' });
                                                        setTimeout(() => saveSettings(), 500);
                                                    }
                                                }}>Save</Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                            Customers can tap to get directions to your shop
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* QR Code Card */}
            <Card>
                <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="flex items-center space-x-2">
                        <QrCode className="w-5 h-5" />
                        <span className="text-base sm:text-lg">Online Menu QR Code</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 space-y-6">
                    {/* Menu Link */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Your Menu Link</Label>
                        <div className="flex gap-2">
                            <Input
                                value={currentQrUrl}
                                readOnly
                                className="text-xs sm:text-sm font-mono bg-muted"
                            />
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={handleCopyLink}
                                className="flex-shrink-0"
                            >
                                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" onClick={handleShare}>
                                <Share2 className="w-4 h-4 mr-1" />
                                Share
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(currentQrUrl, '_blank')}
                            >
                                <ExternalLink className="w-4 h-4 mr-1" />
                                Preview
                            </Button>
                        </div>
                    </div>

                    {/* QR Code Display */}
                    <div className="text-center space-y-4">
                        <div className="inline-block p-4 bg-white rounded-2xl border-2 border-dashed border-muted shadow-sm">
                            <img
                                ref={qrRef}
                                src={generateQRCodeUrl(currentQrUrl, 200)}
                                alt="Menu QR Code"
                                className="w-48 h-48 mx-auto"
                            />
                            {selectedTable && (
                                <Badge className="mt-2 bg-orange-500">
                                    Table {selectedTable}{selectedSeat ? ` - Seat ${selectedSeat}` : ''}
                                </Badge>
                            )}
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                            <Button variant="default" size="sm" onClick={handleDownloadQR}>
                                <Download className="w-4 h-4 mr-1" />
                                Download
                            </Button>
                            <Button variant="outline" size="sm" onClick={handlePrintQR}>
                                <Printer className="w-4 h-4 mr-1" />
                                Print Card
                            </Button>
                        </div>
                    </div>

                    {/* Table-based QR Toggle */}
                    <div className="border-t pt-4 space-y-4">
                        <div className="space-y-3 bg-muted/30 rounded-lg p-4 mb-4 border border-border/50">
                            <Label className="text-sm font-medium flex items-center gap-2">
                                <Download className="w-4 h-4 text-primary" />
                                Download Format
                            </Label>
                            <div className="flex flex-col sm:flex-row gap-4 pt-1">
                                <label className="flex items-center gap-2 cursor-pointer bg-background p-2 rounded border hover:border-primary/50 transition-colors flex-1">
                                    <input 
                                        type="radio" 
                                        className="text-primary"
                                        checked={qrDownloadMode === 'poster'} 
                                        onChange={() => setQrDownloadMode('poster')} 
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium">Premium Poster (Standee)</span>
                                        <span className="text-[10px] text-muted-foreground">High-res 10x18" print ready</span>
                                    </div>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer bg-background p-2 rounded border hover:border-primary/50 transition-colors flex-1">
                                    <input 
                                        type="radio" 
                                        className="text-primary"
                                        checked={qrDownloadMode === 'qr_only'} 
                                        onChange={() => setQrDownloadMode('qr_only')} 
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium">Raw QR Code Only</span>
                                        <span className="text-[10px] text-muted-foreground">For custom designs</span>
                                    </div>
                                </label>
                            </div>
                            {qrDownloadMode === 'poster' && (
                                <p className="text-[11px] text-primary/80 bg-primary/10 p-2 rounded flex items-center gap-2">
                                    <Palette className="w-3 h-3" />
                                    Posters automatically use your Menu Appearance colors defined below.
                                </p>
                            )}
                        </div>

                        <div className="flex items-center justify-between mt-6 mb-3">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-medium flex items-center gap-2">
                                    <Table2 className="w-4 h-4" />
                                    Table-wise QR Codes
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Generate different QR for each table
                                </p>
                            </div>
                            <Switch
                                checked={tableMode}
                                onCheckedChange={(checked) => {
                                    setTableMode(checked);
                                    if (!checked) setSelectedTable(null);
                                }}
                            />
                        </div>

                        {tableMode && (
                            <div className="space-y-3 bg-muted/50 rounded-lg p-4">
                                {tablesLoading ? (
                                    <p className="text-sm text-muted-foreground text-center py-2">Loading tables...</p>
                                ) : dbTables.length === 0 ? (
                                    <div className="text-center py-3">
                                        <p className="text-sm text-muted-foreground">No tables found.</p>
                                        <p className="text-xs text-muted-foreground mt-1">Add tables in <strong>Table Management</strong> first, then come back here to generate QR codes.</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Table Selector */}
                                        <div className="space-y-2">
                                            <Label className="text-sm">Select table to preview QR ({dbTables.length} tables):</Label>
                                            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                                                {dbTables.map(tbl => {
                                                    const num = parseInt(tbl.table_number) || 0;
                                                    return (
                                                        <Button
                                                            key={tbl.id}
                                                            variant={selectedTable === num ? 'default' : 'outline'}
                                                            size="sm"
                                                            className="w-10 h-10"
                                                            onClick={() => {
                                                                if (selectedTable === num) {
                                                                    setSelectedTable(null);
                                                                    setSelectedSeat(null);
                                                                } else {
                                                                    setSelectedTable(num);
                                                                    setSelectedSeat(null);
                                                                }
                                                            }}
                                                        >
                                                            {tbl.table_number}
                                                        </Button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Seat Selector (if selected table has seats configured) */}
                                        {selectedTable && (() => {
                                            const selectedTblObj = dbTables.find(t => (parseInt(t.table_number) || 0) === selectedTable);
                                            if (selectedTblObj?.has_seats && Array.isArray(selectedTblObj.seat_configuration) && selectedTblObj.seat_configuration.length > 0) {
                                                return (
                                                    <div className="space-y-2 border-t pt-3 mt-1 bg-muted/20 p-2.5 rounded border">
                                                        <Label className="text-xs font-semibold text-muted-foreground block">Select Seat to Preview QR:</Label>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            <Button
                                                                variant={selectedSeat === null ? 'default' : 'outline'}
                                                                size="sm"
                                                                className="h-7 px-2.5 text-[10px] font-bold"
                                                                onClick={() => setSelectedSeat(null)}
                                                            >
                                                                Table (General)
                                                            </Button>
                                                            {(selectedTblObj.seat_configuration as string[]).map((seat) => (
                                                                <Button
                                                                    key={seat}
                                                                    variant={selectedSeat === seat ? 'default' : 'outline'}
                                                                    size="sm"
                                                                    className="h-7 px-2.5 text-[10px] font-bold animate-fade-in"
                                                                    onClick={() => setSelectedSeat(seat)}
                                                                >
                                                                    Seat {seat}
                                                                </Button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}

                                        {/* Download All */}
                                        <Button
                                            variant="secondary"
                                            className="w-full"
                                            onClick={handleDownloadAllTableQRs}
                                        >
                                            <Download className="w-4 h-4 mr-2" />
                                            Download All {dbTables.length} Table QR Codes
                                        </Button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Menu Appearance Settings */}
                    <div className="border-t pt-4 space-y-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Palette className="w-4 h-4 text-purple-600" />
                            <Label className="text-sm font-medium">Menu Appearance</Label>
                            <Badge variant="secondary" className="text-[10px]">Per Admin</Badge>
                        </div>

                        {/* Color Pickers */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Header Color</Label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={menuPrimaryColor}
                                        onChange={(e) => setMenuPrimaryColor(e.target.value)}
                                        onBlur={saveSettings}
                                        className="w-8 h-8 rounded border cursor-pointer"
                                    />
                                    <Input
                                        value={menuPrimaryColor}
                                        onChange={(e) => setMenuPrimaryColor(e.target.value)}
                                        onBlur={saveSettings}
                                        className="h-8 text-xs font-mono flex-1"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Category Pills</Label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={menuSecondaryColor}
                                        onChange={(e) => setMenuSecondaryColor(e.target.value)}
                                        onBlur={saveSettings}
                                        className="w-8 h-8 rounded border cursor-pointer"
                                    />
                                    <Input
                                        value={menuSecondaryColor}
                                        onChange={(e) => setMenuSecondaryColor(e.target.value)}
                                        onBlur={saveSettings}
                                        className="h-8 text-xs font-mono flex-1"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Background</Label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={menuBackgroundColor}
                                        onChange={(e) => setMenuBackgroundColor(e.target.value)}
                                        onBlur={saveSettings}
                                        className="w-8 h-8 rounded border cursor-pointer"
                                    />
                                    <Input
                                        value={menuBackgroundColor}
                                        onChange={(e) => setMenuBackgroundColor(e.target.value)}
                                        onBlur={saveSettings}
                                        className="h-8 text-xs font-mono flex-1"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Text Color</Label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={menuTextColor}
                                        onChange={(e) => setMenuTextColor(e.target.value)}
                                        onBlur={saveSettings}
                                        className="w-8 h-8 rounded border cursor-pointer"
                                    />
                                    <Input
                                        value={menuTextColor}
                                        onChange={(e) => setMenuTextColor(e.target.value)}
                                        onBlur={saveSettings}
                                        className="h-8 text-xs font-mono flex-1"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Items Per Row */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <LayoutGrid className="w-4 h-4 text-blue-600" />
                                <Label className="text-xs text-muted-foreground">Items Per Row</Label>
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
                                        onClick={() => {
                                            setMenuItemsPerRow(opt.val);
                                        }}
                                    >
                                        {opt.label}
                                    </Button>
                                ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                                Changes apply instantly to your public menu
                            </p>
                        </div>
                    </div>

                    {/* Usage Instructions */}
                    <div className="bg-orange-50 rounded-lg p-4 border border-orange-100">
                        <h4 className="font-medium text-orange-800 mb-2 text-sm">How to use:</h4>
                        <ul className="text-xs text-orange-700 space-y-1">
                            <li>• Print and display the QR code on your counter or tables</li>
                            <li>• Customers scan with their phone camera to view your menu</li>
                            <li>• Menu updates automatically when you change items</li>
                            <li>• No app download needed - works in any browser</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>

            {/* Promotional Banners Section */}
            <PromoBannerManager />

            {/* Menu Design Studio Section */}
            <MenuDesignStudio />
        </div>
    );
};

export default QRCodeSettings;

