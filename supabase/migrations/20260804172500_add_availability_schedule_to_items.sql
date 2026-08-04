-- Add availability schedule to items (auto-hide/show by time of day)
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS available_from text DEFAULT NULL;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS available_until text DEFAULT NULL;
-- Format: 'HH:MM' in 24h format, e.g. '06:00', '23:00'
-- If both are NULL, item is always available
