import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { exportAllReportsToExcel } from '@/utils/exportUtils';

export const AutoReporter = () => {
  useEffect(() => {
    const handleTrigger = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const { adminId, branchId } = customEvent.detail || {};
      if (!adminId) return;

      toast({ title: 'Auto Report Triggered', description: 'Generating daily report...' });

      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        let query = supabase
          .from('bills')
          .select('*, bill_items(*)')
          .eq('admin_id', adminId)
          .gte('created_at', today.toISOString())
          .lt('created_at', tomorrow.toISOString())
          .order('created_at', { ascending: false });

        if (branchId) query = query.eq('branch_id', branchId);

        const { data: bills, error } = await query;
        if (error) throw error;

        if (!bills || bills.length === 0) {
          toast({ title: 'Auto Report Generated', description: 'No sales recorded today.' });
          return;
        }

        const formattedBills = bills.map((b: any) => ({
          bill_no: b.bill_no || '',
          date: format(new Date(b.created_at), 'yyyy-MM-dd'),
          time: format(new Date(b.created_at), 'HH:mm'),
          total_amount: Number(b.total_amount) || 0,
          discount: Number(b.discount) || 0,
          payment_mode: b.payment_mode || 'CASH',
          items_count: Array.isArray(b.bill_items) ? b.bill_items.length : 0,
        }));

        const totalSales = formattedBills.reduce((s, b) => s + b.total_amount, 0);
        await exportAllReportsToExcel({
          bills: formattedBills,
          items: [],
          payments: [],
          profitLoss: {
            totalSales,
            totalCOGS: 0,
            grossProfit: totalSales,
            totalExpenses: 0,
            netProfit: totalSales,
            totalPurchases: 0,
            netCashFlow: totalSales,
          },
          dateRange: `Auto_Daily_Report_${format(today, 'yyyy-MM-dd')}`,
        });

        toast({ title: 'Auto Report Downloaded', description: 'Your daily report has been saved.' });
      } catch (err: any) {
        console.error('Auto report failed:', err);
        toast({ variant: 'destructive', title: 'Auto Report Failed', description: err.message || 'Failed to generate report' });
      }
    };

    window.addEventListener('zenpos:trigger-auto-report', handleTrigger);
    return () => window.removeEventListener('zenpos:trigger-auto-report', handleTrigger);
  }, []);

  return null;
};
