-- ============================================================
-- P1-A: Coupon / Promo Code Engine
-- ============================================================

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  code text NOT NULL,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'flat')),
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  min_order_amount numeric NOT NULL DEFAULT 0,
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0,
  is_one_use_per_customer boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS coupons_admin_code_unique
  ON public.coupons (admin_id, upper(code));
CREATE INDEX IF NOT EXISTS coupons_admin_id_idx ON public.coupons (admin_id);

CREATE TABLE IF NOT EXISTS public.coupon_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  customer_identifier text NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coupon_uses_coupon_customer_idx
  ON public.coupon_uses (coupon_id, customer_identifier);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_uses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active coupons" ON public.coupons;
CREATE POLICY "Public can read active coupons" ON public.coupons
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admin manages own coupons" ON public.coupons;
CREATE POLICY "Admin manages own coupons" ON public.coupons
  FOR ALL USING (auth.uid() IN (
    SELECT user_id FROM public.profiles WHERE id = admin_id
  ));

DROP POLICY IF EXISTS "Public can record coupon use" ON public.coupon_uses;
CREATE POLICY "Public can record coupon use" ON public.coupon_uses
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admin reads own coupon uses" ON public.coupon_uses;
CREATE POLICY "Admin reads own coupon uses" ON public.coupon_uses
  FOR SELECT USING (auth.uid() IN (
    SELECT user_id FROM public.profiles WHERE id = admin_id
  ));

-- Atomic validation (read-only: does NOT auto-increment uses_count;
-- the app increments uses_count after confirmed order placement)
CREATE OR REPLACE FUNCTION public.validate_and_redeem_coupon(
  p_admin_id uuid,
  p_code text,
  p_order_amount numeric,
  p_customer_identifier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_coupon public.coupons%ROWTYPE;
  v_uses_count int;
  v_discount numeric;
BEGIN
  SELECT * INTO v_coupon
  FROM public.coupons
  WHERE admin_id = p_admin_id
    AND upper(code) = upper(p_code)
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid or expired coupon code');
  END IF;

  IF v_coupon.valid_from IS NOT NULL AND now() < v_coupon.valid_from THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Coupon is not yet active');
  END IF;
  IF v_coupon.valid_until IS NOT NULL AND now() > v_coupon.valid_until THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Coupon has expired');
  END IF;

  IF p_order_amount < v_coupon.min_order_amount THEN
    RETURN jsonb_build_object('valid', false, 'error',
      'Minimum order of ' || v_coupon.min_order_amount || ' required');
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.uses_count >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Coupon usage limit reached');
  END IF;

  IF v_coupon.is_one_use_per_customer THEN
    SELECT count(*) INTO v_uses_count
    FROM public.coupon_uses
    WHERE coupon_id = v_coupon.id AND customer_identifier = p_customer_identifier;
    IF v_uses_count > 0 THEN
      RETURN jsonb_build_object('valid', false, 'error', 'You have already used this coupon');
    END IF;
  END IF;

  IF v_coupon.discount_type = 'percent' THEN
    v_discount := round((p_order_amount * v_coupon.discount_value / 100)::numeric, 2);
  ELSE
    v_discount := least(v_coupon.discount_value, p_order_amount);
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', v_coupon.id,
    'discount_type', v_coupon.discount_type,
    'discount_value', v_coupon.discount_value,
    'discount_amount', v_discount,
    'description', v_coupon.description,
    'code', v_coupon.code
  );
END;
$$;
