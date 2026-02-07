
-- Fix service_calls SELECT policies: change from RESTRICTIVE to PERMISSIVE
-- Drop existing restrictive SELECT policies
DROP POLICY IF EXISTS "Contractors can read service_calls for assigned customers" ON public.service_calls;
DROP POLICY IF EXISTS "Secretaries can read all service_calls" ON public.service_calls;
DROP POLICY IF EXISTS "Users can read assigned service_calls" ON public.service_calls;

-- Recreate as PERMISSIVE (default) so ANY matching policy grants access
CREATE POLICY "Contractors can read service_calls for assigned customers"
ON public.service_calls
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'contractor'::app_role)
  AND contractor_can_access_customer(auth.uid(), customer_id)
);

CREATE POLICY "Secretaries can read all service_calls"
ON public.service_calls
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'secretary'::app_role));

CREATE POLICY "Users can read assigned service_calls"
ON public.service_calls
FOR SELECT
TO authenticated
USING (
  has_any_role(auth.uid())
  AND (assigned_to = auth.uid() OR created_by = auth.uid())
);
