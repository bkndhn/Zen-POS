-- Drop old restrictive policies
DROP POLICY IF EXISTS "Users can insert own settings" ON public.shop_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON public.shop_settings;
DROP POLICY IF EXISTS "Users can view own settings" ON public.shop_settings;
DROP POLICY IF EXISTS "shop_settings_modify" ON public.shop_settings;

-- Create new policies allowing access for admins and sub-users with branch write access

-- SELECT policy
CREATE POLICY "shop_settings_select_policy" ON public.shop_settings
FOR SELECT
USING (
  auth.uid() = user_id OR
  has_branch_write_access((SELECT id FROM public.profiles WHERE user_id = shop_settings.user_id), branch_id)
);

-- INSERT policy
CREATE POLICY "shop_settings_insert_policy" ON public.shop_settings
FOR INSERT
WITH CHECK (
  auth.uid() = user_id OR
  has_branch_write_access((SELECT id FROM public.profiles WHERE user_id = shop_settings.user_id), branch_id)
);

-- UPDATE policy
CREATE POLICY "shop_settings_update_policy" ON public.shop_settings
FOR UPDATE
USING (
  auth.uid() = user_id OR
  has_branch_write_access((SELECT id FROM public.profiles WHERE user_id = shop_settings.user_id), branch_id)
)
WITH CHECK (
  auth.uid() = user_id OR
  has_branch_write_access((SELECT id FROM public.profiles WHERE user_id = shop_settings.user_id), branch_id)
);
