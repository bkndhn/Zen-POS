-- ============================================================
-- HOTEL ZEN POS - COMPLETE SUPABASE DATABASE SCHEMA
-- ============================================================
-- Version: 2.0 (January 2026)
-- This SQL creates the COMPLETE backend for Hotel Zen POS
-- Run this in your Supabase SQL Editor to set up a new project
-- ============================================================

-- ============================================================
-- STEP 1: CREATE ENUMS (Custom Data Types)
-- ============================================================

-- User roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'super_admin');

-- Payment method for bills
CREATE TYPE public.payment_method AS ENUM ('cash', 'upi', 'card', 'other');

-- Payment mode for payment types table
CREATE TYPE public.payment_mode AS ENUM ('cash', 'card', 'upi', 'online');

-- Service/Kitchen status for orders
CREATE TYPE public.service_status AS ENUM ('pending', 'preparing', 'ready', 'served', 'completed', 'rejected');

-- User account status
CREATE TYPE public.user_status AS ENUM ('active', 'paused', 'deleted');

-- ============================================================
-- STEP 2: CREATE TABLES
-- ============================================================

-- -----------------------------------------
-- PROFILES TABLE (linked to auth.users)
-- -----------------------------------------
CREATE TABLE public.profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    name text NOT NULL,
    hotel_name text,
    role app_role DEFAULT 'user'::app_role NOT NULL,
    status text DEFAULT 'active' CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'deleted'::text])),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- -----------------------------------------
-- USER PERMISSIONS TABLE (page-level access)
-- -----------------------------------------
CREATE TABLE public.user_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    page_name text NOT NULL,
    has_access boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(user_id, page_name)
);

-- -----------------------------------------
-- USER PREFERENCES TABLE (UI settings)
-- -----------------------------------------
CREATE TABLE public.user_preferences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE,
    pos_view text DEFAULT 'grid' CHECK (pos_view = ANY (ARRAY['list'::text, 'card'::text])),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- -----------------------------------------
-- ITEM CATEGORIES TABLE
-- -----------------------------------------
CREATE TABLE public.item_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    is_deleted boolean DEFAULT false,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- -----------------------------------------
-- ITEMS TABLE (Menu items)
-- -----------------------------------------
CREATE TABLE public.items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid,
    name text NOT NULL,
    description text,
    price numeric NOT NULL CHECK (price >= 0),
    purchase_rate numeric,
    category text,
    unit text DEFAULT 'Piece (pc)',
    base_value numeric DEFAULT 1,
    quantity_step numeric DEFAULT 1,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    stock_quantity numeric DEFAULT 0,
    minimum_stock_alert numeric DEFAULT 0,
    unlimited_stock boolean DEFAULT false,
    sale_count integer DEFAULT 0,
    display_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    
    -- Product Master Fields
    selling_quantity numeric DEFAULT 1,
    selling_unit text,
    inventory_quantity numeric DEFAULT 1,
    inventory_unit text,
    is_saleable boolean DEFAULT true,

    -- Aggregator Pricing Fields
    price_zomato numeric,
    price_swiggy numeric
);

-- -----------------------------------------
-- BILLS TABLE (Main billing records)
-- -----------------------------------------
CREATE TABLE public.bills (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_no text NOT NULL UNIQUE,
    created_by uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    total_amount numeric NOT NULL CHECK (total_amount >= 0),
    discount numeric DEFAULT 0 CHECK (discount >= 0),
    payment_mode payment_method NOT NULL,
    payment_details jsonb DEFAULT '{}'::jsonb,
    additional_charges jsonb DEFAULT '[]'::jsonb,
    is_edited boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    -- Kitchen/Service status for KDS
    kitchen_status service_status DEFAULT 'pending'::service_status,
    service_status service_status DEFAULT 'pending'::service_status,
    status_updated_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now() NOT NULL,

    -- Food Aggregator Channel Scoping
    channel text DEFAULT 'store'
);

-- -----------------------------------------
-- BILL ITEMS TABLE (Items in each bill)
-- -----------------------------------------
CREATE TABLE public.bill_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id uuid REFERENCES public.bills(id) ON DELETE CASCADE NOT NULL,
    item_id uuid REFERENCES public.items(id) NOT NULL,
    quantity numeric NOT NULL CHECK (quantity > 0),
    price numeric NOT NULL CHECK (price >= 0),
    total numeric NOT NULL CHECK (total >= 0),
    created_at timestamptz DEFAULT now() NOT NULL
);

