
-- Insurance reports table
CREATE TABLE public.insurance_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_call_id UUID NOT NULL REFERENCES public.service_calls(id) ON DELETE CASCADE,
  report_mode TEXT NOT NULL DEFAULT 'repair' CHECK (report_mode IN ('quote', 'repair')),
  event_description TEXT,
  damage_type TEXT CHECK (damage_type IN ('leak', 'burst', 'clog', 'structural', 'other')),
  is_emergency BOOLEAN NOT NULL DEFAULT false,
  technical_details TEXT,
  cost_summary JSONB DEFAULT '[]'::jsonb,
  professional_statement TEXT,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.insurance_reports ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins full access insurance_reports"
  ON public.insurance_reports FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Staff can read
CREATE POLICY "Staff can read insurance_reports"
  ON public.insurance_reports FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'technician') OR public.has_role(auth.uid(), 'secretary'));

-- Users can insert for accessible calls
CREATE POLICY "Users can insert insurance_reports"
  ON public.insurance_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT public.has_role(auth.uid(), 'contractor')
    AND public.can_access_service_call(auth.uid(), service_call_id)
    AND created_by = auth.uid()
  );

-- Users can update for accessible calls
CREATE POLICY "Users can update insurance_reports"
  ON public.insurance_reports FOR UPDATE
  TO authenticated
  USING (
    NOT public.has_role(auth.uid(), 'contractor')
    AND public.can_access_service_call(auth.uid(), service_call_id)
  );

-- Contractors can read for assigned customers
CREATE POLICY "Contractors read insurance_reports"
  ON public.insurance_reports FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'contractor')
    AND public.contractor_can_access_customer(auth.uid(), public.get_customer_for_sc(service_call_id))
  );

-- Updated_at trigger
CREATE TRIGGER set_insurance_reports_updated_at
  BEFORE UPDATE ON public.insurance_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
