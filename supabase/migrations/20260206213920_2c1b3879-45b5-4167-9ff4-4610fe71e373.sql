
-- Helper function to check if user has any role
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
  )
$$;

-- CUSTOMERS table - restrict SELECT to users with roles only
DROP POLICY IF EXISTS "Authenticated users can read customers" ON public.customers;
CREATE POLICY "Users with role can read customers"
ON public.customers FOR SELECT
USING (public.has_any_role(auth.uid()));

-- Allow admin + secretary to insert customers
DROP POLICY IF EXISTS "Admins can manage customers" ON public.customers;
CREATE POLICY "Admins and secretaries can insert customers"
ON public.customers FOR INSERT
WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'secretary'));

-- SERVICE_CALLS - add secretary read access
CREATE POLICY "Secretaries can read all service_calls"
ON public.service_calls FOR SELECT
USING (public.has_role(auth.uid(), 'secretary'));

-- Restrict existing SELECT to require any role
DROP POLICY IF EXISTS "Users can read assigned service_calls" ON public.service_calls;
CREATE POLICY "Users can read assigned service_calls"
ON public.service_calls FOR SELECT
USING (
  public.has_any_role(auth.uid())
  AND (assigned_to = auth.uid() OR created_by = auth.uid())
);

-- Restrict INSERT to admin + technician only
DROP POLICY IF EXISTS "Users can insert service_calls" ON public.service_calls;
CREATE POLICY "Users with role can insert service_calls"
ON public.service_calls FOR INSERT
WITH CHECK (
  (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'technician'))
  AND created_by = auth.uid()
);

-- Restrict UPDATE to require any role
DROP POLICY IF EXISTS "Users can update assigned service_calls" ON public.service_calls;
CREATE POLICY "Users with role can update assigned service_calls"
ON public.service_calls FOR UPDATE
USING (
  public.has_any_role(auth.uid())
  AND (assigned_to = auth.uid() OR created_by = auth.uid())
);

-- Secretary read access to all related tables
CREATE POLICY "Secretaries can read all photos"
ON public.service_call_photos FOR SELECT
USING (public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Secretaries can read all videos"
ON public.service_call_videos FOR SELECT
USING (public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Secretaries can read all reports"
ON public.reports FOR SELECT
USING (public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Secretaries can read all quotes"
ON public.quotes FOR SELECT
USING (public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Secretaries can read all quote_items"
ON public.quote_items FOR SELECT
USING (public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Secretaries can read all profiles"
ON public.profiles FOR SELECT
USING (public.has_role(auth.uid(), 'secretary'));
