-- Capacitor App Access Gate
-- Super admin controls which clients can use the native Capacitor app

ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS native_app_unlocked BOOLEAN DEFAULT false;

-- Storage bucket for APK releases
INSERT INTO storage.buckets (id, name, public)
VALUES ('app-releases', 'app-releases', false)
ON CONFLICT (id) DO NOTHING;

-- Super admins can upload/manage APK files
CREATE POLICY "Super admins can manage app releases"
ON storage.objects FOR ALL
USING (bucket_id = 'app-releases' AND EXISTS (
  SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'super_admin'
))
WITH CHECK (bucket_id = 'app-releases' AND EXISTS (
  SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'super_admin'
));

-- Authenticated users can download APK (gate check is in frontend)
CREATE POLICY "Authenticated users can download app releases"
ON storage.objects FOR SELECT
USING (bucket_id = 'app-releases' AND auth.uid() IS NOT NULL);
