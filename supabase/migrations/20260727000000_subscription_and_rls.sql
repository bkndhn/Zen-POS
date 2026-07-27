-- Migration: Subscription Management & RLS Security Hardening
-- Date: 2026-07-27

-- 1. Add subscription and force logout columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'trial';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_amount INTEGER DEFAULT 999;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS force_logout BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS force_logout_reason TEXT;

-- 2. Super Admin payment settings table
CREATE TABLE IF NOT EXISTS payment_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upi_id TEXT,
    upi_qr_image_url TEXT,
    default_amount INTEGER DEFAULT 999,
    payment_instructions TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Payment history table  
CREATE TABLE IF NOT EXISTS subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES profiles(id),
    amount INTEGER NOT NULL,
    payment_method TEXT DEFAULT 'upi',
    transaction_ref TEXT,
    status TEXT DEFAULT 'pending',
    confirmed_by UUID REFERENCES profiles(id),
    confirmed_at TIMESTAMPTZ,
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

-- Allow Super Admin full access to payment_settings
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'payment_settings' AND policyname = 'super_admin_payment_settings'
    ) THEN
        CREATE POLICY "super_admin_payment_settings" ON payment_settings
            FOR ALL USING (
                EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'super_admin')
            );
    END IF;
END $$;

-- Allow all authenticated users read access to payment_settings
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'payment_settings' AND policyname = 'authenticated_read_payment_settings'
    ) THEN
        CREATE POLICY "authenticated_read_payment_settings" ON payment_settings
            FOR SELECT USING (auth.role() = 'authenticated');
    END IF;
END $$;

-- Policies for subscription_payments
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'subscription_payments' AND policyname = 'super_admin_subscription_payments'
    ) THEN
        CREATE POLICY "super_admin_subscription_payments" ON subscription_payments
            FOR ALL USING (
                EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'super_admin')
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'subscription_payments' AND policyname = 'tenant_subscription_payments'
    ) THEN
        CREATE POLICY "tenant_subscription_payments" ON subscription_payments
            FOR ALL USING (
                admin_id = (SELECT id FROM profiles WHERE user_id = auth.uid()) OR
                admin_id = (SELECT admin_id FROM profiles WHERE user_id = auth.uid())
            );
    END IF;
END $$;
