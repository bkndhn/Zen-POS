CREATE TABLE IF NOT EXISTS public.shop_whatsapp_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid,
  whatsapp_business_api_token text,
  whatsapp_business_phone_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shop_whatsapp_credentials_user_branch_idx
  ON public.shop_whatsapp_credentials (user_id, branch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_whatsapp_credentials TO authenticated;
GRANT ALL ON public.shop_whatsapp_credentials TO service_role;

ALTER TABLE public.shop_whatsapp_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage their whatsapp credentials" ON public.shop_whatsapp_credentials;
CREATE POLICY "Owners manage their whatsapp credentials"
  ON public.shop_whatsapp_credentials
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

INSERT INTO public.shop_whatsapp_credentials (user_id, branch_id, whatsapp_business_api_token, whatsapp_business_phone_id)
SELECT s.user_id, s.branch_id, s.whatsapp_business_api_token, s.whatsapp_business_phone_id
FROM public.shop_settings s
WHERE (s.whatsapp_business_api_token IS NOT NULL OR s.whatsapp_business_phone_id IS NOT NULL)
ON CONFLICT (user_id, branch_id) DO NOTHING;

ALTER TABLE public.shop_settings DROP COLUMN IF EXISTS whatsapp_business_api_token;
ALTER TABLE public.shop_settings DROP COLUMN IF EXISTS whatsapp_business_phone_id;