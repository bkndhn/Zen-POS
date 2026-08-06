CREATE TABLE public.subscription_pack_pricing (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid NOT NULL,
  branch_id uuid NULL,
  months integer NOT NULL CHECK (months >= 1),
  price_per_month numeric NULL,
  discount_percentage numeric NOT NULL DEFAULT 0 CHECK (discount_percentage >= 0 AND discount_percentage <= 90),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX subscription_pack_pricing_unique_idx
  ON public.subscription_pack_pricing (admin_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), months);

CREATE INDEX subscription_pack_pricing_admin_idx ON public.subscription_pack_pricing (admin_id);

GRANT SELECT ON public.subscription_pack_pricing TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.subscription_pack_pricing TO authenticated;
GRANT ALL ON public.subscription_pack_pricing TO service_role;

ALTER TABLE public.subscription_pack_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage all pack pricing"
  ON public.subscription_pack_pricing FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Clients view own pack pricing"
  ON public.subscription_pack_pricing FOR SELECT TO authenticated
  USING (admin_id = public.get_my_profile_id() OR admin_id = public.get_my_admin_id());

CREATE TRIGGER update_subscription_pack_pricing_updated_at
  BEFORE UPDATE ON public.subscription_pack_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();