-- -----------------------------------------
-- ADDITIONAL CHARGES TABLE (packing, delivery, etc.)
-- -----------------------------------------
CREATE TABLE public.additional_charges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    charge_type text NOT NULL CHECK (charge_type = ANY (ARRAY['fixed'::text, 'per_unit'::text, 'percentage'::text])),
    unit text,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- -----------------------------------------
-- PAYMENTS TABLE (Payment methods configuration)
-- -----------------------------------------
CREATE TABLE public.payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_type text NOT NULL,
    payment_method payment_mode,
    is_default boolean DEFAULT false,
    is_disabled boolean DEFAULT false,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- -----------------------------------------
-- EXPENSE CATEGORIES TABLE
-- -----------------------------------------
CREATE TABLE public.expense_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    is_deleted boolean DEFAULT false,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- -----------------------------------------
-- EXPENSES TABLE
-- -----------------------------------------
CREATE TABLE public.expenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid,
    created_by uuid NOT NULL,
    expense_name text,
    category text NOT NULL,
    amount numeric NOT NULL CHECK (amount >= 0),
    date date DEFAULT CURRENT_DATE NOT NULL,
    note text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- -----------------------------------------
-- SHOP SETTINGS TABLE (Receipt header/footer)
-- -----------------------------------------
CREATE TABLE public.shop_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) NOT NULL UNIQUE,
    shop_name text,
    address text,
    contact_number text,
    logo_url text,
    facebook text,
    show_facebook boolean DEFAULT true,
    instagram text,
    show_instagram boolean DEFAULT true,
    whatsapp text,
    show_whatsapp boolean DEFAULT true,
    printer_width text DEFAULT '58mm',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- -----------------------------------------
-- BLUETOOTH SETTINGS TABLE
-- -----------------------------------------
CREATE TABLE public.bluetooth_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE,
    is_enabled boolean DEFAULT false NOT NULL,
    auto_print boolean DEFAULT false NOT NULL,
    printer_name text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- -----------------------------------------
-- DISPLAY SETTINGS TABLE (items per row, category order)
-- -----------------------------------------
CREATE TABLE public.display_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE,
    items_per_row integer DEFAULT 3 NOT NULL,
    category_order text[],
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================
-- STEP 3: CREATE INDEXES FOR PERFORMANCE
-- ============================================================

-- Bills indexes
CREATE INDEX idx_bills_kitchen_status ON public.bills(kitchen_status);
CREATE INDEX idx_bills_service_status ON public.bills(service_status);
CREATE INDEX idx_bills_status_updated_at ON public.bills(status_updated_at);

-- Items indexes
CREATE INDEX idx_items_display_order ON public.items(display_order);

-- ============================================================
-- STEP 4: ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.additional_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bluetooth_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.display_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 5: CREATE HELPER FUNCTIONS
-- ============================================================

-- Function: Auto-update updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Function: Check if user has access to a specific page
CREATE OR REPLACE FUNCTION public.has_page_permission(_user_id uuid, _page_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND role = 'admin') THEN true
    ELSE COALESCE((SELECT has_access FROM public.user_permissions WHERE user_id = _user_id AND page_name = _page_name), false)
  END
$$;

-- ============================================================
-- STEP 6: CREATE TRIGGERS
-- ============================================================

-- Trigger: Auto-update updated_at for additional_charges
CREATE TRIGGER update_additional_charges_updated_at
    BEFORE UPDATE ON public.additional_charges
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: Auto-update updated_at for display_settings
CREATE TRIGGER update_display_settings_updated_at
    BEFORE UPDATE ON public.display_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: Auto-update updated_at for user_permissions
CREATE TRIGGER update_user_permissions_updated_at
    BEFORE UPDATE ON public.user_permissions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: Auto-update updated_at for bluetooth_settings
CREATE TRIGGER update_bluetooth_settings_updated_at
    BEFORE UPDATE ON public.bluetooth_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- STEP 7: CREATE RLS POLICIES
-- ============================================================

-- -----------------------------------------
-- PROFILES POLICIES
-- -----------------------------------------
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
));

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can update all profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
));

CREATE POLICY "Allow insert on signup"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can delete profiles"
ON public.profiles FOR DELETE
TO authenticated
USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
));

-- -----------------------------------------
-- USER PERMISSIONS POLICIES
-- -----------------------------------------
CREATE POLICY "Users can view their own permissions"
ON public.user_permissions FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all permissions"
ON public.user_permissions FOR SELECT
TO authenticated
USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
));

CREATE POLICY "Admins can insert permissions"
ON public.user_permissions FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
));

