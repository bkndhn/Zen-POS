import React, { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { exportAllReportsToExcel } from '@/utils/exportUtils';
import { BillForExport, ItemForExport, PaymentForExport, ProfitLossForExport } from '@/utils/exportUtils';

export const AutoReporter = () => {
  useEffect(() => {
    const handleTrigger = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const { adminId, branchId } = customEvent.detail;
      if (!adminId) return;

      console.log('Generating auto report...');
      toast({
        title: "Auto Report Triggered",
        description: "Generating daily report...",
      });

      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        let query = supabase
          .from('bills')
          .select(`
            *,
            bill_items (*),
            table:tables(table_number)
          `)
          .eq('admin_id', adminId)
          .gte('created_at', today.toISOString())
          .lt('created_at', tomorrow.toISOString())
          .order('created_at', { ascending: false });

        if (branchId) {
          query = query.eq('branch_id', branchId);
        }

        const { data: bills, error } = await query;
        if (error) throw error;
        
        if (!bills || bills.length === 0) {
            toast({
                title: "Auto Report Generated",
                description: "No sales recorded today.",
            });
            return;
        }

        // Just use the existing export utility with the fetched bills
        const formattedBills: BillForExport[] = bills.map(b => ({
            id: b.id,
            bill_number: b.bill_number?.toString() || '',
            created_at: b.created_at,
            total_amount: b.total_amount,
            subtotal: b.subtotal || b.total_amount,
            tax_amount: b.tax_amount || 0,
            discount: b.discount || 0,
            discount_type: b.discount_type || 'flat',
            payment_method: b.payment_method || 'CASH',
            payment_details: b.payment_details || {},
            customer_name: b.customer_name || '',
            customer_mobile: b.customer_mobile || '',
            status: b.status,
            order_type: b.order_type || 'dine_in',
            table_no: (b.table as any)?.table_number || ''
        }));

        // For auto report, we'll just generate the Bills summary to avoid complex cross-queries
        await exportAllReportsToExcel({
            bills: formattedBills,
            items: [],
            payments: [],
            profitLoss: {
                totalSales: formattedBills.reduce((sum, b) => sum + b.total_amount, 0),
                totalExpenses: 0,
                totalTaxes: formattedBills.reduce((sum, b) => sum + b.tax_amount, 0),
                totalDiscounts: formattedBills.reduce((sum, b) => sum + b.discount, 0),
                netProfit: formattedBills.reduce((sum, b) => sum + b.total_amount, 0)
            },
            dateRange: `Auto_Daily_Report_${format(today, 'yyyy-MM-dd')}`
        });

        toast({
            title: "Auto Report Downloaded",
            description: "Your daily report has been saved.",
        });

      } catch (err: any) {
        console.error('Auto report failed:', err);
        toast({
            variant: "destructive",
            title: "Auto Report Failed",
            description: err.message || "Failed to generate report"
        });
      }
    };

    window.addEventListener('zenpos:trigger-auto-report', handleTrigger);
    return () => {
      window.removeEventListener('zenpos:trigger-auto-report', handleTrigger);
    };
  }, []);

  return null;
};
