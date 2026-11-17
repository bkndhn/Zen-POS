CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.token_display_keys (
  admin_id uuid PRIMARY KEY,
  display_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.token_display_keys FROM PUBLIC, anon, authenticated;

-- Owner-only: get or rotate the private TV link key
CREATE OR REPLACE FUNCTION public.get_token_display_key(p_rotate boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_profile uuid; v_key uuid;
BEGIN
  SELECT id INTO v_profile FROM public.profiles
   WHERE user_id = auth.uid() AND admin_id IS NULL AND role::text = 'admin' LIMIT 1;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'Only the shop owner can manage the TV link'; END IF;
  IF p_rotate THEN
    INSERT INTO private.token_display_keys(admin_id) VALUES (v_profile)
    ON CONFLICT (admin_id) DO UPDATE SET display_key = gen_random_uuid(), created_at = now()
    RETURNING display_key INTO v_key;
  ELSE
    INSERT INTO private.token_display_keys(admin_id) VALUES (v_profile)
    ON CONFLICT (admin_id) DO NOTHING;
    SELECT display_key INTO v_key FROM private.token_display_keys WHERE admin_id = v_profile;
  END IF;
  RETURN v_key;
END $$;
REVOKE ALL ON FUNCTION public.get_token_display_key(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_token_display_key(boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.get_public_tokens(uuid);
CREATE FUNCTION public.get_public_tokens(p_display_key uuid)
RETURNS TABLE(id uuid, bill_no text, kitchen_status text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT b.id, b.bill_no::text, b.kitchen_status::text, b.created_at
  FROM public.bills b
  JOIN private.token_display_keys k ON k.admin_id = b.admin_id AND k.display_key = p_display_key
  WHERE b.created_at > now() - interval '18 hours'
    AND COALESCE(b.is_deleted, false) = false
    AND b.kitchen_status::text IN ('pending','preparing','ready')
    AND COALESCE(b.service_status::text, '') NOT IN ('completed','rejected')
  ORDER BY b.created_at ASC
  LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.get_public_tokens(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tokens(uuid) TO anon, authenticated;