-- Create table for aggregator integration settings (API keys, webhooks)
CREATE TABLE IF NOT EXISTS public.aggregator_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL,
    branch_id UUID,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('urbanpiper', 'zomato', 'swiggy', 'custom')),
    api_key TEXT,
    webhook_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(admin_id, branch_id, provider)
);

-- Create table for incoming online orders via webhook
CREATE TABLE IF NOT EXISTS public.online_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL,
    branch_id UUID,
    channel VARCHAR(50) NOT NULL, -- e.g., 'zomato', 'swiggy', 'urbanpiper'
    order_id VARCHAR(100) NOT NULL,
    customer_name VARCHAR(255),
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, accepted, rejected, completed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.aggregator_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;

-- Policies for aggregator_integrations
CREATE POLICY "aggregator_integrations_select" ON public.aggregator_integrations
    FOR SELECT USING (auth.uid() = admin_id);

CREATE POLICY "aggregator_integrations_insert" ON public.aggregator_integrations
    FOR INSERT WITH CHECK (auth.uid() = admin_id);

CREATE POLICY "aggregator_integrations_update" ON public.aggregator_integrations
    FOR UPDATE USING (auth.uid() = admin_id);

CREATE POLICY "aggregator_integrations_delete" ON public.aggregator_integrations
    FOR DELETE USING (auth.uid() = admin_id);

-- Policies for online_orders
CREATE POLICY "online_orders_select" ON public.online_orders
    FOR SELECT USING (auth.uid() = admin_id);

CREATE POLICY "online_orders_insert" ON public.online_orders
    FOR INSERT WITH CHECK (auth.uid() = admin_id OR auth.role() = 'anon'); -- Anon can insert via webhook

CREATE POLICY "online_orders_update" ON public.online_orders
    FOR UPDATE USING (auth.uid() = admin_id);

CREATE POLICY "online_orders_delete" ON public.online_orders
    FOR DELETE USING (auth.uid() = admin_id);
