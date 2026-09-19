-- Subscription payments: tenants may only create pending, unconfirmed records
DROP POLICY IF EXISTS "tenant_subscription_payments_insert" ON public.subscription_payments;
DROP POLICY IF EXISTS "tenant_subscription_payments_select" ON public.subscription_payments;

CREATE POLICY "tenant_subscription_payments_select" ON public.subscription_payments
  FOR SELECT TO authenticated
  USING (
    admin_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    OR admin_id IN (SELECT p.admin_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );

CREATE POLICY "tenant_subscription_payments_insert" ON public.subscription_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      admin_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
      OR admin_id IN (SELECT p.admin_id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
    AND COALESCE(status, 'pending') = 'pending'
    AND confirmed_by IS NULL
    AND confirmed_at IS NULL
  );

-- Block tenant-side confirmation via trigger as defence in depth
CREATE OR REPLACE FUNCTION public.guard_subscription_payment_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.status, 'pending') <> 'pending' OR NEW.confirmed_by IS NOT NULL OR NEW.confirmed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Only a super admin can confirm a subscription payment';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
     OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at THEN
    RAISE EXCEPTION 'Only a super admin can change subscription payment status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_subscription_payment_confirmation ON public.subscription_payments;
CREATE TRIGGER trg_guard_subscription_payment_confirmation
  BEFORE INSERT OR UPDATE ON public.subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_subscription_payment_confirmation();

REVOKE EXECUTE ON FUNCTION public.guard_subscription_payment_confirmation() FROM anon, authenticated;

-- Logos bucket: strict per-tenant folder prefix
DROP POLICY IF EXISTS "Logos tenant insert" ON storage.objects;
DROP POLICY IF EXISTS "Logos tenant update" ON storage.objects;
DROP POLICY IF EXISTS "Logos tenant delete" ON storage.objects;

CREATE POLICY "Logos tenant insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (public.is_super_admin() OR name LIKE public.get_my_admin_id()::text || '/%')
  );

CREATE POLICY "Logos tenant update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (public.is_super_admin() OR name LIKE public.get_my_admin_id()::text || '/%')
  )
  WITH CHECK (
    bucket_id = 'logos'
    AND (public.is_super_admin() OR name LIKE public.get_my_admin_id()::text || '/%')
  );

CREATE POLICY "Logos tenant delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (public.is_super_admin() OR name LIKE public.get_my_admin_id()::text || '/%')
  );