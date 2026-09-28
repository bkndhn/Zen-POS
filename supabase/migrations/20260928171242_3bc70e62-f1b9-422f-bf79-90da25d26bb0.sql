DO $$
DECLARE r record;
BEGIN
  -- 1) Trigger functions: system-only (triggers still fire; privilege is checked at CREATE TRIGGER time)
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;

  -- 2) Internal background-only routines
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'claim_push_queue','run_process_push_queue','dispatch_client_webhook',
        'generate_daily_summaries','generate_slow_day_alerts','fire_antitheft_alert',
        'notify_by_permission','raise_admin_storage_alerts','prune_diagnostic_tables',
        'get_internal_secret','calc_admin_branch_storage','create_bill_transaction'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;

  -- 3) Staff-only routines: remove anonymous access, keep signed-in staff access
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prorettype <> 'trigger'::regtype
      AND p.proname IN (
        'admin_create_user','admin_delete_sub_user','admin_purge_old_data','admin_send_custom_push',
        'apply_stock_adjustment','calc_admin_storage_usage','check_admin_storage_allowance',
        'copy_items_to_branch','create_purchase_return','create_purchase_transaction',
        'create_stock_transfer','get_all_users_for_super_admin','get_backend_health',
        'get_backup_cron_status','get_branch_scoped_shop_settings','get_my_admin_id',
        'get_my_auth_providers','get_my_permissions','get_my_profile_id','get_my_role',
        'get_my_security_epoch','get_platform_payment_settings','get_push_gate',
        'get_public_item_categories','get_public_shop_settings','get_public_shop_settings_by_profile',
        'has_branch_read_access','has_branch_write_access','has_page_permission','has_report_pin',
        'is_admin_or_super','is_super_admin','link_auth_provider','log_security_event',
        'process_remote_order_auto_settle','prune_deactivated_feature_data','register_device_token',
        'report_antitheft_event','secure_create_bill','seed_branch_defaults','set_report_pin',
        'super_admin_delete_client','unregister_device_token','verify_report_pin',
        'void_purchase_transaction','user_admin_id','get_user_admin_id'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;

  -- 4) Guarantee public customer-facing routines stay callable (QR menu, ordering, feedback, rate limits)
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prorettype <> 'trigger'::regtype
      AND p.proname IN (
        'get_public_menu_items','get_public_menu_categories','get_public_table_seats',
        'get_public_tax_rates','get_public_shop_settings_for_branch','get_public_prep_config',
        'get_public_promo_banners','get_public_session_orders','get_public_watermark_info',
        'get_public_legal_content','get_public_feedback_form','get_app_support_info',
        'adopt_public_table_session','public_place_table_order','public_place_remote_order',
        'public_upsert_customer','public_update_table_status','public_rate_limit_hit',
        'submit_public_feedback','submit_remote_order_feedback','get_active_remote_order_for_device',
        'get_remote_order_for_device','get_next_remote_order_number','is_device_blocked',
        'resolve_menu_target','resolve_menu_slug','resolve_branch_menu','resolve_profile_by_provider',
        'check_auth_rate_limit','clear_auth_rate_limit','check_table_order_rate_limit',
        'check_service_request_rate_limit','is_public_ordering_enabled','is_user_allowed_to_login',
        'get_signup_enabled'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
  END LOOP;
END $$;