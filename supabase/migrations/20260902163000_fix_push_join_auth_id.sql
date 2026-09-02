CREATE OR REPLACE FUNCTION public.notify_by_permission(
  p_admin_id UUID,
  p_branch_id UUID,
  p_required_page TEXT,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}',
  p_include_admin BOOLEAN DEFAULT true
) RETURNS void AS $$
BEGIN
  INSERT INTO public.push_queue (user_id, title, body, data)
  -- 1. Admin user (owner) - only if p_include_admin is true
  SELECT p.user_id, p_title, p_body, p_data
  FROM profiles p
  WHERE p.id = p_admin_id
    AND p.role = 'admin'
    AND p_include_admin = true

  UNION ALL

  -- 2. Sub-users with matching page permission AND branch assignment
  SELECT p.user_id, p_title, p_body, p_data
  FROM profiles p
  INNER JOIN user_permissions up ON up.user_id = p.user_id
    AND up.page_name = p_required_page
    AND up.has_access = true
  INNER JOIN user_branches ub ON ub.user_id = p.user_id
    AND ub.branch_id = p_branch_id
  WHERE p.admin_id = p_admin_id
    AND EXISTS (
      SELECT 1 FROM shop_settings s 
      WHERE s.user_id = (SELECT user_id FROM profiles WHERE id = p_admin_id LIMIT 1)
      AND s.fcm_unlocked = true AND s.fcm_enabled = true
      LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
