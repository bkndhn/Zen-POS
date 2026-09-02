SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE trigger_name LIKE '%push%' OR trigger_name LIKE '%fcm%';
