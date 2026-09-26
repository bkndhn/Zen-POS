REVOKE ALL ON FUNCTION public.dispatch_client_webhook(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_bill_webhook() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_payment_webhook() FROM PUBLIC, anon, authenticated;