import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { CalendarDays, TrendingUp, TrendingDown, DollarSign, Package, Receipt, CreditCard, BarChart3, Edit, Trash2, Eye, Download, FileSpreadsheet, Printer, Search, MessageCircle, Phone, Image as ImageIcon, FileText, Loader2 } from 'lucide-react';
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from '@/components/SocialIcons';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { exportAllReportsToExcel, exportAllReportsToPDF } from '@/utils/exportUtils';
import { cachedFetch, CACHE_KEYS, invalidateRelatedData } from '@/utils/cacheUtils';
import { printReceipt } from '@/utils/bluetoothPrinter';
import { printBrowserReceipt } from '@/utils/browserPrinter';
import { offlineManager } from '@/utils/offlineManager';
import { formatQuantityWithUnit, getShortUnit, calculateSmartQtyCount } from '@/utils/timeUtils';
import { formatBillMessage, shareViaWhatsApp, isValidPhoneNumber } from '@/utils/whatsappBillShare';
import { shareBillImageViaWhatsApp, type BillImageData } from '@/utils/billImageGenerator';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';

interface Bill {
  id: string;
  bill_no: string;
  total_amount: number;
  discount: number;
  payment_mode: string;
  date: string;
  created_at: string;
  is_deleted: boolean;
  payment_details?: Record<string, number>;
  additional_charges?: Array<{ name: string; amount: number }>;
  bill_items: BillItem[];
  table_no?: string;
  tax_summary?: any;
  total_tax?: number;
}

interface BillItem {
  id: string;
  quantity: number;
  price: number;
  total: number;
  item_id: string;
  items: {
    name: string;
    category: string;
    is_active?: boolean;
    unit?: string;
    purchase_rate?: number;
    base_value?: number;
  };
}

interface Expense {
  id: string;
  amount: number;
  category: string;
  date: string;
}

interface ItemReport {
  item_name: string;
  category: string;
  total_quantity: number;
  total_revenue: number;
  unit?: string;
}

