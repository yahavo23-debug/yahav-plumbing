
-- Fix 1: Remove public SELECT on report_shares (edge function uses service role key for public access)
DROP POLICY IF EXISTS "Public can verify active share tokens" ON public.report_shares;

-- Fix 2: Remove public SELECT on service_call_shares (edge function handles public access)
DROP POLICY IF EXISTS "Public can verify active share tokens" ON public.service_call_shares;

-- Fix 3: Add SELECT policy for branding_settings (needed for authenticated users)
CREATE POLICY "Authenticated users can read branding"
ON public.branding_settings
FOR SELECT
USING (auth.uid() IS NOT NULL);
