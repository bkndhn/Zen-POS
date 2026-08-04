ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payment_mode text,
  ADD COLUMN IF NOT EXISTS paid_to text,
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence text,
  ADD COLUMN IF NOT EXISTS client_uuid text;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_client_uuid_key ON public.expenses(client_uuid) WHERE client_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS expenses_admin_date_idx ON public.expenses(admin_id, date DESC);

CREATE TABLE IF NOT EXISTS public.expense_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  branch_id uuid,
  category text NOT NULL,
  month text NOT NULL,
  limit_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_budgets_unique_idx
  ON public.expense_budgets(admin_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(category), month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_budgets TO authenticated;
GRANT ALL ON public.expense_budgets TO service_role;

ALTER TABLE public.expense_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own expense budgets"
ON public.expense_budgets FOR ALL TO authenticated
USING (admin_id = public.get_my_admin_id() OR admin_id = public.get_my_profile_id() OR public.is_super_admin())
WITH CHECK (admin_id = public.get_my_admin_id() OR admin_id = public.get_my_profile_id() OR public.is_super_admin());

CREATE TRIGGER update_expense_budgets_updated_at
BEFORE UPDATE ON public.expense_budgets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();