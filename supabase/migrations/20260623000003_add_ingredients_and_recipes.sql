-- Migration: Add ingredients and recipes tables
-- Created at: 2026-06-23

-- 1) Create ingredients table
CREATE TABLE IF NOT EXISTS public.ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  name text NOT NULL,
  stock_quantity numeric NOT NULL DEFAULT 0,
  minimum_stock_alert numeric DEFAULT 0,
  unit text NOT NULL DEFAULT 'pcs',
  cost_per_unit numeric NOT NULL DEFAULT 0 CHECK (cost_per_unit >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_ingredient_per_branch UNIQUE (name, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_ingredients_admin ON public.ingredients(admin_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_branch ON public.ingredients(branch_id);

GRANT ALL ON public.ingredients TO authenticated, service_role;
GRANT SELECT ON public.ingredients TO anon;

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingredients_select" ON public.ingredients FOR SELECT TO authenticated, anon
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id());

CREATE POLICY "ingredients_insert" ON public.ingredients FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR admin_id = public.get_user_admin_id());

CREATE POLICY "ingredients_update" ON public.ingredients FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id());

CREATE POLICY "ingredients_delete" ON public.ingredients FOR DELETE TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id());

-- 2) Create recipes table
CREATE TABLE IF NOT EXISTS public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  quantity numeric NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_recipe_item_ingredient UNIQUE (item_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_recipes_item ON public.recipes(item_id);
CREATE INDEX IF NOT EXISTS idx_recipes_ingredient ON public.recipes(ingredient_id);

GRANT ALL ON public.recipes TO authenticated, service_role;
GRANT SELECT ON public.recipes TO anon;

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipes_select" ON public.recipes FOR SELECT TO authenticated, anon
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id());

CREATE POLICY "recipes_insert" ON public.recipes FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR admin_id = public.get_user_admin_id());

CREATE POLICY "recipes_update" ON public.recipes FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id());

CREATE POLICY "recipes_delete" ON public.recipes FOR DELETE TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id());

-- 3) Create triggers for updated_at
CREATE TRIGGER update_ingredients_updated_at BEFORE UPDATE ON public.ingredients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
