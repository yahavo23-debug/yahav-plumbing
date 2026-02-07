-- Drop overly permissive public access to video_share_tokens
DROP POLICY IF EXISTS "Public can verify video tokens" ON public.video_share_tokens;

-- Drop overly permissive anon storage policies (signed URLs bypass RLS, so they'll still work)
DROP POLICY IF EXISTS "Public can read shared report PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Public can read shared photos" ON storage.objects;
DROP POLICY IF EXISTS "Public can read shared videos" ON storage.objects;
DROP POLICY IF EXISTS "Public can read shared signatures" ON storage.objects;