import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tv, Play, Pause, ChevronLeft, ChevronRight, Clock, ChefHat, CheckCircle } from 'lucide-react';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string | null;
  image_url: string | null;
  category: string | null;
  is_veg: boolean | null;
  spicy_level: string | null;
}

interface TVOrder {
  id: string;
  table_number: string;
  seat_id: string | null;
  order_number: string | null;
  status: 'pending' | 'preparing' | 'ready' | 'served';
}

export const MenuTV: React.FC = () => {
  const { adminId } = useParams<{ adminId: string }>();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<TVOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (adminId) {
      fetchMenu();
      fetchOrders();
      setupRealtime();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [adminId]);

  // Autoplay rotation every 8 seconds
  useEffect(() => {
    if (isPlaying && items.length > 0) {
      timerRef.current = setInterval(() => {
        setActiveIndex((prev) => (prev + 1) % Math.ceil(items.length / 4));
      }, 8000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, items]);

  const fetchMenu = async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('id, name, price, description, image_url, category')
        .eq('admin_id', adminId)
        .eq('is_active', true);
      
      if (!error && data) {
        setItems(data as unknown as MenuItem[]);
      }
    } catch (e) {
      console.warn('Error loading TV menu:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('table_orders')
        .select('id, table_number, seat_id, order_number, status')
        .eq('admin_id', adminId)
        .in('status', ['preparing', 'ready'])
        .eq('is_billed', false);
      
      if (!error && data) {
        setOrders(data as unknown as TVOrder[]);
      }
    } catch (e) {
      console.warn('Error loading TV orders:', e);
    }
  };

  const setupRealtime = () => {
    const channel = supabase.channel('menu-tv-order-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_orders' }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center">
        <Tv className="w-16 h-16 text-primary animate-pulse mb-4" />
        <h2 className="text-xl font-bold">Initializing Digital Signage TV...</h2>
        <p className="text-muted-foreground text-xs mt-1">Fetching live menu items & status board</p>
      </div>
    );
  }

  // Group items by pages of 4 for rotating grid
  const itemsPerPage = 4;
  const totalPages = Math.ceil(items.length / itemsPerPage);
  const displayedItems = items.slice(activeIndex * itemsPerPage, (activeIndex + 1) * itemsPerPage);

  const preparingOrders = orders.filter((o) => o.status === 'preparing');
  const readyOrders = orders.filter((o) => o.status === 'ready');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-zinc-900 to-slate-950 text-white flex flex-col h-screen overflow-hidden p-4 select-none">
      
      {/* Top Brand Header */}
      <header className="flex justify-between items-center bg-zinc-900/60 backdrop-blur border border-zinc-800 px-6 py-3.5 rounded-2xl mb-4 shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center border border-primary/30 shadow-md shadow-primary/10">
            <Tv className="w-6 h-6 text-primary animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight uppercase bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
              LIVE DIGITAL MENU
            </h1>
            <p className="text-[10px] text-muted-foreground font-semibold font-mono leading-none mt-0.5">ZENPOS DIGITAL SIGNAGE SYSTEM</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-zinc-800/80 px-2.5 py-1 rounded-lg border border-zinc-700/50 text-[10px] font-bold">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span className="font-mono text-zinc-300">
              {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800"
              onClick={() => setActiveIndex((prev) => (prev - 1 + totalPages) % totalPages)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800"
              onClick={() => setActiveIndex((prev) => (prev + 1) % totalPages)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Screen Layout - Split Menu (75%) & Token Board (25%) */}
      <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
        
        {/* Left Side: Dynamic Menu Grid */}
        <div className="flex-1 flex flex-col justify-between min-h-0 bg-zinc-900/20 border border-zinc-800/50 rounded-3xl p-4">
          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
              <Tv className="w-16 h-16 opacity-30 mb-2" />
              <p className="font-bold">No Menu Items Configured</p>
              <p className="text-xs">Add items in Item Management to display here.</p>
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
              {displayedItems.map((item) => (
                <Card 
                  key={item.id} 
                  className="bg-zinc-900/70 border border-zinc-800/80 overflow-hidden flex flex-col justify-between hover:border-zinc-700/80 transition-all rounded-2xl shadow-xl shadow-black/20"
                >
                  <CardContent className="p-3.5 flex gap-4 items-start h-full">
                    {/* Item Image */}
                    <div className="w-[110px] h-[110px] rounded-xl overflow-hidden shrink-0 bg-zinc-800 border border-zinc-700/50 flex items-center justify-center">
                      {item.image_url ? (
                        <img 
                          src={item.image_url} 
                          alt={item.name} 
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&q=80'; }}
                        />
                      ) : (
                        <Tv className="w-10 h-10 text-zinc-600" />
                      )}
                    </div>

                    {/* Item Details */}
                    <div className="flex-1 flex flex-col justify-between h-full min-w-0">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <h3 className="text-base font-black tracking-tight text-zinc-100 truncate max-w-[180px]">
                            {item.name}
                          </h3>
                          {item.is_veg !== null && (
                            <span className={`w-2.5 h-2.5 rounded-full ${item.is_veg ? 'bg-emerald-500 shadow-md shadow-emerald-500/20' : 'bg-rose-500 shadow-md shadow-rose-500/20'}`} title={item.is_veg ? 'Vegetarian' : 'Non-Vegetarian'} />
                          )}
                          {item.spicy_level && item.spicy_level !== 'none' && (
                            <Badge className="bg-red-500/10 text-red-500 text-[8px] font-bold border-red-500/20 h-4 px-1">
                              🌶️ {item.spicy_level}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-400 line-clamp-3 leading-relaxed">
                          {item.description || 'Delicately cooked with premium freshly sourced chef selection ingredients.'}
                        </p>
                      </div>

                      <div className="flex items-end justify-between border-t border-zinc-800/60 pt-2 mt-1">
                        <span className="text-[9px] uppercase tracking-wider font-bold text-primary font-mono">
                          {item.category || 'Specialty'}
                        </span>
                        <span className="text-xl font-black text-emerald-400 font-mono tracking-tight">
                          ₹{Math.round(item.price)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Carousel Dot Indicators */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-1.5 mt-3 shrink-0">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIndex(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === activeIndex ? 'w-6 bg-primary' : 'w-2 bg-zinc-700 hover:bg-zinc-600'}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Ready / Preparing Sidebar */}
        <div className="w-[300px] flex flex-col gap-4 shrink-0 min-h-0">
          
          {/* READY FOR PICKUP */}
          <div className="flex-1 flex flex-col bg-emerald-950/20 border border-emerald-900/35 rounded-3xl p-4 min-h-0 shadow-lg">
            <h2 className="text-sm font-black tracking-wide text-emerald-400 uppercase flex items-center gap-2 border-b border-emerald-900/30 pb-2 mb-3 shrink-0">
              <CheckCircle className="w-5 h-5 text-emerald-400 animate-bounce" />
              READY FOR PICKUP
            </h2>
            <div className="flex-1 overflow-y-auto pr-1 space-y-2">
              {readyOrders.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-zinc-600 font-medium">
                  No pending pickups
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {readyOrders.map((o) => (
                    <div 
                      key={o.id}
                      className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2.5 text-center flex flex-col items-center justify-center shadow-lg shadow-emerald-500/5 hover:border-emerald-500/40 transition-colors"
                    >
                      <span className="text-lg font-black text-emerald-300 font-mono">T{o.table_number}</span>
                      {o.seat_id && (
                        <span className="text-[9px] font-bold text-emerald-400 font-mono">Seat {o.seat_id}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* IN PREPARATION */}
          <div className="flex-1 flex flex-col bg-zinc-900/60 border border-zinc-800 rounded-3xl p-4 min-h-0 shadow-lg">
            <h2 className="text-sm font-black tracking-wide text-zinc-300 uppercase flex items-center gap-2 border-b border-zinc-800 pb-2 mb-3 shrink-0">
              <ChefHat className="w-5 h-5 text-primary animate-pulse" />
              IN PREPARATION
            </h2>
            <div className="flex-1 overflow-y-auto pr-1 space-y-2">
              {preparingOrders.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-zinc-600 font-medium">
                  No active preparations
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {preparingOrders.map((o) => (
                    <div 
                      key={o.id}
                      className="bg-zinc-800/80 border border-zinc-700/60 rounded-xl p-2.5 text-center flex flex-col items-center justify-center shadow-md hover:border-zinc-600 transition-colors"
                    >
                      <span className="text-lg font-black text-zinc-300 font-mono">T{o.table_number}</span>
                      {o.seat_id && (
                        <span className="text-[9px] font-bold text-primary font-mono">Seat {o.seat_id}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Footer Banner */}
      <footer className="bg-zinc-900/40 border border-zinc-800/60 text-center py-2 rounded-xl mt-4 shrink-0 shadow-inner">
        <p className="text-[10px] text-zinc-500 font-semibold tracking-wide uppercase">
          Scan QR Code on Table to order instantly • Thank you for dining with us!
        </p>
      </footer>
    </div>
  );
};
