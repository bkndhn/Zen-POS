-- Add delegate pickup tracking & PIN verification columns to remote_orders
ALTER TABLE public.remote_orders
  ADD COLUMN IF NOT EXISTS pickup_pin TEXT,
  ADD COLUMN IF NOT EXISTS collected_by_name TEXT,
  ADD COLUMN IF NOT EXISTS collected_by_phone TEXT,
  ADD COLUMN IF NOT EXISTS is_delegate_pickup BOOLEAN DEFAULT false;
