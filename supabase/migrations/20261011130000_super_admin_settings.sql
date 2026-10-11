-- Create super_admin_settings table for landing page dynamic config
CREATE TABLE IF NOT EXISTS public.super_admin_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  landing_page_config JSONB DEFAULT '{
    "heroTitle": "Lightning POS & QR Ordering OS for Modern Food Businesses",
    "heroSubtitle": "No hardware needed. Works offline. Tamil & English. Start billing in 2 minutes.",
    "pilotDays": 7,
    "monthlyPrice": "1,000",
    "yearlyPrice": "10,000",
    "contactPhone": "9894451420",
    "whatsappNumber": "919894451420",
    "promoBannerText": null
  }'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE public.super_admin_settings ENABLE ROW LEVEL SECURITY;

-- Public can read landing config (anon access for the landing page)
CREATE POLICY "Public read landing config" ON public.super_admin_settings
  FOR SELECT USING (true);

-- Only super admins can write
CREATE POLICY "Super admin write" ON public.super_admin_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- Insert default row
INSERT INTO public.super_admin_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
