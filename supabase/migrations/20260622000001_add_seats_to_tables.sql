-- Migration: Add seat-wise configuration and ordering columns

-- Add columns to public.tables
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS has_seats BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS seat_count INTEGER DEFAULT 0;
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS seat_configuration JSONB DEFAULT '[]'::jsonb;

-- Add column to public.table_orders
ALTER TABLE public.table_orders ADD COLUMN IF NOT EXISTS seat_id TEXT;

-- Add column to public.table_service_requests
ALTER TABLE public.table_service_requests ADD COLUMN IF NOT EXISTS seat_id TEXT;
