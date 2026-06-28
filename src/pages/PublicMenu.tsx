import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Utensils, Phone, MapPin, Wifi, WifiOff, Search, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, MessageCircle, ShoppingCart, Plus, Minus, Send, Clock, CheckCircle2, Loader2, ChefHat, Trash2, MessageSquare, RefreshCw, Bell, Droplets, Receipt, BookOpen, HelpCircle, Share2, QrCode, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getShortUnit } from '@/utils/timeUtils';
import { toast } from '@/hooks/use-toast';

// Types
interface MenuItem {
    id: string;
    name: string;
    price: number;
    image_url?: string;
    video_url?: string;
    media_type?: 'image' | 'gif' | 'video';
    category?: string;
    unit?: string;
    base_value?: number;
    is_active: boolean;
    tax_rate_id?: string | null;
    is_tax_inclusive?: boolean;
}

interface PromoBanner {
    id: string;
    admin_id: string;
    branch_id: string | null;
    image_url: string;
    link_url?: string;
    is_text_only?: boolean;
    text_color?: string;
    bg_color?: string;
    title?: string;
    description?: string;
}

interface ShopSettings {
    shop_name?: string;
    address?: string;
    contact_number?: string;
    logo_url?: string;
    menu_show_shop_name?: boolean;
    menu_show_address?: boolean;
    menu_show_phone?: boolean;
    // Appearance settings
    menu_primary_color?: string;
    menu_secondary_color?: string;
    menu_background_color?: string;
    menu_text_color?: string;
    menu_items_per_row?: number;
    // Layout Settings
    menu_layout_style?: string;
    menu_font_family?: string;
    menu_border_radius?: string;
    menu_glassmorphism?: boolean;
    menu_ai_features_enabled?: boolean;
    
    // Location settings
    shop_latitude?: number;
    shop_longitude?: number;
    // UPI payment details
    upi_id?: string;
    upi_name?: string;
    qr_payment_enabled?: boolean;
}


// Table ordering types
interface CartItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
    unit?: string;
    base_value?: number;
    instructions: string;
    tax_rate_id?: string | null;
    is_tax_inclusive?: boolean;
}

interface TableOrder {
    id: string;
    order_number: number;
    items: Array<{
        item_id: string;
        name: string;
        price: number;
        quantity: number;
        unit?: string;
        base_value?: number;
        instructions?: string;
    }>;
    total_amount: number;
    status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
    customer_note?: string;
    created_at: string;
}


interface ItemCategory {
    id: string;
    name: string;
}

/**
 * Public Menu Page
 * Accessible at /menu/:adminId (UUID) or /menu/:slug (custom URL)
 * Optional query param: ?table=5
 * No authentication required - public read-only
 * 
 * Features:
 * - Shop name displayed prominently (if enabled)
 * - Search functionality
 * - Category filters
 * - Real-time updates when items become unavailable
 * - Custom URL slug support
 */
