-- ============================================================
-- P1-C: Customer Photo Reviews on Portal
-- ============================================================

CREATE TABLE IF NOT EXISTS public.customer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  item_name text,
  customer_name text,
  customer_identifier text,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text,
  photo_url text,
  is_approved boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_reviews_admin_idx ON public.customer_reviews (admin_id, is_approved);
CREATE INDEX IF NOT EXISTS customer_reviews_item_idx ON public.customer_reviews (item_id, is_approved);

ALTER TABLE public.customer_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read approved reviews" ON public.customer_reviews;
CREATE POLICY "Public can read approved reviews" ON public.customer_reviews
  FOR SELECT USING (is_approved = true);

DROP POLICY IF EXISTS "Public can submit reviews" ON public.customer_reviews;
CREATE POLICY "Public can submit reviews" ON public.customer_reviews
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admin manages reviews" ON public.customer_reviews;
CREATE POLICY "Admin manages reviews" ON public.customer_reviews
  FOR ALL USING (auth.uid() IN (
    SELECT user_id FROM public.profiles WHERE id = admin_id
  ));

-- Storage bucket for review photos (run once)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('review-photos', 'review-photos', true, 5242880,
        ARRAY['image/jpeg','image/jpg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can upload review photos" ON storage.objects;
CREATE POLICY "Public can upload review photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'review-photos');

DROP POLICY IF EXISTS "Public can read review photos" ON storage.objects;
CREATE POLICY "Public can read review photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'review-photos');
