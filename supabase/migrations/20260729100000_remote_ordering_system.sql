-- Remote Orders table for pickup & delivery
CREATE TABLE IF NOT EXISTS public.remote_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.profiles(id),
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  device_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL CHECK (customer_phone ~ '^[6-9][0-9]{9}$'),
  order_number TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_total NUMERIC NOT NULL DEFAULT 0,
  delivery_fee NUMERIC NOT NULL DEFAULT 0,
  packaging_fee NUMERIC NOT NULL DEFAULT 0,
  surge_fee NUMERIC NOT NULL DEFAULT 0,
  tip_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  order_type TEXT NOT NULL CHECK (order_type IN ('pickup', 'delivery')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','preparing','ready','out_for_delivery','completed','cancelled','no_show')),
  estimated_wait_minutes INTEGER,
  reject_reason TEXT,
  customer_latitude NUMERIC,
  customer_longitude NUMERIC,
  customer_address TEXT,
  payment_mode TEXT DEFAULT 'pay_on_pickup' CHECK (payment_mode IN ('pay_on_pickup','upi','paid')),
  payment_reference TEXT,
  is_scheduled BOOLEAN DEFAULT false,
  scheduled_for TIMESTAMPTZ,
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  feedback_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_remote_orders_admin_branch ON public.remote_orders(admin_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_remote_orders_device ON public.remote_orders(device_id);
CREATE INDEX IF NOT EXISTS idx_remote_orders_status ON public.remote_orders(status);
CREATE INDEX IF NOT EXISTS idx_remote_orders_created ON public.remote_orders(created_at DESC);

-- Blocked devices table
CREATE TABLE IF NOT EXISTS public.blocked_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.profiles(id),
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  device_id TEXT NOT NULL,
  reason TEXT,
  blocked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(admin_id, branch_id, device_id)
);

-- Shop settings columns for remote ordering
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS remote_ordering_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS remote_order_modes TEXT DEFAULT 'pickup',
  ADD COLUMN IF NOT EXISTS remote_ordering_paused BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS table_qr_protection TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS delivery_fee_mode TEXT DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS delivery_fee_flat NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee_base NUMERIC DEFAULT 30,
  ADD COLUMN IF NOT EXISTS delivery_fee_per_km NUMERIC DEFAULT 10,
  ADD COLUMN IF NOT EXISTS delivery_fee_free_km NUMERIC DEFAULT 2,
  ADD COLUMN IF NOT EXISTS packaging_fee_mode TEXT DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS packaging_fee_value NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surge_fee_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS surge_fee_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tipping_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_delivery_radius_km NUMERIC DEFAULT 10;

-- Enable RLS
ALTER TABLE public.remote_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_devices ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "remote_orders_staff_select" ON public.remote_orders
  FOR SELECT TO authenticated
  USING (public.has_branch_read_access(admin_id, branch_id));

CREATE POLICY "remote_orders_staff_update" ON public.remote_orders
  FOR UPDATE TO authenticated
  USING (public.has_branch_write_access(admin_id, branch_id));

CREATE POLICY "remote_orders_anon_insert" ON public.remote_orders
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "remote_orders_anon_select" ON public.remote_orders
  FOR SELECT TO anon USING (true);

CREATE POLICY "remote_orders_anon_update" ON public.remote_orders
  FOR UPDATE TO anon USING (true);

CREATE POLICY "blocked_devices_staff" ON public.blocked_devices
  FOR ALL TO authenticated
  USING (public.has_branch_write_access(admin_id, branch_id));

CREATE POLICY "blocked_devices_anon_read" ON public.blocked_devices
  FOR SELECT TO anon USING (true);

-- Enable realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.remote_orders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC: Generate next remote order number
CREATE OR REPLACE FUNCTION public.get_next_remote_order_number(
  p_admin_id UUID,
  p_branch_id UUID
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
  v_today TEXT;
BEGIN
  v_today := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.remote_orders
  WHERE admin_id = p_admin_id
    AND branch_id = p_branch_id
    AND created_at::date = (now() AT TIME ZONE 'Asia/Kolkata')::date;
  RETURN 'RO-' || v_today || '-' || LPAD(v_count::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_remote_order_number TO anon, authenticated;
