ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS is_petty_cash BOOLEAN DEFAULT false;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id);
