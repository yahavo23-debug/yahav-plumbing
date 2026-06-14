DROP POLICY IF EXISTS "Technicians update non-completed calls only" ON public.service_calls;
CREATE POLICY "Technicians update non-completed calls only"
ON public.service_calls
FOR UPDATE
USING (
  has_role(auth.uid(), 'technician'::app_role)
  AND ((assigned_to = auth.uid()) OR (created_by = auth.uid()))
  AND (status <> 'completed'::text)
)
WITH CHECK (
  has_role(auth.uid(), 'technician'::app_role)
  AND ((assigned_to = auth.uid()) OR (created_by = auth.uid()))
  AND (status IN ('open','in_progress','pending_customer'))
);