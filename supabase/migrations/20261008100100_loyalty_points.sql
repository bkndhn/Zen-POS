CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL,
  branch_id UUID,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  bill_id UUID,
  type TEXT NOT NULL CHECK (type IN ('earn', 'redeem')),
  points INTEGER NOT NULL,
  amount_spent NUMERIC,
  amount_redeemed NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own loyalty" ON public.loyalty_transactions FOR ALL USING (
  admin_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS loyalty_points INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_loyalty_admin ON public.loyalty_transactions(admin_id, customer_id);
