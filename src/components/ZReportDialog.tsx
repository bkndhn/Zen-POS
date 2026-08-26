import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { Printer, X } from 'lucide-react';
import { usePrinter } from '@/hooks/usePrinter';
import { toast } from '@/hooks/use-toast';

interface ZReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ZReportDialog: React.FC<ZReportDialogProps> = ({ open, onOpenChange }) => {
  const { profile } = useAuth();
  const { printers, activePrinterId } = usePrinter();
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<{
    date: string;
    totalAmount: number;
    cashAmount: number;
    upiAmount: number;
    cardAmount: number;
    totalBills: number;
    branchName: string;
  } | null>(null);

  useEffect(() => {
    if (open && profile) {
      generateReport();
    }
  }, [open, profile]);

  const generateReport = async () => {
    setLoading(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const branchId = profile?.branch_id || profile?.id;
      
      const { data, error } = await supabase
        .from('bills')
        .select('total_amount, payment_mode')
        .eq('branch_id', branchId)
        .eq('date', today)
        .eq('is_deleted', false);

      if (error) throw error;

      let cash = 0;
      let upi = 0;
      let card = 0;
      let total = 0;

      data?.forEach((bill) => {
        total += bill.total_amount || 0;
        if (bill.payment_mode === 'cash') cash += bill.total_amount || 0;
        else if (bill.payment_mode === 'upi') upi += bill.total_amount || 0;
        else if (bill.payment_mode === 'card') card += bill.total_amount || 0;
      });

      // Get branch name if available
      let bName = 'Main Branch';
      if (profile?.branch_id) {
         const { data: bData } = await supabase.from('branches').select('name').eq('id', profile.branch_id).single();
         if (bData) bName = bData.name;
      }

      setReportData({
        date: format(new Date(), 'dd-MM-yyyy hh:mm a'),
        totalAmount: total,
        cashAmount: cash,
        upiAmount: upi,
        cardAmount: card,
        totalBills: data?.length || 0,
        branchName: bName
      });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!reportData) return;
    
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
            <div class="row bold"><span>Total Sales</span><span>Rs ${reportData.totalAmount.toFixed(2)}</span></div>
            <div class="row"><span>CASH</span><span>Rs ${reportData.cashAmount.toFixed(2)}</span></div>
            <div class="row"><span>UPI</span><span>Rs ${reportData.upiAmount.toFixed(2)}</span></div>
            <div class="row"><span>CARD</span><span>Rs ${reportData.cardAmount.toFixed(2)}</span></div>
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
            
            <div className="flex justify-between font-bold text-base">
              <span>Total Sales:</span>
              <span>₹{reportData.totalAmount.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between text-muted-foreground mt-2">
              <span>CASH:</span>
              <span>₹{reportData.cashAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>UPI:</span>
              <span>₹{reportData.upiAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>CARD:</span>
              <span>₹{reportData.cardAmount.toFixed(2)}</span>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">No data found for today.</div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-2" /> Cancel
          </Button>
          <Button onClick={handlePrint} disabled={loading || !reportData || reportData.totalBills === 0}>
            <Printer className="w-4 h-4 mr-2" /> Print Z-Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
