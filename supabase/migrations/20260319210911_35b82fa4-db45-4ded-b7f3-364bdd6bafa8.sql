
-- Drop the existing permissive update policy for users
DROP POLICY "Users can update own profile" ON public.profiles;

-- Create a restricted update policy for regular users that prevents changing ban fields
CREATE POLICY "Users can update own profile (restricted)"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND banned_until IS NOT DISTINCT FROM (SELECT p.banned_until FROM public.profiles p WHERE p.user_id = auth.uid())
    AND banned_by IS NOT DISTINCT FROM (SELECT p.banned_by FROM public.profiles p WHERE p.user_id = auth.uid())
    AND ban_reason IS NOT DISTINCT FROM (SELECT p.ban_reason FROM public.profiles p WHERE p.user_id = auth.uid())
  );
