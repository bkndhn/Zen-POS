DO $$ BEGIN
 IF NOT public.bill_archive_eligible(DATE '2026-09-14','paid',0,'completed','completed',DATE '2026-11-14') THEN RAISE EXCEPTION 'Older settled bill must qualify'; END IF;
 IF public.bill_archive_eligible(DATE '2026-09-15','paid',0,'completed','completed',DATE '2026-11-14') THEN RAISE EXCEPTION 'Exactly 60 days must not qualify'; END IF;
 IF public.bill_archive_eligible(DATE '2026-09-14','unpaid',0,'completed','completed',DATE '2026-11-14') THEN RAISE EXCEPTION 'Unpaid bill must not qualify'; END IF;
 IF public.bill_archive_eligible(DATE '2026-09-14','paid',1,'completed','completed',DATE '2026-11-14') THEN RAISE EXCEPTION 'Outstanding due must not qualify'; END IF;
 IF public.bill_archive_eligible(DATE '2026-09-14','paid',0,'preparing','completed',DATE '2026-11-14') THEN RAISE EXCEPTION 'Active kitchen must not qualify'; END IF;
 IF public.bill_archive_eligible(DATE '2026-09-14','paid',0,'completed','pending',DATE '2026-11-14') THEN RAISE EXCEPTION 'Active service must not qualify'; END IF;
 IF public.bill_archive_eligible(DATE '2026-09-14',NULL,0,'completed','completed',DATE '2026-11-14') THEN RAISE EXCEPTION 'Unknown payment must not qualify'; END IF;
END $$;