import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ChefHat, Bell, Clock } from 'lucide-react';
import { formatTimeAMPM, getTimeElapsed } from '@/utils/timeUtils';
import { cn } from '@/lib/utils';

// Types
interface DisplayBill {
    id: string;
    bill_no: string;
    created_at: string;
    kitchen_status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'rejected';
    service_status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'rejected';
}

/**
 * Customer Display Board
 * Public-facing display for TVs/tablets showing order status
 * No authentication required
 */
const CustomerDisplay = () => {
    const [bills, setBills] = useState<DisplayBill[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Extract admin and branch from URL
    const searchParams = new URLSearchParams(window.location.search);
    const urlAdminId = searchParams.get('admin');
    const urlBranchId = searchParams.get('branch');

    useEffect(() => {
        if (!urlAdminId) {
            setErrorMsg("Invalid Display Configuration. Missing Admin ID.");
            setLoading(false);
        }
    }, [urlAdminId]);

    // Update time every second
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    // Fetch bills
    const fetchBills = useCallback(async () => {
        try {
            const now = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            // Build query - cast to any to avoid type inference issues with custom columns
            let query = (supabase as any)
                .from('bills')
                .select('id, bill_no, created_at, kitchen_status, service_status')
                .eq('date', today)
                .eq('admin_id', urlAdminId)
                .or('is_deleted.is.null,is_deleted.eq.false')
                .in('kitchen_status', ['preparing', 'ready'])
                .neq('service_status', 'completed')
                .neq('service_status', 'rejected');

            if (urlBranchId) {
                query = query.eq('branch_id', urlBranchId);
            }

            query = query.order('created_at', { ascending: true });

            const result = await query;
            const data = result.data as DisplayBill[] | null;
            const error = result.error;

            if (error) throw error;

            console.log(`Customer Display: Fetched ${data?.length || 0} bills for ${today}`);
            setBills(data || []);
        } catch (error) {
            console.error('Error fetching display bills:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial fetch
    useEffect(() => {
        if (!urlAdminId) return;
        fetchBills();

        // Polling fallback every 30 seconds
        const pollInterval = setInterval(() => {
            console.log('Customer Display: Polling for updates...');
            fetchBills();
        }, 30000);

        return () => clearInterval(pollInterval);
    }, [fetchBills, urlAdminId]);

    // Realtime subscription
    useEffect(() => {
        if (!urlAdminId) return;
        console.log('Customer Display: Setting up realtime subscription...');
        
        let filterString = `admin_id=eq.${urlAdminId}`;
        if (urlBranchId) {
            filterString += ` AND branch_id=eq.${urlBranchId}`;
        }

        const channel = supabase
            .channel(`customer-display-changes-${urlAdminId}-${urlBranchId || 'all'}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'bills',
                    filter: filterString,
                },
                (payload) => {
                    console.log('Customer Display: Realtime change detected!', payload);
                    fetchBills();
                }
            )
            .subscribe((status) => {
                console.log('Customer Display: Subscription status:', status);
            });

        return () => {
            console.log('Customer Display: Cleaning up subscription');
            supabase.removeChannel(channel);
        };
    }, [fetchBills, urlAdminId, urlBranchId]);

    // Separate bills by status
    const readyBills = bills.filter(b => b.kitchen_status === 'ready');
    const preparingBills = bills.filter(b => b.kitchen_status === 'preparing');

    if (errorMsg) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-8 text-center">
                <div className="bg-white/5 border border-white/10 p-8 rounded-2xl max-w-md">
                    <h2 className="text-2xl font-bold text-red-400 mb-4">Display Configuration Error</h2>
                    <p className="text-white/60">{errorMsg}</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-white" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white overflow-hidden">
            {/* Header */}
            <div className="bg-black/30 backdrop-blur-sm border-b border-white/10 px-8 py-4">
                <div className="flex items-center justify-between max-w-7xl mx-auto">
                    <div className="flex items-center gap-4">
                        <ChefHat className="w-10 h-10 text-orange-400" />
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Order Status</h1>
                            <p className="text-white/60 text-sm">Live updates • No refresh needed</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-4xl font-bold font-mono">
                            {formatTimeAMPM(currentTime)}
                        </div>
                        <div className="text-white/60 text-sm">
                            {currentTime.toLocaleDateString('en-IN', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'short'
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="p-8 max-w-7xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* NOW SERVING Section */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50" />
                            <h2 className="text-3xl font-bold text-green-400">NOW SERVING</h2>
                            {readyBills.length > 0 && (
                                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-lg px-3 py-1">
                                    {readyBills.length}
                                </Badge>
                            )}
                        </div>

                        {readyBills.length === 0 ? (
                            <div className="bg-white/5 rounded-2xl p-12 text-center border border-white/10">
                                <Bell className="w-16 h-16 mx-auto mb-4 text-white/20" />
                                <p className="text-white/40 text-xl">No orders ready</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {readyBills.map((bill, index) => (
                                    <div
                                        key={bill.id}
                                        className={cn(
                                            "bg-gradient-to-br from-green-500/20 to-green-600/10",
                                            "border-2 border-green-500/50 rounded-2xl p-6 text-center",
                                            "shadow-lg shadow-green-500/20",
                                            "animate-pulse",
                                            index === 0 && "ring-4 ring-green-400 ring-offset-4 ring-offset-gray-900"
                                        )}
                                        style={{ animationDelay: `${index * 0.1}s` }}
                                    >
                                        <div className="text-6xl font-black text-green-400 mb-2">
                                            {bill.bill_no}
                                        </div>
                                        <div className="flex items-center justify-center gap-1 text-white/60 text-sm">
                                            <Bell className="w-4 h-4" />
                                            Ready
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* PREPARING Section */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-orange-500 animate-pulse shadow-lg shadow-orange-500/50" />
                            <h2 className="text-3xl font-bold text-orange-400">PREPARING</h2>
                            {preparingBills.length > 0 && (
                                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-lg px-3 py-1">
                                    {preparingBills.length}
                                </Badge>
                            )}
                        </div>

                        {preparingBills.length === 0 ? (
                            <div className="bg-white/5 rounded-2xl p-12 text-center border border-white/10">
                                <ChefHat className="w-16 h-16 mx-auto mb-4 text-white/20" />
                                <p className="text-white/40 text-xl">No orders in preparation</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {preparingBills.map((bill) => (
                                    <div
                                        key={bill.id}
                                        className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 border-2 border-orange-500/30 rounded-2xl p-6 text-center"
                                    >
                                        <div className="text-5xl font-black text-orange-400 mb-2">
                                            {bill.bill_no}
                                        </div>
                                        <div className="flex items-center justify-center gap-1 text-white/60 text-sm">
                                            <Clock className="w-4 h-4" />
                                            {getTimeElapsed(bill.created_at)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                </div>
            </div>

            {/* Footer */}
            <div className="fixed bottom-0 left-0 right-0 bg-black/30 backdrop-blur-sm border-t border-white/10 px-8 py-3">
                <div className="flex items-center justify-center gap-2 text-white/40 text-sm">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span>Live • Auto-refreshing</span>
                </div>
            </div>
        </div>
    );
};

export default CustomerDisplay;
