REVOKE ALL ON public.bills_archive,public.bill_items_archive FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.bills_archive,public.bill_items_archive TO authenticated;
GRANT ALL ON public.bills_archive,public.bill_items_archive TO service_role;