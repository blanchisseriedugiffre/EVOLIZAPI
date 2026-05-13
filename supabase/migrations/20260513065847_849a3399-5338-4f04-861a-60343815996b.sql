
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS logo_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('client-logos', 'client-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "client-logos public read" ON storage.objects;
CREATE POLICY "client-logos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-logos');

DROP POLICY IF EXISTS "client-logos admin insert" ON storage.objects;
CREATE POLICY "client-logos admin insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'client-logos' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "client-logos admin update" ON storage.objects;
CREATE POLICY "client-logos admin update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'client-logos' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "client-logos admin delete" ON storage.objects;
CREATE POLICY "client-logos admin delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'client-logos' AND public.has_role(auth.uid(), 'admin'));
