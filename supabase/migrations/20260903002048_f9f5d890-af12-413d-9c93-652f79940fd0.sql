DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tax_rates t
    LEFT JOIN public.profiles p ON p.id = t.admin_id
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot enforce tax_rates tenant identity: one or more admin_id values do not reference profiles.id';
  END IF;
END
$$;

ALTER TABLE public.tax_rates
  DROP CONSTRAINT IF EXISTS fk_tax_rates_admin_id;

ALTER TABLE public.tax_rates
  ADD CONSTRAINT fk_tax_rates_admin_id
  FOREIGN KEY (admin_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;