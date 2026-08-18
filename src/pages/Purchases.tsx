import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { ShoppingBag, Plus, Trash2, X, Eye, FileSpreadsheet, DollarSign, Calendar, Loader2, Info, FileText, Send, TrendingUp, Wallet, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { offlineManager } from '@/utils/offlineManager';

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
}
interface ItemRow { id: string; name: string; branch_id: string; unit: string | null; }
interface Purchase {
  id: string; purchase_no: string; invoice_no: string | null; purchase_date: string;
  total_amount: number; notes: string | null; supplier_id: string | null;
  suppliers?: Supplier | null;
}

interface LineDist { branch_id: string; item_id: string; quantity: number; }
interface Line {
  item_name: string; unit: string; quantity: number; rate: number;
  batch_no: string; mfg_date: string; expiry_date: string;
  distributions: LineDist[];
}

const Purchases: React.FC = () => {
  const { profile , adminProfileId } = useAuth();
  const { branches } = useBranch();
  const adminId = adminProfileId;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'purchases' | 'outstanding' | 'ledger'>('purchases');

  // Form states
  const [supplierId, setSupplierId] = useState<string>('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [initialPaymentMode, setInitialPaymentMode] = useState<string>('cash');

  // Inline dropdown state
  const [focusedLineIdx, setFocusedLineIdx] = useState<number | null>(null);

  // Supplier balances outstanding
  const [supplierBalances, setSupplierBalances] = useState<any[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);

  // Detail dialog state
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // New Payment dialog state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMode, setPayMode] = useState<string>('cash');
  const [payRefNo, setPayRefNo] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payDate, setPayDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paySaving, setPaySaving] = useState(false);

  const load = async () => {
    if (!adminId) return;
    setLoading(true);
    try {
      const [sup, pur, itm] = await Promise.all([
        supabase.from('suppliers').select('*').eq('admin_id', adminId).eq('is_active', true).order('name'),
        supabase.from('purchases').select('*, suppliers(*)').eq('admin_id', adminId).order('purchase_date', { ascending: false }).limit(100),
        supabase.from('items').select('id,name,branch_id,unit').eq('admin_id', adminId).eq('is_active', true).order('name'),
      ]);

      if (sup.error) throw sup.error;
      if (pur.error) throw pur.error;
      if (itm.error) throw itm.error;

      // Update UI first (instant)
      setSuppliers((sup.data || []) as Supplier[]);
      setPurchases((pur.data || []) as Purchase[]);
      setItems((itm.data || []) as ItemRow[]);

      // Cache in background (non-blocking)
      offlineManager.cacheQueryResult('suppliers', 'list', sup.data || []).catch(() => {});
      offlineManager.cacheQueryResult('purchases', 'list', pur.data || []).catch(() => {});
      offlineManager.cacheQueryResult('items', 'list', itm.data || []).catch(() => {});
    } catch (err) {
      console.error('Fetch failed:', err);
      try {
        const cachedSup = await offlineManager.getCachedQueryResult('suppliers', 'list');
        if (cachedSup?.data) setSuppliers(cachedSup.data as Supplier[]);
        const cachedPur = await offlineManager.getCachedQueryResult('purchases', 'list');
        if (cachedPur?.data) setPurchases(cachedPur.data as Purchase[]);
        const cachedItm = await offlineManager.getCachedQueryResult('items', 'list');
        if (cachedItm?.data) setItems(cachedItm.data as ItemRow[]);
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [adminId]);

  const calculateSupplierBalances = async () => {
    if (!adminId) return;
    setBalancesLoading(true);
    try {
      const { data: allPurchases } = await supabase
        .from('purchases')
        .select('id, supplier_id, total_amount')
        .eq('admin_id', adminId);

      const { data: allPayments } = await (supabase as any)
        .from('purchase_payments')
        .select('amount, purchase_id')
        .eq('admin_id', adminId);

      const purchasePaidMap: Record<string, number> = {};
      allPayments?.forEach(p => {
        purchasePaidMap[p.purchase_id] = (purchasePaidMap[p.purchase_id] || 0) + Number(p.amount);
      });

      const supplierInvoiced: Record<string, number> = {};
      const supplierPaid: Record<string, number> = {};

      allPurchases?.forEach(p => {
        const supId = p.supplier_id || 'unassigned';
        supplierInvoiced[supId] = (supplierInvoiced[supId] || 0) + Number(p.total_amount);
        supplierPaid[supId] = (supplierPaid[supId] || 0) + (purchasePaidMap[p.id] || 0);
      });

      const balances = suppliers.map(s => {
        const invoiced = supplierInvoiced[s.id] || 0;
        const paid = supplierPaid[s.id] || 0;
        return {
          ...s,
          invoiced,
          paid,
          outstanding: invoiced - paid
        };
      });

      setSupplierBalances(balances);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error calculating balances', variant: 'destructive' });
    } finally {
      setBalancesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'outstanding') {
      calculateSupplierBalances();
    }
  }, [activeTab, purchases, suppliers]);

  // ---------- Credit / Debit ledger ----------
  const [ledgerRows, setLedgerRows] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const loadLedger = async () => {
    if (!adminId) return;
    setLedgerLoading(true);
    try {
      const [purRes, payRes] = await Promise.all([
        supabase.from('purchases').select('id, purchase_no, purchase_date, total_amount, supplier_id, suppliers(name)').eq('admin_id', adminId).order('purchase_date', { ascending: false }).limit(300),
        (supabase as any).from('purchase_payments').select('id, amount, payment_date, payment_mode, reference_no, purchase_id').eq('admin_id', adminId).order('payment_date', { ascending: false }).limit(300),
      ]);

      const purList: any[] = purRes.data || [];
      const purMap: Record<string, any> = {};
      purList.forEach(p => { purMap[p.id] = p; });

      const rows: any[] = [
        ...purList.map(p => ({
          id: `pur-${p.id}`,
          date: p.purchase_date,
          type: 'credit' as const,
          party: p.suppliers?.name || 'Walk-in Supplier',
          ref: p.purchase_no,
          mode: '—',
          amount: Number(p.total_amount || 0),
        })),
        ...((payRes.data || []) as any[]).map(pay => ({
          id: `pay-${pay.id}`,
          date: pay.payment_date,
          type: 'debit' as const,
          party: purMap[pay.purchase_id]?.suppliers?.name || 'Supplier',
          ref: pay.reference_no || purMap[pay.purchase_id]?.purchase_no || '—',
          mode: pay.payment_mode || 'cash',
          amount: Number(pay.amount || 0),
        })),
      ].sort((a, b) => (a.date < b.date ? 1 : -1));

      setLedgerRows(rows);
    } catch (e) {
      console.error('Ledger load failed', e);
      toast({ title: 'Could not load purchase ledger', variant: 'destructive' });
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => { loadLedger(); }, [adminId, purchases.length]);

  const kpis = useMemo(() => {
    const monthKey = format(new Date(), 'yyyy-MM');
    let monthPurchases = 0, monthPaid = 0, totalCredit = 0, totalDebit = 0;
    ledgerRows.forEach(r => {
      const inMonth = (r.date || '').startsWith(monthKey);
      if (r.type === 'credit') {
        totalCredit += r.amount;
        if (inMonth) monthPurchases += r.amount;
      } else {
        totalDebit += r.amount;
        if (inMonth) monthPaid += r.amount;
      }
    });
    return {
      monthPurchases,
      monthPaid,
      outstanding: Math.max(0, totalCredit - totalDebit),
      billCount: ledgerRows.filter(r => r.type === 'credit').length,
    };
  }, [ledgerRows]);

  const exportLedgerCsv = () => {
    const header = ['Date', 'Type', 'Party', 'Reference', 'Mode', 'Amount'];
    const lines = ledgerRows.map(r => [r.date, r.type === 'credit' ? 'Purchase (Credit)' : 'Payment (Debit)', r.party, r.ref, r.mode, r.amount.toFixed(2)]);
    const csv = [header, ...lines].map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase-ledger-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  const resetForm = () => {
    setSupplierId(''); setInvoiceNo(''); setNotes('');
    setPurchaseDate(format(new Date(), 'yyyy-MM-dd'));
    setPaidAmount(0); setInitialPaymentMode('cash');
    setLines([blankLine()]);
  };

  const blankLine = (): Line => ({
    item_name: '', unit: '', quantity: 0, rate: 0,
    batch_no: '', mfg_date: '', expiry_date: '',
    distributions: branches.length ? [{ branch_id: branches.find(b => b.is_main)?.id || branches[0].id, item_id: '', quantity: 0 }] : []
  });

  const openNew = () => { resetForm(); setOpen(true); };

  const updateLine = (idx: number, patch: Partial<Line>) => setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const addLine = () => setLines(prev => [...prev, blankLine()]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const itemsForBranch = (branchId: string) => items.filter(i => i.branch_id === branchId);

  const onPickItem = (idx: number, branchId: string, itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    updateLine(idx, {
      item_name: item.name,
      unit: item.unit || '',
      distributions: lines[idx].distributions.map(d => d.branch_id === branchId ? { ...d, item_id: itemId } : d),
    });
  };

  const updateDist = (lineIdx: number, distIdx: number, patch: Partial<LineDist>) => {
    setLines(prev => prev.map((l, i) => i === lineIdx
      ? { ...l, distributions: l.distributions.map((d, j) => j === distIdx ? { ...d, ...patch } : d) }
      : l));
  };

  const addDist = (lineIdx: number) => {
    const used = new Set(lines[lineIdx].distributions.map(d => d.branch_id));
    const next = branches.find(b => !used.has(b.id));
    if (!next) { toast({ title: 'All branches added' }); return; }
    setLines(prev => prev.map((l, i) => i === lineIdx ? { ...l, distributions: [...l.distributions, { branch_id: next.id, item_id: '', quantity: 0 }] } : l));
  };

  const removeDist = (lineIdx: number, distIdx: number) => {
    setLines(prev => prev.map((l, i) => i === lineIdx ? { ...l, distributions: l.distributions.filter((_, j) => j !== distIdx) } : l));
  };

  const distributeToAllBranches = (lineIdx: number) => {
    const line = lines[lineIdx];
    const split = branches.length ? +(line.quantity / branches.length).toFixed(2) : 0;
    setLines(prev => prev.map((l, i) => i === lineIdx ? {
      ...l,
      distributions: branches.map(b => {
        const matched = items.find(it => it.branch_id === b.id && it.name.toLowerCase() === line.item_name.toLowerCase());
        return { branch_id: b.id, item_id: matched?.id || '', quantity: split };
      })
    } : l));
  };

  const totalAmount = lines.reduce((s, l) => s + (l.quantity * l.rate || 0), 0);
  const totalDistributed = (l: Line) => l.distributions.reduce((s, d) => s + (Number(d.quantity) || 0), 0);

  const submit = async () => {
    if (!lines.length) return toast({ title: 'Add at least one line', variant: 'destructive' });
    for (const [i, l] of lines.entries()) {
      if (!l.item_name.trim()) return toast({ title: `Line ${i + 1}: item name required`, variant: 'destructive' });
      if (l.quantity <= 0) return toast({ title: `Line ${i + 1}: quantity must be > 0`, variant: 'destructive' });
      const distSum = totalDistributed(l);
      if (Math.abs(distSum - l.quantity) > 0.01) return toast({ title: `Line ${i + 1}: distributed (${distSum}) ≠ quantity (${l.quantity})`, variant: 'destructive' });
    }

    if (paidAmount > totalAmount) {
      return toast({ title: 'Paid amount cannot exceed total purchase cost', variant: 'destructive' });
    }

    setSaving(true);
    const payloadData = {
      p_supplier_id: supplierId || null,
      p_invoice_no: invoiceNo || null,
      p_purchase_date: purchaseDate,
      p_notes: notes || null,
      p_lines: lines.map(l => ({
        item_name: l.item_name, unit: l.unit, quantity: l.quantity, rate: l.rate,
        batch_no: l.batch_no, mfg_date: l.mfg_date || null, expiry_date: l.expiry_date || null,
        distributions: l.distributions.filter(d => d.quantity > 0).map(d => ({
          branch_id: d.branch_id, item_id: d.item_id || null, quantity: d.quantity
        }))
      }))
    };
    
    try {
      const { data: purchaseData, error } = await supabase.rpc('create_purchase_transaction', payloadData);

      if (error) throw error;

      // Record initial payment if specified
      if (purchaseData && (purchaseData as any).id && paidAmount > 0) {
        const { error: payError } = await (supabase as any).from("purchase_payments").insert({
          admin_id: adminId,
          purchase_id: (purchaseData as any).id,
          payment_date: purchaseDate,
          amount: paidAmount,
          payment_mode: initialPaymentMode,
          notes: 'Initial payment recorded at purchase time'
        });
        if (payError) {
          console.warn('Failed to record initial purchase payment:', payError);
        }
      }
    } catch (err: any) {
      if (!navigator.onLine) {
        await offlineManager.queueWrite({ table: 'purchases', operation: 'INSERT', data: payloadData });
        toast({ title: 'Saved offline', description: 'Will sync when connection returns' });
        setSaving(false);
        setOpen(false); load();
        window.dispatchEvent(new CustomEvent('items-updated'));
        return; // Don't show error
      }
      setSaving(false);
      return toast({ title: 'Error saving purchase', description: err.message, variant: 'destructive' });
    }



    setSaving(false);
    toast({ title: 'Purchase saved successfully' });
    setOpen(false); load();
    window.dispatchEvent(new CustomEvent('items-updated'));
  };

  // Click row to show details
  const openDetails = async (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setDetailsOpen(true);
    setPaymentsLoading(true);
    try {
      const [itemsRes, paymentsRes] = await Promise.all([
        supabase
          .from('purchase_items')
          .select('*, purchase_distributions(*)')
          .eq('purchase_id', purchase.id),
        (supabase as any)
          .from('purchase_payments')
          .select('*')
          .eq('purchase_id', purchase.id)
          .order('payment_date', { ascending: false })
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      setSelectedPurchase((prev: any) => ({
        ...prev,
        purchase_items: itemsRes.data || []
      }));
      setPayments(paymentsRes.data || []);
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Failed to load details', description: e.message, variant: 'destructive' });
    } finally {
      setPaymentsLoading(false);
    }
  };

  const openRecordPayment = () => {
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const pendingAmount = Number(selectedPurchase?.total_amount || 0) - totalPaid;
    setPayAmount(pendingAmount);
    setPayMode('cash');
    setPayRefNo('');
    setPayNotes('');
    setPayDate(format(new Date(), 'yyyy-MM-dd'));
    setPaymentDialogOpen(true);
  };

  const handleSavePayment = async () => {
    if (payAmount <= 0) return toast({ title: 'Amount must be greater than 0', variant: 'destructive' });
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const pendingAmount = Number(selectedPurchase?.total_amount || 0) - totalPaid;
    
    if (payAmount > pendingAmount + 0.01) {
      return toast({ title: 'Amount exceeds outstanding balance', variant: 'destructive' });
    }

    setPaySaving(true);
    try {
      const { error } = await (supabase as any).from("purchase_payments").insert({
        admin_id: adminId,
        purchase_id: selectedPurchase.id,
        payment_date: payDate,
        amount: payAmount,
        payment_mode: payMode,
        reference_no: payRefNo || null,
        notes: payNotes || null
      });

      if (error) throw error;
      toast({ title: 'Payment recorded successfully' });
      setPaymentDialogOpen(false);
      openDetails(selectedPurchase); // Reload details
      load(); // Reload main purchase list
    } catch (e: any) {
      toast({ title: 'Payment failed', description: e.message, variant: 'destructive' });
    } finally {
      setPaySaving(false);
    }
  };

  // Statement download CSV
  const downloadSupplierStatement = async (supplier: any) => {
    try {
      const { data: supPurchases } = await supabase
        .from('purchases')
        .select('id, purchase_no, invoice_no, purchase_date, total_amount, notes')
        .eq('admin_id', adminId)
        .eq('supplier_id', supplier.id)
        .order('purchase_date', { ascending: true });

      if (!supPurchases || supPurchases.length === 0) {
        toast({ title: 'No transactions found', description: 'No purchases found for this supplier.' });
        return;
      }

      const pIds = supPurchases.map(p => p.id);

      const { data: supPayments } = await (supabase as any)
        .from('purchase_payments')
        .select('payment_date, amount, payment_mode, reference_no, notes, purchase_id')
        .eq('admin_id', adminId)
        .in('purchase_id', pIds)
        .order('payment_date', { ascending: true });

      const ledger: any[] = [];

      supPurchases.forEach(p => {
        ledger.push({
          date: p.purchase_date,
          type: 'Purchase Invoice',
          ref: p.purchase_no + (p.invoice_no ? ` (Inv: ${p.invoice_no})` : ''),
          invoiced: Number(p.total_amount),
          paid: 0,
          notes: p.notes || ''
        });
      });

      supPayments?.forEach(pay => {
        const purchase = supPurchases.find(p => p.id === pay.purchase_id);
        ledger.push({
          date: pay.payment_date,
          type: 'Payment Outward',
          ref: (purchase?.purchase_no || '') + (pay.reference_no ? ` [Ref: ${pay.reference_no}]` : ''),
          invoiced: 0,
          paid: Number(pay.amount),
          notes: `${(pay.payment_mode || '').toUpperCase()}${pay.notes ? ` - ${pay.notes}` : ''}`
        });
      });

      ledger.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let runningBalance = 0;
      const ledgerWithBalance = ledger.map(entry => {
        runningBalance += (entry.invoiced - entry.paid);
        return { ...entry, balance: runningBalance };
      });

      const headers = ['Date', 'Transaction Type', 'Reference', 'Invoiced Amount (Dr)', 'Paid Amount (Cr)', 'Outstanding Balance', 'Notes'];
      const rows = ledgerWithBalance.map(e => [
        e.date,
        e.type,
        `"${e.ref.replace(/"/g, '""')}"`,
        e.invoiced || '',
        e.paid || '',
        e.balance.toFixed(2),
        `"${e.notes.replace(/"/g, '""')}"`
      ]);

      const csvContent = [
        `Supplier Statement for: ${supplier.name}`,
        `Outstanding Balance: INR ${runningBalance.toFixed(2)}`,
        '',
        headers.join(','),
        ...rows.map(r => r.join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `statement_${supplier.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: 'Statement downloaded successfully' });
    } catch (e: any) {
      toast({ title: 'Export failed', description: e.message, variant: 'destructive' });
    }
  };

  const generatePO = (purchase: any) => {
    const shopName = profile?.hotel_name || 'Our Shop';
    const supplierName = purchase.suppliers?.name || 'Walk-in Supplier';
    const supplierPhone = purchase.suppliers?.phone || '';
    const itemsHtml = purchase.purchase_items?.map((item: any, i: number) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${i + 1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.item_name} ${item.unit ? `(${item.unit})` : ''}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">₹${Number(item.rate).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">₹${Number(item.total).toFixed(2)}</td>
      </tr>
    `).join('') || '';

    const html = `
      <html>
        <head>
          <title>PO-${purchase.purchase_no}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; color: #333; line-height: 1.5; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
            .title { font-size: 24px; font-weight: bold; margin: 0 0 10px 0; color: #111; }
            .shop-name { font-size: 18px; color: #555; }
            .details { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .box { padding: 15px; background: #f9f9f9; border-radius: 8px; min-width: 250px; }
            .box h3 { margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; color: #666; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; text-align: left; }
            th { background: #f9f9f9; padding: 10px 8px; font-weight: 600; text-transform: uppercase; font-size: 12px; color: #555; border-bottom: 2px solid #ddd; }
            .total { text-align: right; font-size: 18px; font-weight: bold; padding-top: 15px; border-top: 2px solid #ddd; }
            .notes { margin-top: 40px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">PURCHASE ORDER</h1>
            <div class="shop-name">${shopName}</div>
          </div>
          
          <div class="details">
            <div class="box">
              <h3>Supplier Details</h3>
              <strong>${supplierName}</strong><br>
              ${supplierPhone ? `Phone: ${supplierPhone}<br>` : ''}
              ${purchase.suppliers?.address ? `Address: ${purchase.suppliers.address}<br>` : ''}
              ${purchase.suppliers?.gstin ? `GSTIN: ${purchase.suppliers.gstin}` : ''}
            </div>
            <div class="box">
              <h3>Order Details</h3>
              <strong>PO No:</strong> ${purchase.purchase_no}<br>
              ${purchase.invoice_no ? `<strong>Invoice No:</strong> ${purchase.invoice_no}<br>` : ''}
              <strong>Date:</strong> ${purchase.purchase_date}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Item Description</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="total">
            Total Amount: ₹${Number(purchase.total_amount || 0).toFixed(2)}
          </div>
          
          ${purchase.notes ? `<div class="notes"><strong>Notes:</strong><br>${purchase.notes}</div>` : ''}
        </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    iframe.contentWindow?.document.open();
    iframe.contentWindow?.document.write(html);
    iframe.contentWindow?.document.close();
    
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  };

  const sendWhatsApp = (purchase: any) => {
    const shopName = profile?.hotel_name || 'Our Shop';
    const supplierPhone = purchase.suppliers?.phone || '';
    
    if (!supplierPhone) {
      toast({ title: 'Supplier phone number not available', variant: 'destructive' });
      return;
    }

    let itemsText = '';
    purchase.purchase_items?.forEach((item: any, i: number) => {
      itemsText += `${i + 1}. ${item.item_name} - ${item.quantity} ${item.unit || ''} @ ₹${Number(item.rate).toFixed(2)}\n`;
    });

    const message = `📋 *Purchase Order - ${purchase.purchase_no}*
From: ${shopName}
Date: ${purchase.purchase_date}

*Items:*
${itemsText}
*Total: ₹${Number(purchase.total_amount || 0).toFixed(2)}*

Please confirm receipt of this order.`;

    const encodedMessage = encodeURIComponent(message);
    const waUrl = `https://wa.me/${supplierPhone.replace(/\D/g, '')}?text=${encodedMessage}`;
    window.open(waUrl, '_blank');
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 pb-24 font-sans text-slate-800 dark:text-slate-100">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-primary" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Purchases</h1>
          </div>
          <Button onClick={openNew} className="h-9 font-semibold shadow-sm"><Plus className="w-4 h-4 mr-1.5" /> New Purchase</Button>
        </div>

        {/* KPI summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Purchases this month', value: kpis.monthPurchases, icon: ShoppingBag, tone: 'text-primary' },
            { label: 'Paid this month', value: kpis.monthPaid, icon: Wallet, tone: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Total outstanding', value: kpis.outstanding, icon: TrendingUp, tone: 'text-rose-500' },
            { label: 'Purchase bills', value: kpis.billCount, icon: FileText, tone: 'text-slate-600 dark:text-slate-300', plain: true },
          ].map(k => (
            <Card key={k.label} className="border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm bg-white dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                  <k.icon className={`w-3.5 h-3.5 ${k.tone}`} />
                  <span className="truncate">{k.label}</span>
                </div>
                <p className={`mt-1.5 text-lg font-black ${k.tone}`}>
                  {ledgerLoading ? <span className="inline-block h-5 w-20 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" /> : (k as any).plain ? k.value : `₹${Number(k.value).toFixed(2)}`}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} className="w-full">
          <TabsList className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50 w-full sm:w-auto flex-wrap h-auto">
            <TabsTrigger value="purchases" className="text-xs font-semibold py-1.5 px-3">Recent Purchases</TabsTrigger>
            <TabsTrigger value="outstanding" className="text-xs font-semibold py-1.5 px-3">Suppliers & Outstanding</TabsTrigger>
            <TabsTrigger value="ledger" className="text-xs font-semibold py-1.5 px-3">Credit / Debit Ledger</TabsTrigger>
          </TabsList>


          <TabsContent value="purchases" className="mt-4">
            <Card className="border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm bg-white dark:bg-slate-950 overflow-hidden">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/10 py-3.5 px-5">
                <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">Recent purchases list</CardTitle>
              </CardHeader>
              <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-800/80">
                {loading && (
                  <div className="flex justify-center items-center py-12 text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span>Loading purchases…</span>
                  </div>
                )}
                {!loading && purchases.length === 0 && (
                  <p className="text-slate-400 text-center py-12 text-sm">No purchases recorded yet</p>
                )}
                {!loading && purchases.map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => openDetails(p)}
                    className="flex items-center justify-between py-3 px-5 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-all duration-150 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-primary transition-colors flex items-center gap-1.5">
                        <span>{p.purchase_no}</span>
                        {p.invoice_no && <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-muted-foreground font-normal">Inv: {p.invoice_no}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        <span className="font-medium text-slate-600 dark:text-slate-400">{p.suppliers?.name || 'Walk-in Supplier'}</span>
                        <span>•</span>
                        <span>{p.purchase_date}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="font-black text-primary text-base">₹{Number(p.total_amount).toFixed(2)}</span>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0"><Eye className="w-4 h-4 text-slate-400 group-hover:text-primary" /></Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="outstanding" className="mt-4">
            <Card className="border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm bg-white dark:bg-slate-950 overflow-hidden">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/10 py-3.5 px-5">
                <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">Party-wise Outstanding Balances</CardTitle>
              </CardHeader>
              <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-800/80">
                {balancesLoading && (
                  <div className="flex justify-center items-center py-12 text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span>Calculating balances…</span>
                  </div>
                )}
                {!balancesLoading && supplierBalances.length === 0 && (
                  <p className="text-slate-400 text-center py-12 text-sm">No suppliers registered</p>
                )}
                {!balancesLoading && supplierBalances.map(sup => (
                  <div 
                    key={sup.id} 
                    className="flex flex-col sm:flex-row sm:items-center justify-between py-4.5 px-5 gap-3 hover:bg-slate-50/20 dark:hover:bg-slate-900/10 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-800 dark:text-slate-200">{sup.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                        {sup.phone && <p>📞 {sup.phone}</p>}
                        {sup.gstin && <p>🧾 GSTIN: {sup.gstin}</p>}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between sm:justify-end gap-5 flex-wrap">
                      <div className="text-left sm:text-right text-xs">
                        <p className="text-muted-foreground">Total Invoiced: <span className="font-semibold text-slate-700 dark:text-slate-300">₹{sup.invoiced.toFixed(0)}</span></p>
                        <p className="text-muted-foreground mt-0.5">Total Paid: <span className="font-semibold text-emerald-600 dark:text-emerald-400">₹{sup.paid.toFixed(0)}</span></p>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Outstanding Balance</p>
                        <p className={`text-base font-black mt-0.5 ${sup.outstanding > 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                          ₹{sup.outstanding.toFixed(2)}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => downloadSupplierStatement(sup)}
                          className="h-8 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                          Statement
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* New Purchase Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-2xl">
          <DialogHeader className="border-b pb-3 mb-4">
            <DialogTitle className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4 text-primary" />
              New Purchase Transaction
            </DialogTitle>
          </DialogHeader>

          <div className="grid sm:grid-cols-3 gap-4 bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-200/50 dark:border-slate-800 shadow-sm">
            <div>
              <Label className="text-xs font-semibold">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Invoice No</Label>
              <Input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="e.g. INV-123" className="h-9 mt-1 text-xs bg-white dark:bg-slate-800" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Date</Label>
              <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} className="h-9 mt-1 text-xs bg-white dark:bg-slate-800" />
            </div>
          </div>

          <div className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Purchase Line Items</h4>
              <Button size="sm" variant="outline" onClick={addLine} className="h-8 text-xs font-semibold"><Plus className="w-3.5 h-3.5 mr-1" /> Add line</Button>
            </div>

            {lines.map((l, idx) => (
              <Card key={idx} className="p-4 space-y-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl relative">
                <div className="flex justify-between items-center border-b pb-2 mb-2">
                  <h5 className="text-xs font-bold text-primary">Line {idx + 1} Details</h5>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-rose-500" onClick={() => removeLine(idx)}><X className="w-4 h-4" /></Button>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="relative col-span-2">
                    <Label className="text-xs font-semibold">Item name *</Label>
                    <Input 
                      value={l.item_name} 
                      placeholder="Type or select existing item..."
                      onChange={e => {
                        const val = e.target.value;
                        const matched = items.find(it => (it.name || '').toLowerCase() === val.toLowerCase());
                        if (matched) {
                          const updatedDists = l.distributions.map(d => {
                            const branchMatch = items.find(it => it.branch_id === d.branch_id && (it.name || '').toLowerCase() === val.toLowerCase());
                            return branchMatch ? { ...d, item_id: branchMatch.id } : d;
                          });
                          updateLine(idx, {
                            item_name: val,
                            unit: matched.unit || '',
                            distributions: updatedDists
                          });
                        } else {
                          updateLine(idx, { item_name: val });
                        }
                      }}
                      onFocus={() => setFocusedLineIdx(idx)}
                      onBlur={() => setTimeout(() => setFocusedLineIdx(null), 250)}
                      className="h-9 mt-1 text-xs bg-white dark:bg-slate-800"
                    />
                    {focusedLineIdx === idx && (
                      <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl divide-y divide-slate-50 dark:divide-slate-900">
                        {Array.from(new Set(items.map(i => i.name)))
                          .filter(name => name.toLowerCase().includes((l.item_name || '').toLowerCase()))
                          .sort()
                          .map(name => {
                            const matched = items.find(i => i.name === name);
                            return (
                              <button
                                key={name}
                                type="button"
                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors font-medium text-slate-700 dark:text-slate-300"
                                onMouseDown={() => {
                                  const updatedDists = l.distributions.map(d => {
                                    const branchMatch = items.find(it => it.branch_id === d.branch_id && it.name.toLowerCase() === name.toLowerCase());
                                    return branchMatch ? { ...d, item_id: branchMatch.id } : d;
                                  });
                                  updateLine(idx, {
                                    item_name: name,
                                    unit: matched?.unit || '',
                                    distributions: updatedDists
                                  });
                                }}
                              >
                                📦 {name} {matched?.unit ? `(${matched.unit})` : ''}
                              </button>
                            );
                          })}
                        {l.item_name.trim() && !Array.from(new Set(items.map(i => i.name))).some(name => name.toLowerCase() === l.item_name.toLowerCase()) && (
                          <div className="px-3 py-2 text-[10px] text-muted-foreground bg-slate-50 dark:bg-slate-900/50">
                            ✨ You are purchasing a new item name not in catalog.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Unit</Label>
                    <Input value={l.unit} onChange={e => updateLine(idx, { unit: e.target.value })} placeholder="e.g. pc, kg" className="h-9 mt-1 text-xs bg-white dark:bg-slate-800" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Qty *</Label>
                    <Input type="number" value={l.quantity || ''} onChange={e => updateLine(idx, { quantity: +e.target.value })} placeholder="0" className="h-9 mt-1 text-xs bg-white dark:bg-slate-800" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Rate (Cost Price)</Label>
                    <Input type="number" value={l.rate || ''} onChange={e => updateLine(idx, { rate: +e.target.value })} placeholder="₹ 0.00" className="h-9 mt-1 text-xs bg-white dark:bg-slate-800" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Batch No</Label>
                    <Input value={l.batch_no} onChange={e => updateLine(idx, { batch_no: e.target.value })} placeholder="e.g. BAT-01" className="h-9 mt-1 text-xs bg-white dark:bg-slate-800" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Mfg Date (opt)</Label>
                    <Input type="date" value={l.mfg_date} onChange={e => updateLine(idx, { mfg_date: e.target.value })} className="h-9 mt-1 text-xs bg-white dark:bg-slate-800" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Expiry (opt)</Label>
                    <Input type="date" value={l.expiry_date} onChange={e => updateLine(idx, { expiry_date: e.target.value })} className="h-9 mt-1 text-xs bg-white dark:bg-slate-800" />
                  </div>
                  <div className="flex items-end justify-end">
                    <div className="text-right pb-1">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">Line Cost</p>
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-200">₹{(l.quantity * l.rate || 0).toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3 mt-1">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 text-muted-foreground" />
                      Branch Stock Distribution (Sum must = {l.quantity || 0})
                    </Label>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] font-bold text-primary hover:bg-primary/5 px-2" onClick={() => distributeToAllBranches(idx)}>Split equally</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] font-bold text-slate-500 hover:bg-slate-100 px-2" onClick={() => addDist(idx)}><Plus className="w-3 h-3 mr-0.5" /> Add branch</Button>
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    {l.distributions.map((d, dIdx) => (
                      <div key={dIdx} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-4">
                          <Select value={d.branch_id} onValueChange={v => updateDist(idx, dIdx, { branch_id: v, item_id: '' })}>
                            <SelectTrigger className="h-8 text-xs bg-white dark:bg-slate-800"><SelectValue /></SelectTrigger>
                            <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-5">
                          <Select value={d.item_id} onValueChange={v => onPickItem(idx, d.branch_id, v)}>
                            <SelectTrigger className="h-8 text-xs bg-white dark:bg-slate-800"><SelectValue placeholder="Link to menu catalog" /></SelectTrigger>
                            <SelectContent>
                              {itemsForBranch(d.branch_id).map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2">
                          <Input className="h-8 text-xs bg-white dark:bg-slate-800" type="number" placeholder="Qty" value={d.quantity || ''} onChange={e => updateDist(idx, dIdx, { quantity: +e.target.value })} />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-rose-500" onClick={() => removeDist(idx, dIdx)}><X className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {l.distributions.some(d => !d.item_id) && (
                    <p className="text-[10px] text-amber-500 font-medium mt-1">⚠️ Warning: Unlinked branch allocations will record purchasing cost but will NOT increment stock levels.</p>
                  )}
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-4">
            <Label className="text-xs font-semibold">Notes / Purchase Remarks</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Received goods in good condition. Payment pending." rows={2} className="mt-1 text-xs bg-white dark:bg-slate-800" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4 bg-slate-100 dark:bg-slate-950 p-4 rounded-xl border border-slate-200/50 dark:border-slate-800/80 mt-4">
            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Initial Payment Recorded</Label>
              <Input 
                type="number" 
                value={paidAmount || ''} 
                onChange={e => setPaidAmount(+e.target.value)} 
                placeholder="₹ 0.00 (leave 0 if credit)" 
                className="h-9 mt-1 text-xs bg-white dark:bg-slate-800" 
              />
            </div>
            {paidAmount > 0 && (
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Payment Mode</Label>
                <Select value={initialPaymentMode} onValueChange={setInitialPaymentMode}>
                  <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="net_banking">Net Banking</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter className="flex-row justify-between items-center border-t pt-4 mt-5">
            <div className="text-left">
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Purchase Grand Total</p>
              <p className="font-black text-lg text-primary">₹{totalAmount.toFixed(2)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="h-9 font-semibold" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} className="h-9 font-semibold" disabled={saving}>{saving ? 'Saving…' : 'Save Purchase'}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detailed Purchase view Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-2xl">
          {selectedPurchase && (
            <>
              <DialogHeader className="border-b pb-3 mb-4">
                <DialogTitle className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5">
                    <ShoppingBag className="w-4 h-4 text-primary" />
                    Transaction: {selectedPurchase.purchase_no}
                  </div>
                  <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-muted-foreground uppercase font-medium">
                    {selectedPurchase.invoice_no ? `Invoice: ${selectedPurchase.invoice_no}` : 'No Invoice Ref'}
                  </span>
                </DialogTitle>
              </DialogHeader>

              <div className="grid sm:grid-cols-2 gap-4">
                {/* Info Card */}
                <div className="bg-white dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200/50 dark:border-slate-800/80 shadow-sm text-xs space-y-2">
                  <h4 className="font-bold text-primary uppercase tracking-wider text-[10px]">Purchase details</h4>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="text-muted-foreground">Date:</span>
                    <span className="col-span-2 font-medium">{selectedPurchase.purchase_date}</span>
                    <span className="text-muted-foreground">Notes:</span>
                    <span className="col-span-2 font-medium italic text-slate-600 dark:text-slate-400">{selectedPurchase.notes || '—'}</span>
                  </div>
                </div>

                {/* Supplier Card */}
                <div className="bg-white dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200/50 dark:border-slate-800/80 shadow-sm text-xs space-y-2">
                  <h4 className="font-bold text-primary uppercase tracking-wider text-[10px]">Supplier details</h4>
                  {selectedPurchase.suppliers ? (
                    <div className="grid grid-cols-3 gap-1">
                      <span className="text-muted-foreground">Name:</span>
                      <span className="col-span-2 font-bold">{selectedPurchase.suppliers.name}</span>
                      <span className="text-muted-foreground">Phone:</span>
                      <span className="col-span-2 font-medium">{selectedPurchase.suppliers.phone || '—'}</span>
                      <span className="text-muted-foreground">GSTIN:</span>
                      <span className="col-span-2 font-medium">{selectedPurchase.suppliers.gstin || '—'}</span>
                      <span className="text-muted-foreground">Address:</span>
                      <span className="col-span-2 font-medium">{selectedPurchase.suppliers.address || '—'}</span>
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic">Walk-in Supplier (Unlinked)</p>
                  )}
                </div>
              </div>

              {/* Items List Table */}
              <div className="mt-4 bg-white dark:bg-slate-950 border border-slate-200/50 dark:border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 text-muted-foreground uppercase font-bold text-[9px] border-b">
                      <th className="p-3">Item Description</th>
                      <th className="p-3 text-right">Quantity</th>
                      <th className="p-3 text-right">Cost Rate</th>
                      <th className="p-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {selectedPurchase.purchase_items?.map((item: any, idx: number) => (
                      <React.Fragment key={idx}>
                        <tr className="font-medium">
                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                            {item.item_name} {item.unit ? `(${item.unit})` : ''}
                            <div className="text-[10px] text-muted-foreground font-normal mt-0.5 space-x-2">
                              {item.batch_no && <span>Batch: {item.batch_no}</span>}
                              {item.mfg_date && <span>Mfg: {item.mfg_date}</span>}
                              {item.expiry_date && <span>Expiry: {item.expiry_date}</span>}
                            </div>
                          </td>
                          <td className="p-3 text-right">{item.quantity}</td>
                          <td className="p-3 text-right">₹{Number(item.rate).toFixed(2)}</td>
                          <td className="p-3 text-right font-bold text-slate-900 dark:text-slate-100">₹{Number(item.total).toFixed(2)}</td>
                        </tr>
                        {/* Show Distributions split details */}
                        {item.purchase_distributions?.length > 0 && (
                          <tr className="bg-slate-50/50 dark:bg-slate-900/10 text-[10px] text-muted-foreground">
                            <td colSpan={4} className="px-5 py-1.5">
                              <span className="font-bold uppercase tracking-wider text-[9px]">Allocated to:</span>{' '}
                              {item.purchase_distributions.map((d: any, dIdx: number) => {
                                const branch = branches.find(b => b.id === d.branch_id);
                                return (
                                  <span key={dIdx} className="mr-3 inline-flex items-center bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                                    🏛️ {branch?.name || 'Branch'}: {d.quantity} {item.unit || 'units'}
                                  </span>
                                );
                              })}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Payments ledger card */}
              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                {/* Payments History */}
                <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-200/50 dark:border-slate-800/80 shadow-sm text-xs space-y-3">
                  <h4 className="font-bold text-primary uppercase tracking-wider text-[10px]">Payment History</h4>
                  {paymentsLoading && (
                    <div className="flex items-center text-slate-400 py-3">
                      <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                      <span>Loading payments…</span>
                    </div>
                  )}
                  {!paymentsLoading && payments.length === 0 && (
                    <p className="text-slate-400 italic py-2">No payments recorded against invoice. Outstanding credit.</p>
                  )}
                  {!paymentsLoading && payments.length > 0 && (
                    <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                      {payments.map(pay => (
                        <div key={pay.id} className="flex items-center justify-between border-b pb-1.5 last:border-0 last:pb-0">
                          <div>
                            <p className="font-semibold text-slate-800 dark:text-slate-200">₹{Number(pay.amount).toFixed(2)}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{pay.payment_date} · {pay.payment_mode.toUpperCase()}</p>
                          </div>
                          {pay.reference_no && <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-muted-foreground px-1.5 py-0.5 rounded">Ref: {pay.reference_no}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Calculations & Action */}
                <div className="bg-slate-100 dark:bg-slate-950/40 p-4 rounded-xl border border-slate-200/50 dark:border-slate-800/80 shadow-sm text-xs space-y-4 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                      <span>Invoice Total:</span>
                      <span className="font-semibold">₹{Number(selectedPurchase.total_amount || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                      <span>Total Paid:</span>
                      <span className="font-semibold">₹{payments.reduce((sum, p) => sum + Number(p.amount), 0).toFixed(2)}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between items-center font-bold text-sm text-slate-800 dark:text-slate-100">
                      <span>Balance Outstanding:</span>
                      <span className={Number(selectedPurchase.total_amount || 0) - payments.reduce((sum, p) => sum + Number(p.amount), 0) > 0 ? 'text-rose-500 font-extrabold' : 'text-slate-500'}>
                        ₹{(Number(selectedPurchase.total_amount || 0) - payments.reduce((sum, p) => sum + Number(p.amount), 0)).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {Number(selectedPurchase.total_amount || 0) - payments.reduce((sum, p) => sum + Number(p.amount), 0) > 0.01 && (
                    <Button onClick={openRecordPayment} className="w-full h-8.5 font-bold mt-2"><DollarSign className="w-4 h-4 mr-1" /> Record payment</Button>
                  )}
                </div>
              </div>

              <DialogFooter className="border-t pt-4 mt-5 sm:justify-between items-center w-full">
                <div className="flex gap-2 w-full sm:w-auto mb-3 sm:mb-0">
                  <Button variant="outline" className="h-9 font-semibold text-primary border-primary/20 hover:bg-primary/5 flex-1 sm:flex-none" onClick={() => generatePO(selectedPurchase)}>
                    <FileText className="w-4 h-4 mr-1.5" /> PO PDF
                  </Button>
                  <Button variant="outline" className="h-9 font-semibold text-emerald-600 border-emerald-200 hover:bg-emerald-50 flex-1 sm:flex-none" onClick={() => sendWhatsApp(selectedPurchase)}>
                    <Send className="w-4 h-4 mr-1.5" /> WhatsApp
                  </Button>
                </div>
                <Button variant="outline" className="h-9 font-semibold w-full sm:w-auto" onClick={() => setDetailsOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-2xl">
          <DialogHeader className="border-b pb-3 mb-4">
            <DialogTitle className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-500" />
              Record Supplier Payment
            </DialogTitle>
          </DialogHeader>

          {selectedPurchase && (
            <div className="space-y-4">
              <div className="bg-slate-100 dark:bg-slate-950 p-3 rounded-lg border text-xs">
                <p className="text-muted-foreground">Paying against Purchase Invoice:</p>
                <p className="font-bold text-slate-800 dark:text-slate-200 text-sm mt-0.5">{selectedPurchase.purchase_no} ({selectedPurchase.suppliers?.name || 'Walk-in Vendor'})</p>
                <p className="text-rose-500 font-extrabold mt-1">Outstanding Balance: ₹{(Number(selectedPurchase.total_amount || 0) - payments.reduce((sum, p) => sum + Number(p.amount), 0)).toFixed(2)}</p>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-semibold">Payment Date</Label>
                  <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="h-9 mt-1 text-xs bg-white dark:bg-slate-800" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Amount to Pay (INR) *</Label>
                  <Input type="number" value={payAmount || ''} onChange={e => setPayAmount(+e.target.value)} placeholder="0.00" className="h-9 mt-1 text-xs bg-white dark:bg-slate-800" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Payment Mode</Label>
                  <Select value={payMode} onValueChange={setPayMode}>
                    <SelectTrigger className="h-9 mt-1 text-xs bg-white dark:bg-slate-800"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="net_banking">Net Banking</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Reference / Transaction No</Label>
                  <Input value={payRefNo} onChange={e => setPayRefNo(e.target.value)} placeholder="e.g. Upi reference, check no" className="h-9 mt-1 text-xs bg-white dark:bg-slate-800" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Notes</Label>
                  <Textarea value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Enter details..." rows={2} className="mt-1 text-xs bg-white dark:bg-slate-800" />
                </div>
              </div>

              <DialogFooter className="border-t pt-4 mt-4 flex gap-2">
                <Button variant="outline" className="h-9 font-semibold text-xs" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSavePayment} className="h-9 font-semibold text-xs" disabled={paySaving}>{paySaving ? 'Recording…' : 'Record Payment'}</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Purchases;
