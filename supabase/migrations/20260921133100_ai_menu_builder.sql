-- AI Menu Builder Tables & Staging Storage Bucket

-- 1. Create Staging Bucket (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ai_staging_assets', 'ai_staging_assets', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Storage Policies for ai_staging_assets
CREATE POLICY "Anyone can view staging assets"
    ON storage.objects FOR SELECT
    USING ( bucket_id = 'ai_staging_assets' );

CREATE POLICY "Authenticated users can upload staging assets"
    ON storage.objects FOR INSERT
    WITH CHECK ( bucket_id = 'ai_staging_assets' AND auth.role() = 'authenticated' );

CREATE POLICY "Authenticated users can update staging assets"
    ON storage.objects FOR UPDATE
    USING ( bucket_id = 'ai_staging_assets' AND auth.role() = 'authenticated' );

CREATE POLICY "Authenticated users can delete staging assets"
    ON storage.objects FOR DELETE
    USING ( bucket_id = 'ai_staging_assets' AND auth.role() = 'authenticated' );

-- 3. AI Menu Sessions
CREATE TABLE IF NOT EXISTS public.ai_menu_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL, -- auth user id
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'extracting' CHECK (status IN ('extracting', 'matching', 'review', 'published', 'failed')),
    raw_menu_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. AI Extracted Items
CREATE TABLE IF NOT EXISTS public.ai_extracted_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.ai_menu_sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    price NUMERIC(10,2) DEFAULT 0,
    description TEXT,
    is_veg BOOLEAN DEFAULT true,
    suggested_image_url TEXT,
    confidence_score NUMERIC(5,2) DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Add RLS Policies
ALTER TABLE public.ai_menu_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_extracted_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own ai_menu_sessions" 
    ON public.ai_menu_sessions
    FOR ALL USING (auth.uid() = user_id);
    
CREATE POLICY "Users can manage items for their ai_menu_sessions" 
    ON public.ai_extracted_items
    FOR ALL USING (
        session_id IN (SELECT id FROM public.ai_menu_sessions WHERE user_id = auth.uid())
    );
