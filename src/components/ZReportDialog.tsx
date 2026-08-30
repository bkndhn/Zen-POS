import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { format } from 'date-fns';
import { Printer, X, History, Download } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { checkSupabaseResult } from '@/utils/monitoring';
import { ShiftReconciliationHistory } from '@/components/ShiftReconciliationHistory';
import { generateZReportPdf } from '@/utils/zReportPdf';


interface ZReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ZReportDialog: React.FC<ZReportDialogProps> = ({ open, onOpenChange }) => {
  const { profile } = useAuth();
  const { operatingBranchId } = useBranch();
  const [loading, setLoading] = useState(false);
  const [actualClosingCash, setActualClosingCash] = useState<string>("");
  const [adjustments, setAdjustments] = useState<string>("");
  const [reconNotes, setReconNotes] = useState<string>("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isClosingShift, setIsClosingShift] = useState(false);

  const [reportData, setReportData] = useState<{
    date: string;
    totalAmount: number;
    paymentTotals: Record<string, number>;
    totalBills: number;
    branchName: string;
    shift?: any;
  } | null>(null);

  useEffect(() => {
    if (open && profile) {
      generateReport();
    }
  }, [open, profile, operatingBranchId]);

  const generateReport = async () => {
    setLoading(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const branchId = operatingBranchId || profile?.id;
      const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;
      
      // Fetch dynamic payment methods
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('payment_type, branch_id')
        .eq('admin_id', adminId)
        .eq('is_disabled', false);
        
      // Filter for this branch or global (branch_id is null)
      const validPayments = paymentsData?.filter(p => !p.branch_id || p.branch_id === branchId) || [];
      
      
      // Fetch open shift
      const { data: shiftData } = await supabase
        .from('shifts')
        .select('*')
        .eq('admin_id', adminId)
        .eq('branch_id', branchId)
        .eq('status', 'open')
        .maybeSingle();

      let query = supabase
        .from('bills')
        .select('total_amount, payment_mode')
        .eq('branch_id', branchId)
        .eq('is_deleted', false);
        
      if (shiftData) {
        query = query.gte('created_at', shiftData.opened_at);
      } else {
        query = query.eq('date', today);
      }

      const { data, error } = await query;


      if (error) throw error;

      let paymentTotals: Record<string, number> = {};
      
      // Initialize with configured active payment methods
      if (validPayments.length > 0) {
        validPayments.forEach(p => {
          if (p.payment_type) paymentTotals[p.payment_type.toLowerCase()] = 0;
        });
      } else {
        paymentTotals = { 'cash': 0, 'upi': 0, 'card': 0 };
      }

      let total = 0;

      data?.forEach((bill) => {
        total += bill.total_amount || 0;
        const mode = (bill.payment_mode || 'unknown').toLowerCase();
        paymentTotals[mode] = (paymentTotals[mode] || 0) + (bill.total_amount || 0);
      });

      // Get branch name if available
      let bName = 'Main Branch';
      if (operatingBranchId) {
         const { data: bData } = await supabase.from('branches').select('name').eq('id', operatingBranchId).maybeSingle();
         if (bData) bName = bData.name;
      }

      setReportData({
        date: format(new Date(), 'dd-MM-yyyy hh:mm a'),
        totalAmount: total,
        paymentTotals,
        totalBills: data?.length || 0,
        branchName: bName,
        shift: shiftData
      });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!reportData) return;
    setLoading(true);
    try {
      const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;
      const branchId = operatingBranchId || profile?.id;
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: historyData } = await supabase
        .from('shift_reconciliations')
        .select('*')
        .eq('admin_id', adminId)
        .eq('branch_id', branchId)
        .gte('opened_at', thirtyDaysAgo.toISOString())
        .order('opened_at', { ascending: false });

      const pdfData = {
        branchName: reportData.branchName,
        date: reportData.date,
        totalSales: reportData.totalAmount,
        totalBills: reportData.totalBills,
        paymentTotals: reportData.paymentTotals,
        openingCash: reportData.shift ? Number(reportData.shift.opening_cash) : undefined,
      };
      
      const doc = generateZReportPdf(pdfData, historyData || []);
      doc.save(`Z-Report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`);
      toast({ title: 'Success', description: 'PDF generated successfully.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!reportData) return;

    if (reportData.shift) {
      if (!actualClosingCash || isNaN(Number(actualClosingCash))) {
        toast({ title: 'Validation Error', description: 'Please enter the actual closing cash in drawer.', variant: 'destructive' });
        return;
      }
      setIsClosingShift(true);
      try {
        const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;
        const branchId = operatingBranchId || profile?.id;
        const openingCash = Number(reportData.shift.opening_cash) || 0;
        const cashSales = reportData.paymentTotals['cash'] || 0;
        const adjustmentValue = Number(adjustments) || 0;
        const expectedCash = openingCash + cashSales + adjustmentValue;
        const actualCash = Number(actualClosingCash);

        await supabase.from('shifts').update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          actual_closing_cash: actualCash,
          expected_closing_cash: expectedCash
        }).eq('id', reportData.shift.id);

        // Traceable reconciliation record
        const reconResult = await supabase.from('shift_reconciliations').insert({
          admin_id: adminId,
          branch_id: branchId,
          shift_id: reportData.shift.id,
          closed_by: profile?.id ?? null,
          opened_at: reportData.shift.opened_at,
          closed_at: new Date().toISOString(),
          opening_cash: openingCash,
          cash_sales: cashSales,
          adjustments: adjustmentValue,
          expected_cash: expectedCash,
          actual_cash: actualCash,
          variance: Number((actualCash - expectedCash).toFixed(2)),
          total_sales: reportData.totalAmount,
          total_bills: reportData.totalBills,
          payment_breakdown: reportData.paymentTotals as any,
          notes: reconNotes || null,
        } as any);
        checkSupabaseResult('shift_reconciliations.insert', reconResult as any);

        toast({ title: 'Shift Closed', description: 'Shift closed and reconciliation recorded.' });
      } catch (err: any) {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
        setIsClosingShift(false);
        return;
      }
      setIsClosingShift(false);
    }


    
    // Generate dynamic payment rows for HTML print
    const paymentRowsHTML = Object.entries(reportData.paymentTotals)
      .filter(([_, amount]) => amount > 0 || Object.keys(reportData.paymentTotals).length <= 5) // Show 0 only if not too many modes
      .map(([mode, amount]) => `<div class="row"><span>${mode.toUpperCase()}</span><span>Rs ${amount.toFixed(2)}</span></div>`)
      .join('');
    
    // Fallback to standard browser print
    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(`
        <html>
          <head>
            <title>Z-Report</title>
            <style>
              body { font-family: monospace; padding: 20px; font-size: 14px; width: 300px; margin: 0 auto; }
              .center { text-align: center; }
              .row { display: flex; justify-content: space-between; margin-bottom: 5px; }
              .bold { font-weight: bold; }
              .line { border-bottom: 1px dashed #000; margin: 10px 0; }
              @media print {
                @page { margin: 0; }
                body { padding: 10px; width: 100%; }
              }
            </style>
          </head>
          <body>
            <div class="center bold" style="font-size: 18px;">Z - REPORT</div>
            <div class="center">${reportData.branchName}</div>
            <br />
            <div>Date/Time: ${reportData.date}</div>
            <div>Total Bills: ${reportData.totalBills}</div>
            <div class="line"></div>
            ${reportData.shift ? `<div class="row"><span>Opening Cash</span><span>Rs ${Number(reportData.shift.opening_cash).toFixed(2)}</span></div>` : ''}
            <div class="row bold"><span>Total Sales</span><span>Rs ${reportData.totalAmount.toFixed(2)}</span></div>
            ${paymentRowsHTML}
            <div class="line"></div>
            <div class="center">END OF REPORT</div>
          </body>
        </html>
      `);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => {
        printWin.print();
        printWin.close();
      }, 250);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Z-Report (End of Day)</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Generating report...</div>
        ) : reportData ? (
          <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-lg font-mono text-sm space-y-2">
            <div className="text-center font-bold text-lg mb-2">Z-REPORT</div>
            <div className="text-center mb-4">{reportData.branchName}</div>
            
            <div className="flex justify-between">
              <span>Date/Time:</span>
              <span>{reportData.date}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Bills:</span>
              <span>{reportData.totalBills}</span>
            </div>
            
            <div className="border-t border-dashed border-zinc-300 dark:border-zinc-700 my-2 pt-2"></div>
            
            
            {reportData.shift && (
              <div className="flex justify-between text-muted-foreground mt-2 mb-2 pb-2 border-b border-dashed border-zinc-300 dark:border-zinc-700">
                <span>Opening Cash:</span>
                <span>₹{Number(reportData.shift.opening_cash).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base">
              <span>Total Sales:</span>

              <span>₹{reportData.totalAmount.toFixed(2)}</span>
            </div>
            
            {Object.entries(reportData.paymentTotals).map(([mode, amount]) => (
              <div key={mode} className="flex justify-between text-muted-foreground mt-1">
                <span className="uppercase">{mode}:</span>
                <span>₹{amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">No data found for today.</div>
        )}

        
        {reportData && reportData.shift && (
          <div className="px-4 pb-4 space-y-2">
            <Label className="text-xs text-muted-foreground uppercase">Close Shift: Actual Cash in Drawer</Label>
            <Input 
              type="number" 
              placeholder="0.00" 
              value={actualClosingCash} 
              onChange={(e) => setActualClosingCash(e.target.value)} 
            />
            <div className="text-[10px] text-muted-foreground">
              Expected Cash: ₹{(Number(reportData.shift.opening_cash) + (reportData.paymentTotals['cash'] || 0)).toFixed(2)}
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setHistoryOpen(true)}>
            <History className="w-4 h-4 mr-2" /> History
          </Button>
          <Button variant="outline" onClick={handleDownloadPdf} disabled={loading || !reportData}>
            <Download className="w-4 h-4 mr-2" /> Download PDF
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-2" /> Cancel
          </Button>
          <Button onClick={handlePrint} disabled={loading || isClosingShift || !reportData || reportData.totalBills === 0}>
            {isClosingShift ? "Closing Shift..." : "Close Shift & Print"}
          </Button>
        </DialogFooter>

        <ShiftReconciliationHistory open={historyOpen} onOpenChange={setHistoryOpen} />
      </DialogContent>
    </Dialog>
  );
};
