CREATE OR REPLACE FUNCTION public.get_backup_cron_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cron, extensions
AS $$
DECLARE
  v_job record;
  v_run record;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jobid, schedule, active INTO v_job
  FROM cron.job WHERE jobname = 'zenpos-auto-backup' LIMIT 1;

  IF v_job IS NULL THEN
    RETURN jsonb_build_object('scheduled', false);
  END IF;

  SELECT status, start_time, return_message INTO v_run
  FROM cron.job_run_details
  WHERE jobid = v_job.jobid
  ORDER BY start_time DESC LIMIT 1;

  RETURN jsonb_build_object(
    'scheduled', true,
    'active', v_job.active,
    'schedule', v_job.schedule,
    'last_status', v_run.status,
    'last_run_at', v_run.start_time,
    'last_message', v_run.return_message
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_backup_cron_status() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_backup_cron_status() TO authenticated;