ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS seat_order_mode text NOT NULL DEFAULT 'both';

ALTER TABLE public.table_orders
  ADD COLUMN IF NOT EXISTS seat_label text,
  ADD COLUMN IF NOT EXISTS order_scope text NOT NULL DEFAULT 'table';

ALTER TABLE public.table_service_requests
  ADD COLUMN IF NOT EXISTS seat_label text;

UPDATE public.table_orders
  SET seat_label = seat_id, order_scope = 'seat'
  WHERE seat_id IS NOT NULL AND seat_label IS NULL;

CREATE INDEX IF NOT EXISTS idx_table_orders_seat_lookup
  ON public.table_orders (admin_id, branch_id, table_number, seat_id);