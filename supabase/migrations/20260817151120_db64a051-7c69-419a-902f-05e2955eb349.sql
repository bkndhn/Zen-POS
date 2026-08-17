
select cron.schedule('zenpos-storage-alert-sweep', '15 3 * * *', $$select public.sweep_admin_storage_alerts();$$);
