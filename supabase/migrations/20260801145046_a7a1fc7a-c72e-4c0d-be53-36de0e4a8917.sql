DROP POLICY IF EXISTS remote_orders_public_insert ON public.remote_orders;

CREATE POLICY remote_orders_public_insert
ON public.remote_orders
FOR INSERT
TO anon, authenticated
WITH CHECK (
  device_id IS NOT NULL
  AND coalesce(customer_phone, '') <> ''
  AND coalesce(status, 'pending') = 'pending'
  AND coalesce(is_paid, false) = false
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = remote_orders.admin_id
      AND p.status = 'active'
  )
);