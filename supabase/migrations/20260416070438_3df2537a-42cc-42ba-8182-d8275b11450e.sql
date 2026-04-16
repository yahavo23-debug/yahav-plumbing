-- Fix 1: Drop public/anon SELECT policies that expose share tokens
DROP POLICY IF EXISTS "Public can verify active share tokens" ON public.service_call_shares;
DROP POLICY IF EXISTS "Public can verify active share tokens" ON public.report_shares;

-- Fix 2: Restrict change_audit_logs INSERT to only allow the trigger (changed_by = auth.uid())
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "System create change audit logs" ON public.change_audit_logs;

-- Replace with a policy that ensures changed_by matches the caller
CREATE POLICY "Authenticated users insert own audit logs"
ON public.change_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (changed_by = auth.uid());