const PublicMenu = () => {
    const { adminId: urlParam } = useParams<{ adminId: string }>();
    const [searchParams] = useSearchParams();
    const tableNo = searchParams.get('table');

    const [adminId, setAdminId] = useState<string | null>(null);
    const [branchId, setBranchId] = useState<string | null>(null);
    const [items, setItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<ItemCategory[]>([]);
    const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);
    const [banners, setBanners] = useState<PromoBanner[]>([]);
    const [gstEnabled, setGstEnabled] = useState(false);
    const [taxRatesMap, setTaxRatesMap] = useState<Record<string, { rate: number; name: string; cess: number }>>({});
    const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // Banner swipe state
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const [isPaused, setIsPaused] = useState(false);

    // Collapsible categories state
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

    // ========== TABLE ORDERING STATE (only active when ?table=N) ==========
    const isTableMode = !!tableNo;

    // Session ID: persisted in localStorage so it survives app close/reopen
    const seatId = searchParams.get('seat');
    const sessionStorageKey = isTableMode 
        ? (seatId ? `table-session-${urlParam}-${tableNo}-${seatId}` : `table-session-${urlParam}-${tableNo}`) 
        : null;
    const [sessionId, setSessionId] = useState<string | null>(() => {
        if (!sessionStorageKey) return null;
        return localStorage.getItem(sessionStorageKey) || null;
    });
    const [sessionReady, setSessionReady] = useState(false);

    // Cart
    const [cart, setCart] = useState<CartItem[]>([]);
    const [orderNote, setOrderNote] = useState('');
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [showCart, setShowCart] = useState(false);
    const [showMyOrders, setShowMyOrders] = useState(false);
    const [instructionItemId, setInstructionItemId] = useState<string | null>(null);

    // Orders for this session
    const [sessionOrders, setSessionOrders] = useState<TableOrder[]>([]);
    const orderChannelRef = useRef<any>(null);

    // ========== HELP / SERVICE REQUEST STATE ==========
    const [showHelpSheet, setShowHelpSheet] = useState(false);
    const [helpCooldowns, setHelpCooldowns] = useState<Record<string, number>>({});
    const [helpStatus, setHelpStatus] = useState<Record<string, 'pending' | 'acknowledged' | 'resolved'>>({});
    const [customHelpMsg, setCustomHelpMsg] = useState('');
    const [showCustomInput, setShowCustomInput] = useState(false);
    const helpChannelRef = useRef<any>(null);

    // UPI Checkout States
    const [showCheckoutDialog, setShowCheckoutDialog] = useState(false);
    const [paymentReference, setPaymentReference] = useState('');
    const [isSubmittingReference, setIsSubmittingReference] = useState(false);
    const [isPaymentConfirmed, setIsPaymentConfirmed] = useState(false);

    // Online/Offline detection
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Dynamically load Google Font for the Public Menu
    useEffect(() => {
        const fontFamily = shopSettings?.menu_font_family;
        if (!fontFamily || fontFamily === 'Inter') {
            return;
        }

        const fontName = fontFamily.split(',')[0].replace(/['"]/g, '').trim();
        const fontId = `google-font-public-${fontName.toLowerCase().replace(/\s+/g, '-')}`;

        if (document.getElementById(fontId)) return;

        const link = document.createElement('link');
        link.id = fontId;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;500;600;700;800&display=swap`;
        document.head.appendChild(link);
    }, [shopSettings?.menu_font_family]);

    // Resolve slug or UUID to admin ID
    useEffect(() => {
        const resolveAdminId = async () => {
            if (!urlParam) {
                setError('Invalid menu link');
                setLoading(false);
                return;
            }

            // Check if it's a UUID format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

            if (uuidRegex.test(urlParam)) {
                // It's a UUID — treat as admin ID, default to main branch
                setAdminId(urlParam);
                try {
                    const { data: mainBranch } = await (supabase as any)
                        .from('branches')
                        .select('id')
                        .eq('admin_id', urlParam)
                        .eq('is_main', true)
                        .maybeSingle();
                    setBranchId(mainBranch?.id || null);
                } catch { /* ignore */ }
            } else {
                // It's a slug — resolve to (admin_id, branch_id)
                try {
                    const { data: rows, error: slugError } = await (supabase as any)
                        .rpc('resolve_menu_target', { p_slug: urlParam });

                    if (slugError) console.error('Slug lookup error:', slugError);

                    const row = Array.isArray(rows) ? rows[0] : rows;
                    if (row?.admin_id) {
                        setAdminId(row.admin_id);
                        setBranchId(row.branch_id || null);
                    } else {
                        setError('Menu not found');
                        setLoading(false);
                        return;
                    }
                } catch (err) {
                    console.error('Error resolving slug:', err);
                    setError('Failed to load menu');
                    setLoading(false);
                    return;
                }
            }
        };

        resolveAdminId();
    }, [urlParam]);

    // Fetch menu data once adminId is resolved
    useEffect(() => {
        if (!adminId) return;

        const fetchMenuData = async () => {
            try {
                // Fetch items for this admin/branch (including video/media fields)
                let itemsQuery: any = supabase
                    .from('items')
                    .select('id, name, price, image_url, video_url, media_type, category, unit, base_value, is_active, branch_id, tax_rate_id, is_tax_inclusive')
                    .eq('admin_id', adminId)
                    .eq('is_active', true);
                if (branchId) itemsQuery = itemsQuery.eq('branch_id', branchId);
                itemsQuery = itemsQuery.order('category').order('name');
                const { data: itemsData, error: itemsError } = await itemsQuery;

                // Fetch promotional banners (branch-scoped, with admin-level fallback)
                let bannersQuery: any = supabase
                    .from('promo_banners')
                    .select('id, title, description, image_url, link_url, is_text_only, text_color, bg_color, branch_id')
                    .eq('admin_id', adminId)
                    .eq('is_active', true)
                    .order('display_order');
                const { data: allBannersData } = await bannersQuery;
                const bannersData = branchId
                    ? (allBannersData || []).filter((b: any) => b.branch_id === branchId)
                    : (allBannersData || []);

                if (itemsError) {
                    console.error('Items fetch error:', itemsError);
                }

                // Fetch shop settings (branch-aware, falls back to main branch)
                const { data: settingsData, error: settingsError } = await (supabase as any)
                    .rpc('get_public_shop_settings_for_branch', { p_admin_id: adminId, p_branch_id: branchId });

                if (settingsError && (settingsError as any).code !== 'PGRST116') {
                    console.error('Settings error:', settingsError);
                }

                // Fetch categories (branch-scoped if available, else admin-wide)
                let catQuery: any = supabase
                    .from('item_categories')
                    .select('id, name, branch_id')
                    .eq('admin_id', adminId)
                    .eq('is_deleted', false);
                const { data: allCats, error: categoriesError } = await catQuery.order('name');
                const categoriesData = branchId
                    ? (allCats || []).filter((c: any) => c.branch_id === branchId)
                    : (allCats || []);

                if (categoriesError) {
                    console.error('Categories error:', categoriesError);
                }

                // GST: use gst_enabled from the RPC settings response (no extra fetch needed)
                const enabled = (settingsData as any)?.gst_enabled || false;
                setGstEnabled(enabled);

                if (enabled) {
                    // tax_rates.admin_id stores Auth UID; resolve it from Profile UUID
                    const { data: profileRow } = await supabase
                        .from('profiles')
                        .select('user_id')
                        .eq('id', adminId)
                        .maybeSingle();
                    const authUid = profileRow?.user_id;
                    if (authUid) {
                        let ratesQuery = supabase
                            .from('tax_rates')
                            .select('id, name, rate, cess_rate')
                            .eq('admin_id', authUid)
                            .eq('is_active', true);
                        if (branchId) {
                            ratesQuery = ratesQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
                        }
                        const { data: rates } = await ratesQuery;
                        const ratesMap: Record<string, any> = {};
                        (rates || []).forEach((r: any) => {
                            ratesMap[r.id] = { rate: r.rate, name: r.name, cess: r.cess_rate || 0 };
                        });
                        setTaxRatesMap(ratesMap);
                    }
                }

                setItems((itemsData || []) as any);
                setShopSettings(settingsData as ShopSettings | null);
                setCategories(categoriesData || []);
                setBanners(bannersData || []);

                if (!itemsData?.length && itemsError) {
                    setError('Failed to load menu. Please try again.');
                } else {
                    setError(null);
                }
            } catch (err) {
                console.error('Error fetching menu:', err);
                setError('Failed to load menu. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        fetchMenuData();
    }, [adminId, branchId]);

    // Real-time subscription for item updates
    useEffect(() => {
        if (!adminId) return;

        const channel = supabase
            .channel(`public-menu-${adminId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'items',
                    filter: `admin_id = eq.${adminId} `
                },
                (payload) => {
                    console.log('Menu item update:', payload);

                    if (payload.eventType === 'UPDATE') {
                        const updatedItem = payload.new as MenuItem;

                        if (!updatedItem.is_active) {
                            setItems(prev => prev.filter(item => item.id !== updatedItem.id));
                        } else {
                            setItems(prev => prev.map(item =>
                                item.id === updatedItem.id ? updatedItem : item
                            ));
                        }
                    } else if (payload.eventType === 'INSERT') {
                        const newItem = payload.new as MenuItem;
                        if (newItem.is_active) {
                            setItems(prev => [...prev, newItem].sort((a, b) =>
                                (a.category || '').localeCompare(b.category || '') ||
                                a.name.localeCompare(b.name)
                            ));
                        }
                    } else if (payload.eventType === 'DELETE') {
                        const deletedItem = payload.old as MenuItem;
                        setItems(prev => prev.filter(item => item.id !== deletedItem.id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [adminId]);

    // Real-time subscription for menu settings changes (items per row, colors, etc.)
    useEffect(() => {
        if (!adminId) return;

        const settingsChannel = supabase
            .channel(`menu-settings-${adminId}`)
            .on('broadcast', { event: 'menu-settings-updated' }, (payload: any) => {
                const settings = payload.payload;
                if (settings) {
                    setShopSettings(prev => prev ? { ...prev, ...settings } : settings);
                    // Keep gst_enabled in sync too
                    if (settings.gst_enabled !== undefined) {
                        setGstEnabled(settings.gst_enabled);
                    }
                }
            })
            .on(
                'postgres_changes' as any,
                { event: 'UPDATE', schema: 'public', table: 'shop_settings' },
                async () => {
                    // Re-fetch settings on any shop_settings change
                    const { data: freshSettings } = await (supabase as any)
                        .rpc('get_public_shop_settings_for_branch', { p_admin_id: adminId, p_branch_id: branchId });
                    if (freshSettings) {
                        setShopSettings(freshSettings as ShopSettings);
                        setGstEnabled((freshSettings as any).gst_enabled || false);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(settingsChannel);
        };
    }, [adminId, branchId]);

    // Auto-swipe banners every 4 seconds (pauses when user interacts)
    useEffect(() => {
        if (banners.length <= 1 || isPaused) return;
        const interval = setInterval(() => {
            setCurrentBannerIndex(prev => (prev + 1) % banners.length);
        }, 4000);
        return () => clearInterval(interval);
    }, [banners.length, isPaused]);

    // Resume auto-swipe after 8 seconds of no interaction
    useEffect(() => {
        if (!isPaused) return;
        const resumeTimer = setTimeout(() => setIsPaused(false), 8000);
        return () => clearTimeout(resumeTimer);
    }, [isPaused]);

    // Touch swipe handlers
    const minSwipeDistance = 50;
    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };
    const handleTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };
    const handleTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;
        if (isLeftSwipe) {
            setCurrentBannerIndex(prev => (prev + 1) % banners.length);
            setIsPaused(true);
        } else if (isRightSwipe) {
            setCurrentBannerIndex(prev => (prev - 1 + banners.length) % banners.length);
            setIsPaused(true);
        }
    };
    const goToPrevBanner = () => {
        setCurrentBannerIndex(prev => (prev - 1 + banners.length) % banners.length);
        setIsPaused(true);
    };
    const goToNextBanner = () => {
        setCurrentBannerIndex(prev => (prev + 1) % banners.length);
        setIsPaused(true);
    };

    // Update status bar color to match public menu theme
    useEffect(() => {
        const originalColor = document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '#db2777';
        const menuColor = shopSettings?.menu_primary_color || '#f97316';

        // Update theme-color meta tag for status bar
        let metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (!metaThemeColor) {
            metaThemeColor = document.createElement('meta');
            metaThemeColor.setAttribute('name', 'theme-color');
            document.head.appendChild(metaThemeColor);
        }
        metaThemeColor.setAttribute('content', menuColor);

        // Restore original color on unmount
        return () => {
            if (metaThemeColor) {
                metaThemeColor.setAttribute('content', originalColor);
            }
        };
    }, [shopSettings?.menu_primary_color]);

    // Item Media component with download protection
    const ItemMedia = ({ item }: { item: MenuItem }) => {
        const mediaUrl = item.media_type === 'video' || item.media_type === 'gif'
            ? item.video_url
            : item.image_url;

        if (!mediaUrl) return null;

        if (item.media_type === 'video') {
            return (
                <video
                    src={mediaUrl}
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                    autoPlay
                    loop
                    muted
                    playsInline
                    controlsList="nodownload nofullscreen noremoteplayback"
                    disablePictureInPicture
                    onContextMenu={(e) => e.preventDefault()}
                />
            );
        }

        return (
            <img
                src={mediaUrl}
                alt={item.name}
                className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                loading="lazy"
                onContextMenu={(e) => e.preventDefault()}
                draggable={false}
            />
        );
    };

    // Get unique categories from items
    const itemCategories = useMemo(() => {
        const cats = new Set<string>();
        items.forEach(item => {
            if (item.category) cats.add(item.category);
        });
        return Array.from(cats).sort();
    }, [items]);

    // Filter items by category AND search query
    const filteredItems = useMemo(() => {
        let result = items;

        if (selectedCategory !== 'all') {
            result = result.filter(item => item.category === selectedCategory);
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(item =>
                item.name.toLowerCase().includes(query) ||
                (item.category && item.category.toLowerCase().includes(query))
            );
        }

        return result;
    }, [items, selectedCategory, searchQuery]);

    // Group items by category
    const groupedItems = useMemo(() => {
        const groups: Record<string, MenuItem[]> = {};
        filteredItems.forEach(item => {
            const cat = item.category || 'Other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(item);
        });
        return groups;
    }, [filteredItems]);

    // Clear search
    const clearSearch = useCallback(() => {
        setSearchQuery('');
        setShowSearch(false);
    }, []);

    // Determine what to show based on settings
    const showShopName = shopSettings?.menu_show_shop_name !== false;
    const showAddress = shopSettings?.menu_show_address !== false;
    const showPhone = shopSettings?.menu_show_phone !== false;
    const headerTitle = showShopName && shopSettings?.shop_name ? shopSettings.shop_name : 'Our Menu';

    // Toggle category collapse
    const toggleCategory = useCallback((category: string) => {
        setCollapsedCategories(prev => {
            const next = new Set(prev);
            if (next.has(category)) {
                next.delete(category);
            } else {
                next.add(category);
            }
            return next;
        });
    }, []);

    // ========== TABLE ORDERING FUNCTIONS ==========

    // Calculate cart details (subtotal, taxes, total)
    const { cartSubtotal, cartExclusiveTax, cartTaxesList, cartTotal } = useMemo(() => {
        let subtotal = 0;
        let exclusiveTax = 0;
        const rateSummary: Record<string, { rate: number; taxable: number; tax: number; name: string }> = {};

        cart.forEach(item => {
            const bv = item.base_value || 1;
            const lineTotal = (item.quantity / bv) * item.price;
            subtotal += lineTotal;

            const taxRateId = item.tax_rate_id;
            const taxRateInfo = (gstEnabled && taxRateId) ? taxRatesMap[taxRateId] : null;

            if (taxRateInfo) {
                const totalRate = taxRateInfo.rate + taxRateInfo.cess;
                const isInclusive = item.is_tax_inclusive !== false;
                let taxable = lineTotal;
                let tax = 0;

                if (isInclusive) {
                    taxable = lineTotal / (1 + totalRate / 100);
                    tax = lineTotal - taxable;
                } else {
                    taxable = lineTotal;
                    tax = lineTotal * (totalRate / 100);
                    exclusiveTax += tax;
                }

                const key = String(taxRateInfo.rate);
                if (!rateSummary[key]) {
                    rateSummary[key] = {
                        rate: taxRateInfo.rate,
                        name: taxRateInfo.name || `GST ${taxRateInfo.rate}%`,
                        taxable: 0,
                        tax: 0
                    };
                }
                rateSummary[key].taxable += taxable;
                rateSummary[key].tax += tax;
            }
        });

        const total = subtotal + exclusiveTax;

        return {
            cartSubtotal: subtotal,
            cartExclusiveTax: exclusiveTax,
            cartTaxesList: Object.values(rateSummary),
            cartTotal: total
        };
    }, [cart, gstEnabled, taxRatesMap]);

    const cartItemCount = useMemo(() => cart.reduce((sum, item) => sum + (item.quantity / (item.base_value || 1)), 0), [cart]);

    // Add item to cart
    const addToCart = useCallback((item: MenuItem) => {
        const step = item.base_value || 1;
        setCart(prev => {
            const existing = prev.find(c => c.id === item.id);
            if (existing) {
                return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + step } : c);
            }
            return [...prev, {
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: step,
                unit: item.unit,
                base_value: item.base_value,
                instructions: '',
                tax_rate_id: item.tax_rate_id,
                is_tax_inclusive: item.is_tax_inclusive
            }];
        });
    }, []);

    // Remove item from cart
    const removeFromCart = useCallback((itemId: string) => {
        setCart(prev => prev.filter(c => c.id !== itemId));
    }, []);

    // Update quantity
    const updateQuantity = useCallback((itemId: string, delta: number) => {
        setCart(prev => {
            return prev.map(c => {
                if (c.id !== itemId) return c;
                const step = c.base_value || 1;
                const newQty = c.quantity + (delta * step);
                return newQty <= 0 ? c : { ...c, quantity: newQty };
            }).filter(c => c.quantity > 0);
        });
    }, []);

    // Get cart quantity for an item
    const getCartQuantity = useCallback((itemId: string) => {
        const item = cart.find(c => c.id === itemId);
        if (!item) return 0;
        return item.quantity / (item.base_value || 1);
    }, [cart]);

    // Set instructions for a cart item
    const setItemInstructions = useCallback((itemId: string, instructions: string) => {
        setCart(prev => prev.map(c => c.id === itemId ? { ...c, instructions } : c));
    }, []);

    // Place order
    const placeOrder = useCallback(async () => {
        if (!adminId || !tableNo || !sessionId || cart.length === 0) return;
        setIsPlacingOrder(true);
        try {
            const orderItems = cart.map(c => ({
                item_id: c.id,
                name: c.name,
                price: c.price,
                quantity: c.quantity,
                unit: c.unit || 'pcs',
                base_value: c.base_value || 1,
                instructions: c.instructions || undefined
            }));
            const totalAmount = cartTotal;
            const orderNumber = sessionOrders.length + 1;

            const { data, error: insertError } = await supabase
                .from('table_orders')
                .insert({
                    admin_id: adminId,
                    branch_id: branchId,
                    table_number: tableNo,
                    session_id: sessionId,
                    seat_id: seatId || null,
                    order_number: orderNumber,
                    items: orderItems,
                    total_amount: totalAmount,
                    customer_note: orderNote || null,
                    status: 'pending'
                })
                .select()
                .single();

            if (insertError) throw insertError;

            // Auto update table status to occupied
            let tableUpdateQ = supabase
                .from('tables')
                .update({ status: 'occupied' })
                .eq('admin_id', adminId)
                .eq('table_number', tableNo);
            
            if (branchId) {
                tableUpdateQ = tableUpdateQ.eq('branch_id', branchId);
            }
            
            const { error: tableErr } = await tableUpdateQ;
            if (tableErr) console.warn('Table status update failed:', tableErr);

            // Broadcast table status change + new order to Kitchen/ServiceArea via shared channel
            try {
                const syncChannel = supabase.channel('table-order-sync');
                syncChannel.subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        syncChannel.send({
                            type: 'broadcast',
                            event: 'table-status-updated',
                            payload: { table_number: tableNo, status: 'occupied', timestamp: Date.now() }
                        });
                        syncChannel.send({
                            type: 'broadcast',
                            event: 'new-table-order',
                            payload: {
                                id: data.id,
                                admin_id: adminId,
                                table_number: tableNo,
                                seat_id: seatId || null,
                                order_number: orderNumber,
                                items: orderItems,
                                total_amount: totalAmount,
                                customer_note: orderNote || null,
                                status: 'pending',
                                session_id: sessionId,
                                created_at: data.created_at
                            }
                        });
                        setTimeout(() => supabase.removeChannel(syncChannel), 1000);
                    }
                });
            } catch (broadcastErr) {
                console.warn('Realtime broadcast failed, but order was saved', broadcastErr);
            }

            // Add to local orders
            setSessionOrders(prev => [...prev, {
                id: data.id,
                order_number: orderNumber,
                items: orderItems,
                total_amount: totalAmount,
                status: 'pending',
                customer_note: orderNote || undefined,
                created_at: data.created_at
            }]);

            // Clear cart
            setCart([]);
            setOrderNote('');
            setShowCart(false);
            setShowMyOrders(true);
        } catch (err) {
            console.error('Order placement error:', err);
            toast({
                title: "Order Failed",
                description: "Failed to place order. Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsPlacingOrder(false);
        }
    }, [adminId, tableNo, sessionId, cart, cartTotal, orderNote, sessionOrders.length]);

    // Smart session initialization: check for active orders on this table
    useEffect(() => {
        if (!adminId || !isTableMode || !tableNo || !sessionStorageKey) return;

        const initSession = async () => {
            // Step 1: If we have a stored session, check if it still has active orders
            const storedSid = localStorage.getItem(sessionStorageKey);
            if (storedSid) {
                let existingOrdersQ = supabase
                    .from('table_orders')
                    .select('id, order_number, items, total_amount, status, customer_note, created_at, is_billed')
                    .eq('admin_id', adminId)
                    .eq('session_id', storedSid);
                
                if (branchId) existingOrdersQ = existingOrdersQ.eq('branch_id', branchId);
                
                const { data: existingOrders } = await existingOrdersQ.order('order_number');

                if (existingOrders && existingOrders.length > 0) {
                    // Check if ANY order is still active (not terminal)
                    const hasActive = existingOrders.some(
                        (o: any) => !['served', 'cancelled'].includes(o.status) || !o.is_billed
                    );
                    if (hasActive) {
                        // Resume this session
                        setSessionId(storedSid);
                        setSessionOrders(existingOrders as unknown as TableOrder[]);
                        setShowMyOrders(true);
                        setSessionReady(true);
                        return;
                    }
                    // All orders are terminal+billed → clear old session
                    localStorage.removeItem(sessionStorageKey);
                }
            }

            // Step 2: No stored session or old one expired. Check DB for ANY active order on this table.
            let tableActiveOrdersQ = supabase
                .from('table_orders')
                .select('session_id, id, order_number, items, total_amount, status, customer_note, created_at, is_billed')
                .eq('admin_id', adminId)
                .eq('table_number', tableNo)
                .in('status', ['pending', 'preparing', 'ready'])
                .eq('is_billed', false);

            if (seatId) {
                tableActiveOrdersQ = tableActiveOrdersQ.eq('seat_id', seatId);
            } else {
                tableActiveOrdersQ = tableActiveOrdersQ.is('seat_id', null);
            }
            
            if (branchId) tableActiveOrdersQ = tableActiveOrdersQ.eq('branch_id', branchId);
            
            const { data: tableActiveOrders } = await tableActiveOrdersQ
                .order('created_at', { ascending: false })
                .limit(20);

            if (tableActiveOrders && tableActiveOrders.length > 0) {
                // Adopt the session of the most recent active order
                const adoptSid = (tableActiveOrders[0] as any).session_id;
                localStorage.setItem(sessionStorageKey, adoptSid);
                setSessionId(adoptSid);

                // Fetch all orders for that session
                let allSessionOrdersQ = supabase
                    .from('table_orders')
                    .select('id, order_number, items, total_amount, status, customer_note, created_at')
                    .eq('admin_id', adminId)
                    .eq('session_id', adoptSid);
                
                if (branchId) allSessionOrdersQ = allSessionOrdersQ.eq('branch_id', branchId);
                
                const { data: allSessionOrders } = await allSessionOrdersQ.order('order_number');

                if (allSessionOrders) {
                    setSessionOrders(allSessionOrders as TableOrder[]);
                    setShowMyOrders(true);
                }
                setSessionReady(true);
                return;
            }

            // Step 3: No active orders at all → generate new session
            const newSid = crypto.randomUUID();
            localStorage.setItem(sessionStorageKey, newSid);
            setSessionId(newSid);
            setSessionReady(true);
        };

        initSession();
    }, [adminId, isTableMode, tableNo, sessionStorageKey]);

    // Real-time subscription for order status updates
    useEffect(() => {
        if (!adminId || !sessionId || !isTableMode) return;

        // Subscribe to broadcast for instant updates
        const channel = supabase.channel(`table-order-status-${sessionId}`)
            .on('broadcast', { event: 'order-status-update' }, (payload: any) => {
                const { order_id, status, is_billed } = payload.payload || {};
                if (order_id && status) {
                    setSessionOrders(prev => {
                        const updated = prev.map(o =>
                            o.id === order_id ? { ...o, status, ...(is_billed !== undefined ? { is_billed } : {}) } : o
                        );
                        // Auto-clear session when ALL orders are served+billed
                        const allDone = updated.length > 0 && updated.every(
                            o => (['served', 'cancelled'].includes(o.status)) && (o as any).is_billed
                        );
                        if (allDone && sessionStorageKey) {
                            // Delay slightly to let UI show final status
                            setTimeout(() => {
                                localStorage.removeItem(sessionStorageKey);
                                setSessionOrders([]);
                                setShowMyOrders(false);
                            }, 2000);
                        }
                        return updated;
                    });
                }
            })
            .subscribe();

        // Also subscribe to postgres_changes as fallback
        const pgChannel = supabase.channel(`table-order-pg-${sessionId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'table_orders',
                    filter: `session_id=eq.${sessionId}`
                },
                (payload: any) => {
                    const updated = payload.new;
                    if (updated) {
                        setSessionOrders(prev => prev.map(o =>
                            o.id === updated.id ? { ...o, status: updated.status } : o
                        ));
                    }
                }
            )
            .subscribe();

        orderChannelRef.current = channel;

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(pgChannel);
        };
    }, [adminId, sessionId, isTableMode, sessionStorageKey]);

    // Status helpers
    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'pending': return <Clock className="w-4 h-4 text-amber-500" />;
            case 'preparing': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
            case 'ready': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
            case 'served': return <CheckCircle2 className="w-4 h-4 text-gray-400" />;
            case 'cancelled': return <X className="w-4 h-4 text-red-500" />;
            default: return <Clock className="w-4 h-4 text-gray-400" />;
        }
    };
    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'pending': return 'Waiting';
            case 'preparing': return 'Being Prepared 👨‍🍳';
            case 'ready': return 'Ready! 🔔';
            case 'served': return 'Served ✅';
            case 'cancelled': return 'Cancelled';
            default: return status;
        }
    };
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'preparing': return 'bg-blue-100 text-blue-700 border-blue-200 animate-pulse';
            case 'ready': return 'bg-green-100 text-green-700 border-green-200';
            case 'served': return 'bg-gray-100 text-gray-500 border-gray-200';
            case 'cancelled': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-gray-100 text-gray-500';
        }
    };

    const sessionTotal = useMemo(() => sessionOrders.reduce((sum, o) => sum + o.total_amount, 0), [sessionOrders]);

    // Check if session is complete (all orders terminal + billed)
    const isSessionComplete = useMemo(() => {
        if (sessionOrders.length === 0) return false;
        return sessionOrders.every(
            o => ['served', 'cancelled'].includes(o.status) && (o as any).is_billed === true
        );
    }, [sessionOrders]);

    // Check if all orders are served but NOT yet billed (customer waiting state)
    const isAllServed = useMemo(() => {
        if (sessionOrders.length === 0) return false;
        if (isSessionComplete) return false;
        return sessionOrders.every(
            o => ['served', 'cancelled'].includes(o.status)
        );
    }, [sessionOrders, isSessionComplete]);

    // Reset session when complete
    const startNewOrder = useCallback(() => {
        if (!sessionStorageKey) return;
        localStorage.removeItem(sessionStorageKey);
        const newSid = crypto.randomUUID();
        localStorage.setItem(sessionStorageKey, newSid);
        setSessionId(newSid);
        setSessionOrders([]);
        setShowMyOrders(false);
        setCart([]);
        setOrderNote('');
    }, [sessionStorageKey]);

    // ========== HELP / SERVICE REQUEST FUNCTIONS ==========

    const HELP_ACTIONS = [
        { type: 'call_waiter', label: '🙋 Call Waiter', icon: Bell, color: 'bg-red-500' },
        { type: 'need_water', label: '💧 Need Water', icon: Droplets, color: 'bg-blue-500' },
        { type: 'need_bill', label: '🧾 Request Bill', icon: Receipt, color: 'bg-green-600' },
        { type: 'need_menu', label: '📋 Need Menu', icon: BookOpen, color: 'bg-purple-500' },
        { type: 'custom', label: '✏️ Custom Request', icon: MessageCircle, color: 'bg-amber-500' },
    ];

    // Send a help/service request
    const sendHelpRequest = useCallback(async (requestType: string, message?: string) => {
        if (!adminId || !tableNo || !sessionId) return;
        // Cooldown check
        const cooldownEnd = helpCooldowns[requestType] || 0;
        if (Date.now() < cooldownEnd) return;

        try {
            const { error: insertErr } = await supabase
                .from('table_service_requests')
                .insert({
                    admin_id: adminId,
                    branch_id: branchId,
                    table_number: tableNo,
                    session_id: sessionId,
                    seat_id: seatId || null,
                    request_type: requestType,
                    message: message || null,
                    status: 'pending'
                } as any);

            if (insertErr) {
                // Unique constraint = already pending
                if (insertErr.code === '23505') {
                    toast({
                        title: "Request Active",
                        description: "You already have a pending request of this type. Staff has been notified!"
                    });
                    return;
                }
                throw insertErr;
            }

            // Broadcast to Service Area for instant notification
            const syncChannel = supabase.channel('service-request-sync');
            await syncChannel.send({
                type: 'broadcast',
                event: 'new-service-request',
                payload: {
                    admin_id: adminId,
                    table_number: tableNo,
                    seat_id: seatId || null,
                    request_type: requestType,
                    message: message || null,
                    session_id: sessionId,
                    timestamp: Date.now()
                }
            });
            supabase.removeChannel(syncChannel);

            // Set cooldown (30 seconds)
            setHelpCooldowns(prev => ({ ...prev, [requestType]: Date.now() + 30000 }));
            setHelpStatus(prev => ({ ...prev, [requestType]: 'pending' }));
            setShowHelpSheet(false);
            setShowCustomInput(false);
            setCustomHelpMsg('');
        } catch (err) {
            console.error('Help request error:', err);
            toast({
                title: "Request Failed",
                description: "Failed to send request. Please try again.",
                variant: "destructive"
            });
        }
    }, [adminId, tableNo, sessionId, helpCooldowns]);

    const handleShareLocation = async () => {
        if (!shopSettings?.shop_latitude || !shopSettings?.shop_longitude) return;
        const mapsUrl = `https://www.google.com/maps?q=${shopSettings.shop_latitude},${shopSettings.shop_longitude}`;
        const text = `Visit ${shopSettings.shop_name || 'our shop'}! Here is the location:`;
        
        if (navigator.share) {
            try {
                await navigator.share({
                    title: shopSettings.shop_name || 'Shop Location',
                    text: text,
                    url: mapsUrl
                });
            } catch (err) {
                if ((err as Error).name !== 'AbortError') {
                    copyToClipboard(mapsUrl);
                }
            }
        } else {
            copyToClipboard(mapsUrl);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
            .then(() => {
                toast({
                    title: "Link Copied",
                    description: "Location link copied to clipboard!"
                });
            })
            .catch(err => {
                console.error('Failed to copy link:', err);
                toast({
                    title: "Clipboard Error",
                    description: "Could not copy link. Here is the URL: " + text,
                    variant: "destructive"
                });
            });
    };

    const submitPaymentReference = async () => {
        if (!paymentReference.trim()) return;
        setIsSubmittingReference(true);
        try {
            const msg = `Paid: ₹${sessionTotal.toFixed(2)} | UTR/Ref: ${paymentReference.trim()}`;
            await sendHelpRequest('upi_payment', msg);
            setIsPaymentConfirmed(true);
            toast({
                title: "Receipt Submitted",
                description: "Payment details sent to staff for instant verification."
            });
            setTimeout(() => {
                setShowCheckoutDialog(false);
                setIsPaymentConfirmed(false);
                setPaymentReference('');
            }, 6000);
        } catch (err) {
            console.error('Payment confirmation error:', err);
            toast({
                title: "Error",
                description: "Failed to submit reference. Please tell the waiter.",
                variant: "destructive"
            });
        } finally {
            setIsSubmittingReference(false);
        }
    };

    // Listen for acknowledgement/resolution from staff
    useEffect(() => {
        if (!adminId || !isTableMode || !sessionId) return;

        const channel = supabase.channel(`service-request-response-${sessionId}`)
            .on('broadcast', { event: 'request-status-update' }, (payload: any) => {
                const { request_type, status } = payload.payload || {};
                if (request_type && status) {
                    setHelpStatus(prev => ({ ...prev, [request_type]: status }));
                    // Auto-clear after 5 seconds for resolved
                    if (status === 'resolved') {
                        setTimeout(() => {
                            setHelpStatus(prev => {
                                const next = { ...prev };
                                delete next[request_type];
                                return next;
                            });
                        }, 5000);
                    }
                }
            })
            .subscribe();

        helpChannelRef.current = channel;

        return () => {
            supabase.removeChannel(channel);
        };
    }, [adminId, isTableMode, sessionId]);

    // Fetch active help requests on mount or when tableNo/sessionId changes
    useEffect(() => {
        if (!adminId || !tableNo || !sessionId) return;
        const fetchActiveRequests = async () => {
            try {
                const { data, error } = await supabase
                    .from('table_service_requests')
                    .select('request_type, status')
                    .eq('session_id', sessionId)
                    .in('status', ['pending', 'acknowledged']);
                if (error) throw error;
                if (data) {
                    const statusMap: Record<string, 'pending' | 'acknowledged' | 'resolved'> = {};
                    data.forEach((r: any) => {
                        statusMap[r.request_type] = r.status;
                    });
                    setHelpStatus(prev => ({ ...prev, ...statusMap }));
                }
            } catch (err) {
                console.error('Error fetching active service requests:', err);
            }
        };
        fetchActiveRequests();
    }, [adminId, tableNo, sessionId]);

    // Cooldown ticker
    useEffect(() => {
        const hasCooldowns = Object.values(helpCooldowns).some(t => Date.now() < t);
        if (!hasCooldowns) return;
        const interval = setInterval(() => {
            setHelpCooldowns(prev => {
                const now = Date.now();
                const next = { ...prev };
                let changed = false;
                for (const key in next) {
                    if (now >= next[key]) {
                        delete next[key];
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [helpCooldowns]);

    // Get help status badge text
    const getHelpStatusText = (type: string) => {
        const status = helpStatus[type];
        if (status === 'acknowledged') return '👍 Staff notified!';
        if (status === 'pending') return '⏳ Request sent';
        if (status === 'resolved') return '✅ Done!';
        return null;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4" />
                    <p className="text-orange-700">Loading menu...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    <Utensils className="w-16 h-16 mx-auto mb-4 text-red-400" />
                    <h1 className="text-2xl font-bold text-red-700 mb-2">Menu Unavailable</h1>
                    <p className="text-red-600">{error}</p>
                </div>
            </div>
        );
    }

    if (items.length === 0 && !searchQuery) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    <Utensils className="w-16 h-16 mx-auto mb-4 text-orange-400" />
                    <h1 className="text-2xl font-bold text-orange-700 mb-2">
                        {headerTitle}
                    </h1>
                    <p className="text-orange-600">Menu is being updated. Please check back soon!</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen public-menu-container pb-24"
            style={{
                fontFamily: shopSettings?.menu_font_family || 'Inter, sans-serif',
                backgroundColor: shopSettings?.menu_background_color || '#fef7ed',
                color: shopSettings?.menu_text_color || '#1c1917',
            }}
        >
            <style>{`
                .public-menu-container .text-\\[10px\\] { font-size: 12.5px !important; }
                .public-menu-container .text-\\[11px\\] { font-size: 13px !important; }
                .public-menu-container .text-\\[12px\\] { font-size: 14px !important; }
                .public-menu-container .text-xs { font-size: 14px !important; }
                .public-menu-container .text-sm { font-size: 15.5px !important; }
                .public-menu-container .text-base { font-size: 17.5px !important; }
                .public-menu-container .text-lg { font-size: 19.5px !important; }
                .public-menu-container .text-xl { font-size: 22px !important; }
                .public-menu-container .text-2xl { font-size: 26px !important; }
                .public-menu-container .text-3xl { font-size: 32px !important; }
                /* Dynamic text color for muted text inheriting brand */
                .public-menu-container { --menu-primary: ${shopSettings?.menu_primary_color || '#f97316'}; --menu-text: ${shopSettings?.menu_text_color || '#1c1917'}; }
                
                /* Custom brand glow shadow hover effects */
                .menu-card-glow {
                    box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 0 12px ${shopSettings?.menu_primary_color || '#ea580c'}15;
                    border-color: ${shopSettings?.menu_primary_color || '#ea580c'}25;
                }
                .menu-card-glow:hover {
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 0 20px ${shopSettings?.menu_primary_color || '#ea580c'}30;
                    border-color: ${shopSettings?.menu_primary_color || '#ea580c'}40;
                    transform: translateY(-4px);
                }
            `}</style>
            {/* Header with Shop Name */}
            <header
                className={cn(
                    "sticky top-0 z-50 text-white shadow-xl transition-all duration-300",
                    shopSettings?.menu_glassmorphism ? "backdrop-blur-xl bg-opacity-70 supports-[backdrop-filter]:bg-opacity-60" : ""
                )}
                style={{
                    background: shopSettings?.menu_primary_color
                        ? (shopSettings.menu_glassmorphism 
                            ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}dd, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color}cc)`
                            : `linear-gradient(135deg, ${shopSettings.menu_primary_color}, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color}cc)`)
                        : 'linear-gradient(135deg, #ea580c, #dc2626)'
                }}
            >
                <div className="max-w-2xl mx-auto px-4 py-3.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3.5 flex-1 min-w-0">
                            {shopSettings?.logo_url ? (
                                <img
                                    src={shopSettings.logo_url}
                                    alt="Logo"
                                    className="w-12 h-12 rounded-xl object-cover border-2 border-white/40 flex-shrink-0 shadow-lg"
                                />
                            ) : (
                                <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center flex-shrink-0 border border-white/20">
                                    <Utensils className="w-6 h-6" />
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <h1 className="text-xl font-extrabold leading-tight truncate tracking-tight" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                                    {headerTitle}
                                </h1>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {tableNo && (
                                <Badge className="bg-white/20 text-white border-white/30 text-xs">
                                    T{tableNo}{seatId ? ` - Seat ${seatId}` : ''}
                                </Badge>
                            )}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-white hover:bg-white/20"
                                onClick={() => setShowSearch(!showSearch)}
                            >
                                <Search className="w-5 h-5" />
                            </Button>
                            {isOnline ? (
                                <Wifi className="w-4 h-4 text-white/70" />
                            ) : (
                                <WifiOff className="w-4 h-4 text-red-300" />
                            )}
                        </div>
                    </div>

                    {/* Search Bar */}
                    {showSearch && (
                        <div className="mt-3 flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400" />
                                <Input
                                    type="text"
                                    placeholder="Search items..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 pr-9 bg-white/95 border-0 text-gray-800 placeholder:text-gray-400"
                                    autoFocus
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20"
                                onClick={clearSearch}
                            >
                                Cancel
                            </Button>
                        </div>
                    )}
                </div>
            </header>

            {/* Category Filter */}
            {itemCategories.length > 0 && (
                <div className={cn(
                    "sticky z-40 bg-white/95 backdrop-blur-md border-b shadow-sm",
                    showSearch ? "top-[120px]" : "top-[72px]"
                )}
                    style={{ borderColor: shopSettings?.menu_primary_color ? `${shopSettings.menu_primary_color} 20` : '#fed7aa' }}
                >
                    <div className="max-w-2xl mx-auto px-4 py-2.5">
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                            <button
                                onClick={() => setSelectedCategory('all')}
                                className={cn(
                                    "flex-shrink-0 rounded-full h-8 px-4 text-xs font-semibold transition-all duration-200 border",
                                    selectedCategory === 'all'
                                        ? "text-white border-transparent shadow-md scale-105"
                                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:shadow-sm"
                                )}
                                style={selectedCategory === 'all' ? {
                                    background: shopSettings?.menu_primary_color
                                        ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color})`
                                        : 'linear-gradient(135deg, #ea580c, #dc2626)'
                                } : {}}
                            >
                                All ({items.length})
                            </button>
                            {itemCategories.map(cat => {
                                const count = items.filter(i => i.category === cat).length;
                                return (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={cn(
                                            "flex-shrink-0 rounded-full h-8 px-4 text-xs font-semibold transition-all duration-200 border",
                                            selectedCategory === cat
                                                ? "text-white border-transparent shadow-md scale-105"
                                                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:shadow-sm"
                                        )}
                                        style={selectedCategory === cat ? {
                                            background: shopSettings?.menu_primary_color
                                                ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color})`
                                                : 'linear-gradient(135deg, #ea580c, #dc2626)'
                                        } : {}}
                                    >
                                        {cat} ({count})
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Search Results Info */}
            {searchQuery && (
                <div className="max-w-2xl mx-auto px-4 pt-4">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-orange-700">
                            {filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''} for "{searchQuery}"
                        </span>
                        <button
                            onClick={() => setSearchQuery('')}
                            className="text-orange-500 hover:text-orange-700 underline text-xs"
                        >
                            Clear search
                        </button>
                    </div>
                </div>
            )}

            {/* Get Directions & Share Location Bar - Shows when shop location is set */}
            {shopSettings?.shop_latitude && shopSettings?.shop_longitude && (
                <div className="max-w-2xl mx-auto px-4 pt-3">
                    <div className="flex gap-2.5">
                        <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${shopSettings.shop_latitude},${shopSettings.shop_longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-2 text-white py-2.5 px-3 rounded-xl shadow-md hover:shadow-lg transition-all text-xs sm:text-sm font-medium hover:scale-[1.01] active:scale-[0.99]"
                            style={{
                                background: shopSettings?.menu_primary_color
                                    ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color}cc)`
                                    : 'linear-gradient(135deg, #ea580c, #dc2626)'
                            }}
                        >
                            <MapPin className="w-4 h-4" />
                            <span>Get Directions</span>
                        </a>
                        <button
                            onClick={handleShareLocation}
                            className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 py-2.5 px-3 rounded-xl shadow-sm hover:shadow-md transition-all text-xs sm:text-sm font-medium hover:scale-[1.01] active:scale-[0.99] border border-slate-200/50"
                        >
                            <Share2 className="w-4 h-4" />
                            <span>Share Location</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Promotional Banners Carousel */}
            {
                banners.length > 0 && (
                    <div className="max-w-2xl mx-auto px-4 pt-4">
                        <div className="relative rounded-xl overflow-hidden shadow-lg" style={{ maxHeight: '200px' }}>
                            <div
                                className="flex transition-transform duration-500 ease-in-out touch-pan-y h-full"
                                style={{ transform: `translateX(-${currentBannerIndex * 100}%)` }}
                                onTouchStart={handleTouchStart}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                            >
                                {banners.map((banner) => (
                                    <div
                                        key={banner.id}
                                        className="w-full flex-shrink-0"
                                        onContextMenu={(e) => e.preventDefault()}
                                    >
                                        {banner.is_text_only ? (
                                            // Text-only banner with solid color background
                                            <div
                                                className="relative aspect-[16/7] max-h-[200px] flex items-center justify-center"
                                                style={{ backgroundColor: banner.bg_color || '#22c55e' }}
                                            >
                                                <div className="text-center px-6">
                                                    <h3
                                                        className="font-bold text-xl md:text-2xl drop-shadow-lg"
                                                        style={{ color: banner.text_color || '#ffffff' }}
                                                    >
                                                        {banner.title}
                                                    </h3>
                                                    {banner.description && (
                                                        <p
                                                            className="text-sm md:text-base mt-1 opacity-90"
                                                            style={{ color: banner.text_color || '#ffffff' }}
                                                        >
                                                            {banner.description}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            // Image banner
                                            <div className="relative aspect-[16/7] max-h-[200px] bg-gradient-to-r from-orange-400 to-amber-400">
                                                <img
                                                    src={banner.image_url}
                                                    alt={banner.title}
                                                    className="w-full h-full object-cover object-center"
                                                    draggable={false}
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                                <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                                                    <h3 className="font-bold text-sm drop-shadow-lg">{banner.title}</h3>
                                                    {banner.description && (
                                                        <p className="text-xs opacity-90 line-clamp-1">{banner.description}</p>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {banners.length > 1 && (
                                <>
                                    {/* Arrow Navigation */}
                                    <button
                                        onClick={goToPrevBanner}
                                        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-white transition-colors"
                                        aria-label="Previous banner"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={goToNextBanner}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-white transition-colors"
                                        aria-label="Next banner"
                                    >
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                    {/* Dot Indicators */}
                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                                        {banners.map((_, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => { setCurrentBannerIndex(idx); setIsPaused(true); }}
                                                className={cn(
                                                    "w-2 h-2 rounded-full transition-all",
                                                    idx === currentBannerIndex
                                                        ? "bg-white w-4"
                                                        : "bg-white/50 hover:bg-white/70"
                                                )}
                                            />
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Menu Items */}
            <main className="max-w-2xl mx-auto px-4 py-4 pb-36">
                {filteredItems.length === 0 ? (
                    <div className="text-center py-12">
                        <Search className="w-12 h-12 mx-auto mb-4 text-orange-300" />
                        <p className="text-orange-600">No items found for "{searchQuery}"</p>
                        <button
                            onClick={() => setSearchQuery('')}
                            className="mt-2 text-orange-500 hover:text-orange-700 underline text-sm"
                        >
                            Show all items
                        </button>
                    </div>
                ) : (
                    Object.entries(groupedItems).map(([category, categoryItems]) => {
                        const isCollapsed = collapsedCategories.has(category);
                        return (
                            <div key={category} className="mb-8">
                                {/* Clickable category header */}
                                <button
                                    onClick={() => toggleCategory(category)}
                                    className="w-full text-left text-base font-bold mb-3 flex items-center gap-2.5 sticky top-[114px] py-2.5 z-10 cursor-pointer transition-colors"
                                    style={{ color: shopSettings?.menu_primary_color || '#9a3412' }}
                                >
                                    <span className="w-8 h-0.5 rounded-full" style={{ background: `linear-gradient(to right, ${shopSettings?.menu_primary_color || '#ea580c'}, transparent)` }} />
                                    <span className="text-[15px] tracking-tight">{category}</span>
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: `${shopSettings?.menu_primary_color || '#ea580c'}15`, color: shopSettings?.menu_primary_color || '#ea580c' }}>({categoryItems.length})</span>
                                    <span className="ml-auto pr-2">
                                        {isCollapsed ? (
                                            <ChevronDown className="w-4 h-4" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }} />
                                        ) : (
                                            <ChevronUp className="w-4 h-4" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }} />
                                        )}
                                    </span>
                                </button>

                                {/* Collapsible items section */}
                                {shopSettings?.menu_items_per_row === 4 ? (
                                    /* ===== MODE 4: HORIZONTAL SCROLL PER CATEGORY ===== */
                                    <div
                                        className={cn(
                                            "transition-all duration-300 ease-in-out overflow-hidden",
                                            isCollapsed ? "max-h-0 opacity-0" : "max-h-[5000px] opacity-100"
                                        )}
                                    >
                                        <div className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                            {categoryItems.map(item => (
                                                <div
                                                    key={item.id}
                                                    className={cn(
                                                        "flex-shrink-0 w-[140px] snap-start bg-white rounded-2xl shadow-sm border hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col",
                                                        shopSettings?.menu_primary_color ? 'border-orange-100' : 'border-orange-50'
                                                    )}
                                                >
                                                    <div className="aspect-square bg-orange-50 relative overflow-hidden">
                                                        {item.video_url || item.media_type === 'gif' || item.media_type === 'video' ? (
                                                            item.media_type === 'gif' ? (
                                                                <img src={item.video_url || item.image_url} alt={item.name} className="w-full h-full object-cover" loading="lazy" draggable={false} onContextMenu={(e) => e.preventDefault()} />
                                                            ) : (
                                                                <video src={item.video_url} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                                                            )
                                                        ) : item.image_url ? (
                                                            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" loading="lazy" draggable={false} onContextMenu={(e) => e.preventDefault()} />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-orange-300">
                                                                <Utensils className="w-10 h-10" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="p-2 text-center flex flex-col flex-1 justify-between">
                                                        <h3 className="font-semibold text-gray-800 text-xs leading-tight line-clamp-2">{item.name}</h3>
                                                        <div className="mt-1">
                                                            <span className="text-sm font-extrabold" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }}>
                                                                ₹{item.price}
                                                                <span className="text-[9px] font-medium text-gray-400 ml-0.5">
                                                                    /{item.base_value && item.base_value > 1 ? item.base_value : ''}{getShortUnit(item.unit)}
                                                                </span>
                                                            </span>
                                                        </div>
                                                        {isTableMode && (
                                                            <div className="mt-1.5">
                                                                {getCartQuantity(item.id) > 0 ? (
                                                                    <div className="flex items-center justify-center gap-1">
                                                                        <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 active:scale-90 transition-transform">
                                                                            <Minus className="w-3.5 h-3.5" />
                                                                        </button>
                                                                        <span className="text-sm font-bold w-6 text-center">{getCartQuantity(item.id)}</span>
                                                                        <button onClick={() => addToCart(item)} className="w-8 h-8 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform" style={{ background: shopSettings?.menu_primary_color || '#ea580c' }}>
                                                                            <Plus className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button onClick={() => addToCart(item)} className="px-4 py-1.5 rounded-full text-white text-xs font-semibold shadow-sm hover:shadow-md active:scale-95 transition-all" style={{ background: shopSettings?.menu_primary_color || '#ea580c' }}>
                                                                        ADD
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    /* ===== MODE 1/2/3: GRID LAYOUT ===== */
                                    <div
                                        className={cn(
                                            "grid gap-3 transition-all duration-300 ease-in-out overflow-hidden",
                                            shopSettings?.menu_items_per_row === 3 ? "grid-cols-3" :
                                                shopSettings?.menu_items_per_row === 2 ? "grid-cols-2" :
                                                    "grid-cols-1",
                                            isCollapsed ? "max-h-0 opacity-0" : "max-h-[5000px] opacity-100"
                                        )}
                                    >
                                        {categoryItems.map(item => {
                                            const borderRadiusClass = 
                                                shopSettings?.menu_border_radius === 'none' ? 'rounded-none' :
                                                shopSettings?.menu_border_radius === 'sm' ? 'rounded-md' :
                                                shopSettings?.menu_border_radius === 'lg' ? 'rounded-3xl' :
                                                shopSettings?.menu_border_radius === 'full' ? 'rounded-[2rem]' :
                                                'rounded-2xl'; // default md
                                            
                                            const [layoutBase, shadowStyle] = (shopSettings?.menu_layout_style || 'classic').split(':');
                                            
                                            // Determine if we should use horizontal (classic) or vertical (modern_cards) layout for single row
                                            const isSingleColumn = shopSettings?.menu_items_per_row === 1;
                                            const useHorizontalLayout = isSingleColumn && layoutBase !== 'modern_cards';
                                            
                                            const shadowClass = 
                                                shadowStyle === 'none' ? 'shadow-none hover:shadow-none hover:translate-y-0 border-gray-100' :
                                                shadowStyle === 'glow' ? 'menu-card-glow' :
                                                'shadow-sm border hover:shadow-lg hover:-translate-y-0.5'; // default/subtle

                                            return (
                                            <div
                                                key={item.id}
                                                className={cn(
                                                    `bg-white transition-all duration-300 overflow-hidden group ${borderRadiusClass} ${shadowClass}`,
                                                    useHorizontalLayout ? "flex items-center p-3.5 gap-3.5" : "flex flex-col"
                                                )}
                                                style={{ borderColor: shadowStyle !== 'glow' && shopSettings?.menu_primary_color ? `${shopSettings.menu_primary_color}15` : undefined }}
                                            >
                                                {/* Image */}
                                                {useHorizontalLayout ? (
                                                    // Single column: Classic Horizontal Layout
                                                    <>
                                                        <ItemMedia item={item} />
                                                        <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                                            <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                                                                {item.name}
                                                            </h3>
                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                                <span className="text-base font-bold" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }}>
                                                                    ₹{item.price}
                                                                    <span className="text-xs font-medium text-gray-400 ml-0.5">
                                                                        /{item.base_value && item.base_value > 1 ? item.base_value : ''}{getShortUnit(item.unit)}
                                                                    </span>
                                                                </span>
                                                                {isTableMode && (
                                                                    getCartQuantity(item.id) > 0 ? (
                                                                        <div className="flex items-center gap-1.5">
                                                                            <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 active:scale-90 transition-transform">
                                                                                <Minus className="w-3.5 h-3.5" />
                                                                            </button>
                                                                            <span className="text-sm font-bold w-6 text-center">{getCartQuantity(item.id)}</span>
                                                                            <button onClick={() => addToCart(item)} className="w-8 h-8 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform" style={{ background: shopSettings?.menu_primary_color || '#ea580c' }}>
                                                                                <Plus className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <button onClick={() => addToCart(item)} className="px-4 py-1.5 rounded-full text-white text-xs font-semibold shadow-sm hover:shadow-md active:scale-95 transition-all" style={{ background: shopSettings?.menu_primary_color || '#ea580c' }}>
                                                                            ADD
                                                                        </button>
                                                                    )
                                                                )}
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    // Multi-column: vertical card with large image on top
                                                    <>
                                                        <div className="aspect-square bg-orange-50 relative overflow-hidden">
                                                            {item.video_url || item.media_type === 'gif' || item.media_type === 'video' ? (
                                                                item.media_type === 'gif' ? (
                                                                    <img
                                                                        src={item.video_url || item.image_url}
                                                                        alt={item.name}
                                                                        className="w-full h-full object-cover"
                                                                        loading="lazy"
                                                                        draggable={false}
                                                                        onContextMenu={(e) => e.preventDefault()}
                                                                    />
                                                                ) : (
                                                                    <video
                                                                        src={item.video_url}
                                                                        className="w-full h-full object-cover"
                                                                        autoPlay
                                                                        loop
                                                                        muted
                                                                        playsInline
                                                                    />
                                                                )
                                                            ) : item.image_url ? (
                                                                <img
                                                                    src={item.image_url}
                                                                    alt={item.name}
                                                                    className="w-full h-full object-cover"
                                                                    loading="lazy"
                                                                    draggable={false}
                                                                    onContextMenu={(e) => e.preventDefault()}
                                                                />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-orange-300">
                                                                    <Utensils className="w-12 h-12" />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="p-2.5 text-center">
                                                            <h3 className={cn(
                                                                "font-semibold text-gray-800 leading-tight line-clamp-2",
                                                                shopSettings?.menu_items_per_row === 3 ? "text-xs" : "text-sm"
                                                            )}>
                                                                {item.name}
                                                            </h3>
                                                            <div className="mt-1.5 flex items-center justify-center gap-2">
                                                                <span
                                                                    className={cn(
                                                                        "font-extrabold",
                                                                        shopSettings?.menu_items_per_row === 3 ? "text-sm" : "text-base"
                                                                    )}
                                                                    style={{ color: shopSettings?.menu_primary_color || '#ea580c' }}
                                                                >
                                                                    ₹{item.price}
                                                                    <span className="text-[10px] font-medium text-gray-400 ml-0.5">
                                                                        /{item.base_value && item.base_value > 1 ? item.base_value : ''}{getShortUnit(item.unit)}
                                                                    </span>
                                                                </span>
                                                            </div>
                                                            {isTableMode && (
                                                                <div className="mt-2">
                                                                    {getCartQuantity(item.id) > 0 ? (
                                                                        <div className="flex items-center justify-center gap-1.5">
                                                                            <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 active:scale-90 transition-transform">
                                                                                <Minus className="w-3.5 h-3.5" />
                                                                            </button>
                                                                            <span className="text-sm font-bold w-6 text-center">{getCartQuantity(item.id)}</span>
                                                                            <button onClick={() => addToCart(item)} className="w-8 h-8 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform" style={{ background: shopSettings?.menu_primary_color || '#ea580c' }}>
                                                                                <Plus className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <button onClick={() => addToCart(item)} className="px-4 py-1.5 rounded-full text-white text-xs font-semibold shadow-sm hover:shadow-md active:scale-95 transition-all" style={{ background: shopSettings?.menu_primary_color || '#ea580c' }}>
                                                                            ADD
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </main>

            {/* ========== TABLE ORDERING UI ========== */}

            {/* My Orders Section (when table mode + has orders) */}
            {
                isTableMode && sessionOrders.length > 0 && showMyOrders && (
                    <div className="max-w-2xl mx-auto px-4 pb-4">
                        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                            <button
                                onClick={() => setShowMyOrders(!showMyOrders)}
                                className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50"
                            >
                                <div className="flex items-center gap-2">
                                    <ChefHat className="w-5 h-5 text-blue-600" />
                                    <span className="font-bold text-blue-900">Your Orders — Table {tableNo}{seatId ? ` (Seat ${seatId})` : ''}</span>
                                    <Badge className="bg-blue-100 text-blue-700 text-xs">{sessionOrders.length}</Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-blue-700">₹{sessionTotal.toFixed(0)}</span>
                                    <ChevronUp className="w-4 h-4 text-blue-500" />
                                </div>
                            </button>

                            <div className="divide-y divide-gray-50">
                                {sessionOrders.map(order => (
                                    <div key={order.id} className="p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-semibold text-gray-800 text-sm">Order #{order.order_number}</span>
                                            <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border", getStatusColor(order.status))}>
                                                {getStatusIcon(order.status)}
                                                <span>{getStatusLabel(order.status)}</span>
                                            </div>
                                        </div>
                                        {order.items.map((item: any, idx: number) => (
                                            <div key={idx} className="flex justify-between text-sm text-gray-600 py-0.5">
                                                <div>
                                                    <span>{item.name} ×{item.quantity}</span>
                                                    {item.instructions && (
                                                        <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                                                            <MessageSquare className="w-3 h-3" /> {item.instructions}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className="font-medium">₹{((item.quantity / (item.base_value || 1)) * item.price).toFixed(0)}</span>
                                            </div>
                                        ))}
                                        {order.customer_note && (
                                            <p className="text-xs text-gray-400 mt-1 italic">Note: {order.customer_note}</p>
                                        )}
                                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
                                            <span className="text-xs text-gray-400">
                                                {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <span className="font-bold text-sm" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }}>₹{order.total_amount.toFixed(0)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {shopSettings?.qr_payment_enabled && (
                                <div className="p-4 bg-slate-50 border-t border-gray-100 flex flex-col gap-2">
                                    <div className="flex justify-between items-center text-sm font-semibold text-gray-700 mb-1">
                                        <span>Total Outstanding Bill:</span>
                                        <span className="text-base text-gray-900 font-bold">₹{sessionTotal.toFixed(0)}</span>
                                    </div>
                                    <Button
                                        onClick={() => setShowCheckoutDialog(true)}
                                        className="w-full py-2.5 rounded-xl text-white font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-md animate-pulse"
                                        style={{
                                            background: shopSettings?.menu_primary_color
                                                ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color}cc)`
                                                : 'linear-gradient(135deg, #ea580c, #dc2626)'
                                        }}
                                    >
                                        <QrCode className="w-5 h-5" />
                                        <span>Pay Bill via UPI (₹{sessionTotal.toFixed(0)})</span>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Cart Overlay */}
            {
                isTableMode && showCart && cart.length > 0 && (
                    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end" onClick={() => setShowCart(false)}>
                        <div className="w-full max-w-2xl mx-auto bg-white rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between p-4 border-b">
                                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <ShoppingCart className="w-5 h-5" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }} />
                                    Your Cart
                                </h2>
                                <button onClick={() => setShowCart(false)} className="p-1 rounded-full hover:bg-gray-100">
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {cart.map(item => (
                                    <div key={item.id} className="bg-gray-50 rounded-xl p-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-semibold text-sm text-gray-800 truncate">{item.name}</h4>
                                                <span className="text-xs text-gray-500">₹{item.price}/{item.base_value && item.base_value > 1 ? item.base_value : ''}{getShortUnit(item.unit)}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 rounded-full bg-white border flex items-center justify-center hover:bg-gray-100">
                                                    <Minus className="w-3.5 h-3.5" />
                                                </button>
                                                <span className="text-sm font-bold w-5 text-center">{item.quantity / (item.base_value || 1)}</span>
                                                <button onClick={() => updateQuantity(item.id, 1)} className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: shopSettings?.menu_primary_color || '#ea580c' }}>
                                                    <Plus className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center hover:bg-red-100">
                                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                                </button>
                                            </div>
                                        </div>
                                        {/* Per-item instructions */}
                                        <div className="mt-2">
                                            {instructionItemId === item.id ? (
                                                <div className="flex gap-1">
                                                    <Input
                                                        placeholder="e.g. Extra spicy, no onion..."
                                                        value={item.instructions}
                                                        onChange={e => setItemInstructions(item.id, e.target.value)}
                                                        className="h-8 text-xs"
                                                        autoFocus
                                                    />
                                                    <button onClick={() => setInstructionItemId(null)} className="px-2 py-1 text-xs rounded bg-gray-200 hover:bg-gray-300">
                                                        Done
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setInstructionItemId(item.id)}
                                                    className="text-xs text-amber-600 flex items-center gap-1 hover:text-amber-700"
                                                >
                                                    <MessageSquare className="w-3 h-3" />
                                                    {item.instructions || 'Add instructions'}
                                                </button>
                                            )}
                                        </div>
                                        <div className="text-right mt-1">
                                            <span className="font-bold text-sm" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }}>
                                                ₹{((item.quantity / (item.base_value || 1)) * item.price).toFixed(0)}
                                            </span>
                                        </div>
                                    </div>
                                ))}

                                {/* General order note */}
                                <div className="pt-2">
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Note for kitchen (optional)</label>
                                    <Input
                                        placeholder="Any general instructions..."
                                        value={orderNote}
                                        onChange={e => setOrderNote(e.target.value)}
                                        className="h-9 text-sm"
                                    />
                                </div>
                            </div>

                            {/* Cart summary + Place Order */}
                            <div className="p-4 border-t bg-white space-y-2">
                                <div className="space-y-1 text-xs text-gray-500">
                                    <div className="flex justify-between">
                                        <span>Subtotal:</span>
                                        <span>₹{cartSubtotal.toFixed(2)}</span>
                                    </div>
                                    {cartExclusiveTax > 0 && (
                                        <div className="flex justify-between text-amber-600 font-medium">
                                            <span>Tax (Exclusive):</span>
                                            <span>+₹{cartExclusiveTax.toFixed(2)}</span>
                                        </div>
                                    )}
                                    {gstEnabled && cartTaxesList.map((entry: any) => (
                                        <div key={entry.rate} className="flex justify-between pl-2 text-[10px] text-gray-400">
                                            <span>{entry.name} (Taxable ₹{entry.taxable.toFixed(2)}):</span>
                                            <span>₹{entry.tax.toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between items-center mb-1.5 pt-1.5 border-t">
                                    <span className="text-sm text-gray-600 font-semibold">{cartItemCount} item{cartItemCount !== 1 ? 's' : ''}</span>
                                    <span className="text-lg font-bold" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }}>₹{cartTotal.toFixed(2)}</span>
                                </div>
                                <Button
                                    onClick={placeOrder}
                                    disabled={isPlacingOrder || cart.length === 0}
                                    className="w-full h-12 text-base font-bold rounded-xl text-white"
                                    style={{ background: shopSettings?.menu_primary_color ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color})` : 'linear-gradient(135deg, #ea580c, #dc2626)' }}
                                >
                                    {isPlacingOrder ? (
                                        <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Placing Order...</>
                                    ) : (
                                        <><Send className="w-5 h-5 mr-2" /> Place Order ₹{cartTotal.toFixed(2)}</>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Floating Cart Bar (when table mode + items in cart) */}
            {
                isTableMode && cartItemCount > 0 && !showCart && (
                    <div className="fixed bottom-[76px] left-0 right-0 z-50 px-4">
                        <button
                            onClick={() => setShowCart(true)}
                            className="w-full max-w-2xl mx-auto flex items-center justify-between px-5 py-3.5 rounded-2xl shadow-xl text-white transition-transform active:scale-[0.98]"
                            style={{ background: shopSettings?.menu_primary_color ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color})` : 'linear-gradient(135deg, #ea580c, #dc2626)' }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <ShoppingCart className="w-5 h-5" />
                                    <span className="absolute -top-2 -right-2 bg-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }}>
                                        {cartItemCount}
                                    </span>
                                </div>
                                <span className="font-semibold">{cartItemCount} item{cartItemCount !== 1 ? 's' : ''} in cart</span>
                            </div>
                            <span className="font-bold text-lg">₹{cartTotal.toFixed(0)} →</span>
                        </button>
                    </div>
                )
            }

            {/* My Orders Toggle Button (table mode, no cart) */}
            {
                isTableMode && sessionOrders.length > 0 && cartItemCount === 0 && !showMyOrders && !isSessionComplete && !isAllServed && (
                    <div className="fixed bottom-[76px] left-0 right-0 z-50 px-4">
                        <button
                            onClick={() => setShowMyOrders(true)}
                            className="w-full max-w-2xl mx-auto flex items-center justify-between px-5 py-3 rounded-2xl shadow-lg bg-blue-600 text-white"
                        >
                            <div className="flex items-center gap-2">
                                <ChefHat className="w-5 h-5" />
                                <span className="font-semibold">My Orders ({sessionOrders.length})</span>
                            </div>
                            <span className="font-bold">₹{sessionTotal.toFixed(0)}</span>
                        </button>
                    </div>
                )
            }

            {/* All Orders Served — Re-order or Request Bill */}
            {
                isTableMode && isAllServed && cartItemCount === 0 && (
                    <div className="fixed bottom-[76px] left-0 right-0 z-50 px-4">
                        <div
                            className="w-full max-w-2xl mx-auto rounded-2xl shadow-xl p-4 text-center border"
                            style={{
                                background: `linear-gradient(135deg, ${shopSettings?.menu_primary_color || '#ea580c'}08, ${shopSettings?.menu_secondary_color || '#dc2626'}12)`,
                                borderColor: `${shopSettings?.menu_primary_color || '#ea580c'}25`
                            }}
                        >
                            <CheckCircle2 className="w-7 h-7 mx-auto mb-1.5" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }} />
                            <p className="font-semibold text-sm mb-0.5" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }}>All items served! ✨</p>
                            <p className="text-gray-500 text-xs mb-3">Would you like anything else?</p>
                            <div className="flex items-center gap-2 justify-center">
                                    <button
                                        onClick={() => { setShowMyOrders(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-sm text-white shadow-md hover:shadow-lg active:scale-95 transition-all"
                                        style={{ background: shopSettings?.menu_primary_color ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color})` : 'linear-gradient(135deg, #ea580c, #dc2626)' }}
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        Place More Order
                                    </button>
                                {shopSettings?.qr_payment_enabled ? (
                                    <button
                                        onClick={() => setShowCheckoutDialog(true)}
                                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-sm text-white shadow-md hover:shadow-lg active:scale-95 transition-all"
                                        style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                                    >
                                        <QrCode className="w-4 h-4" />
                                        Pay Bill (UPI)
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => sendHelpRequest('need_bill')}
                                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-sm bg-white border-2 shadow-md hover:shadow-lg active:scale-95 transition-all"
                                        style={{ borderColor: shopSettings?.menu_primary_color || '#ea580c', color: shopSettings?.menu_primary_color || '#ea580c' }}
                                    >
                                        <Receipt className="w-4 h-4" />
                                        Request Bill
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Session Complete — Start New Order */}
            {
                isTableMode && isSessionComplete && cartItemCount === 0 && (
                    <div className="fixed bottom-[76px] left-0 right-0 z-50 px-4">
                        <div className="w-full max-w-2xl mx-auto bg-green-50 border border-green-200 rounded-2xl shadow-lg p-4 text-center">
                            <p className="text-green-800 font-semibold text-sm mb-1">Bill generated!</p>
                            <p className="text-green-600 text-xs mb-3">You can still order more items if you wish.</p>
                            <button
                                onClick={() => { setShowMyOrders(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-green-600 hover:bg-green-700 text-white font-bold shadow-md transition-colors"
                            >
                                <Utensils className="w-4 h-4" />
                                Place More Order
                            </button>
                        </div>
                    </div>
                )
            }

            {/* ========== HELP / NEED SERVICE BUTTON ========== */}
            {isTableMode && !isSessionComplete && (
                <>
                    {/* Floating Help Button */}
                    <button
                        onClick={() => setShowHelpSheet(true)}
                        className="fixed z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-2xl text-white font-bold text-sm transition-all duration-300 hover:scale-105 active:scale-95"
                        style={{
                            background: shopSettings?.menu_primary_color
                                ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color})`
                                : 'linear-gradient(135deg, #ea580c, #dc2626)',
                            bottom: cart.length > 0 ? '180px' : (showMyOrders && sessionOrders.length > 0) ? '140px' : '100px',
                            right: '16px',
                        }}
                    >
                        <Bell className="w-4 h-4" />
                        Need Help?
                        {Object.keys(helpStatus).length > 0 && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse border-2 border-white" />
                        )}
                    </button>

                    {/* Help Status Toast (shows when request is active) */}
                    {Object.entries(helpStatus).map(([type, status]) => (
                        <div
                            key={type}
                            className={`fixed left-4 right-4 z-[60] max-w-md mx-auto rounded-2xl px-4 py-3 shadow-xl text-sm font-semibold text-center transition-all duration-500 ${status === 'acknowledged'
                                    ? 'bg-green-100 text-green-800 border border-green-200'
                                    : status === 'pending'
                                        ? 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                                        : 'bg-blue-100 text-blue-800 border border-blue-200'
                                }`}
                            style={{
                                bottom: cart.length > 0 ? '230px' : (showMyOrders && sessionOrders.length > 0) ? '190px' : '150px',
                            }}
                        >
                            {status === 'acknowledged' && '👍 Staff is coming to your table!'}
                            {status === 'pending' && `⏳ ${HELP_ACTIONS.find(a => a.type === type)?.label || 'Request'} sent...`}
                            {status === 'resolved' && '✅ Request completed!'}
                        </div>
                    ))}

                    {/* Help Bottom Sheet */}
                    {showHelpSheet && (
                        <div className="fixed inset-0 z-[70] flex items-end justify-center">
                            {/* Backdrop */}
                            <div
                                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                                onClick={() => { setShowHelpSheet(false); setShowCustomInput(false); }}
                            />
                            {/* Sheet */}
                            <div className="relative w-full max-w-md bg-white rounded-t-3xl shadow-2xl p-5 pb-8 animate-in slide-in-from-bottom duration-300">
                                {/* Handle */}
                                <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-gray-900 mb-1 text-center">Need Assistance?</h3>
                                <p className="text-xs text-gray-500 mb-4 text-center">Table {tableNo}{seatId ? ` - Seat ${seatId}` : ''} • Tap to notify staff</p>

                                <div className="grid grid-cols-2 gap-3">
                                    {HELP_ACTIONS.filter(a => a.type !== 'custom').map((action) => {
                                        const status = helpStatus[action.type];
                                        const isPending = status === 'pending' || status === 'acknowledged';
                                        const isOnCooldown = Date.now() < (helpCooldowns[action.type] || 0);
                                        const statusText = getHelpStatusText(action.type);
                                        const remainingSec = isOnCooldown
                                            ? Math.ceil(((helpCooldowns[action.type] || 0) - Date.now()) / 1000)
                                            : 0;
                                        return (
                                            <button
                                                key={action.type}
                                                onClick={() => !isPending && sendHelpRequest(action.type)}
                                                disabled={isOnCooldown || isPending}
                                                className={`flex flex-col items-center gap-2 p-4 rounded-2xl text-white font-semibold text-sm transition-all duration-200 ${action.color} ${
                                                    isOnCooldown || isPending
                                                        ? 'opacity-60 cursor-not-allowed filter saturate-[0.6]'
                                                        : 'hover:opacity-90 active:scale-95 shadow-lg hover:shadow-xl'
                                                }`}
                                            >
                                                <action.icon className={cn("w-6 h-6", isPending && "animate-pulse")} />
                                                <span>{action.label}</span>
                                                {isPending && (
                                                    <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded-full font-normal">Active (Pending)</span>
                                                )}
                                                {isOnCooldown && !isPending && (
                                                    <span className="text-[10px] opacity-75">Wait {remainingSec}s</span>
                                                )}
                                                {statusText && !isOnCooldown && !isPending && (
                                                    <span className="text-[10px] opacity-85">{statusText}</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Custom Request */}
                                <div className="mt-3">
                                    {!showCustomInput ? (
                                        <button
                                            onClick={() => setShowCustomInput(true)}
                                            className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-colors"
                                        >
                                            <MessageCircle className="w-4 h-4" />
                                            ✏️ Send Custom Message
                                        </button>
                                    ) : (
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={customHelpMsg}
                                                onChange={(e) => setCustomHelpMsg(e.target.value)}
                                                placeholder="Type your request..."
                                                className="flex-1 px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                autoFocus
                                                maxLength={200}
                                            />
                                            <button
                                                onClick={() => customHelpMsg.trim() && sendHelpRequest('custom', customHelpMsg.trim())}
                                                disabled={!customHelpMsg.trim()}
                                                className="px-4 py-3 rounded-2xl bg-amber-500 text-white font-bold text-sm disabled:opacity-50 hover:bg-amber-600 transition-colors"
                                            >
                                                <Send className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Close */}
                                <button
                                    onClick={() => { setShowHelpSheet(false); setShowCustomInput(false); }}
                                    className="mt-4 w-full py-3 rounded-2xl border-2 border-gray-200 text-gray-500 font-semibold text-sm hover:bg-gray-50 transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* UPI Checkout Dialog Overlay */}
            {showCheckoutDialog && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <QrCode className="w-5 h-5 text-emerald-600" />
                                UPI Self Checkout
                            </h3>
                            <button
                                onClick={() => { setShowCheckoutDialog(false); setPaymentReference(''); setIsPaymentConfirmed(false); }}
                                className="p-1 rounded-full hover:bg-gray-100"
                            >
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                            <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 text-center">
                                <span className="text-xs text-emerald-700 font-semibold uppercase tracking-wider block mb-1">Amount to Pay</span>
                                <span className="text-3xl font-extrabold text-emerald-900">₹{sessionTotal.toFixed(2)}</span>
                                <p className="text-[11px] text-emerald-600/80 mt-1">Table {tableNo}{seatId ? ` (Seat ${seatId})` : ''} • Order Total</p>
                            </div>

                            {/* Merchant Details */}
                            <div className="text-xs space-y-1.5 text-gray-600 bg-gray-50 p-3 rounded-xl">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Merchant Name:</span>
                                    <span className="font-semibold text-gray-800">{shopSettings?.upi_name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">UPI ID:</span>
                                    <span className="font-semibold text-gray-800 font-mono">{shopSettings?.upi_id}</span>
                                </div>
                            </div>

                            {isPaymentConfirmed ? (
                                <div className="text-center py-6 space-y-3">
                                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                                        <CheckCircle2 className="w-10 h-10" />
                                    </div>
                                    <h4 className="font-bold text-gray-900">Reference Submitted!</h4>
                                    <p className="text-xs text-gray-500 max-w-xs mx-auto">
                                        We have notified the staff of your payment reference ({paymentReference}). Cashier will verify and mark your table as billed shortly.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {/* Mobile Quick Pay Button */}
                                    <div className="block md:hidden">
                                        <a
                                            href={`upi://pay?pa=${shopSettings?.upi_id}&pn=${encodeURIComponent(shopSettings?.upi_name || '')}&am=${sessionTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Table ' + tableNo + (seatId ? ' Seat ' + seatId : '') + ' Bill')}`}
                                            className="w-full h-12 text-sm font-bold rounded-xl text-white flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-95 transition-all"
                                            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                                        >
                                            <Send className="w-4 h-4" />
                                            Open in UPI App & Pay
                                        </a>
                                        <div className="relative my-4 text-center">
                                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                                            <span className="relative bg-white px-3 text-xs text-gray-400">OR SCAN QR CODE</span>
                                        </div>
                                    </div>

                                    {/* QR Code Section */}
                                    <div className="flex flex-col items-center justify-center p-3 bg-white border border-gray-100 rounded-2xl shadow-sm max-w-[240px] mx-auto">
                                        <img
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                                                `upi://pay?pa=${shopSettings?.upi_id}&pn=${encodeURIComponent(shopSettings?.upi_name || '')}&am=${sessionTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Table ' + tableNo + (seatId ? ' Seat ' + seatId : '') + ' Bill')}`
                                            )}`}
                                            alt="UPI QR Code"
                                            className="w-40 h-40 object-contain"
                                        />
                                        <span className="text-[10px] text-gray-400 mt-2 font-medium">Scan using GPay, PhonePe, Paytm etc.</span>
                                    </div>

                                    {/* Reference Verification Input */}
                                    <div className="space-y-2 pt-2 border-t">
                                        <Label htmlFor="payment_ref" className="text-xs font-semibold text-gray-700">Enter Payment Reference (UTR / Txn ID) *</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                id="payment_ref"
                                                placeholder="Enter 12-digit UTR or last 4 digits"
                                                value={paymentReference}
                                                onChange={e => setPaymentReference(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                                                className="h-10 text-sm font-mono"
                                                maxLength={24}
                                            />
                                            <Button
                                                onClick={submitPaymentReference}
                                                disabled={isSubmittingReference || !paymentReference.trim()}
                                                className="h-10 px-4 bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold rounded-xl"
                                            >
                                                {isSubmittingReference ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
                                            </Button>
                                        </div>
                                        <p className="text-[10px] text-gray-400">
                                            Crucial: Enter the reference number after completing payment to notify the cashier instantly.
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Footer with Contact Info */}
            <footer
                className="fixed bottom-0 left-0 right-0 text-white py-2 shadow-2xl backdrop-blur-sm"
                style={{
                    background: shopSettings?.menu_primary_color
                        ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}ee, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color}dd)`
                        : 'linear-gradient(135deg, #ea580cee, #dc2626dd)'
                }}
            >
                <div className="max-w-2xl mx-auto px-4">
                    {(showPhone || showAddress) && (
                        <div className="flex items-center justify-center gap-3 text-xs">
                            {showPhone && shopSettings?.contact_number && (
                                <div className="flex items-center gap-2">
                                    {/* Call Button */}
                                    <a
                                        href={`tel:${shopSettings.contact_number}`}
                                        className="flex items-center justify-center w-9 h-9 bg-white/15 hover:bg-white/25 rounded-xl transition-all duration-200 backdrop-blur-sm border border-white/20 hover:scale-105"
                                        aria-label="Call us"
                                    >
                                        <Phone className="w-4 h-4" />
                                    </a>
                                    {/* WhatsApp Button - Official Logo */}
                                    <a
                                        href={`https://wa.me/${shopSettings.contact_number.replace(/[^0-9]/g, '')}?text=Hi! I visited your restaurant and have a query.`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center w-9 h-9 bg-[#25D366] hover:bg-[#20BD5A] rounded-xl transition-all duration-200 border border-[#25D366]/40 hover:scale-105 shadow-md"
                                        aria-label="WhatsApp us"
                                    >
                                        <svg viewBox="0 0 32 32" className="w-5 h-5" fill="white">
                                            <path d="M16.004 0h-.008C7.174 0 0 7.176 0 16c0 3.5 1.132 6.744 3.054 9.378L1.054 31.29l6.166-1.964C9.79 30.988 12.79 32 16.004 32 24.826 32 32 24.822 32 16S24.826 0 16.004 0zm9.31 22.608c-.39 1.1-1.932 2.014-3.166 2.28-.846.18-1.95.322-5.668-1.218-4.762-1.97-7.824-6.8-8.062-7.114-.228-.314-1.918-2.554-1.918-4.872s1.214-3.456 1.644-3.928c.43-.472.94-.59 1.254-.59.312 0 .626.002.9.016.288.016.676-.11 1.058.808.39.94 1.328 3.242 1.446 3.476.118.234.196.508.04.82-.158.314-.236.508-.47.784-.236.274-.496.614-.708.824-.236.234-.482.49-.208.962.274.47 1.22 2.014 2.62 3.264 1.8 1.606 3.316 2.104 3.786 2.338.472.234.748.196 1.022-.118.274-.314 1.176-1.372 1.49-1.844.314-.47.626-.39 1.058-.234.43.156 2.736 1.292 3.206 1.526.47.234.784.352.9.548.118.196.118 1.138-.27 2.238z" />
                                        </svg>
                                    </a>
                                </div>
                            )}
                            {showAddress && shopSettings?.address && (
                                <a
                                    href={shopSettings.shop_latitude && shopSettings.shop_longitude
                                        ? `https://www.google.com/maps?q=${shopSettings.shop_latitude},${shopSettings.shop_longitude}`
                                        : `https://www.google.com/maps/search/${encodeURIComponent(shopSettings.address)}`
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-white/90 hover:text-white transition-colors"
                                >
                                    <MapPin className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate max-w-[180px] text-[10px]">{shopSettings.address}</span>
                                </a>
                            )}
                        </div>
                    )}
                    <p className={cn(
                        "text-center text-[7px] text-white/25 tracking-wider uppercase",
                        (showPhone || showAddress) ? "mt-1" : ""
                    )}>
                        Powered by ZenPOS
                    </p>
                </div>
            </footer>

            {/* Smart AI Waiter Floating Button */}
            {shopSettings?.menu_ai_features_enabled && (
                <button 
                    onClick={() => {
                        // Intelligent Search Logic - populate search with smart tags
                        const smartTags = ["Spicy", "Vegan", "Sweet", "Bestseller", "Quick"];
                        const randomTag = smartTags[Math.floor(Math.random() * smartTags.length)];
                        setSearchQuery(randomTag);
                        setShowSearch(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        toast({
                            title: "🤖 AI Smart Waiter",
                            description: `I'm filtering the menu for "${randomTag}" items for you! Try searching for other tastes.`,
                            duration: 4000
                        });
                    }}
                    className={cn(
                        "fixed bottom-24 right-4 z-40 w-12 h-12 rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-110 active:scale-95 animate-bounce",
                        shopSettings?.menu_glassmorphism ? "backdrop-blur-md bg-white/90 border border-white/40" : "bg-white border border-gray-200"
                    )}
                >
                    <Sparkles className="w-6 h-6 text-amber-500" />
                </button>
            )}
        </div>
    );
};

export default PublicMenu;
