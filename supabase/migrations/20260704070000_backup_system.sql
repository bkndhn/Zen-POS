-- Migration: Create backup_settings and backup_logs tables
-- Date: 2026-07-04

CREATE TABLE IF NOT EXISTS public.backup_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    gdrive_folder_id text NULL,
    gdrive_credentials jsonb NULL, -- Google Service Account JSON
    backup_times text[] NOT NULL DEFAULT ARRAY['08:00', '14:00', '23:00'],
    retention_days integer NOT NULL DEFAULT 10,
    is_enabled boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.backup_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_time timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL CHECK (status = ANY (ARRAY['success', 'failure'])),
    file_name text,
    file_size bigint,
    details text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default settings
INSERT INTO public.backup_settings (gdrive_folder_id, retention_days, is_enabled)
VALUES (NULL, 10, true)
ON CONFLICT DO NOTHING;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_logs TO authenticated;

GRANT ALL ON public.backup_settings TO service_role;
GRANT ALL ON public.backup_logs TO service_role;

-- Enable Row Level Security
ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Super Admin Only)
CREATE POLICY "Super admin backup_settings access" ON public.backup_settings
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admin backup_logs access" ON public.backup_logs
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Add updated_at trigger for backup_settings
DROP TRIGGER IF EXISTS trg_backup_settings_updated ON public.backup_settings;
CREATE TRIGGER trg_backup_settings_updated BEFORE UPDATE ON public.backup_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
