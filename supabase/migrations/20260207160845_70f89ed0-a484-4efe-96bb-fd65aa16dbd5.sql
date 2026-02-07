
-- Drop existing policies on service_calls
DROP POLICY IF EXISTS "Admins can manage service_calls" ON public.service_calls;
DROP POLICY IF EXISTS "Contractors can read service_calls for assigned customers" ON public.service_calls;
DROP POLICY IF EXISTS "Secretaries can read all service_calls" ON public.service_calls;
DROP POLICY IF EXISTS "Technicians can update assigned service_calls" ON public.service_calls;
DROP POLICY IF EXISTS "Users can read assigned service_calls" ON public.service_calls;
DROP POLICY IF EXISTS "Users with role can insert service_calls" ON public.service_calls;

-- 1. SELECT: Staff (admin, secretary, technician assigned/created)
CREATE POLICY "Staff can view service calls"
ON public.service_calls FOR SELECT
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'secretary'::app_role)
  OR (has_role(auth.uid(), 'technician'::app_role) AND (assigned_to = auth.uid() OR created_by = auth.uid()))
);

-- 2. SELECT: Contractors (assigned customers only) — preserved from before
CREATE POLICY "Contractors can read service_calls for assigned customers"
ON public.service_calls FOR SELECT
USING (
  has_role(auth.uid(), 'contractor'::app_role) 
  AND contractor_can_access_customer(auth.uid(), customer_id)
);

-- 3. UPDATE: Technicians — one-way door (cannot edit completed calls)
CREATE POLICY "Technicians update non-completed calls only"
ON public.service_calls FOR UPDATE
USING (
  has_role(auth.uid(), 'technician'::app_role) 
  AND (assigned_to = auth.uid() OR created_by = auth.uid())
  AND status != 'completed'
)
WITH CHECK (
  status != 'completed' OR status = 'completed'
  -- allows setting TO completed, but once saved as completed, USING blocks next edit
);

-- 4. UPDATE: Admins — full access
CREATE POLICY "Admins can update anything"
ON public.service_calls FOR UPDATE
USING (is_admin(auth.uid()));

-- 5. INSERT: Admin, secretary, and technicians can create
CREATE POLICY "Staff can create calls"
ON public.service_calls FOR INSERT
WITH CHECK (
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretary'::app_role) OR has_role(auth.uid(), 'technician'::app_role))
  AND created_by = auth.uid()
);

-- 6. DELETE: Admin only
CREATE POLICY "Admins can delete calls"
ON public.service_calls FOR DELETE
USING (is_admin(auth.uid()));