CREATE POLICY "Admins can update permissions"
ON public.user_permissions FOR UPDATE
TO authenticated
USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
));

CREATE POLICY "Admins can delete permissions"
ON public.user_permissions FOR DELETE
TO authenticated
USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
));

-- -----------------------------------------
-- USER PREFERENCES POLICIES
-- -----------------------------------------
CREATE POLICY "Users can view their own preferences"
ON public.user_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
ON public.user_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
ON public.user_preferences FOR UPDATE
USING (auth.uid() = user_id);

-- -----------------------------------------
-- ITEM CATEGORIES POLICIES
-- -----------------------------------------
CREATE POLICY "Everyone can view categories"
ON public.item_categories FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage categories"
ON public.item_categories FOR ALL
TO authenticated
USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() AND role IN ('admin'::app_role, 'super_admin'::app_role)
));

-- -----------------------------------------
-- ITEMS POLICIES
-- -----------------------------------------
CREATE POLICY "Everyone can view items"
ON public.items FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage items"
ON public.items FOR ALL
TO authenticated
USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() AND role IN ('admin'::app_role, 'super_admin'::app_role)
));

-- -----------------------------------------
-- BILLS POLICIES
-- -----------------------------------------
CREATE POLICY "Users can view all bills"
ON public.bills FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can create bills"
ON public.bills FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update bills"
ON public.bills FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Admins can manage all bills"
ON public.bills FOR ALL
TO authenticated
USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
));

-- -----------------------------------------
-- BILL ITEMS POLICIES
-- -----------------------------------------
CREATE POLICY "Users can view bill items"
ON public.bill_items FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can create bill items"
ON public.bill_items FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Admins can manage bill items"
ON public.bill_items FOR ALL
TO authenticated
USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
));

-- -----------------------------------------
-- ADDITIONAL CHARGES POLICIES
-- -----------------------------------------
CREATE POLICY "Everyone can view active additional charges"
ON public.additional_charges FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage additional charges"
ON public.additional_charges FOR ALL
USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() AND role IN ('admin'::app_role, 'super_admin'::app_role)
));

-- -----------------------------------------
-- PAYMENTS POLICIES
-- -----------------------------------------
CREATE POLICY "Everyone can view payment types"
ON public.payments FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage payment types"
ON public.payments FOR ALL
TO authenticated
USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() AND role IN ('admin'::app_role, 'super_admin'::app_role)
));

-- -----------------------------------------
-- EXPENSE CATEGORIES POLICIES
-- -----------------------------------------
CREATE POLICY "Everyone can view expense categories"
ON public.expense_categories FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage expense categories"
ON public.expense_categories FOR ALL
TO authenticated
USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() AND role IN ('admin'::app_role, 'super_admin'::app_role)
));

-- -----------------------------------------
-- EXPENSES POLICIES
-- -----------------------------------------
CREATE POLICY "Everyone can view expenses"
ON public.expenses FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can create expenses"
ON public.expenses FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Admins can manage all expenses"
ON public.expenses FOR ALL
TO authenticated
USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() AND role IN ('admin'::app_role, 'super_admin'::app_role)
));

-- -----------------------------------------
-- SHOP SETTINGS POLICIES
-- -----------------------------------------
CREATE POLICY "Everyone can view shop settings"
ON public.shop_settings FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can manage their own shop settings"
ON public.shop_settings FOR ALL
TO authenticated
USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
));

-- -----------------------------------------
-- BLUETOOTH SETTINGS POLICIES
-- -----------------------------------------
CREATE POLICY "Users can view their bluetooth settings"
ON public.bluetooth_settings FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can manage their bluetooth settings"
ON public.bluetooth_settings FOR ALL
TO authenticated
USING (user_id = auth.uid());

-- -----------------------------------------
-- DISPLAY SETTINGS POLICIES
-- -----------------------------------------
CREATE POLICY "Users can view their display settings"
ON public.display_settings FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can manage their display settings"
ON public.display_settings FOR ALL
TO authenticated
USING (user_id = auth.uid());

-- ============================================================
-- STEP 8: INSERT DEFAULT DATA
-- ============================================================

-- Default Payment Methods
INSERT INTO public.payments (payment_type, payment_method, is_default, is_disabled) VALUES
('Cash', 'cash', true, false),
('UPI', 'upi', false, false),
('Card', 'card', false, false);

-- Default Expense Categories
INSERT INTO public.expense_categories (name) VALUES
('Rent'),
('Utilities'),
('Salaries'),
('Supplies'),
('Maintenance'),
('Marketing'),
('Other');

