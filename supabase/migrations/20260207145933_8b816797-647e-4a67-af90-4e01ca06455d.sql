
-- Add ban fields to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS banned_until timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ban_reason text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS banned_by uuid DEFAULT NULL;

-- Add index for quick ban lookups
CREATE INDEX IF NOT EXISTS idx_profiles_banned_until ON public.profiles(banned_until) WHERE banned_until IS NOT NULL;
