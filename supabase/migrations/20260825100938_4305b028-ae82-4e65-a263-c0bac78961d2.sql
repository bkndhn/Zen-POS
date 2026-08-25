-- Close cross-tenant / public read exposure on remote_orders
-- The policy 'remote_orders_anon_select_by_device' (device_id IS NOT NULL) is always true,
-- exposing all orders to anon. Guests use device-scoped SECURITY DEFINER RPCs instead.
DROP POLICY IF EXISTS remote_orders_anon_select_by_device ON public.remote_orders;

-- Defense-in-depth: anon role gets no direct SELECT on the table at all.
-- Guest reads go through get_remote_order_for_device / get_active_remote_order_for_device
-- (SECURITY DEFINER, device-id scoped). This also closes the Realtime leak, since
-- postgres_changes subscriptions are gated by SELECT privilege + RLS.
REVOKE SELECT ON public.remote_orders FROM anon;