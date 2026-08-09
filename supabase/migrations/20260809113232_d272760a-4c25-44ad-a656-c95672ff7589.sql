
-- 1. blocked_devices: remove public read
DROP POLICY IF EXISTS "blocked_devices_public_read" ON public.blocked_devices;

CREATE OR REPLACE FUNCTION public.is_device_blocked(p_admin_id uuid, p_device_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_devices b
    WHERE b.admin_id = p_admin_id AND b.device_id = p_device_id
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_device_blocked(uuid, text) TO anon, authenticated;

-- 2. cross-tenant authenticated reads
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.brands;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.departments;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.item_batches;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.item_variants;

CREATE POLICY "item_variants_owner_read" ON public.item_variants
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.items i
  WHERE i.id = item_variants.item_id
    AND i.admin_id IN (
      SELECT p.admin_id FROM public.profiles p WHERE p.user_id = auth.uid()
      UNION
      SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
));

-- 3. payment_settings: only owners/admins and super admins
DROP POLICY IF EXISTS "authenticated_read_payment_settings" ON public.payment_settings;
CREATE POLICY "admins_read_payment_settings" ON public.payment_settings
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.role IN ('admin'::app_role, 'super_admin'::app_role)
));

-- 4. remote_orders: remove unconditional public read
DROP POLICY IF EXISTS "remote_orders_public_select" ON public.remote_orders;

CREATE OR REPLACE FUNCTION public.get_remote_order_for_device(p_order_id uuid, p_device_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(o)
  FROM public.remote_orders o
  WHERE o.id = p_order_id
    AND p_device_id IS NOT NULL
    AND o.device_id = p_device_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_remote_order_for_device(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_active_remote_order_for_device(p_admin_id uuid, p_branch_id uuid, p_device_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(o)
  FROM public.remote_orders o
  WHERE p_device_id IS NOT NULL
    AND o.device_id = p_device_id
    AND o.admin_id = p_admin_id
    AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
    AND COALESCE(o.status, 'pending') NOT IN ('completed', 'cancelled', 'no_show')
  ORDER BY o.created_at DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_active_remote_order_for_device(uuid, uuid, text) TO anon, authenticated;
