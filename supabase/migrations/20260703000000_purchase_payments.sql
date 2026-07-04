-- Migration: Create purchase_payments table
-- Date: 2026-07-03

CREATE TABLE IF NOT EXISTS public.purchase_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL,
    purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    payment_date date NOT NULL DEFAULT CURRENT_DATE,
    amount numeric NOT NULL CHECK (amount > 0),
    payment_mode text NOT NULL CHECK (payment_mode = ANY (ARRAY['cash', 'upi', 'card', 'net_banking', 'other'])),
    reference_no text,
    notes text,
    created_by uuid NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_payments TO authenticated;
GRANT ALL ON public.purchase_payments TO service_role;

-- Enable Row Level Security
ALTER TABLE public.purchase_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Purchase payments admin access" ON public.purchase_payments
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR admin_id = public.get_user_admin_id())
  WITH CHECK (public.is_super_admin() OR admin_id = public.get_user_admin_id());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_purchase_payments_purchase ON public.purchase_payments(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_payments_admin ON public.purchase_payments(admin_id);

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS trg_purchase_payments_updated ON public.purchase_payments;
CREATE TRIGGER trg_purchase_payments_updated BEFORE UPDATE ON public.purchase_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
