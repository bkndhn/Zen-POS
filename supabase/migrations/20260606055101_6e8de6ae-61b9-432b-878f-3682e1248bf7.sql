
-- 1) Item expiry mode on items
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS expiry_mode text NOT NULL DEFAULT 'none'
    CHECK (expiry_mode IN ('mandatory', 'optional', 'none'));

-- 2) Backfill any orphan item_categories rows (NULL branch_id) onto the admin's main branch
UPDATE public.item_categories ic
SET branch_id = b.id
FROM public.branches b
WHERE ic.branch_id IS NULL
  AND ic.admin_id IS NOT NULL
  AND b.admin_id = ic.admin_id
  AND b.is_main = true;

-- 3) Prevent duplicate active categories per (admin, branch) — case-insensitive
CREATE UNIQUE INDEX IF NOT EXISTS item_categories_admin_branch_name_unique
  ON public.item_categories (admin_id, branch_id, lower(name))
  WHERE COALESCE(is_deleted, false) = false;

-- 4) Global app settings (singleton) — signup toggle
CREATE TABLE IF NOT EXISTS public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  signup_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anonymous Auth page visitors) can read the toggle
CREATE POLICY "Anyone can read app settings"
  ON public.app_settings FOR SELECT
  USING (true);

-- Only super admins can change it
CREATE POLICY "Super admin can update app settings"
  ON public.app_settings FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admin can insert app settings"
  ON public.app_settings FOR INSERT
  WITH CHECK (public.is_super_admin());

-- Seed singleton
INSERT INTO public.app_settings (id, signup_enabled)
VALUES (true, true)
ON CONFLICT (id) DO NOTHING;

-- 5) Public RPC for the Auth page (no auth needed)
CREATE OR REPLACE FUNCTION public.get_signup_enabled()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT signup_enabled FROM public.app_settings WHERE id = true), true);
$$;

GRANT EXECUTE ON FUNCTION public.get_signup_enabled() TO anon, authenticated;
