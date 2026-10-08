CREATE TABLE IF NOT EXISTS public.happy_hours (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL,
  branch_id UUID,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  days_of_week INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
  discount_percent NUMERIC NOT NULL DEFAULT 20,
  applies_to TEXT DEFAULT 'all',
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.happy_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_happy_hours" ON public.happy_hours FOR ALL USING (
  admin_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);
CREATE INDEX IF NOT EXISTS idx_happy_hours_admin ON public.happy_hours(admin_id);