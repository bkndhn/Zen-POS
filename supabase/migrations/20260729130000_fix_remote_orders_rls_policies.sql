-- Fix RLS policies for remote ordering tables
-- Problem: original policies were anon-only, but authenticated users (admins testing as customers) 
-- also need to be able to INSERT orders and SELECT their order status

-- remote_orders: replace anon-only INSERT with public (anon + authenticated)
DROP POLICY IF EXISTS "remote_orders_anon_insert" ON public.remote_orders;
CREATE POLICY "remote_orders_public_insert" ON public.remote_orders
  FOR INSERT WITH CHECK (true);

-- remote_orders: replace anon-only SELECT with public
DROP POLICY IF EXISTS "remote_orders_anon_select" ON public.remote_orders;
CREATE POLICY "remote_orders_public_select" ON public.remote_orders
  FOR SELECT USING (true);

-- remote_orders: update policy already public (kept as-is)

-- blocked_devices: replace anon-only SELECT with public
DROP POLICY IF EXISTS "blocked_devices_anon_read" ON public.blocked_devices;
CREATE POLICY "blocked_devices_public_read" ON public.blocked_devices
  FOR SELECT USING (true);
