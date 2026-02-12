
-- Allow secretaries to update customers (but NOT delete)
CREATE POLICY "Secretaries can update customers"
ON public.customers
FOR UPDATE
USING (has_role(auth.uid(), 'secretary'::app_role));

-- Allow secretaries to update service calls (not delete)
CREATE POLICY "Secretaries can update service calls"
ON public.service_calls
FOR UPDATE
USING (has_role(auth.uid(), 'secretary'::app_role));
