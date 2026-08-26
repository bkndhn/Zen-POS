CREATE TABLE IF NOT EXISTS public.shifts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id UUID NOT NULL,
    branch_id UUID,
    user_id UUID NOT NULL,
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    opening_cash NUMERIC(10,2) NOT NULL DEFAULT 0,
    actual_closing_cash NUMERIC(10,2),
    expected_closing_cash NUMERIC(10,2),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for users based on admin_id" ON public.shifts
    FOR SELECT USING (
        auth.uid() IN (
            SELECT user_id FROM profiles WHERE id = admin_id OR admin_id = shifts.admin_id
        )
    );

CREATE POLICY "Enable insert for authenticated users" ON public.shifts
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT user_id FROM profiles WHERE id = admin_id OR admin_id = shifts.admin_id
        )
    );

CREATE POLICY "Enable update for users based on admin_id" ON public.shifts
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT user_id FROM profiles WHERE id = admin_id OR admin_id = shifts.admin_id
        )
    );

CREATE POLICY "Enable delete for admin users only" ON public.shifts
    FOR DELETE USING (
        auth.uid() IN (
            SELECT user_id FROM profiles WHERE id = admin_id AND role = 'admin'
        )
    );
