
-- Allow secretaries to insert reports
CREATE POLICY "Secretaries can insert reports"
ON public.reports
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'secretary'::app_role) AND (created_by = auth.uid()));

-- Allow secretaries to update reports
CREATE POLICY "Secretaries can update reports"
ON public.reports
FOR UPDATE
USING (has_role(auth.uid(), 'secretary'::app_role));
