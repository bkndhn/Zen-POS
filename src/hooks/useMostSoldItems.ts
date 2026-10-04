
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cachedFetch, CACHE_KEYS, dataCache } from '@/utils/cacheUtils';

interface MostSoldItem {
  id: string;
  name: string;
  category: string;
  price: number;
  total_quantity: number;
  total_revenue: number;
  image_url?: string;
}

export const useMostSoldItems = (limit: number = 10) => {
  const [mostSoldItems, setMostSoldItems] = useState<MostSoldItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMostSoldItems = async (): Promise<MostSoldItem[]> => {
    // Inner join drops rows whose item was deleted; filter on the real FK column.
    const { data, error } = await supabase
      .from('bill_items')
      .select(`
        quantity,
        total,
        items!inner (
          id,
          name,
          category,
          price,
          image_url
        )
      `)
      .not('item_id', 'is', null)
      .limit(5000);

    if (error) throw error;

    // Aggregate data by item
    const itemMap = new Map<string, MostSoldItem>();
    
    data?.forEach(billItem => {
      if (billItem.items) {
        const item = billItem.items as any;
        const key = item.id;
        
        if (itemMap.has(key)) {
          const existing = itemMap.get(key)!;
          existing.total_quantity += billItem.quantity;
          existing.total_revenue += billItem.total;
        } else {
          itemMap.set(key, {
            id: item.id,
            name: item.name,
            category: item.category,
            price: item.price,
            total_quantity: billItem.quantity,
            total_revenue: billItem.total,
            image_url: item.image_url
          });
        }
      }
    });

    // Sort by quantity and limit results
    return Array.from(itemMap.values())
      .sort((a, b) => b.total_quantity - a.total_quantity)
      .slice(0, limit);
  };

  const loadMostSoldItems = async () => {
    try {
      setLoading(true);
      const items = await cachedFetch(
        CACHE_KEYS.MOST_SOLD_ITEMS,
        fetchMostSoldItems,
        5 * 60 * 1000 // 5 minutes cache
      );
      setMostSoldItems(items);
    } catch (error) {
      console.error('Error fetching most sold items:', error);
      setMostSoldItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMostSoldItems();

    // Subscribe to cache changes
    const unsubscribe = dataCache.subscribe(CACHE_KEYS.MOST_SOLD_ITEMS, () => {
      const cached = dataCache.get<MostSoldItem[]>(CACHE_KEYS.MOST_SOLD_ITEMS);
      if (cached) {
        setMostSoldItems(cached);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const refreshMostSoldItems = () => {
    dataCache.invalidate(CACHE_KEYS.MOST_SOLD_ITEMS);
    loadMostSoldItems();
  };

  return {
    mostSoldItems,
    loading,
    refreshMostSoldItems
  };
};
