-- Migration: Enforce Tenant FKs and Backfill Auth IDs to Profile IDs

-- 1. Backfill any tables where admin_id accidentally points to an Auth UUID (profiles.user_id)
DO $$$
DECLARE
  r RECORD;
  query text;
BEGIN
  FOR r IN 
    SELECT table_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND column_name = 'admin_id'
  LOOP
    query := format('
      UPDATE public.%I t
      SET admin_id = p.id
      FROM public.profiles p
      WHERE t.admin_id = p.user_id;
    ', r.table_name);
    EXECUTE query;
  END LOOP;
END $$$;

-- 2. Add strict foreign keys to all tenant tables
DO $$$
DECLARE
  r RECORD;
  fk_name text;
  query text;
BEGIN
  FOR r IN 
    SELECT table_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND column_name = 'admin_id'
  LOOP
    fk_name := format('fk_%s_admin_id', r.table_name);
    
    -- Drop existing if any to avoid duplicates
    BEGIN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.table_name, fk_name);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- Add the constraint (using NOT VALID so it doesn't fail on legacy orphaned rows, but protects all future inserts)
    BEGIN
      query := format('
        ALTER TABLE public.%I 
        ADD CONSTRAINT %I 
        FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;
      ', r.table_name, fk_name);
      EXECUTE query;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not add FK to %. It may already have one or have conflicting structure.', r.table_name;
    END;
  END LOOP;
END $$$;

-- 3. Standardize RLS RPC functions to only use profiles.id
CREATE OR REPLACE FUNCTION public.get_my_profile_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$$;

CREATE OR REPLACE FUNCTION public.get_my_admin_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$$
  SELECT COALESCE(admin_id, id) FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$$;

-- 4. Rewrite profiles and user_permissions policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view team profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
FOR SELECT TO authenticated
USING (
  id = public.get_my_profile_id() OR
  admin_id = public.get_my_admin_id() OR
  public.is_super_admin()
);

CREATE POLICY "profiles_update" ON public.profiles
FOR UPDATE TO authenticated
USING (
  id = public.get_my_profile_id() OR
  (admin_id = public.get_my_admin_id() AND public.get_my_role() = 'admin') OR
  public.is_super_admin()
);

DROP POLICY IF EXISTS "Users can view own permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Admins can manage team permissions" ON public.user_permissions;

CREATE POLICY "user_permissions_select" ON public.user_permissions
FOR SELECT TO authenticated
USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin') OR
  public.is_super_admin()
);

CREATE POLICY "user_permissions_modify" ON public.user_permissions
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin') OR
  public.is_super_admin()
);

