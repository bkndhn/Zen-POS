-- ============================================================
-- P1-B: Loyalty Stamp Card (N orders → free item)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.loyalty_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  customer_identifier text NOT NULL,
  customer_name text,
  customer_phone text,
  stamps_count integer NOT NULL DEFAULT 0,
  total_orders integer NOT NULL DEFAULT 0,
  free_items_earned integer NOT NULL DEFAULT 0,
  free_items_redeemed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_cards_admin_customer_idx
  ON public.loyalty_cards (admin_id, customer_identifier);
CREATE INDEX IF NOT EXISTS loyalty_cards_admin_id_idx ON public.loyalty_cards (admin_id);
CREATE INDEX IF NOT EXISTS loyalty_cards_phone_idx ON public.loyalty_cards (admin_id, customer_phone);

-- Loyalty config columns on shop_settings
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS loyalty_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS loyalty_stamps_required integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS loyalty_reward_description text DEFAULT 'Free item of your choice';

ALTER TABLE public.loyalty_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read loyalty card" ON public.loyalty_cards;
CREATE POLICY "Public can read loyalty card" ON public.loyalty_cards
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can insert loyalty card" ON public.loyalty_cards;
CREATE POLICY "Public can insert loyalty card" ON public.loyalty_cards
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public can update loyalty card" ON public.loyalty_cards;
CREATE POLICY "Public can update loyalty card" ON public.loyalty_cards
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Admin manages loyalty cards" ON public.loyalty_cards;
CREATE POLICY "Admin manages loyalty cards" ON public.loyalty_cards
  FOR ALL USING (auth.uid() IN (
    SELECT user_id FROM public.profiles WHERE id = admin_id
  ));

-- Add a stamp after a confirmed order
CREATE OR REPLACE FUNCTION public.add_loyalty_stamp(
  p_admin_id uuid,
  p_branch_id uuid,
  p_customer_identifier text,
  p_customer_phone text DEFAULT NULL,
  p_customer_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_card public.loyalty_cards%ROWTYPE;
  v_stamps_required int := 10;
  v_new_stamps int;
  v_free_earned int;
  v_stamp_just_earned boolean := false;
BEGIN
  SELECT COALESCE(loyalty_stamps_required, 10) INTO v_stamps_required
  FROM public.shop_settings
  WHERE user_id IN (SELECT user_id FROM public.profiles WHERE id = p_admin_id)
  ORDER BY branch_id NULLS LAST LIMIT 1;

  v_stamps_required := COALESCE(v_stamps_required, 10);

  INSERT INTO public.loyalty_cards
    (admin_id, branch_id, customer_identifier, customer_phone, customer_name, stamps_count, total_orders)
  VALUES
    (p_admin_id, p_branch_id, p_customer_identifier, p_customer_phone, p_customer_name, 1, 1)
  ON CONFLICT (admin_id, customer_identifier) DO UPDATE
  SET stamps_count    = loyalty_cards.stamps_count + 1,
      total_orders    = loyalty_cards.total_orders + 1,
      customer_phone  = COALESCE(EXCLUDED.customer_phone, loyalty_cards.customer_phone),
      customer_name   = COALESCE(EXCLUDED.customer_name, loyalty_cards.customer_name),
      updated_at      = now()
  RETURNING * INTO v_card;

  v_new_stamps := v_card.stamps_count;
  v_free_earned := v_card.free_items_earned;

  -- Milestone: reset cycle, award free item
  IF v_new_stamps > 0 AND (v_new_stamps % v_stamps_required) = 0 THEN
    UPDATE public.loyalty_cards
    SET free_items_earned = free_items_earned + 1,
        stamps_count      = 0,
        updated_at        = now()
    WHERE id = v_card.id;
    v_stamp_just_earned := true;
    v_free_earned       := v_free_earned + 1;
    v_new_stamps        := 0;
  END IF;

  RETURN jsonb_build_object(
    'stamps_count',          v_new_stamps,
    'total_orders',          v_card.total_orders,
    'free_items_earned',     v_free_earned,
    'free_items_redeemed',   v_card.free_items_redeemed,
    'free_items_available',  v_free_earned - v_card.free_items_redeemed,
    'stamps_required',       v_stamps_required,
    'stamp_just_earned_free', v_stamp_just_earned
  );
END;
$$;

-- Read a customer's loyalty card
CREATE OR REPLACE FUNCTION public.get_loyalty_card(
  p_admin_id uuid,
  p_customer_identifier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_card public.loyalty_cards%ROWTYPE;
  v_stamps_required int;
  v_loyalty_enabled boolean;
  v_reward_desc text;
BEGIN
  SELECT COALESCE(loyalty_stamps_required, 10),
         COALESCE(loyalty_enabled, false),
         COALESCE(loyalty_reward_description, 'Free item of your choice')
  INTO v_stamps_required, v_loyalty_enabled, v_reward_desc
  FROM public.shop_settings
  WHERE user_id IN (SELECT user_id FROM public.profiles WHERE id = p_admin_id)
  ORDER BY branch_id NULLS LAST LIMIT 1;

  IF NOT v_loyalty_enabled THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  SELECT * INTO v_card
  FROM public.loyalty_cards
  WHERE admin_id = p_admin_id AND customer_identifier = p_customer_identifier
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'enabled',              true,
      'stamps_count',         0,
      'total_orders',         0,
      'free_items_available', 0,
      'stamps_required',      v_stamps_required,
      'reward_description',   v_reward_desc
    );
  END IF;

  RETURN jsonb_build_object(
    'enabled',              true,
    'stamps_count',         v_card.stamps_count,
    'total_orders',         v_card.total_orders,
    'free_items_available', v_card.free_items_earned - v_card.free_items_redeemed,
    'stamps_required',      v_stamps_required,
    'reward_description',   v_reward_desc
  );
END;
$$;
