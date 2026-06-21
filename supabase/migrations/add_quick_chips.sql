-- Migration: Add quick_chips column to items table
-- This adds an optional text array column for storing quick-add chip labels
-- e.g., {"250 ml","500 ml","1 L"} or {"6 PC","12 PC"}
-- NULL means no chips (existing behavior preserved)

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS quick_chips text[] DEFAULT NULL;
