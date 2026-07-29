-- Add missing timestamp columns to remote_orders
-- OnlineOrders.tsx uses ready_at, out_for_delivery_at, and no_show_at
-- when updating order status, but these columns were missing from the original migration

ALTER TABLE public.remote_orders
  ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS out_for_delivery_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ;
