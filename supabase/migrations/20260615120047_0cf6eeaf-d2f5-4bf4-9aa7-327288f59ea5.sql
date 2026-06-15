
-- 1) Restrict secretaries from setting status to completed/cancelled via WITH CHECK
DROP POLICY IF EXISTS "Secretaries can update service calls" ON public.service_calls;
CREATE POLICY "Secretaries can update service calls"
ON public.service_calls
FOR UPDATE
USING (has_role(auth.uid(), 'secretary'::app_role))
WITH CHECK (
  has_role(auth.uid(), 'secretary'::app_role)
  AND status = ANY (ARRAY['open'::text, 'in_progress'::text, 'pending_customer'::text])
);

-- 2) Extend can_access_service_call to include secretaries
CREATE OR REPLACE FUNCTION public.can_access_service_call(_user_id uuid, _service_call_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.service_calls
    WHERE id = _service_call_id
    AND (
      public.is_admin(_user_id)
      OR public.has_role(_user_id, 'secretary'::app_role)
      OR assigned_to = _user_id
      OR created_by = _user_id
    )
  )
$function$;