const Reports: React.FC = () => {
  const { profile } = useAuth();
  const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
  const { branchFilterId, activeBranch, isAllBranchesView } = useBranchScopedQuery(() => fetchReports());
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState('today');
  const [hourRange, setHourRange] = useState(12);
  const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [itemReports, setItemReports] = useState<ItemReport[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [billFilter, setBillFilter] = useState('processed');
  const [orderTypeFilter, setOrderTypeFilter] = useState<'all' | 'dine_in' | 'parcel'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [itemSortBy, setItemSortBy] = useState<'amount' | 'quantity'>('amount');
  const [billSettings, setBillSettings] = useState<{
    shopName: string;
    address: string;
    contactNumber: string;
    logoUrl: string;
    facebook: string;
    showFacebook?: boolean;
    instagram: string;
    showInstagram?: boolean;
    whatsapp: string;
    showWhatsapp?: boolean;
    gstin?: string;
  } | null>(null);

  // Delete confirmation dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [billToDelete, setBillToDelete] = useState<string | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [billToRestore, setBillToRestore] = useState<string | null>(null);

  // WhatsApp share state
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [showWhatsappInput, setShowWhatsappInput] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);

  // Handle WhatsApp share for selected bill
  const handleWhatsAppShareBill = (bill: Bill, mode: 'text' | 'image' = 'text') => {
    // Text mode requires phone number; image mode does not
    if (mode === 'text') {
      if (!whatsappPhone.trim()) {
        toast({ title: "Enter phone number", description: "Please enter customer's phone number for text share", variant: "destructive" });
        return;
      }
      if (!isValidPhoneNumber(whatsappPhone)) {
        toast({ title: "Invalid phone", description: "Enter a valid 10-digit mobile number", variant: "destructive" });
        return;
      }
    }

    const subtotal = bill.bill_items.reduce((sum, item) => sum + item.total, 0);
    const billDate = new Date(bill.created_at);

    if (mode === 'image') {
      // Image mode
      setSharingImage(true);
      const billData: BillImageData = {
        billNo: bill.bill_no,
        shopName: billSettings?.shopName || profile?.hotel_name || 'Hotel',
        address: billSettings?.address,
        phone: billSettings?.contactNumber,
        gstin: billSettings?.gstin,
        items: bill.bill_items.map(item => ({
          name: item.items?.name || 'Item',
          quantity: item.quantity,
          total: item.total,
          unit: item.items?.unit,
          price: item.price,
          base_value: item.items?.base_value
        })),
        subtotal,
        discount: bill.discount,
        additionalCharges: bill.additional_charges || [],
        total: bill.total_amount,
        date: format(billDate, 'dd/MM/yyyy'),
        time: format(billDate, 'hh:mm a'),
        paymentMethod: bill.payment_mode,
        totalItemsCount: bill.bill_items.length,
        smartQtyCount: calculateSmartQtyCount(bill.bill_items.map(bi => ({ quantity: bi.quantity, unit: bi.items?.unit }))),
        paymentDetails: bill.payment_details as Record<string, number> | undefined,
        taxSummary: bill.tax_summary ? (typeof bill.tax_summary === 'string' ? bill.tax_summary : JSON.stringify(bill.tax_summary)) : undefined,
        totalTax: bill.total_tax || undefined,
        isComposition: (bill as any).is_composition || undefined,
        roundOff: (bill as any).round_off || undefined,
        orderType: (bill as any).order_type || undefined
      };
      shareBillImageViaWhatsApp('', billData).then(result => {
        setSharingImage(false);
        if (result.success) {
          setWhatsappPhone('');
          setShowWhatsappInput(false);
          toast({
            title: result.method === 'share' ? 'Bill Image Shared!' : 'Bill Image Downloaded',
            description: result.method === 'share' ? 'Shared via WhatsApp' : 'Image downloaded. Attach in WhatsApp.',
          });
        } else {
          toast({ title: "Share Failed", description: result.error, variant: "destructive" });
        }
      }).catch(() => setSharingImage(false));
    } else {
      // Text mode
      const message = formatBillMessage({
        billNo: bill.bill_no,
        shopName: billSettings?.shopName || profile?.hotel_name || 'Hotel',
        gstin: billSettings?.gstin,
        items: bill.bill_items.map(item => ({
          name: item.items?.name || 'Item',
          quantity: item.quantity,
          total: item.total,
          unit: item.items?.unit,
          price: item.price,
          base_value: item.items?.base_value
        })),
        subtotal,
        discount: bill.discount,
        additionalCharges: bill.additional_charges || [],
        total: bill.total_amount,
        date: format(billDate, 'dd/MM/yyyy'),
        time: format(billDate, 'hh:mm a'),
        paymentMethod: bill.payment_mode,
        taxSummary: bill.tax_summary ? (typeof bill.tax_summary === 'string' ? bill.tax_summary : JSON.stringify(bill.tax_summary)) : undefined,
        totalTax: bill.total_tax || undefined,
        isComposition: (bill as any).is_composition || undefined,
        roundOff: (bill as any).round_off || undefined,
        orderType: (bill as any).order_type || undefined
      });

      shareViaWhatsApp(whatsappPhone, message);
      setWhatsappPhone('');
      setShowWhatsappInput(false);
      toast({ title: "Opening WhatsApp", description: "Bill details ready to send" });
    }
  };

  // Cache-first loading: localStorage first, then Supabase sync
  useEffect(() => {
    const headerKey = branchFilterId ? `hotel_pos_bill_header_${branchFilterId}` : 'hotel_pos_bill_header';
    // 1. Instant load from localStorage (cache)
    const savedSettings = localStorage.getItem(headerKey) ?? localStorage.getItem('hotel_pos_bill_header');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setBillSettings({
          shopName: parsed.shopName || '',
          address: parsed.address || '',
          contactNumber: parsed.contactNumber || '',
          logoUrl: parsed.logoUrl || '',
          facebook: parsed.facebook || '',
          showFacebook: parsed.showFacebook !== false,
          instagram: parsed.instagram || '',
          showInstagram: parsed.showInstagram !== false,
          whatsapp: parsed.whatsapp || '',
          showWhatsapp: parsed.showWhatsapp !== false,
          gstin: parsed.gstin || ''
        });
      } catch (e) { /* ignore parse errors */ }
    }

    // 2. Background sync from Supabase
    const syncFromSupabase = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('shop_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        const settings = {
          shopName: data.shop_name || '',
          address: data.address || '',
          contactNumber: data.contact_number || '',
          logoUrl: data.logo_url || '',
          facebook: data.facebook || '',
          showFacebook: data.show_facebook,
          instagram: data.instagram || '',
          showInstagram: data.show_instagram,
          whatsapp: data.whatsapp || '',
          showWhatsapp: data.show_whatsapp,
          gstin: data.gstin || ''
        };
        setBillSettings(settings);
        // Update cache
        const headerKey = branchFilterId ? `hotel_pos_bill_header_${branchFilterId}` : 'hotel_pos_bill_header';
        localStorage.setItem(headerKey, JSON.stringify(settings));
      }
    };

    syncFromSupabase();
  }, []);

  const fetchReportsCallback = useCallback(() => {
    fetchReports();
  }, [dateRange, customStartDate, customEndDate, billFilter, hourRange]);

  useEffect(() => {
    fetchReportsCallback();
  }, [fetchReportsCallback]);

  // Real-time subscription for bills changes
  useEffect(() => {
    const channel = supabase
      .channel('reports-bills-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bills',
        },
        () => {
          // Invalidate cache and refetch
          invalidateRelatedData('bills');
          fetchReportsCallback();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchReportsCallback]);

  // Listen for custom bills-updated event (backup mechanism)
  useEffect(() => {
    const handleBillsUpdated = () => {
      console.log('Bills updated event received, invalidating cache and refreshing...');
      invalidateRelatedData('bills');
      fetchReportsCallback();
    };

    window.addEventListener('bills-updated', handleBillsUpdated);

    return () => {
      window.removeEventListener('bills-updated', handleBillsUpdated);
    };
  }, [fetchReportsCallback]);

  const getDateFilter = () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    switch (dateRange) {
      case 'hourly': {
        const startByHours = new Date(today);
        const safeHours = Math.max(1, Math.min(hourRange, 24));
        startByHours.setHours(startByHours.getHours() - safeHours);
        return { start: startByHours.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
      }

      case 'today':
        return { start: today.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
      case 'yesterday':
        return { start: yesterday.toISOString().split('T')[0], end: yesterday.toISOString().split('T')[0] };
      case 'week': {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 7);
        return { start: weekStart.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
      }
      case 'month': {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        return { start: monthStart.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
      }
      case 'year': {
        const yearStart = new Date(today.getFullYear(), 0, 1);
        return { start: yearStart.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
      }
      case 'all':
        return { start: '2000-01-01', end: today.toISOString().split('T')[0] };
      case 'custom':
        // Validate custom dates
        if (!customStartDate || !customEndDate) {
          return { start: today.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
        }
        if (new Date(customEndDate) < new Date(customStartDate)) {
          toast({
            title: "Invalid Date Range",
            description: "End date cannot be before start date",
            variant: "destructive",
          });
          return { start: customStartDate, end: customStartDate };
        }
        return { start: customStartDate, end: customEndDate };
      default:
        return { start: today.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
    }
  };

  const fetchReports = async () => {
    if (dateRange === 'custom' && (!customStartDate || !customEndDate)) return;

    setLoading(true);

    try {
      const { start, end } = getDateFilter();
      const isOffline = !navigator.onLine;

      // OFFLINE MODE - Load from IndexedDB cache
      if (isOffline) {
        console.log('📴 Offline mode: Loading reports from cache...');

        try {
          const cachedBills = await offlineManager.getCachedBills();

          // Filter by date range
          let filteredBills = cachedBills.filter((bill: any) => {
            const billDate = bill.date;
            return billDate >= start && billDate <= end;
          });

          // Apply deleted/processed filter
          if (billFilter === 'processed') {
            filteredBills = filteredBills.filter((bill: any) => !bill.is_deleted);
          } else {
            filteredBills = filteredBills.filter((bill: any) => bill.is_deleted);
          }

          // Sort by created_at descending
          filteredBills.sort((a: any, b: any) => {
            const dateA = new Date(a.created_at || a.date).getTime();
            const dateB = new Date(b.created_at || b.date).getTime();
            return dateB - dateA;
          });

          // Apply hourly filter if needed
          if (dateRange === 'hourly') {
            const now = new Date();
            const safeHours = Math.max(1, Math.min(hourRange, 24));
            const fromTime = new Date(now.getTime() - safeHours * 60 * 60 * 1000);

            filteredBills = filteredBills.filter((bill: any) => {
              const createdAt = bill.created_at ? new Date(bill.created_at) : new Date(bill.date);
              return createdAt >= fromTime && createdAt <= now;
            });
          }

          // Generate item reports from cached bills
          const itemReportMap = new Map();
          if (billFilter === 'processed') {
            filteredBills.forEach((bill: any) => {
              bill.bill_items?.forEach((item: any) => {
                const key = item.items?.name || item.name || 'Unknown';
                const existing = itemReportMap.get(key);

                if (existing) {
                  existing.total_quantity += item.quantity;
                  existing.total_revenue += item.total;
                } else {
                  itemReportMap.set(key, {
                    item_name: item.items?.name || item.name || 'Unknown',
                    category: item.items?.category || item.category || 'Unknown',
                    total_quantity: item.quantity,
                    total_revenue: item.total,
                    unit: item.items?.unit || item.unit
                  });
                }
              });
            });
          }

          setBills(filteredBills.map((bill: any) => {
            let parsedCharges: { name: string; amount: number }[] = [];
            if (bill.additional_charges) {
              if (typeof bill.additional_charges === 'string') {
                try {
                  parsedCharges = JSON.parse(bill.additional_charges);
                } catch {
                  parsedCharges = [];
                }
              } else if (Array.isArray(bill.additional_charges)) {
                parsedCharges = bill.additional_charges as any;
              }
            }
            return {
              ...bill,
              payment_details: (bill.payment_details as any) || {},
              additional_charges: parsedCharges
            };
          }));
          setExpenses([]); // Expenses not cached offline for now
          setItemReports(Array.from(itemReportMap.values()));

          console.log(`📴 Loaded ${filteredBills.length} bills from offline cache`);
        } catch (offlineError) {
          console.error('Error loading offline data:', offlineError);
          setBills([]);
          setExpenses([]);
          setItemReports([]);
        }

        setLoading(false);
        return;
      }

      // ONLINE MODE - Fetch from Supabase with caching
      const cacheKey = `${CACHE_KEYS.REPORTS}_${adminId}_${branchFilterId || 'all'}_${billFilter}_${start}_${end}_${dateRange === 'hourly' ? hourRange : ''}`;

      const reportData = await cachedFetch(
        cacheKey,
        async () => {
          // Fetch bills based on filter — branch-scoped
          let billsQuery: any = supabase
            .from('bills')
            .select(`
              *,
              bill_items (
                *,
                items (
                  name,
                  category,
                  is_active,
                  unit,
                  base_value,
                  purchase_rate
                )
              )
            `)
            .eq('admin_id', adminId)
            .gte('date', start)
            .lte('date', end)
            .order('created_at', { ascending: false });
          if (branchFilterId) billsQuery = billsQuery.eq('branch_id', branchFilterId);

          // Apply filter for deleted/processed bills
          if (billFilter === 'processed') {
            billsQuery = billsQuery.eq('is_deleted', false);
          } else {
            billsQuery = billsQuery.eq('is_deleted', true);
          }

          const { data: billsData, error: billsError } = await billsQuery;
          if (billsError) throw billsError;

          let filteredBillsData = billsData || [];

          if (dateRange === 'hourly') {
            const now = new Date();
            const safeHours = Math.max(1, Math.min(hourRange, 24));
            const fromTime = new Date(now.getTime() - safeHours * 60 * 60 * 1000);

            filteredBillsData = filteredBillsData.filter((bill: any) => {
              const createdAt = bill.created_at ? new Date(bill.created_at) : new Date(bill.date);
              return createdAt >= fromTime && createdAt <= now;
            });
          }

          let expensesData = [];
          let purchasesData = [];
          const itemReportMap = new Map();

          // Only fetch expenses, purchases and item reports for processed bills
          if (billFilter === 'processed') {
            // Fetch expenses — branch-scoped
            let expensesQ: any = supabase
              .from('expenses')
              .select('*')
              .eq('admin_id', adminId)
              .gte('date', start)
              .lte('date', end)
              .order('date', { ascending: false });
            if (branchFilterId) expensesQ = expensesQ.eq('branch_id', branchFilterId);
            const { data: expensesResult, error: expensesError } = await expensesQ;

            if (expensesError) throw expensesError;
            expensesData = expensesResult || [];

            // Fetch purchases — client-isolated
            let purchasesQ: any = supabase
              .from('purchases')
              .select(`
                id,
                purchase_date,
                total_amount,
                purchase_items (
                  id,
                  quantity,
                  rate,
                  total,
                  purchase_distributions (
                    branch_id,
                    quantity
                  )
                )
              `)
              .eq('admin_id', adminId)
              .gte('purchase_date', start)
              .lte('purchase_date', end);

            const { data: purchasesResult, error: purchasesError } = await purchasesQ;
            if (purchasesError) throw purchasesError;
            purchasesData = purchasesResult || [];

            // Generate item reports
            filteredBillsData.forEach((bill: any) => {
              bill.bill_items?.forEach(item => {
                const key = item.items?.name || 'Unknown';
                const existing = itemReportMap.get(key);

                if (existing) {
                  existing.total_quantity += item.quantity;
                  existing.total_revenue += item.total;
                } else {
                  itemReportMap.set(key, {
                    item_name: item.items?.name || 'Unknown',
                    category: item.items?.category || 'Unknown',
                    total_quantity: item.quantity,
                    total_revenue: item.total,
                    unit: item.items?.unit
                  });
                }
              });
            });
          }

          // Cache bills to IndexedDB for offline access
          for (const bill of filteredBillsData) {
            try {
              await offlineManager.cacheBill(bill);
            } catch (e) {
              // Ignore caching errors
            }
          }

          return {
            bills: filteredBillsData,
            expenses: expensesData,
            purchases: purchasesData,
            itemReports: Array.from(itemReportMap.values())
          };
        },
        2 * 60 * 1000 // 2 minutes cache
      );

      setBills(reportData.bills.map(bill => {
        // Handle additional_charges: could be array, JSON string, or null
        let parsedCharges: { name: string; amount: number }[] = [];
        if (bill.additional_charges) {
          if (typeof bill.additional_charges === 'string') {
            try {
              parsedCharges = JSON.parse(bill.additional_charges);
            } catch {
              parsedCharges = [];
            }
          } else if (Array.isArray(bill.additional_charges)) {
            parsedCharges = bill.additional_charges as any;
          }
        }

        return {
          ...bill,
          payment_details: (bill.payment_details as any) || {},
          additional_charges: parsedCharges
        };
      }));
      setExpenses(reportData.expenses);
      setPurchases(reportData.purchases || []);
      setItemReports(reportData.itemReports);

    } catch (error) {
      console.error('Error fetching reports:', error);

      // Try to load from offline cache as fallback
      try {
        console.log('⚠️ Online fetch failed, trying offline cache...');
        setExpenses([]);
        setPurchases([]);
        const cachedBills = await offlineManager.getCachedBills();
        if (cachedBills.length > 0) {
          const { start, end } = getDateFilter();
          let filteredBills = cachedBills.filter((bill: any) => {
            const billDate = bill.date;
            return billDate >= start && billDate <= end && !bill.is_deleted;
          });
          setBills(filteredBills);
          toast({
            title: "Offline Mode",
            description: `Showing ${filteredBills.length} cached bills`,
          });
        } else {
          toast({
            title: "Error",
            description: "Failed to fetch reports and no cached data available",
            variant: "destructive",
          });
        }
      } catch (cacheError) {
        toast({
          title: "Error",
          description: "Failed to fetch reports",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Trigger delete confirmation dialog
  const handleDeleteClick = (billId: string) => {
    setBillToDelete(billId);
    setDeleteConfirmOpen(true);
  };

  // Actually delete the bill (called after confirmation)
  const confirmDeleteBill = async () => {
    if (!billToDelete) return;

    try {
      // Get bill items to restore stock
      const { data: billItems } = await supabase
        .from('bill_items')
        .select('item_id, quantity')
        .eq('bill_id', billToDelete);

      // Mark bill as deleted
      const { error } = await supabase
        .from('bills')
        .update({ is_deleted: true })
        .eq('id', billToDelete);

      if (error) throw error;

      // Restore stock for each item
      if (billItems) {
        for (const item of billItems) {
          const { data: currentItem } = await supabase
            .from('items')
            .select('stock_quantity')
            .eq('id', item.item_id)
            .single();

          if (currentItem) {
            await supabase
              .from('items')
              .update({ stock_quantity: (currentItem.stock_quantity || 0) + item.quantity })
              .eq('id', item.item_id);
          }
        }
      }

      toast({
        title: "Success",
        description: "Bill deleted successfully and stock restored",
      });

      // Invalidate related caches and refresh
      invalidateRelatedData('bills');
      fetchReports();
    } catch (error) {
      console.error('Error deleting bill:', error);
      toast({
        title: "Error",
        description: "Failed to delete bill",
        variant: "destructive",
      });
    } finally {
      setDeleteConfirmOpen(false);
      setBillToDelete(null);
    }
  };

  // Trigger restore confirmation dialog
  const handleRestoreClick = (billId: string) => {
    setBillToRestore(billId);
    setRestoreConfirmOpen(true);
  };

  // Actually restore the bill (called after confirmation)
  const confirmRestoreBill = async () => {
    if (!billToRestore) return;

    try {
      // Get bill items to reduce stock
      const { data: billItems } = await supabase
        .from('bill_items')
        .select('item_id, quantity')
        .eq('bill_id', billToRestore);

      // Restore bill
      const { error } = await supabase
        .from('bills')
        .update({ is_deleted: false })
        .eq('id', billToRestore);

      if (error) throw error;

      // Reduce stock for each item
      if (billItems) {
        for (const item of billItems) {
          const { data: currentItem } = await supabase
            .from('items')
            .select('stock_quantity')
            .eq('id', item.item_id)
            .single();

          if (currentItem) {
            await supabase
              .from('items')
              .update({ stock_quantity: Math.max(0, (currentItem.stock_quantity || 0) - item.quantity) })
              .eq('id', item.item_id);
          }
        }
      }

      toast({
        title: "Success",
        description: "Bill restored successfully"
      });

      // Invalidate related caches and refresh
      invalidateRelatedData('bills');
      fetchReports();
    } catch (error) {
      console.error('Error restoring bill:', error);
      toast({
        title: "Error",
        description: "Failed to restore bill",
        variant: "destructive",
      });
    } finally {
      setRestoreConfirmOpen(false);
      setBillToRestore(null);
    }
  };

  const editBill = (bill: Bill) => {
    navigate('/billing', {
      state: {
        editBill: bill,
        editMode: true
      }
    });
  };

  const quickPrintBill = async (bill: Bill) => {
    try {
      // Ensure we have settings
      let settings = billSettings;
      if (!settings?.shopName) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data } = await supabase.from('shop_settings').select('*').eq('user_id', user.id).single();
            if (data) {
              settings = {
                shopName: data.shop_name || '',
                address: data.address || '',
                contactNumber: data.contact_number || '',
                logoUrl: data.logo_url || '',
                facebook: data.facebook || '',
                showFacebook: data.show_facebook,
                instagram: data.instagram || '',
                showInstagram: data.show_instagram,
                whatsapp: data.whatsapp || '',
                showWhatsapp: data.show_whatsapp
              };
              setBillSettings(settings);
            }
          }
        } catch (e) {
          console.error("Failed to fetch settings for print", e);
        }
      }
      const printData = {
        billNo: bill.bill_no,
        date: format(new Date(bill.date), 'MMM dd, yyyy'),
        time: format(new Date(bill.created_at), 'hh:mm a'),
        items: bill.bill_items?.map(item => ({
          name: item.items?.name || 'Unknown Item',
          quantity: item.quantity,
          price: item.price,
          total: item.total,
          unit: item.items?.unit,
          base_value: item.items?.base_value
        })) || [],
        subtotal: bill.bill_items?.reduce((sum, item) => sum + item.total, 0) || 0,
        paymentDetails: bill.payment_details as Record<string, number> | undefined,
        additionalCharges: (bill.additional_charges as any[])?.map(charge => ({
          name: charge.name,
          amount: charge.amount
        })) || [],
        discount: bill.discount,
        total: bill.total_amount,
        paymentMethod: bill.payment_mode.toUpperCase(),
        hotelName: profile?.hotel_name || 'ZenPOS',
        shopName: settings?.shopName,
        address: settings?.address,
        contactNumber: settings?.contactNumber,
        logoUrl: settings?.logoUrl,
        facebook: settings?.showFacebook !== false ? settings?.facebook : undefined,
        instagram: settings?.showInstagram !== false ? settings?.instagram : undefined,
        whatsapp: settings?.showWhatsapp !== false ? settings?.whatsapp : undefined,
        totalItemsCount: bill.bill_items?.length || 0,
        smartQtyCount: calculateSmartQtyCount(bill.bill_items?.map(item => ({ quantity: item.quantity, unit: item.items?.unit })) || []),
        orderType: (bill as any).order_type || undefined
      };

      toast({
        title: "Printing...",
        description: `Sending ${bill.bill_no} to printer`,
      });

      const success = await printReceipt(printData);

      if (success) {
        toast({
          title: "Success",
          description: `${bill.bill_no} printed successfully!`,
        });
      } else {
        console.log("Bluetooth print failed (returned false), falling back to browser print");
        printBrowserReceipt(printData);
        // Toast is optional here since browser print dialog will open
      }
    } catch (error) {
      console.error('Print error:', error);
      console.log("Bluetooth print error, falling back to browser print", error);

      // Fallback
      // Re-construct printData if needed, but we have it in scope
      const printData = {
        billNo: bill.bill_no,
        date: format(new Date(bill.date), 'MMM dd, yyyy'),
        time: format(new Date(bill.created_at), 'hh:mm a'),
        items: bill.bill_items?.map(item => ({
          name: item.items?.name || 'Unknown Item',
          quantity: item.quantity,
          price: item.price,
          total: item.total,
          unit: item.items?.unit,
          base_value: item.items?.base_value
        })) || [],
        subtotal: bill.bill_items?.reduce((sum, item) => sum + item.total, 0) || 0,
        paymentDetails: bill.payment_details as Record<string, number> | undefined,
        additionalCharges: (bill.additional_charges as any[])?.map(charge => ({
          name: charge.name,
          amount: charge.amount
        })) || [],
        discount: bill.discount,
        total: bill.total_amount,
        paymentMethod: bill.payment_mode.toUpperCase(),
        hotelName: profile?.hotel_name || 'ZenPOS',
        totalItemsCount: bill.bill_items?.length || 0,
        smartQtyCount: calculateSmartQtyCount(bill.bill_items?.map(item => ({ quantity: item.quantity, unit: item.items?.unit })) || []),
        orderType: (bill as any).order_type || undefined
      };

      printBrowserReceipt(printData);
    }
  };

  const activeBills = bills.filter(bill => !bill.is_deleted);
  const totalSales = activeBills.reduce((sum, bill) => sum + bill.total_amount, 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  // Compute detailed P&L
  const totalCOGS = activeBills.reduce((sum, bill) => {
    return sum + (bill.bill_items?.reduce((itemSum, item) => {
      const rate = item.items?.purchase_rate || 0;
      const baseVal = item.items?.base_value || 1;
      return itemSum + ((item.quantity / baseVal) * rate);
    }, 0) || 0);
  }, 0);

  const totalPurchases = branchFilterId
    ? purchases.reduce((sum, p) => {
        const linesSum = p.purchase_items?.reduce((lSum: number, l: any) => {
          const dist = l.purchase_distributions?.find((d: any) => d.branch_id === branchFilterId);
          return lSum + (dist ? dist.quantity * (l.rate || 0) : 0);
        }, 0) || 0;
        return sum + linesSum;
      }, 0)
    : purchases.reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0);

  const grossProfit = totalSales - totalCOGS;
  const netProfit = grossProfit - totalExpenses;
  const netCashFlow = totalSales - totalPurchases - totalExpenses;
  const profit = netProfit;

  const handleExportAllExcel = () => {
    try {
      const billsForExport = activeBills.map(bill => ({
        bill_no: bill.bill_no,
        date: format(new Date(bill.date), 'MMM dd, yyyy'),
        time: format(new Date(bill.created_at), 'hh:mm a'),
        total_amount: bill.total_amount,
        discount: bill.discount,
        payment_mode: bill.payment_mode.toUpperCase(),
        items_count: bill.bill_items?.length || 0
      }));

      const itemsForExport = itemReports.map(item => ({
        item_name: item.item_name,
        category: item.category,
        total_quantity: item.total_quantity,
        total_revenue: item.total_revenue,
        unit: item.unit
      }));

      const paymentMethodSummary = activeBills.reduce((acc, bill) => {
        acc[bill.payment_mode] = (acc[bill.payment_mode] || 0) + bill.total_amount;
        return acc;
      }, {} as Record<string, number>);

      const paymentsForExport = Object.entries(paymentMethodSummary).map(([method, amount]) => ({
        payment_method: method.toUpperCase(),
        total_amount: amount,
        transaction_count: activeBills.filter(b => b.payment_mode === method).length,
        percentage: ((amount / totalSales) * 100)
      }));

      const profitLossForExport = {
        totalSales,
        totalCOGS,
        grossProfit,
        totalExpenses,
        netProfit,
        totalPurchases,
        netCashFlow
      };

      const dateRangeText = dateRange === 'custom'
        ? `${customStartDate} to ${customEndDate}`
        : dateRange.charAt(0).toUpperCase() + dateRange.slice(1);

      exportAllReportsToExcel({
        bills: billsForExport,
        items: itemsForExport,
        payments: paymentsForExport,
        profitLoss: profitLossForExport,
        dateRange: dateRangeText,
        branchName: isAllBranchesView ? undefined : (activeBranch?.name || undefined),
      });

      toast({
        title: "Success",
        description: "All reports exported to Excel successfully!",
      });
    } catch (error) {
      console.error('Error exporting Excel:', error);
      toast({
        title: "Error",
        description: "Failed to export Excel file",
        variant: "destructive",
      });
    }
  };

  const handleExportAllPDF = () => {
    try {
      const billsForExport = activeBills.map(bill => ({
        bill_no: bill.bill_no,
        date: format(new Date(bill.date), 'MMM dd, yyyy'),
        time: format(new Date(bill.created_at), 'hh:mm a'),
        total_amount: bill.total_amount,
        discount: bill.discount,
        payment_mode: bill.payment_mode.toUpperCase(),
        items_count: bill.bill_items?.length || 0
      }));

      const itemsForExport = itemReports.map(item => ({
        item_name: item.item_name,
        category: item.category,
        total_quantity: item.total_quantity,
        total_revenue: item.total_revenue,
        unit: item.unit
      }));

      const paymentMethodSummary = activeBills.reduce((acc, bill) => {
        acc[bill.payment_mode] = (acc[bill.payment_mode] || 0) + bill.total_amount;
        return acc;
      }, {} as Record<string, number>);

      const paymentsForExport = Object.entries(paymentMethodSummary).map(([method, amount]) => ({
        payment_method: method.toUpperCase(),
        total_amount: amount,
        transaction_count: activeBills.filter(b => b.payment_mode === method).length,
        percentage: ((amount / totalSales) * 100)
      }));

      const profitLossForExport = {
        totalSales,
        totalCOGS,
        grossProfit,
        totalExpenses,
        netProfit,
        totalPurchases,
        netCashFlow
      };

      const dateRangeText = dateRange === 'custom'
        ? `${customStartDate} to ${customEndDate}`
        : dateRange.charAt(0).toUpperCase() + dateRange.slice(1);

      exportAllReportsToPDF({
        bills: billsForExport,
        items: itemsForExport,
        payments: paymentsForExport,
        profitLoss: profitLossForExport,
        dateRange: dateRangeText,
        branchName: isAllBranchesView ? undefined : (activeBranch?.name || undefined),
      });

      toast({
        title: "Success",
        description: "All reports exported to PDF successfully!",
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast({
        title: "Error",
        description: "Failed to export PDF file",
        variant: "destructive",
      });
    }
  };

  // Sum payment method amounts from payment_details (supports split payments)
  const paymentMethodSummary = activeBills.reduce((acc, bill) => {
    // If payment_details exists and has entries, use those (split payments)
    if (bill.payment_details && typeof bill.payment_details === 'object' && Object.keys(bill.payment_details).length > 0) {
      Object.entries(bill.payment_details).forEach(([method, amount]) => {
        const methodName = method.toLowerCase();
        acc[methodName] = (acc[methodName] || 0) + (Number(amount) || 0);
      });
    } else {
      // Fallback to primary payment_mode for older bills without split details
      acc[bill.payment_mode] = (acc[bill.payment_mode] || 0) + bill.total_amount;
    }
    return acc;
  }, {} as Record<string, number>);

  // Permission check is now handled by ProtectedRoute, so we don't need a redundant check here

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-md shadow-primary/20">
            <BarChart3 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">Reports</h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Business insights and analytics</p>
          </div>
        </div>
        <div className="flex flex-row gap-2">
          <Button onClick={handleExportAllExcel} variant="outline" size="sm" className="text-xs h-8 rounded-lg">
            <FileSpreadsheet className="w-3 h-3 mr-1" />
            Excel
          </Button>
          <Button onClick={handleExportAllPDF} variant="outline" size="sm" className="text-xs h-8 rounded-lg">
            <Download className="w-3 h-3 mr-1" />
            PDF
          </Button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search bills, items, payment methods..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Date Filter */}
      <Card className="p-3 sm:p-4">
        <CardHeader className="p-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <CalendarDays className="w-4 h-4" />
            Date Range
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <Label className="text-xs">Period</Label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Last X Hours</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateRange === 'hourly' && (
              <div>
                <Label className="text-xs">Hours</Label>
                <Input
                  type="number"
                  value={hourRange}
                  min={1}
                  max={24}
                  onChange={(e) => {
                    const value = Number(e.target.value) || 1;
                    const clamped = Math.max(1, Math.min(24, value));
                    setHourRange(clamped);
                  }}
                  className="h-8 text-xs"
                />
              </div>
            )}

            {dateRange === 'custom' && (
              <>
                <div>
                  <Label className="text-xs">Start Date</Label>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    max={customEndDate}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">End Date</Label>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    min={customStartDate}
                    className="h-8 text-xs"
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards - Premium Style */}
      {billFilter === 'processed' && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {/* Total Revenue Card */}
          <div className="bg-card rounded-2xl p-4 shadow-lg dark:shadow-none border border-border">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Revenue</p>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-emerald-500 mb-1">₹{totalSales.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
            <p className="text-xs text-muted-foreground">For selected period</p>
          </div>

          {/* Total Expenses Card */}
          <div className="bg-card rounded-2xl p-4 shadow-lg dark:shadow-none border border-border">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Expenses</p>
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 dark:bg-rose-500/20 flex items-center justify-center">
                <TrendingDown className="w-4 h-4 text-rose-500" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-rose-500 mb-1">₹{totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
            <p className="text-xs text-muted-foreground">For selected period</p>
          </div>

          {/* Net Profit Card */}
          <div className="bg-card rounded-2xl p-4 shadow-lg dark:shadow-none border border-border">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Net Profit</p>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${profit >= 0 ? 'bg-blue-500/10 dark:bg-blue-500/20' : 'bg-rose-500/10 dark:bg-rose-500/20'}`}>
                <DollarSign className={`w-4 h-4 ${profit >= 0 ? 'text-blue-500' : 'text-rose-500'}`} />
              </div>
            </div>
            <p className={`text-2xl sm:text-3xl font-bold mb-1 ${profit >= 0 ? 'text-blue-500' : 'text-rose-500'}`}>₹{Math.abs(profit).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
            <p className="text-xs text-muted-foreground">{totalSales > 0 ? `${((profit / totalSales) * 100).toFixed(1)}% margin` : '0% margin'}</p>
          </div>

          {/* Total Bills Card */}
          <div className="bg-card rounded-2xl p-4 shadow-lg dark:shadow-none border border-border">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Bills</p>
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 dark:bg-violet-500/20 flex items-center justify-center">
                <Receipt className="w-4 h-4 text-violet-500" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-foreground mb-1">{activeBills.length}</p>
            <p className="text-xs text-muted-foreground">Avg: ₹{activeBills.length > 0 ? Math.round(totalSales / activeBills.length).toLocaleString('en-IN') : 0}</p>
          </div>
        </div>
      )}

      {/* Order Type Summary - Dine In vs Parcel */}
      {billFilter === 'processed' && (() => {
        const dineInBills = activeBills.filter((b: any) => !b.order_type || b.order_type === 'dine_in');
        const parcelBills = activeBills.filter((b: any) => b.order_type === 'parcel');
        const dineInTotal = dineInBills.reduce((sum, b) => sum + b.total_amount, 0);
        const parcelTotal = parcelBills.reduce((sum, b) => sum + b.total_amount, 0);
        const hasParcelOrDineIn = parcelBills.length > 0 || dineInBills.some((b: any) => b.order_type === 'dine_in');
        
        if (!hasParcelOrDineIn) return null;
        
        return (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card rounded-2xl p-4 shadow-lg dark:shadow-none border border-border">
              <div className="flex items-start justify-between mb-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">🍽️ Dine In</p>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-foreground mb-0.5">₹{dineInTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
              <p className="text-xs text-muted-foreground">{dineInBills.length} bills • Avg ₹{dineInBills.length > 0 ? Math.round(dineInTotal / dineInBills.length).toLocaleString('en-IN') : 0}</p>
            </div>
            <div className="bg-card rounded-2xl p-4 shadow-lg dark:shadow-none border border-border">
              <div className="flex items-start justify-between mb-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">📦 Parcel</p>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-foreground mb-0.5">₹{parcelTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
              <p className="text-xs text-muted-foreground">{parcelBills.length} bills • Avg ₹{parcelBills.length > 0 ? Math.round(parcelTotal / parcelBills.length).toLocaleString('en-IN') : 0}</p>
            </div>
          </div>
        );
      })()}

      {/* Detailed Reports */}
      <Tabs defaultValue="bills" className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="grid w-full grid-cols-5 min-w-[380px] h-10">
            <TabsTrigger value="bills" className="text-sm font-medium">Bills</TabsTrigger>
            <TabsTrigger value="items" disabled={billFilter === 'deleted'} className="text-sm font-medium">Items</TabsTrigger>
            <TabsTrigger value="payments" disabled={billFilter === 'deleted'} className="text-sm font-medium">Payments</TabsTrigger>
            <TabsTrigger value="profit" disabled={billFilter === 'deleted'} className="text-sm font-medium">P&L</TabsTrigger>
            <TabsTrigger value="gst" disabled={billFilter === 'deleted'} className="text-sm font-medium">GST</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="bills" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                  <Receipt className="w-4 h-4" />
                  Bill-wise Report
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Order Type filter */}
                  <div className="flex items-center gap-1 p-0.5 rounded-md bg-muted">
                    <Button
                      size="sm"
                      variant={orderTypeFilter === 'all' ? 'default' : 'ghost'}
                      className="h-7 px-2.5 text-[11px]"
                      onClick={() => setOrderTypeFilter('all')}
                    >All</Button>
                    <Button
                      size="sm"
                      variant={orderTypeFilter === 'dine_in' ? 'default' : 'ghost'}
                      className="h-7 px-2.5 text-[11px]"
                      onClick={() => setOrderTypeFilter('dine_in')}
                    >🍽️ Dine In</Button>
                    <Button
                      size="sm"
                      variant={orderTypeFilter === 'parcel' ? 'default' : 'ghost'}
                      className="h-7 px-2.5 text-[11px]"
                      onClick={() => setOrderTypeFilter('parcel')}
                    >📦 Parcel</Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Filter:</Label>
                    <Select value={billFilter} onValueChange={setBillFilter}>
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="processed">Processed</SelectItem>
                        <SelectItem value="deleted">Deleted</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-xs">Loading...</div>
              ) : (
                <div className="space-y-3">
                  {bills
                    .filter(bill => {
                      // Order type filter (Dine In / Parcel / All)
                      if (orderTypeFilter !== 'all') {
                        const ot = (bill as any).order_type || 'dine_in';
                        if (ot !== orderTypeFilter) return false;
                      }
                      if (!searchQuery.trim()) return true;
                      const query = searchQuery.toLowerCase();
                      return (
                        bill.bill_no.toLowerCase().includes(query) ||
                        bill.payment_mode.toLowerCase().includes(query) ||
                        bill.total_amount.toString().includes(query) ||
                        format(new Date(bill.date), 'MMM dd, yyyy').toLowerCase().includes(query) ||
                        bill.bill_items?.some(item => item.items?.name?.toLowerCase().includes(query))
                      );
                    })
                    .map((bill) => (
                      <div
                        key={bill.id}
                        className={`flex items-center justify-between p-3 rounded-lg ${billFilter === 'deleted'
                          ? 'bg-destructive/10 border border-destructive/20'
                          : 'bg-muted/50'
                          }`}
                      >
                        <div className="flex-1 min-w-0 mr-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm">{bill.bill_no}</h3>
                            {(bill as any).table_no && (
                              <Badge className="bg-purple-100 text-purple-700 text-[10px] px-1.5">
                                {(bill as any).table_no}
                              </Badge>
                            )}
                            {(bill as any).order_type === 'parcel' && (
                              <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1.5">
                                📦 Parcel
                              </Badge>
                            )}
                            {bill.is_deleted && (
                              <Badge variant="destructive" className="text-xs">
                                Deleted
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                            <span>{format(new Date(bill.date), 'MMM dd, yyyy')}</span>
                            <span>{format(new Date(bill.created_at), 'hh:mm a')}</span>
                            <span>{bill.payment_mode.toUpperCase()} • {bill.bill_items?.length || 0} items</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            <p className="font-semibold text-sm text-primary whitespace-nowrap">₹{bill.total_amount.toFixed(2)}</p>
                            {bill.discount > 0 && (
                              <p className="text-xs text-success whitespace-nowrap">-₹{bill.discount.toFixed(2)}</p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedBill(bill)}
                              className="h-7 w-7 p-0 flex-shrink-0"
                              title="View Details"
                            >
                              <Eye className="w-3 h-3" />
                            </Button>
                            {billFilter === 'processed' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => quickPrintBill(bill)}
                                className="h-7 w-7 p-0 flex-shrink-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                title="Quick Print"
                              >
                                <Printer className="w-3 h-3" />
                              </Button>
                            )}
                            {billFilter === 'processed' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteClick(bill.id)}
                                className="h-7 w-7 p-0 flex-shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRestoreClick(bill.id)}
                                className="h-7 w-7 p-0 flex-shrink-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                title="Restore"
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  {bills.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-xs">
                      No {billFilter} bills found for selected period
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="items" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-lg">
                <span className="flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Item-wise Sales Report
                </span>
                <div className="flex gap-1">
                  <Button
                    variant={itemSortBy === 'amount' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setItemSortBy('amount')}
                    className="text-xs h-7 px-2"
                  >
                    By Amount
                  </Button>
                  <Button
                    variant={itemSortBy === 'quantity' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setItemSortBy('quantity')}
                    className="text-xs h-7 px-2"
                  >
                    By Qty
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-xs">Loading...</div>
              ) : (
                <div className="space-y-3">
                  {itemReports
                    .filter(item => {
                      if (!searchQuery.trim()) return true;
                      const query = searchQuery.toLowerCase();
                      return (
                        item.item_name.toLowerCase().includes(query) ||
                        item.category.toLowerCase().includes(query)
                      );
                    })
                    .sort((a, b) => {
                      if (itemSortBy === 'amount') {
                        return b.total_revenue - a.total_revenue;
                      }
                      return b.total_quantity - a.total_quantity;
                    })
                    .map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-3 sm:p-4 bg-muted/50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-base truncate">{index + 1}.{item.item_name}</h3>
                          <p className="text-sm text-muted-foreground">{item.category}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-base">
                            Qty: {formatQuantityWithUnit(item.total_quantity, item.unit)}
                          </p>
                          <p className="text-sm text-primary font-medium">₹{item.total_revenue.toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                  {itemReports.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-xs">
                      No item sales data for selected period
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <CreditCard className="w-4 h-4" />
                Payment Method Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-xs">Loading...</div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(paymentMethodSummary)
                    .filter(([method]) => {
                      if (!searchQuery.trim()) return true;
                      return method.toLowerCase().includes(searchQuery.toLowerCase());
                    })
                    .sort(([, amountA], [, amountB]) => amountB - amountA)
                    .map(([method, amount]) => (
                      <div key={method} className="flex items-center justify-between p-3 sm:p-4 bg-muted/50 rounded-lg">
                        <div>
                          <h3 className="font-semibold text-base capitalize">{method}</h3>
                          <p className="text-sm text-muted-foreground">
                            {activeBills.filter(b => {
                              // Count bills that have this method in payment_details
                              if (b.payment_details && typeof b.payment_details === 'object') {
                                return Object.keys(b.payment_details).some(key => key.toLowerCase() === method);
                              }
                              // Fallback to primary payment_mode for older bills
                              return b.payment_mode === method;
                            }).length} transactions
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-base text-primary">₹{amount.toFixed(2)}</p>
                          <p className="text-sm text-muted-foreground">
                            {((amount / totalSales) * 100).toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  {Object.keys(paymentMethodSummary).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-xs">
                      No payment data for selected period
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profit" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <BarChart3 className="w-4 h-4" />
                Profit & Loss Statement
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {activeBills.some(b => b.bill_items?.some(bi => !bi.items?.purchase_rate)) && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 rounded-xl text-xs flex items-start gap-2">
                    <span className="shrink-0 text-sm">⚠️</span>
                    <p>Some sold items in this period do not have a purchase rate configured in your inventory. COGS for those items is calculated as ₹0.00, which may skew the profit margins.</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Accrual P&L */}
                  <div className="bg-muted/40 rounded-2xl p-4 border border-border space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-1">Accrual Basis (Sales COGS-based)</h3>
                      <p className="text-[10px] text-muted-foreground">Measures the real profitability of items sold during this period.</p>
                    </div>

                    <div className="space-y-2.5 text-xs">
                      <div className="flex justify-between items-center py-1 border-b border-muted">
                        <span className="text-muted-foreground">Total Sales (Revenue)</span>
                        <span className="font-semibold text-foreground">₹{totalSales.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-muted">
                        <span className="text-muted-foreground">Cost of Goods Sold (COGS)</span>
                        <span className="font-semibold text-rose-500">-₹{totalCOGS.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 border-b border-muted">
                        <span className="font-bold text-foreground">Gross Profit</span>
                        <span className="font-bold text-emerald-500">
                          ₹{grossProfit.toFixed(2)}
                          <span className="text-[10px] font-normal text-muted-foreground ml-1.5">
                            ({totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : '0.0'}% margin)
                          </span>
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-muted">
                        <span className="text-muted-foreground">Operating Expenses</span>
                        <span className="font-semibold text-rose-500">-₹{totalExpenses.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 text-sm font-black">
                        <span className="text-foreground">Net Profit (COGS-based)</span>
                        <span className={netProfit >= 0 ? 'text-emerald-500 font-black' : 'text-rose-500 font-black'}>
                          ₹{netProfit.toFixed(2)}
                          <span className="text-[11px] font-normal text-muted-foreground ml-2">
                            ({totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : '0.0'}% margin)
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Cash Flow P&L */}
                  <div className="bg-muted/40 rounded-2xl p-4 border border-border space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-1">Cash Basis (Cash Flow)</h3>
                      <p className="text-[10px] text-muted-foreground">Measures cash inflows and outflows during this period.</p>
                    </div>

                    <div className="space-y-2.5 text-xs">
                      <div className="flex justify-between items-center py-1 border-b border-muted">
                        <span className="text-muted-foreground">Total Inflow (Sales)</span>
                        <span className="font-semibold text-foreground">₹{totalSales.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-muted">
                        <span className="text-muted-foreground">Stock Purchases (Cash spent)</span>
                        <span className="font-semibold text-rose-500">-₹{totalPurchases.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-muted">
                        <span className="text-muted-foreground">Operating Expenses</span>
                        <span className="font-semibold text-rose-500">-₹{totalExpenses.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-5 text-sm font-black">
                        <span className="text-foreground">Net Cash Flow</span>
                        <span className={netCashFlow >= 0 ? 'text-blue-500 font-black' : 'text-rose-500 font-black'}>
                          ₹{netCashFlow.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* GST Reports Tab */}
        <TabsContent value="gst" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <Receipt className="w-4 h-4" />
                GST Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                // Compute GST data from bills
                const gstBills = bills.filter((b: any) => b.total_tax > 0);
                if (gstBills.length === 0) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="text-sm">No GST bills found in selected period</p>
                      <p className="text-xs mt-1">Enable GST in Settings and create bills to see tax reports</p>
                    </div>
                  );
                }

                // Tax summary by rate
                const rateMap: Record<string, { taxable: number; cgst: number; sgst: number; cess: number; total: number; count: number }> = {};
                // HSN summary
                const hsnMap: Record<string, { description: string; taxable: number; tax: number; count: number }> = {};
                // B2B vs B2C
                let b2bCount = 0, b2bTotal = 0, b2cCount = 0, b2cTotal = 0;
                let totalTaxCollected = 0;

                gstBills.forEach((bill: any) => {
                  totalTaxCollected += bill.total_tax || 0;
                  if (bill.customer_gstin) {
                    b2bCount++; b2bTotal += bill.total_amount || 0;
                  } else {
                    b2cCount++; b2cTotal += bill.total_amount || 0;
                  }
                  try {
                    const summary = bill.tax_summary ? (typeof bill.tax_summary === 'string' ? JSON.parse(bill.tax_summary) : bill.tax_summary) : null;
                    const rawEntries = summary?.entries || [];
                    const taxEntries = rawEntries.length > 0 ? rawEntries : (() => {
                      if (summary && typeof summary === 'object') {
                        return Object.keys(summary).filter((k: string) => !isNaN(parseFloat(k))).map((rate: string) => ({
                          taxName: summary[rate].taxName || `GST ${rate}%`,
                          taxRate: parseFloat(rate),
                          taxableAmount: summary[rate].taxable || 0,
                          cgst: summary[rate].cgst || 0,
                          sgst: summary[rate].sgst || 0,
                          cess: summary[rate].cess || 0,
                          hsnCode: summary[rate].hsnCode || ''
                        }));
                      }
                      return [];
                    })();
                    if (taxEntries.length > 0) {
                      taxEntries.forEach((entry: any) => {
                        const rate = String(entry.taxRate || 0);
                        if (!rateMap[rate]) rateMap[rate] = { taxable: 0, cgst: 0, sgst: 0, cess: 0, total: 0, count: 0 };
                        rateMap[rate].taxable += entry.taxableAmount || 0;
                        rateMap[rate].cgst += entry.cgst || 0;
                        rateMap[rate].sgst += entry.sgst || 0;
                        rateMap[rate].cess += entry.cess || 0;
                        rateMap[rate].total += (entry.cgst || 0) + (entry.sgst || 0) + (entry.cess || 0);
                        rateMap[rate].count++;
                      });
                      taxEntries.forEach((entry: any) => {
                        const hsn = entry.hsnCode || 'N/A';
                        if (!hsnMap[hsn]) hsnMap[hsn] = { description: entry.taxName || '', taxable: 0, tax: 0, count: 0 };
                        hsnMap[hsn].taxable += entry.taxableAmount || 0;
                        hsnMap[hsn].tax += (entry.cgst || 0) + (entry.sgst || 0) + (entry.cess || 0);
                        hsnMap[hsn].count++;
                      });
                    }
                  } catch { }
                });

                const exportGSTR1 = () => {
                  let csv = 'GSTIN,Invoice No,Date,Total Amount,Taxable Value,CGST,SGST,Total Tax,Customer GSTIN\n';
                  gstBills.forEach((bill: any) => {
                    const taxSummary = bill.tax_summary ? (typeof bill.tax_summary === 'string' ? JSON.parse(bill.tax_summary) : bill.tax_summary) : {};
                    const totalTaxable = taxSummary.totalTaxableValue || (bill.total_amount - (bill.total_tax || 0));
                    const halfTax = (bill.total_tax || 0) / 2;
                    csv += `${bill.gstin || ''},${bill.bill_no},${bill.date},${bill.total_amount},${totalTaxable.toFixed(2)},${halfTax.toFixed(2)},${halfTax.toFixed(2)},${bill.total_tax || 0},${bill.customer_gstin || ''}\n`;
                  });
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `GSTR1_${new Date().toISOString().split('T')[0]}.csv`;
                  a.click(); URL.revokeObjectURL(url);
                };

                return (
                  <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 text-center">
                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Tax Collected</p>
                        <p className="text-lg font-black text-amber-900 dark:text-amber-200">₹{totalTaxCollected.toFixed(2)}</p>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-center">
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">GST Bills</p>
                        <p className="text-lg font-black text-blue-900 dark:text-blue-200">{gstBills.length}</p>
                      </div>
                      <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-center">
                        <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider">B2B Bills</p>
                        <p className="text-lg font-black text-green-900 dark:text-green-200">{b2bCount}</p>
                      </div>
                    </div>

                    {/* Tax by Rate */}
                    {Object.keys(rateMap).length > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2">Tax Summary by Rate</h4>
                        <div className="rounded-lg border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/50">
                                <th className="text-left p-2 font-semibold">Rate</th>
                                <th className="text-right p-2 font-semibold">Taxable</th>
                                <th className="text-right p-2 font-semibold">CGST</th>
                                <th className="text-right p-2 font-semibold">SGST</th>
                                <th className="text-right p-2 font-semibold">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(rateMap).sort(([a], [b]) => parseFloat(a) - parseFloat(b)).map(([rate, data]) => (
                                <tr key={rate} className="border-t">
                                  <td className="p-2 font-medium">{rate}%</td>
                                  <td className="p-2 text-right">₹{data.taxable.toFixed(2)}</td>
                                  <td className="p-2 text-right">₹{data.cgst.toFixed(2)}</td>
                                  <td className="p-2 text-right">₹{data.sgst.toFixed(2)}</td>
                                  <td className="p-2 text-right font-semibold">₹{data.total.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* HSN Summary */}
                    {Object.keys(hsnMap).length > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2">HSN-wise Summary</h4>
                        <div className="rounded-lg border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/50">
                                <th className="text-left p-2 font-semibold">HSN</th>
                                <th className="text-right p-2 font-semibold">Taxable</th>
                                <th className="text-right p-2 font-semibold">Tax</th>
                                <th className="text-right p-2 font-semibold">Count</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(hsnMap).map(([hsn, data]) => (
                                <tr key={hsn} className="border-t">
                                  <td className="p-2 font-mono font-medium">{hsn}</td>
                                  <td className="p-2 text-right">₹{data.taxable.toFixed(2)}</td>
                                  <td className="p-2 text-right">₹{data.tax.toFixed(2)}</td>
                                  <td className="p-2 text-right">{data.count}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* B2B vs B2C */}
                    <div>
                      <h4 className="font-semibold text-sm mb-2">B2B vs B2C</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-lg p-3">
                          <p className="text-[10px] font-bold text-indigo-600 uppercase">B2B (With GSTIN)</p>
                          <p className="text-base font-bold text-indigo-900 dark:text-indigo-200">{b2bCount} bills</p>
                          <p className="text-xs text-indigo-600">₹{b2bTotal.toFixed(0)}</p>
                        </div>
                        <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-3">
                          <p className="text-[10px] font-bold text-purple-600 uppercase">B2C (Without GSTIN)</p>
                          <p className="text-base font-bold text-purple-900 dark:text-purple-200">{b2cCount} bills</p>
                          <p className="text-xs text-purple-600">₹{b2cTotal.toFixed(0)}</p>
                        </div>
                      </div>
                    </div>

                    {/* GSTR-1 Export */}
                    <div className="border-t pt-4">
                      <Button onClick={exportGSTR1} variant="outline" className="w-full gap-2">
                        <Download className="w-4 h-4" />
                        Export GSTR-1 (CSV)
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Bill Details Dialog */}
      {selectedBill && (
        <Dialog open={!!selectedBill} onOpenChange={() => setSelectedBill(null)}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-sm sm:text-base hidden">Bill Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Header - Shop Name & Logo */}
              <div className="text-center mb-6">
                {billSettings?.logoUrl && (
                  <div className="w-[1.5in] h-[1.5in] mx-auto mb-2 flex items-center justify-center">
                    <img src={billSettings.logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                  </div>
                )}
                {billSettings?.shopName ? (
                  <h2 className="text-xl font-bold uppercase tracking-wide">{billSettings.shopName}</h2>
                ) : (
                  <h2 className="text-xl font-bold uppercase tracking-wide">{profile?.hotel_name || 'BISMILLAH'}</h2>
                )}

                {/* Address */}
                {billSettings?.address && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap px-8">{billSettings.address}</p>
                )}

                {/* Contact */}
                {billSettings?.contactNumber && (
                  <p className="text-sm font-medium mt-1">{billSettings.contactNumber}</p>
                )}

                {/* GSTIN */}
                {billSettings?.gstin && (
                  <p className="text-xs font-semibold text-indigo-600 mt-1">GSTIN: {billSettings.gstin}</p>
                )}

                {/* Social Media */}
                {(
                  (billSettings?.showFacebook !== false && billSettings?.facebook) ||
                  (billSettings?.showInstagram !== false && billSettings?.instagram) ||
                  (billSettings?.showWhatsapp !== false && billSettings?.whatsapp)
                ) && (
                    <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-2 mt-3 text-xs text-muted-foreground px-4">
                      {billSettings?.showFacebook !== false && billSettings?.facebook && (
                        <div className="flex items-center gap-1.5 min-w-fit">
                          <FacebookIcon className="w-3.5 h-3.5 text-[#1877F2] shrink-0" />
                          <span className="truncate max-w-[150px]">{billSettings.facebook}</span>
                        </div>
                      )}
                      {billSettings?.showInstagram !== false && billSettings?.instagram && (
                        <div className="flex items-center gap-1.5 min-w-fit">
                          <InstagramIcon className="w-3.5 h-3.5 text-[#E4405F] shrink-0" />
                          <span className="truncate max-w-[150px]">{billSettings.instagram}</span>
                        </div>
                      )}
                      {billSettings?.showWhatsapp !== false && billSettings?.whatsapp && (
                        <div className="flex items-center gap-1.5 min-w-fit">
                          <WhatsAppIcon className="w-3.5 h-3.5 text-[#25D366] shrink-0" />
                          <span className="truncate max-w-[150px]">{billSettings.whatsapp}</span>
                        </div>
                      )}
                    </div>
                  )}
              </div>

              {/* Bill Info */}
              <div className="text-center mb-6 pb-4 border-b">
                <h3 className="font-semibold text-lg">Bill Details - {selectedBill.bill_no}</h3>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(selectedBill.created_at), 'MMM dd, yyyy hh:mm a')}
                </p>
                {(selectedBill as any).order_type && (
                  <Badge className={`mt-1 ${(selectedBill as any).order_type === 'parcel' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'}`}>
                    {(selectedBill as any).order_type === 'parcel' ? '📦 Parcel' : '🍽️ Dine In'}
                  </Badge>
                )}
              </div>
              <div className="flex justify-between items-center text-xs sm:text-sm mb-4 border-b pb-4">
                <div className="flex items-center gap-2">
                  <p className="font-medium">Date:</p>
                  <p>{format(new Date(selectedBill.date), 'dd/MM/yyyy')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">Total:</p>
                  <p className="font-bold text-lg">₹{selectedBill.total_amount.toFixed(2)}</p>
                </div>
              </div>

              <div>
                <div className="grid grid-cols-12 gap-2 mb-2 px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  <div className="col-span-6">Item Name</div>
                  <div className="col-span-2 text-center">Qty/Kg</div>
                  <div className="col-span-2 text-right">Rate</div>
                  <div className="col-span-2 text-right">Value</div>
                </div>
                <div className="space-y-1.5">
                  {selectedBill.bill_items?.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 p-2 bg-muted/30 rounded-md items-center">
                      <div className="col-span-6">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="font-bold text-xs truncate">{item.items?.name}</p>
                          {item.items?.is_active === false && (
                            <Badge variant="destructive" className="h-4 text-[8px] px-1 translate-y-[1px]">Deleted</Badge>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2 text-center font-bold text-primary text-xs">
                        {formatQuantityWithUnit(item.quantity, item.items?.unit)}
                      </div>
                      <div className="col-span-2 text-right text-[10px] text-muted-foreground">
                        ₹{item.price.toFixed(0)}/{item.items?.base_value && item.items?.base_value > 1 ? `${item.items?.base_value}${getShortUnit(item.items?.unit)}` : getShortUnit(item.items?.unit)}
                      </div>
                      <div className="col-span-2 text-right font-bold text-xs">
                        ₹{item.total.toFixed(0)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between mt-4 px-2 py-3 bg-primary/5 rounded-xl border border-primary/10 shadow-inner">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Qty Count</span>
                    <span className="text-lg font-black text-primary leading-none mt-1">
                      {calculateSmartQtyCount(selectedBill.bill_items.map(bi => ({ quantity: bi.quantity, unit: bi.items?.unit })))}
                    </span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Items Count</span>
                    <span className="text-lg font-black text-foreground leading-none mt-1">
                      {selectedBill.bill_items?.length || 0}
                    </span>
                  </div>
                </div>
              </div>

              {selectedBill?.additional_charges && Array.isArray(selectedBill.additional_charges) && selectedBill.additional_charges.length > 0 && (
                <div className="space-y-1 pt-2 border-t">
                  <h4 className="font-medium text-sm">Additional Charges</h4>
                  {selectedBill.additional_charges.map((charge, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-muted/30 p-2 rounded text-sm">
                      <span className="text-muted-foreground">{charge.name}</span>
                      <span className="font-medium">₹{charge.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              {selectedBill.discount > 0 && (
                <div className="p-3 bg-green-50 rounded-lg flex justify-between items-center">
                  <p className="text-xs sm:text-sm font-medium text-green-800">
                    Discount Applied
                  </p>
                  <p className="text-sm font-bold text-green-800">
                    -₹{selectedBill.discount.toFixed(2)}
                  </p>
                </div>
              )}

              {/* Payment Details (Split Payment) */}
              {selectedBill?.payment_details && Object.keys(selectedBill.payment_details).length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3 text-sm">Payment Split Details</h4>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm bg-muted/30 p-2 rounded">
                    {Object.entries(selectedBill.payment_details).map(([method, amount], index, arr) => (
                      <div key={method} className="flex items-center">
                        <span className="capitalize font-medium text-muted-foreground mr-1">{method}:</span>
                        <span className="font-semibold">₹{Number(amount).toFixed(2)}</span>
                        {index < arr.length - 1 && <span className="mx-2 text-muted-foreground">|</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* GST Tax Breakdown */}
              {(selectedBill as any)?.total_tax > 0 && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2 text-sm text-amber-800 dark:text-amber-400">Tax Details</h4>
                  <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                    {(() => {
                      const bill = selectedBill as any;
                      if (bill.is_composition) {
                        return (
                          <div className="flex justify-between text-sm">
                            <span className="text-amber-700 dark:text-amber-300">Tax (Composition)</span>
                            <span className="font-semibold text-amber-900 dark:text-amber-200">₹{bill.total_tax.toFixed(2)}</span>
                          </div>
                        );
                      }
                      try {
                        const summary = bill.tax_summary ? (typeof bill.tax_summary === 'string' ? JSON.parse(bill.tax_summary) : bill.tax_summary) : null;
                        const rawEntries = summary?.entries || [];
                        // Try entries[] format, fallback to numeric-key format
                        const taxEntries = rawEntries.length > 0 ? rawEntries : (() => {
                          if (summary && typeof summary === 'object') {
                            return Object.keys(summary).filter((k: string) => !isNaN(parseFloat(k))).map((rate: string) => ({
                              taxName: summary[rate].taxName || `GST ${rate}%`,
                              taxRate: parseFloat(rate),
                              taxableAmount: summary[rate].taxable || 0,
                              cgst: summary[rate].cgst || 0,
                              sgst: summary[rate].sgst || 0,
                              cess: summary[rate].cess || 0
                            }));
                          }
                          return [];
                        })();
                        if (taxEntries.length > 0) {
                          return (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-amber-200 dark:border-amber-800">
                                  <th className="text-left py-1 text-amber-700 dark:text-amber-400 font-semibold">TaxName</th>
                                  <th className="text-right py-1 text-amber-700 dark:text-amber-400 font-semibold">Taxable</th>
                                  <th className="text-right py-1 text-amber-700 dark:text-amber-400 font-semibold">CGST</th>
                                  <th className="text-right py-1 text-amber-700 dark:text-amber-400 font-semibold">SGST</th>
                                </tr>
                              </thead>
                              <tbody>
                                {taxEntries.map((entry: any, i: number) => (
                                  <tr key={i}>
                                    <td className="py-1 text-amber-800 dark:text-amber-300">{entry.taxName || `GST ${entry.taxRate}%`}</td>
                                    <td className="text-right py-1 font-medium">{(entry.taxableAmount || 0).toFixed(2)}</td>
                                    <td className="text-right py-1 font-medium">{(entry.cgst || 0).toFixed(2)}</td>
                                    <td className="text-right py-1 font-medium">{(entry.sgst || 0).toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          );
                        }
                      } catch { }
                      const halfTax = bill.total_tax / 2;
                      return (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-amber-700 dark:text-amber-300">CGST</span>
                            <span className="font-medium">₹{halfTax.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-amber-700 dark:text-amber-300">SGST</span>
                            <span className="font-medium">₹{halfTax.toFixed(2)}</span>
                          </div>
                        </>
                      );
                    })()}
                    {/* Round Off */}
                    {(selectedBill as any)?.round_off && (selectedBill as any).round_off !== 0 && (
                      <div className="flex justify-between text-xs pt-1 border-t border-amber-200 dark:border-amber-800 mt-1">
                        <span className="text-amber-600 dark:text-amber-400">Round Off</span>
                        <span className="font-medium">{(selectedBill as any).round_off > 0 ? '+' : ''}₹{(selectedBill as any).round_off.toFixed(2)}</span>
                      </div>
                    )}
                    {(selectedBill as any)?.customer_gstin && (
                      <div className="flex justify-between text-xs pt-1 border-t border-amber-200 dark:border-amber-800 mt-1">
                        <span className="text-amber-600 dark:text-amber-400">Customer GSTIN</span>
                        <span className="font-mono font-medium">{(selectedBill as any).customer_gstin}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* WhatsApp Share Section */}
              <div className="border-t pt-4 mt-4">
                {!showWhatsappInput ? (
                  <Button
                    variant="outline"
                    onClick={() => setShowWhatsappInput(true)}
                    className="w-full gap-2 text-green-600 border-green-200 hover:bg-green-50"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                    Share via WhatsApp
                  </Button>
                ) : (
                  <div className="space-y-2">
                    {/* Image Bill - no phone needed */}
                    <Button
                      onClick={() => handleWhatsAppShareBill(selectedBill, 'image')}
                      disabled={sharingImage}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-1 h-9"
                    >
                      {sharingImage ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ImageIcon className="w-4 h-4" />
                      )}
                      Image Bill (opens share dialog)
                    </Button>
                    {/* Text Bill - needs phone */}
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Enter customer mobile"
                          value={whatsappPhone}
                          onChange={(e) => setWhatsappPhone(e.target.value)}
                          className="pl-10"
                          type="tel"
                          maxLength={12}
                        />
                      </div>
                      <Button
                        onClick={() => handleWhatsAppShareBill(selectedBill, 'text')}
                        disabled={!whatsappPhone.trim()}
                        className="bg-green-600 hover:bg-green-700 text-white gap-1 h-10 px-3"
                      >
                        <FileText className="w-4 h-4" />
                        Text
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowWhatsappInput(false);
                        setWhatsappPhone('');
                      }}
                      className="w-full text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )
      }

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the bill as deleted and restore the stock quantities for all items in this bill.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteBill}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Bill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore the bill and reduce stock quantities for all items in this bill.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRestoreBill}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div >
  );
};

export default Reports;
