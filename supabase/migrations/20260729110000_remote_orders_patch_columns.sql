-- Patch: Add missing columns to remote_orders table
-- These columns are referenced in RemoteCheckout.tsx and OnlineOrders.tsx

ALTER TABLE public.remote_orders
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_prep_time INTEGER,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_method TEXT;
