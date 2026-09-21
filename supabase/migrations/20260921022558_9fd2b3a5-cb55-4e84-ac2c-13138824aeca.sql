DROP POLICY IF EXISTS "Users can view their own bluetooth settings" ON public.bluetooth_settings;
DROP POLICY IF EXISTS "Users can insert their own bluetooth settings" ON public.bluetooth_settings;
DROP POLICY IF EXISTS "Users can update their own bluetooth settings" ON public.bluetooth_settings;
CREATE POLICY "Users can view their own bluetooth settings" ON public.bluetooth_settings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert their own bluetooth settings" ON public.bluetooth_settings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own bluetooth settings" ON public.bluetooth_settings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage their own display settings" ON public.display_settings;
CREATE POLICY "Users can manage their own display settings" ON public.display_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own devices" ON public.user_devices;
DROP POLICY IF EXISTS "Users can view own devices" ON public.user_devices;
CREATE POLICY "Users can manage own devices" ON public.user_devices FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own devices" ON public.user_devices FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can update their own preferences" ON public.user_preferences;
CREATE POLICY "Users can view their own preferences" ON public.user_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own preferences" ON public.user_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own preferences" ON public.user_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.bluetooth_settings FROM anon;
REVOKE ALL ON public.display_settings FROM anon;
REVOKE ALL ON public.user_devices FROM anon;
REVOKE ALL ON public.user_preferences FROM anon;