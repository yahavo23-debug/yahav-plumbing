
-- Fix the tautological WITH CHECK on the technician update policy
DROP POLICY "Technicians update non-completed calls only" ON public.service_calls;

CREATE POLICY "Technicians update non-completed calls only"
  ON public.service_calls FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'technician'::app_role)
    AND (assigned_to = auth.uid() OR created_by = auth.uid())
    AND status <> 'completed'
  )
  WITH CHECK (
    status <> 'completed'
  );
