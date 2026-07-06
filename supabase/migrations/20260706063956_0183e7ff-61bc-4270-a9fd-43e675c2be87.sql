ALTER TABLE public.item_categories
  ADD COLUMN IF NOT EXISTS print_station text NOT NULL DEFAULT 'kitchen';

COMMENT ON COLUMN public.item_categories.print_station IS
  'KOT/BOT routing target: kitchen | bar | dessert | <custom>. Used to split a bill into separate print tickets per station.';

CREATE INDEX IF NOT EXISTS idx_item_categories_admin_station
  ON public.item_categories(admin_id, print_station);