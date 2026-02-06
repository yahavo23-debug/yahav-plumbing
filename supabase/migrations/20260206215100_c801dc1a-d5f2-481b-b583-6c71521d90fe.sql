
-- 1. Create contractor_customer_access table
CREATE TABLE public.contractor_customer_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_user_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE(contractor_user_id, customer_id)
);

ALTER TABLE public.contractor_customer_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contractor access"
ON public.contractor_customer_access FOR ALL
USING (public.is_admin(auth.uid()));

CREATE POLICY "Contractors can read own access"
ON public.contractor_customer_access FOR SELECT
USING (contractor_user_id = auth.uid());

-- 2. Helper functions
CREATE OR REPLACE FUNCTION public.contractor_can_access_customer(_user_id uuid, _customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contractor_customer_access
    WHERE contractor_user_id = _user_id
    AND customer_id = _customer_id
  )
$$;

CREATE OR REPLACE FUNCTION public.get_customer_for_sc(_sc_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT customer_id FROM public.service_calls WHERE id = _sc_id
$$;

-- 3. Update customers SELECT - exclude contractor from general access
DROP POLICY IF EXISTS "Users with role can read customers" ON public.customers;
CREATE POLICY "Staff can read all customers"
ON public.customers FOR SELECT
USING (
  public.is_admin(auth.uid()) 
  OR public.has_role(auth.uid(), 'technician') 
  OR public.has_role(auth.uid(), 'secretary')
);

CREATE POLICY "Contractors can read assigned customers"
ON public.customers FOR SELECT
USING (
  public.has_role(auth.uid(), 'contractor')
  AND public.contractor_can_access_customer(auth.uid(), id)
);

-- 4. Contractor service_calls read access
CREATE POLICY "Contractors can read service_calls for assigned customers"
ON public.service_calls FOR SELECT
USING (
  public.has_role(auth.uid(), 'contractor')
  AND public.contractor_can_access_customer(auth.uid(), customer_id)
);

-- Update service_calls UPDATE to exclude contractor and secretary (read-only roles)
DROP POLICY IF EXISTS "Users with role can update assigned service_calls" ON public.service_calls;
CREATE POLICY "Technicians can update assigned service_calls"
ON public.service_calls FOR UPDATE
USING (
  public.has_role(auth.uid(), 'technician')
  AND (assigned_to = auth.uid() OR created_by = auth.uid())
);

-- 5. Contractor read access for related tables
CREATE POLICY "Contractors can read photos for assigned customers"
ON public.service_call_photos FOR SELECT
USING (
  public.has_role(auth.uid(), 'contractor')
  AND public.contractor_can_access_customer(auth.uid(), public.get_customer_for_sc(service_call_id))
);

CREATE POLICY "Contractors can read videos for assigned customers"
ON public.service_call_videos FOR SELECT
USING (
  public.has_role(auth.uid(), 'contractor')
  AND public.contractor_can_access_customer(auth.uid(), public.get_customer_for_sc(service_call_id))
);

CREATE POLICY "Contractors can read reports for assigned customers"
ON public.reports FOR SELECT
USING (
  public.has_role(auth.uid(), 'contractor')
  AND public.contractor_can_access_customer(auth.uid(), public.get_customer_for_sc(service_call_id))
);

CREATE POLICY "Contractors can read quotes for assigned customers"
ON public.quotes FOR SELECT
USING (
  public.has_role(auth.uid(), 'contractor')
  AND public.contractor_can_access_customer(auth.uid(), public.get_customer_for_sc(service_call_id))
);

CREATE POLICY "Contractors can read quote_items for assigned customers"
ON public.quote_items FOR SELECT
USING (
  public.has_role(auth.uid(), 'contractor')
  AND public.contractor_can_access_customer(
    auth.uid(), 
    public.get_customer_for_sc(public.get_sc_id_for_quote(quote_id))
  )
);
