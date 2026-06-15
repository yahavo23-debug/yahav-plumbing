DROP POLICY IF EXISTS "Technicians update non-completed calls only" ON public.service_calls;
CREATE POLICY "Technicians update non-completed calls only" ON public.service_calls
FOR UPDATE
USING (
  has_role(auth.uid(), 'technician'::app_role)
  AND ((assigned_to = auth.uid()) OR (created_by = auth.uid()))
  AND status <> 'completed'
  AND status <> 'cancelled'
)
WITH CHECK (
  has_role(auth.uid(), 'technician'::app_role)
  AND ((assigned_to = auth.uid()) OR (created_by = auth.uid()))
  AND status = ANY (ARRAY['open'::text, 'in_progress'::text, 'pending_customer'::text])
);