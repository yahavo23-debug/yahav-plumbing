
-- =====================================================
-- 1. BRANDING SETTINGS (singleton row)
-- =====================================================
CREATE TABLE public.branding_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_path text,
  primary_color text DEFAULT '#000000',
  secondary_color text DEFAULT '#ffffff',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  is_singleton boolean DEFAULT true,
  CONSTRAINT branding_singleton_check CHECK (is_singleton IS TRUE),
  CONSTRAINT branding_singleton_unique UNIQUE (is_singleton)
);

ALTER TABLE public.branding_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read branding"
ON public.branding_settings FOR SELECT
USING (true);

CREATE POLICY "Admins can update branding"
ON public.branding_settings FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert branding"
ON public.branding_settings FOR INSERT
WITH CHECK (is_admin(auth.uid()));

INSERT INTO public.branding_settings (id, is_singleton)
VALUES (gen_random_uuid(), true)
ON CONFLICT (is_singleton) DO NOTHING;

-- =====================================================
-- 2. BRANDING STORAGE (private bucket + public read policy)
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read branding files"
ON storage.objects FOR SELECT
USING (bucket_id = 'branding');

CREATE POLICY "Admins upload branding files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'branding' AND is_admin(auth.uid()));

CREATE POLICY "Admins update branding files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'branding' AND is_admin(auth.uid()));

CREATE POLICY "Admins delete branding files"
ON storage.objects FOR DELETE
USING (bucket_id = 'branding' AND is_admin(auth.uid()));

-- =====================================================
-- 3. CHANGE AUDIT LOGS (detailed old/new data tracking)
-- NOTE: Existing audit_logs table kept for action-level logging.
--       This new table is for row-level change tracking with jsonb diffs.
-- =====================================================
CREATE TABLE public.change_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  operation text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid DEFAULT auth.uid(),
  changed_at timestamptz DEFAULT now()
);

ALTER TABLE public.change_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System create change audit logs"
ON public.change_audit_logs FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins read change audit logs"
ON public.change_audit_logs FOR SELECT
USING (is_admin(auth.uid()));

-- =====================================================
-- 4. CUSTOMER LEDGER
-- =====================================================
CREATE TABLE public.customer_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  entry_type text NOT NULL,
  amount numeric NOT NULL,
  description text,
  service_call_id uuid REFERENCES public.service_calls(id) ON DELETE SET NULL,
  is_locked boolean DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_entry_type CHECK (entry_type IN ('charge', 'payment', 'credit'))
);

ALTER TABLE public.customer_ledger ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ledger_customer ON public.customer_ledger(customer_id);
CREATE INDEX idx_ledger_date ON public.customer_ledger(entry_date);

-- Staff read all
CREATE POLICY "Staff read all ledger"
ON public.customer_ledger FOR SELECT
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'technician'::app_role) 
  OR has_role(auth.uid(), 'secretary'::app_role)
);

-- Contractors read assigned only
CREATE POLICY "Contractors read assigned ledger"
ON public.customer_ledger FOR SELECT
USING (
  has_role(auth.uid(), 'contractor'::app_role)
  AND contractor_can_access_customer(auth.uid(), customer_id)
);

-- Staff insert
CREATE POLICY "Staff insert ledger"
ON public.customer_ledger FOR INSERT
WITH CHECK (
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretary'::app_role) OR has_role(auth.uid(), 'technician'::app_role))
  AND created_by = auth.uid()
);

-- Technician edit only if not locked
CREATE POLICY "Technician edit IF NOT LOCKED"
ON public.customer_ledger FOR UPDATE
USING (
  has_role(auth.uid(), 'technician'::app_role)
  AND created_by = auth.uid()
  AND is_locked = false
)
WITH CHECK (
  is_locked = false
);

-- Admin full access
CREATE POLICY "Admin full access ledger"
ON public.customer_ledger FOR ALL
USING (is_admin(auth.uid()));

-- =====================================================
-- 5. TRIGGER for ledger audit trail
-- =====================================================
CREATE OR REPLACE FUNCTION public.log_ledger_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.change_audit_logs (table_name, record_id, operation, new_data, changed_by)
    VALUES ('customer_ledger', NEW.id, 'INSERT', row_to_json(NEW)::jsonb, auth.uid());
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.change_audit_logs (table_name, record_id, operation, old_data, new_data, changed_by)
    VALUES ('customer_ledger', NEW.id, 'UPDATE', row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb, auth.uid());
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.change_audit_logs (table_name, record_id, operation, old_data, changed_by)
    VALUES ('customer_ledger', OLD.id, 'DELETE', row_to_json(OLD)::jsonb, auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_ledger_trigger ON public.customer_ledger;
CREATE TRIGGER audit_ledger_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.customer_ledger
FOR EACH ROW EXECUTE FUNCTION public.log_ledger_changes();

-- =====================================================
-- 6. REPORTS-PDF additional storage policies
-- =====================================================
CREATE POLICY "Staff read report PDFs"
ON storage.objects FOR SELECT
USING (bucket_id = 'reports-pdf' AND (
  is_admin(auth.uid()) OR has_role(auth.uid(), 'technician'::app_role) OR has_role(auth.uid(), 'secretary'::app_role)
));

CREATE POLICY "Staff upload report PDFs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'reports-pdf' 
  AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'technician'::app_role))
);

CREATE POLICY "Admin delete report PDFs"
ON storage.objects FOR DELETE
USING (bucket_id = 'reports-pdf' AND is_admin(auth.uid()));
