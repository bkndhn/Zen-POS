import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { toLocalDateString } from '@/utils/timeUtils';

interface ExpiryAlert {
  id: string;
  item_name: string;
  batch_no: string;
  expiry_date: string;
  stock_quantity: number;
  status: 'expired' | 'critical' | 'warning';
  days_left: number;
}

export function ExpiryAlertsWidget() {
  const { adminProfileId } = useAuth();
  const { branchFilterId, operatingBranchId } = useBranchScopedQuery();
  const [alerts, setAlerts] = useState<ExpiryAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (adminProfileId) {
      fetchExpiryAlerts();
    }
  }, [adminProfileId, branchFilterId, operatingBranchId]);

  const fetchExpiryAlerts = async () => {
    try {
      setLoading(true);
      const today = new Date();
      const ninetyDaysFromNow = new Date();
      ninetyDaysFromNow.setDate(today.getDate() + 90);

      let query = supabase
        .from('item_batches')
        .select(`
          id,
          batch_no,
          expiry_date,
          stock_quantity,
          items!inner(name)
        `)
        .eq('admin_id', adminProfileId)
        .gt('stock_quantity', 0)
        .lte('expiry_date', toLocalDateString(ninetyDaysFromNow))
        .order('expiry_date', { ascending: true });

      if (branchFilterId) {
        query = query.eq('branch_id', branchFilterId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const mapped = (data || []).map((batch: any) => {
        const expDate = new Date(batch.expiry_date);
        const diffTime = expDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let status: 'expired' | 'critical' | 'warning' = 'warning';
        if (diffDays < 0) status = 'expired';
        else if (diffDays <= 30) status = 'critical';

        return {
          id: batch.id,
          item_name: batch.items?.name || 'Unknown Item',
          batch_no: batch.batch_no || 'N/A',
          expiry_date: batch.expiry_date,
          stock_quantity: batch.stock_quantity,
          status,
          days_left: diffDays
        };
      });

      setAlerts(mapped);
    } catch (err) {
      console.error('Error fetching expiry alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Card className="border-red-100 shadow-md animate-pulse h-[300px]" />;
  }

  if (alerts.length === 0) {
    return null; // Don't show widget if no alerts
  }

  const expired = alerts.filter(a => a.status === 'expired');
  const critical = alerts.filter(a => a.status === 'critical');
  const warning = alerts.filter(a => a.status === 'warning');

  return (
    <Card className="border-orange-200 shadow-md">
      <CardHeader className="p-4 bg-orange-50/50 border-b border-orange-100">
        <CardTitle className="text-lg flex items-center gap-2 text-orange-800">
          <AlertTriangle className="w-5 h-5 text-orange-600" /> 
          Inventory Expiry Alerts
        </CardTitle>
        <CardDescription>Items expiring within 90 days or already expired</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex gap-4 p-4 border-b border-gray-100 bg-white">
          <div className="flex flex-col flex-1 items-center justify-center p-3 rounded-lg bg-red-50 border border-red-100">
            <span className="text-2xl font-bold text-red-600">{expired.length}</span>
            <span className="text-xs font-semibold uppercase text-red-800">Expired</span>
          </div>
          <div className="flex flex-col flex-1 items-center justify-center p-3 rounded-lg bg-orange-50 border border-orange-100">
            <span className="text-2xl font-bold text-orange-600">{critical.length}</span>
            <span className="text-xs font-semibold uppercase text-orange-800">&lt; 30 Days</span>
          </div>
          <div className="flex flex-col flex-1 items-center justify-center p-3 rounded-lg bg-yellow-50 border border-yellow-100">
            <span className="text-2xl font-bold text-yellow-600">{warning.length}</span>
            <span className="text-xs font-semibold uppercase text-yellow-800">&lt; 90 Days</span>
          </div>
        </div>

        <div className="max-h-[300px] overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 shadow-sm">
              <tr>
                <th className="px-4 py-3">Item / Batch</th>
                <th className="px-4 py-3 text-center">Stock</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {alerts.map((alert) => (
                <tr key={alert.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{alert.item_name}</p>
                    <p className="text-xs text-gray-500">Batch: {alert.batch_no} • Exp: {new Date(alert.expiry_date).toLocaleDateString()}</p>
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-gray-700">
                    {alert.stock_quantity}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {alert.status === 'expired' && (
                      <Badge variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-200">
                        <AlertCircle className="w-3 h-3 mr-1" /> Expired
                      </Badge>
                    )}
                    {alert.status === 'critical' && (
                      <Badge variant="outline" className="border-orange-500 text-orange-700 bg-orange-50">
                        <Clock className="w-3 h-3 mr-1" /> {alert.days_left} Days
                      </Badge>
                    )}
                    {alert.status === 'warning' && (
                      <Badge variant="outline" className="border-yellow-500 text-yellow-700 bg-yellow-50">
                        {alert.days_left} Days
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
