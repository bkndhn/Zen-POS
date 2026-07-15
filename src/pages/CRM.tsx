import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { Users, Search, Phone, Calendar, DollarSign, Download, FileSpreadsheet, Edit, Trash2, Eye, RotateCcw, Loader2, Sparkles, Share2, Printer, TrendingUp, ChevronDown, ChevronUp, Utensils } from 'lucide-react';
import { format } from 'date-fns';
// xlsx removed for security; using CSV export instead
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { AllBranchesReadOnlyBanner } from '@/components/AllBranchesReadOnlyBanner';
import { useBranch } from '@/contexts/BranchContext';
import { getShortUnit } from '@/utils/timeUtils';

interface Customer {
  id: string;
  phone: string;
  name: string | null;
  visit_count: number;
  total_spent: number;
  last_visit: string;
  created_at: string;
}

const CRM: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
  const { branchFilterId } = useBranchScopedQuery(() => fetchCustomers());
  const { isAllBranchesView } = useBranch();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  // History dialog state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [historyBills, setHistoryBills] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  // New tab/detail view states
  const [activeTab, setActiveTab] = useState<'bills' | 'insights'>('bills');
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
  const [printingBillId, setPrintingBillId] = useState<string | null>(null);
  const [sharingBillId, setSharingBillId] = useState<string | null>(null);
  const [billSettings, setBillSettings] = useState<any>(null);

  useEffect(() => {
    if (adminId) fetchCustomers();
  }, [adminId, branchFilterId]);

  // Load bill settings on mount
  useEffect(() => {
    const fetchBillSettings = async () => {
      const filterId = branchFilterId;
      const headerKey = filterId ? `hotel_pos_bill_header_${filterId}` : 'hotel_pos_bill_header';
      const savedSettings = localStorage.getItem(headerKey) ?? localStorage.getItem('hotel_pos_bill_header');
      if (savedSettings) {
        try {
          setBillSettings(JSON.parse(savedSettings));
          return;
        } catch { /* ignore */ }
      }
      if (adminId) {
        try {
          const { data } = await (supabase as any)
            .from('shop_settings')
            .select('whatsapp_bill_share_enabled, gstin, printer_width, shop_name, address, contact_number, logo_url')
            .eq('admin_id', adminId)
            .maybeSingle();
          if (data) {
            setBillSettings({
              shopName: data.shop_name || '',
              address: data.address || '',
              contactNumber: data.contact_number || '',
              logoUrl: data.logo_url || '',
              whatsappBillShareEnabled: data.whatsapp_bill_share_enabled !== false,
              gstin: data.gstin || '',
              printerWidth: data.printer_width || '58mm'
            });
          }
        } catch (err) {
          console.warn('Failed to fetch shop settings from Supabase in CRM:', err);
        }
      }
    };
    fetchBillSettings();
  }, [adminId, branchFilterId]);

  const fetchCustomers = async () => {
    if (!adminId) return;
    try {
      let query: any = supabase
        .from('customers')
        .select('*')
        .eq('admin_id', adminId)
        .order('last_visit', { ascending: false });
      if (branchFilterId) query = query.eq('branch_id', branchFilterId);
      const { data, error } = await query;

      if (error) throw error;
      setCustomers((data || []).map(c => ({
        ...c,
        visit_count: c.visit_count ?? 0,
        total_spent: c.total_spent ?? 0,
        last_visit: c.last_visit ?? c.created_at
      })));
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast({
        title: "Error",
        description: "Failed to fetch customers",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(customer => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      customer.phone.toLowerCase().includes(query) ||
      (customer.name?.toLowerCase() || '').includes(query)
    );
  });

  // Handle Edit
  const handleEditClick = (customer: Customer) => {
    setEditingCustomer(customer);
    setEditName(customer.name || '');
    setEditPhone(customer.phone);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingCustomer) return;

    if (!editPhone.trim()) {
      toast({ title: "Error", description: "Phone number is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('customers')
        .update({
          name: editName.trim() || null,
          phone: editPhone.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', editingCustomer.id);

      if (error) throw error;

      toast({ title: "Success", description: "Customer updated successfully" });
      setEditDialogOpen(false);
      setEditingCustomer(null);
      fetchCustomers();
    } catch (error) {
      console.error('Error updating customer:', error);
      toast({ title: "Error", description: "Failed to update customer", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Handle Delete
  const handleDeleteClick = (customer: Customer) => {
    setCustomerToDelete(customer);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!customerToDelete) return;

    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customerToDelete.id);

      if (error) throw error;

      toast({ title: "Success", description: "Customer deleted successfully" });
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
      fetchCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
      toast({ title: "Error", description: "Failed to delete customer", variant: "destructive" });
    }
  };

  // Helper to process customer preference analytics from their past bills
  const calculateCustomerAnalytics = (billsList: any[]) => {
    const itemFrequencies: Record<string, { name: string; qty: number; count: number; unit: string }> = {};
    let totalItemsCount = 0;
    
    billsList.forEach(bill => {
      (bill.bill_items || []).forEach((bi: any) => {
        const name = bi.items?.name || bi.name || 'Unknown Item';
        const qty = bi.quantity || 0;
        const unit = getShortUnit(bi.items?.unit || bi.unit);
        if (!itemFrequencies[name]) {
          itemFrequencies[name] = { name, qty: 0, count: 0, unit };
        }
        itemFrequencies[name].qty += qty;
        itemFrequencies[name].count += 1;
        // Only count "pc" items toward a raw items counter; weight/volume don't add to line count
        totalItemsCount += 1;
      });
    });

    const sortedItems = Object.values(itemFrequencies).sort((a, b) => b.qty - a.qty);
    
    const mostPurchased = sortedItems.slice(0, 3);
    const leastPurchased = sortedItems.length > 3 ? sortedItems.slice(-3).reverse() : [];
    const mediumPurchased = sortedItems.length > 6 ? sortedItems.slice(3, -3) : (sortedItems.length > 3 ? sortedItems.slice(3) : []);

    return { mostPurchased, leastPurchased, mediumPurchased, totalItemsCount };
  };

  // WhatsApp Share handler for CRM bill details
  const handleWhatsAppShareBill = async (bill: any, mode: 'text' | 'image' = 'text') => {
    try {
      const { formatBillMessage, shareViaWhatsApp, isValidPhoneNumber } = await import('@/utils/whatsappBillShare');
      const billDate = new Date(bill.created_at);
      const subtotal = bill.bill_items?.reduce((sum: number, item: any) => sum + (item.total || (item.quantity * item.price)), 0) || 0;
      const targetPhone = bill.customer_phone || bill.customer_mobile || historyCustomer?.phone || '';

      if (mode === 'image') {
        const { shareBillImageViaWhatsApp } = await import('@/utils/billImageGenerator');
        const billData: any = {
          billNo: bill.bill_no,
          shopName: billSettings?.shopName || profile?.hotel_name || 'Hotel',
          address: billSettings?.address,
          phone: billSettings?.contactNumber,
          gstin: billSettings?.gstin,
          items: bill.bill_items?.map((item: any) => ({
            name: item.items?.name || item.name || 'Item',
            quantity: item.quantity,
            total: item.total || (item.quantity * item.price),
            unit: item.items?.unit,
            price: item.price,
            base_value: item.items?.base_value
          })) || [],
          subtotal,
          discount: bill.discount,
          additionalCharges: bill.additional_charges || [],
          total: bill.total_amount,
          date: format(billDate, 'dd/MM/yyyy'),
          time: format(billDate, 'hh:mm a'),
          paymentMethod: bill.payment_mode,
          totalItemsCount: bill.bill_items?.length || 0,
          smartQtyCount: bill.bill_items?.reduce((s: number, i: any) => s + i.quantity, 0) || 0,
          paymentDetails: bill.payment_details,
          taxSummary: bill.tax_summary ? (typeof bill.tax_summary === 'string' ? bill.tax_summary : JSON.stringify(bill.tax_summary)) : undefined,
          totalTax: bill.total_tax || undefined,
          isComposition: (bill as any).is_composition || undefined,
          roundOff: bill.round_off || undefined,
          orderType: bill.order_type || undefined
        };
        
        setSharingBillId(bill.id);
        const result = await shareBillImageViaWhatsApp(targetPhone, billData);
        setSharingBillId(null);
        
        if (result.success) {
          toast({
            title: result.method === 'share' ? 'Bill Image Shared!' : 'Bill Image Downloaded',
            description: result.method === 'share' ? 'Shared via WhatsApp' : 'Image downloaded. Attach in WhatsApp.',
          });
        } else {
          toast({ title: "Share Failed", description: result.error, variant: "destructive" });
        }
      } else {
        // Text mode
        const message = formatBillMessage({
          billNo: bill.bill_no,
          shopName: billSettings?.shopName || profile?.hotel_name || 'Hotel',
          gstin: billSettings?.gstin,
          items: bill.bill_items?.map((item: any) => ({
            name: item.items?.name || item.name || 'Item',
            quantity: item.quantity,
            total: item.total || (item.quantity * item.price),
            unit: item.items?.unit,
            price: item.price,
            base_value: item.items?.base_value
          })) || [],
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
          roundOff: bill.round_off || undefined,
          orderType: bill.order_type || undefined,
          customerName: historyCustomer?.name || undefined
        });

        shareViaWhatsApp(targetPhone, message);
        toast({ title: "Opening WhatsApp", description: "Bill details ready to send" });
      }
    } catch (error) {
      console.error('WhatsApp share error:', error);
      toast({ title: "Error", description: "WhatsApp share failed", variant: "destructive" });
      setSharingBillId(null);
    }
  };

  // Printing handler for CRM bill details
  const handlePrintBill = async (bill: any) => {
    setPrintingBillId(bill.id);
    try {
      const { printReceipt } = await import('@/utils/bluetoothPrinter');
      const { printBrowserReceipt } = await import('@/utils/browserPrinter');

      const billDate = new Date(bill.created_at);
      const printData = {
        billNo: bill.bill_no,
        date: format(new Date(bill.date || bill.created_at), 'MMM dd, yyyy'),
        time: format(billDate, 'hh:mm a'),
        items: bill.bill_items?.map((item: any) => ({
          name: item.items?.name || item.name || 'Unknown Item',
          quantity: item.quantity,
          price: item.price,
          total: item.total || (item.quantity * item.price),
          unit: item.items?.unit || item.unit,
          base_value: item.items?.base_value || item.base_value
        })) || [],
        subtotal: bill.bill_items?.reduce((sum: number, item: any) => sum + (item.total || (item.quantity * item.price)), 0) || 0,
        paymentDetails: bill.payment_details,
        additionalCharges: bill.additional_charges || [],
        discount: bill.discount,
        total: bill.total_amount,
        paymentMethod: bill.payment_mode?.toUpperCase() || 'CASH',
        hotelName: profile?.hotel_name || '',
        shopName: billSettings?.shopName || profile?.hotel_name || 'Hotel',
        address: billSettings?.address || '',
        contactNumber: billSettings?.contactNumber || '',
        logoUrl: billSettings?.logoUrl || '',
        facebook: billSettings?.showFacebook !== false ? billSettings?.facebook : undefined,
        instagram: billSettings?.showInstagram !== false ? billSettings?.instagram : undefined,
        whatsapp: billSettings?.showWorkspace !== false ? billSettings?.whatsapp : undefined,
        printerWidth: billSettings?.printerWidth || '58mm',
        gstin: billSettings?.gstin || undefined,
        totalItemsCount: bill.bill_items?.length || 0,
        smartQtyCount: bill.bill_items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0,
        orderType: bill.order_type || undefined,
        taxSummary: bill.tax_summary ? (typeof bill.tax_summary === 'string' ? bill.tax_summary : JSON.stringify(bill.tax_summary)) : undefined,
        totalTax: bill.total_tax || undefined,
        customerGstin: bill.customer_gstin || undefined,
        roundOff: bill.round_off || undefined,
        customerMobile: bill.customer_phone || historyCustomer?.phone || undefined
      };

      toast({
        title: "Printing...",
        description: `Sending ${bill.bill_no} to printer`,
      });

      const success = await printReceipt(printData as any);

      if (success) {
        toast({
          title: "Success",
          description: `${bill.bill_no} printed successfully!`,
        });
      } else {
        console.log("Bluetooth print failed, falling back to browser print");
        await printBrowserReceipt(printData as any);
      }
    } catch (error) {
      console.error('Print error:', error);
      try {
        const { printBrowserReceipt } = await import('@/utils/browserPrinter');
        const printData = {
          billNo: bill.bill_no,
          date: format(new Date(bill.date || bill.created_at), 'MMM dd, yyyy'),
          time: format(new Date(bill.created_at), 'hh:mm a'),
          items: bill.bill_items?.map((item: any) => ({
            name: item.items?.name || item.name || 'Unknown Item',
            quantity: item.quantity,
            price: item.price,
            total: item.total || (item.quantity * item.price),
            unit: item.items?.unit || item.unit,
            base_value: item.items?.base_value || item.base_value
          })) || [],
          subtotal: bill.bill_items?.reduce((sum: number, item: any) => sum + (item.total || (item.quantity * item.price)), 0) || 0,
          paymentDetails: bill.payment_details,
          additionalCharges: bill.additional_charges || [],
          discount: bill.discount,
          total: bill.total_amount,
          paymentMethod: bill.payment_mode?.toUpperCase() || 'CASH',
          hotelName: profile?.hotel_name || '',
          shopName: billSettings?.shopName || profile?.hotel_name || 'Hotel',
          address: billSettings?.address || '',
          contactNumber: billSettings?.contactNumber || '',
          logoUrl: billSettings?.logoUrl || '',
          facebook: billSettings?.showFacebook !== false ? billSettings?.facebook : undefined,
          instagram: billSettings?.showInstagram !== false ? billSettings?.instagram : undefined,
          whatsapp: billSettings?.showWorkspace !== false ? billSettings?.whatsapp : undefined,
          printerWidth: billSettings?.printerWidth || '58mm',
          gstin: billSettings?.gstin || undefined,
          totalItemsCount: bill.bill_items?.length || 0,
          smartQtyCount: bill.bill_items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0,
          orderType: bill.order_type || undefined,
          taxSummary: bill.tax_summary ? (typeof bill.tax_summary === 'string' ? bill.tax_summary : JSON.stringify(bill.tax_summary)) : undefined,
          totalTax: bill.total_tax || undefined,
          customerGstin: bill.customer_gstin || undefined,
          roundOff: bill.round_off || undefined,
          customerMobile: bill.customer_phone || historyCustomer?.phone || undefined
        };
        await printBrowserReceipt(printData as any);
      } catch (err) {
        console.error('Browser print fallback failed:', err);
      }
    } finally {
      setPrintingBillId(null);
    }
  };

  // View history
  const openHistory = async (customer: Customer) => {
    setHistoryCustomer(customer);
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryBills([]);
    setActiveTab('bills');
    setExpandedBillId(null);
    
    try {
      const last10Digits = customer.phone.replace(/[^0-9]/g, '').slice(-10);
      if (!last10Digits || last10Digits.length < 10) {
        setHistoryBills([]);
        return;
      }
      
      let q: any = supabase
        .from('bills')
        .select('id, bill_no, date, created_at, total_amount, payment_mode, payment_details, discount, additional_charges, tax_summary, total_tax, order_type, customer_gstin, round_off, customer_phone, customer_mobile, bill_items(quantity, price, total, items(name, unit, base_value))')
        .eq('admin_id', adminId)
        .or(`customer_phone.ilike.%${last10Digits},customer_mobile.ilike.%${last10Digits}`)
        .order('created_at', { ascending: false })
        .limit(50);
        
      if (branchFilterId) q = q.eq('branch_id', branchFilterId);
      const { data, error } = await q;
      if (error) throw error;
      setHistoryBills(data || []);
    } catch (e) {
      console.error('history load failed', e);
      toast({ title: 'Error', description: 'Failed to load bill history', variant: 'destructive' });
    } finally {
      setHistoryLoading(false);
    }
  };

  // Reorder: fetch latest bill and navigate to /billing with state
  const handleReorder = async (customer: Customer, billId?: string) => {
    setReorderingId(customer.id);
    try {
      let targetBillId = billId;
      if (!targetBillId) {
        const last10Digits = customer.phone.replace(/[^0-9]/g, '').slice(-10);
        if (!last10Digits || last10Digits.length < 10) {
          toast({ title: 'Invalid Phone', description: 'Customer phone number is invalid.' });
          return;
        }
        let q: any = supabase
          .from('bills')
          .select('id')
          .eq('admin_id', adminId)
          .or(`customer_phone.ilike.%${last10Digits},customer_mobile.ilike.%${last10Digits}`)
          .order('created_at', { ascending: false })
          .limit(1);
        if (branchFilterId) q = q.eq('branch_id', branchFilterId);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) {
          toast({ title: 'No bills', description: 'No previous bill found for this customer.' });
          return;
        }
        targetBillId = data[0].id;
      }
      navigate('/billing', { state: { reorderBillId: targetBillId, customerPhone: customer.phone, customerName: customer.name } });
    } catch (e) {
      console.error('reorder failed', e);
      toast({ title: 'Error', description: 'Failed to start reorder', variant: 'destructive' });
    } finally {
      setReorderingId(null);
    }
  };

  const exportToExcel = () => {
    try {
      const data = customers.map(c => ({
        'Phone': c.phone,
        'Name': c.name || '-',
        'Total Visits': c.visit_count,
        'Total Spent': `₹${c.total_spent.toFixed(2)}`,
        'Last Visit': format(new Date(c.last_visit), 'dd/MM/yyyy hh:mm a'),
        'First Visit': format(new Date(c.created_at), 'dd/MM/yyyy')
      }));

      const headers = Object.keys(data[0] || {});
      const escape = (v: any) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [headers.join(','), ...data.map(r => headers.map(h => escape((r as any)[h])).join(','))].join('\r\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CRM_Export_${format(new Date(), 'dd-MM-yyyy')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast({
        title: "Success",
        description: "Customer data exported to CSV!"
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Error",
        description: "Failed to export data",
        variant: "destructive"
      });
    }
  };

  const exportToPDF = () => {
    try {
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>CRM Export</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #f4f4f4; font-weight: bold; }
            .summary { margin-bottom: 20px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>${profile?.hotel_name || 'Hotel'} - Customer Report</h1>
          <div class="summary">
            <p><strong>Total Customers:</strong> ${customers.length}</p>
            <p><strong>Total Revenue:</strong> ₹${customers.reduce((sum, c) => sum + c.total_spent, 0).toFixed(2)}</p>
            <p><strong>Generated:</strong> ${format(new Date(), 'dd/MM/yyyy hh:mm a')}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Phone</th>
                <th>Name</th>
                <th>Visits</th>
                <th>Total Spent</th>
                <th>Last Visit</th>
              </tr>
            </thead>
            <tbody>
              ${customers.map(c => `
                <tr>
                  <td>${c.phone}</td>
                  <td>${c.name || '-'}</td>
                  <td>${c.visit_count}</td>
                  <td>₹${c.total_spent.toFixed(2)}</td>
                  <td>${format(new Date(c.last_visit), 'dd/MM/yyyy')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.onload = () => {
          printWindow.print();
        };
      }

      toast({
        title: "Success",
        description: "PDF export opened in new window"
      });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: "Error",
        description: "Failed to generate PDF",
        variant: "destructive"
      });
    }
  };

  const totalRevenue = customers.reduce((sum, c) => sum + c.total_spent, 0);
  const totalVisits = customers.reduce((sum, c) => sum + c.visit_count, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-full overflow-x-hidden pb-24 md:pb-4">
      <AllBranchesReadOnlyBanner message="Read-only aggregate of customers across all branches." />
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-md shadow-primary/20">
            <Users className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">CRM</h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Customer relationship management</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" size="sm" className="text-xs h-8">
            <FileSpreadsheet className="w-3 h-3 mr-1" />
            Excel
          </Button>
          <Button onClick={exportToPDF} variant="outline" size="sm" className="text-xs h-8">
            <Download className="w-3 h-3 mr-1" />
            PDF
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Customers</p>
              <p className="text-lg font-bold">{customers.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">Total Visits</p>
              <p className="text-lg font-bold">{totalVisits}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="text-lg font-bold">₹{totalRevenue.toFixed(0)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by phone or name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Customer List */}
      <Card>
        <CardHeader className="p-3">
          <CardTitle className="text-sm">Customer List ({filteredCustomers.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {filteredCustomers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No customers found
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/80 transition-colors"
                  onClick={() => openHistory(customer)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3 h-3 text-primary" />
                      <span className="font-semibold text-sm">{customer.phone}</span>
                    </div>
                    {customer.name && (
                      <p className="text-xs text-muted-foreground mt-0.5">{customer.name}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {customer.visit_count} visits • Last: {format(new Date(customer.last_visit), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right mr-2">
                      <p className="font-bold text-sm text-primary">₹{customer.total_spent.toFixed(0)}</p>
                      <p className="text-[10px] text-muted-foreground">total spent</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      onClick={(e) => { e.stopPropagation(); openHistory(customer); }}
                      title="View bill history"
                    >
                      <Eye className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0 text-primary"
                      onClick={(e) => { e.stopPropagation(); handleReorder(customer); }}
                      disabled={isAllBranchesView || reorderingId === customer.id}
                      title="Reorder latest bill"
                    >
                      {reorderingId === customer.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <RotateCcw className="w-3 h-3" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      onClick={(e) => { e.stopPropagation(); handleEditClick(customer); }}
                      disabled={isAllBranchesView}
                    >
                      <Edit className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDeleteClick(customer); }}
                      disabled={isAllBranchesView}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="Enter phone number"
              />
            </div>
            <div className="space-y-2">
              <Label>Name (Optional)</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter customer name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this customer record? This action cannot be undone.
              <br /><br />
              <strong>Phone:</strong> {customerToDelete?.phone}
              <br />
              <strong>Name:</strong> {customerToDelete?.name || 'N/A'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bill History & Insights Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-[680px] w-full max-h-[90vh] overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-0">
          
          {/* Header */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0 bg-white dark:bg-slate-950">
            <div>
              <DialogTitle className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-primary" />
                Customer Profile
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {historyCustomer ? `${historyCustomer.name || 'Customer'} (${historyCustomer.phone})` : ''}
              </p>
            </div>
            
            {/* Tab Swapper */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
              <button
                onClick={() => setActiveTab('bills')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  activeTab === 'bills'
                    ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-800 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                📋 Bills List
              </button>
              <button
                onClick={() => setActiveTab('insights')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                  activeTab === 'insights'
                    ? 'bg-white dark:bg-slate-950 shadow-sm text-slate-800 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Sparkles className="w-3 h-3 text-primary animate-pulse" />
                AI Preferences
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {historyLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Analyzing past purchases...</p>
              </div>
            ) : historyBills.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-slate-950 border rounded-xl p-8 shadow-sm">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No active bills found</p>
                <p className="text-xs text-muted-foreground mt-1">This user profile exists in CRM but hasn't completed any transaction yet.</p>
              </div>
            ) : activeTab === 'bills' ? (
              /* Bills List Tab */
              <div className="space-y-3">
                {historyBills.map((b: any) => {
                  const isExpanded = expandedBillId === b.id;
                  const billDate = new Date(b.created_at);
                  const itemsCount = b.bill_items?.length || 0;
                  const subtotal = b.bill_items?.reduce((sum: number, item: any) => sum + (item.total || (item.quantity * item.price)), 0) || 0;

                  return (
                    <div
                      key={b.id}
                      className={`border rounded-xl transition-all duration-200 shadow-sm bg-white dark:bg-slate-950 ${
                        isExpanded 
                          ? 'border-primary ring-1 ring-primary/20' 
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {/* Summary Row */}
                      <div 
                        onClick={() => setExpandedBillId(isExpanded ? null : b.id)}
                        className="p-3.5 flex items-center justify-between gap-4 cursor-pointer"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 dark:text-slate-100">#{b.bill_no}</span>
                            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-muted-foreground uppercase font-medium">
                              {b.order_type === 'parcel' ? '📦 PARCEL' : '🍽️ DINE-IN'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                            <span>{format(billDate, 'dd MMM yyyy · hh:mm a')}</span>
                            <span>•</span>
                            <span className="capitalize">{b.payment_mode || 'Cash'}</span>
                            <span>•</span>
                            <span>{itemsCount} items</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <p className="font-black text-primary text-base">₹{Number(b.total_amount || 0).toFixed(0)}</p>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      </div>

                      {/* Expandable Receipt Detail view */}
                      {isExpanded && (
                        <div className="border-t border-dashed border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/20">
                          
                          {/* Dotted Receipt Container */}
                          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 rounded-lg shadow-inner max-w-sm mx-auto font-mono text-[11px] text-slate-700 dark:text-slate-300 leading-normal">
                            <div className="text-center font-bold uppercase text-xs tracking-wider mb-0.5">
                              {billSettings?.shopName || profile?.hotel_name || 'Hotel Zen'}
                            </div>
                            {billSettings?.address && (
                              <div className="text-center text-[10px] text-muted-foreground line-clamp-2 mb-1">
                                {billSettings.address}
                              </div>
                            )}
                            <div className="text-center text-[10px] text-muted-foreground mb-2">
                              {billSettings?.contactNumber && `Tel: ${billSettings.contactNumber}`}
                            </div>
                            
                            <div className="border-t border-dashed border-slate-300 dark:border-slate-700 my-2"></div>
                            
                            <div className="flex justify-between gap-2 mb-1">
                              <span>Bill No: #{b.bill_no}</span>
                              <span>Mode: {b.payment_mode?.toUpperCase()}</span>
                            </div>
                            <div className="flex justify-between gap-2 mb-2">
                              <span>Date: {format(billDate, 'dd/MM/yyyy')}</span>
                              <span>Time: {format(billDate, 'hh:mm a')}</span>
                            </div>
                            
                            <div className="border-t border-dashed border-slate-300 dark:border-slate-700 my-2"></div>
                            
                            {/* Items List */}
                            <div className="space-y-1 mb-2 font-mono">
                              <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase pb-1">
                                <span>Item</span>
                                <div className="flex gap-4">
                                  <span>Qty</span>
                                  <span className="w-12 text-right">Total</span>
                                </div>
                              </div>
                              {b.bill_items?.map((item: any, idx: number) => {
                                const base = item.items?.base_value || 1;
                                const shortU = getShortUnit(item.items?.unit || item.unit);
                                return (
                                  <div key={idx} className="flex justify-between gap-2">
                                    <span className="truncate flex-1">{item.items?.name || item.name || 'Item'}</span>
                                    <div className="flex gap-4 flex-shrink-0">
                                      <span>{item.quantity} {shortU}</span>
                                      <span className="w-12 text-right">₹{(item.total || (item.quantity * item.price)).toFixed(0)}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            
                            <div className="border-t border-dashed border-slate-300 dark:border-slate-700 my-2"></div>
                            
                            {/* Calculation Summary */}
                            <div className="space-y-1 font-mono">
                              <div className="flex justify-between gap-2">
                                <span className="text-muted-foreground">Subtotal:</span>
                                <span>₹{subtotal.toFixed(2)}</span>
                              </div>
                              {b.discount > 0 && (
                                <div className="flex justify-between gap-2 text-green-600">
                                  <span>Discount:</span>
                                  <span>-₹{Number(b.discount).toFixed(2)}</span>
                                </div>
                              )}
                              {b.additional_charges?.map((c: any, idx: number) => (
                                <div key={idx} className="flex justify-between gap-2">
                                  <span className="text-muted-foreground">{c.name}:</span>
                                  <span>+₹{Number(c.amount).toFixed(2)}</span>
                                </div>
                              ))}
                              {b.total_tax > 0 && (
                                <div className="flex justify-between gap-2">
                                  <span className="text-muted-foreground">GST/Taxes:</span>
                                  <span>+₹{Number(b.total_tax).toFixed(2)}</span>
                                </div>
                              )}
                              {b.round_off !== 0 && (
                                <div className="flex justify-between gap-2">
                                  <span className="text-muted-foreground">Round Off:</span>
                                  <span>{b.round_off > 0 ? '+' : ''}₹{Number(b.round_off).toFixed(2)}</span>
                                </div>
                              )}
                              <div className="flex justify-between gap-2 border-t border-dashed border-slate-200 dark:border-slate-800 pt-1.5 text-xs font-bold">
                                <span>GRAND TOTAL:</span>
                                <span className="text-primary font-black">₹{Number(b.total_amount || 0).toFixed(0)}</span>
                              </div>
                            </div>
                            
                            <div className="border-t border-dashed border-slate-300 dark:border-slate-700 my-2"></div>
                            <div className="text-center text-[10px] text-muted-foreground font-bold tracking-wide italic">
                              THANK YOU FOR YOUR VISIT!
                            </div>
                          </div>
                          
                          {/* Receipt Action Toolbar */}
                          <div className="mt-4 flex flex-wrap gap-2 justify-center border-t border-slate-200/50 dark:border-slate-800/50 pt-3">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePrintBill(b)}
                              className="h-8 text-xs flex items-center gap-1.5"
                              disabled={printingBillId === b.id}
                            >
                              {printingBillId === b.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Printer className="w-3.5 h-3.5 text-slate-500" />
                              )}
                              Print Receipt
                            </Button>
                            
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleWhatsAppShareBill(b, 'text')}
                              className="h-8 text-xs flex items-center gap-1.5"
                              disabled={sharingBillId === b.id}
                            >
                              <Share2 className="w-3.5 h-3.5 text-slate-500" />
                              WhatsApp Text
                            </Button>
                            
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleWhatsAppShareBill(b, 'image')}
                              className="h-8 text-xs flex items-center gap-1.5 text-green-600 dark:text-green-400 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
                              disabled={sharingBillId === b.id}
                            >
                              {sharingBillId === b.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-[#25D366] fill-current" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                              )}
                              Share Image
                            </Button>
                            
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => historyCustomer && handleReorder(historyCustomer, b.id)}
                              className="h-8 text-xs flex items-center gap-1.5 border-primary/40 hover:bg-primary/5 text-primary"
                              disabled={isAllBranchesView}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Reorder items
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Preferences / AI Analytics Tab */
              <div className="space-y-4 font-sans">
                {(() => {
                  const analytics = calculateCustomerAnalytics(historyBills);
                  const averageSpent = historyCustomer && historyCustomer.visit_count > 0 ? (historyCustomer.total_spent / historyCustomer.visit_count) : 0;
                  
                  return (
                    <>
                      {/* Metric Widgets */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Spent</p>
                          <p className="text-lg font-black text-primary mt-1">₹{historyCustomer?.total_spent.toFixed(0)}</p>
                        </div>
                        <div className="bg-white dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Visits</p>
                          <p className="text-lg font-black text-blue-600 dark:text-blue-400 mt-1">{historyCustomer?.visit_count}</p>
                        </div>
                        <div className="bg-white dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Avg Ticket</p>
                          <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">₹{averageSpent.toFixed(0)}</p>
                        </div>
                      </div>

                      {/* Customer Taste Profiler */}
                      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-4">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          <TrendingUp className="w-4 h-4 text-primary" />
                          Favorite Dishes & Purchasing Frequency
                        </h3>
                        
                        <div className="space-y-3">
                          {/* Most Purchased (Top) */}
                          <div>
                            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded uppercase tracking-wider">
                              🔥 Most Ordered (Favorite)
                            </span>
                            {analytics.mostPurchased.length === 0 ? (
                              <p className="text-xs text-muted-foreground mt-1 px-1">No items found.</p>
                            ) : (
                              <div className="mt-1.5 space-y-1">
                                {analytics.mostPurchased.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center bg-emerald-50/20 dark:bg-emerald-950/10 p-2 rounded-lg text-xs">
                                    <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                      <Utensils className="w-3 h-3 text-emerald-500" />
                                      {item.name}
                                    </span>
                                    <span className="font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full">
                                      {item.qty} {item.unit}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Medium Purchased (Occasional) */}
                          <div>
                            <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 rounded uppercase tracking-wider">
                              🍽️ Medium/Occasional Dishes
                            </span>
                            {analytics.mediumPurchased.length === 0 ? (
                              <p className="text-xs text-muted-foreground mt-1 px-1">No items found.</p>
                            ) : (
                              <div className="mt-1.5 space-y-1">
                                {analytics.mediumPurchased.slice(0, 3).map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center bg-blue-50/20 dark:bg-blue-950/10 p-2 rounded-lg text-xs">
                                    <span className="text-slate-700 dark:text-slate-300">
                                      {item.name}
                                    </span>
                                    <span className="font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-full">
                                      {item.qty} {item.unit}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Least Purchased (Trial/Experiment) */}
                          <div>
                            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded uppercase tracking-wider">
                              🧊 Least Ordered (Tried Once)
                            </span>
                            {analytics.leastPurchased.length === 0 ? (
                              <p className="text-xs text-muted-foreground mt-1 px-1">No items found.</p>
                            ) : (
                              <div className="mt-1.5 space-y-1">
                                {analytics.leastPurchased.slice(0, 3).map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center bg-amber-50/20 dark:bg-amber-950/10 p-2 rounded-lg text-xs">
                                    <span className="text-slate-600 dark:text-slate-400">
                                      {item.name}
                                    </span>
                                    <span className="font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-full">
                                      {item.qty} {item.unit}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Advice Card */}
                      <div className="bg-slate-100 dark:bg-slate-800/50 rounded-xl p-3.5 border border-slate-200/50 dark:border-slate-800 text-xs text-muted-foreground leading-relaxed flex items-start gap-2.5">
                        <Sparkles className="w-4 h-4 text-primary flex-shrink-0 mt-0.5 animate-pulse" />
                        <div>
                          <span className="font-bold text-slate-700 dark:text-slate-300">Waiter Pairing Suggestion:</span>{" "}
                          When billing {historyCustomer?.name || 'this customer'}, recommend pairings based on their favorite dishes above (e.g. suggesting custom spice levels or paired beverages) for a customized dining experience!
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex justify-end flex-shrink-0">
            <Button variant="outline" className="h-8 text-xs font-semibold" onClick={() => setHistoryOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CRM;
