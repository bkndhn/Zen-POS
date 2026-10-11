-- Create marketing_leads table for ZenPOS pilot sign-up leads from landing page
CREATE TABLE IF NOT EXISTS public.marketing_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_name TEXT,
  phone TEXT NOT NULL,
  shop_type TEXT,
  source TEXT DEFAULT 'landing_page',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;

-- Only service role can read leads (admin dashboard only)
CREATE POLICY "Service role only" ON public.marketing_leads
  FOR ALL USING (false) WITH CHECK (false);
