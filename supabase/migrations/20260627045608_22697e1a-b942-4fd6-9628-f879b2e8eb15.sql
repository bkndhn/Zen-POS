
-- Fix items table: add online channel prices used by AddItem/EditItem dialogs
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS price_zomato numeric,
  ADD COLUMN IF NOT EXISTS price_swiggy numeric;

-- Fix bills table: add channel column (store/zomato/swiggy) used by Billing
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'store';

-- Fix table_service_requests: allow new request types incl. UPI payment
ALTER TABLE public.table_service_requests
  DROP CONSTRAINT IF EXISTS table_service_requests_request_type_check;
ALTER TABLE public.table_service_requests
  ADD CONSTRAINT table_service_requests_request_type_check
  CHECK (request_type IS NOT NULL AND length(request_type) BETWEEN 1 AND 50);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