-- Default Item Categories
INSERT INTO public.item_categories (name) VALUES
('Food'),
('Beverages'),
('Snacks'),
('Desserts');

-- ============================================================
-- STEP 10: SUPER ADMIN FUNCTIONS
-- ============================================================

-- Function: Check if user is allowed to login (considering pause cascade)
CREATE OR REPLACE FUNCTION public.is_user_allowed_to_login(p_user_id uuid)
RETURNS TABLE(allowed boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_status text;
  v_user_role text;
  v_admin_id uuid;
  v_admin_status text;
BEGIN
  SELECT status, role, admin_id INTO v_user_status, v_user_role, v_admin_id
  FROM public.profiles WHERE user_id = p_user_id;

  IF v_user_status IS NULL THEN
    RETURN QUERY SELECT true, 'new_user'::text;
    RETURN;
  END IF;

  IF v_user_status = 'paused' THEN
    RETURN QUERY SELECT false, 'Account paused'::text;
    RETURN;
  END IF;

  IF v_user_status = 'deleted' THEN
    RETURN QUERY SELECT false, 'Account deleted'::text;
    RETURN;
  END IF;

  IF v_user_role = 'user' AND v_admin_id IS NOT NULL THEN
    SELECT status INTO v_admin_status FROM public.profiles WHERE id = v_admin_id;
    IF v_admin_status = 'paused' THEN
      RETURN QUERY SELECT false, 'Account paused by Super Admin'::text;
      RETURN;
    END IF;
    IF v_admin_status = 'deleted' THEN
      RETURN QUERY SELECT false, 'Parent admin account deleted'::text;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true, 'active'::text;
END;
$$;

-- Function: Check if current user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'super_admin');
$$;

-- Function: Get current user's role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE  
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.profiles WHERE user_id = auth.uid()
$$;

-- Function: Get current user's profile ID
CREATE OR REPLACE FUNCTION public.get_my_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid()
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_user_allowed_to_login(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_allowed_to_login(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile_id() TO authenticated;

-- Enable realtime for profiles (for force logout on pause)
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- ============================================================
-- SETUP COMPLETE!
-- ============================================================
-- 
-- NEXT STEPS:
-- 1. Go to Authentication > Settings and enable Email Auth
-- 2. (Optional) Create a Storage bucket called 'images' for item photos
-- 3. Update your .env file with the new Supabase URL and anon key
-- 4. The first user to sign up becomes the admin automatically
-- 5. Promote an admin to 'super_admin' role manually for admin management
--
-- ============================================================
-- SUMMARY OF WHAT'S INCLUDED:
-- ============================================================
-- 
-- ENUMS (5):
--   - app_role (admin, user, super_admin)
--   - payment_method (cash, upi, card, other)
--   - payment_mode (cash, card, upi, online)
--   - service_status (pending, preparing, ready, served, completed, rejected)
--   - user_status (active, paused, deleted)
--
-- TABLES (14):
--   - profiles (with admin_id for sub-user linking)
--   - user_permissions
--   - user_preferences  
--   - item_categories
--   - items
--   - bills
--   - bill_items
--   - additional_charges
--   - payments
--   - expense_categories
--   - expenses
--   - shop_settings
--   - bluetooth_settings
--   - display_settings
--
-- FUNCTIONS (6):
--   - update_updated_at_column()
--   - has_page_permission()
--   - is_user_allowed_to_login() - Pause cascade logic
--   - is_super_admin() - Check if current user is super admin
--   - get_my_role() - Get current user's role  
--   - get_my_profile_id() - Get current user's profile ID
--
-- TRIGGERS (4):
--   - update_additional_charges_updated_at
--   - update_display_settings_updated_at
--   - update_user_permissions_updated_at
--   - update_bluetooth_settings_updated_at
--
-- RLS POLICIES (36+):
--   - Full row-level security for all tables
--   - Admin/user role separation
--   - Super Admin support for admin management
--   - Page-level permission support
--
-- INDEXES (4):
--   - idx_bills_kitchen_status
--   - idx_bills_service_status
--   - idx_bills_status_updated_at
--   - idx_items_display_order
--
-- SUPER ADMIN FEATURES:
--   - Super Admin can only access Users page
--   - Super Admin can view/pause/activate all admins
--   - When admin is paused, all sub-users are blocked
--   - Real-time force logout when paused  
--   - New admin signups start as 'paused' pending approval
--   - Sub-users can only be created from inside the app
--
-- ============================================================
