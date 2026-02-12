
-- 1. Create financial_transactions table
CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  txn_date date NOT NULL DEFAULT CURRENT_DATE,
  direction text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'ILS',
  category text,
  payment_method text,
  counterparty_name text,
  customer_id uuid REFERENCES public.customers(id),
  service_call_id uuid REFERENCES public.service_calls(id),
  notes text,
  doc_type text,
  doc_path text,
  status text NOT NULL DEFAULT 'paid'
);

-- 2. Validation triggers
CREATE OR REPLACE FUNCTION public.validate_financial_direction()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.direction NOT IN ('income', 'expense') THEN
    RAISE EXCEPTION 'Invalid direction: %', NEW.direction;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_financial_direction ON public.financial_transactions;
CREATE TRIGGER trg_validate_financial_direction
  BEFORE INSERT OR UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_financial_direction();

CREATE OR REPLACE FUNCTION public.validate_financial_doc_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.doc_type IS NOT NULL AND NEW.doc_type NOT IN ('receipt', 'supplier_invoice', 'other') THEN
    RAISE EXCEPTION 'Invalid doc_type: %', NEW.doc_type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_financial_doc_type ON public.financial_transactions;
CREATE TRIGGER trg_validate_financial_doc_type
  BEFORE INSERT OR UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_financial_doc_type();

CREATE OR REPLACE FUNCTION public.validate_financial_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('paid', 'debt', 'credit') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_financial_status ON public.financial_transactions;
CREATE TRIGGER trg_validate_financial_status
  BEFORE INSERT OR UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_financial_status();

-- 3. RLS
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access finance" ON public.financial_transactions;
CREATE POLICY "Admins full access finance"
  ON public.financial_transactions FOR ALL
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Secretaries full access finance" ON public.financial_transactions;
CREATE POLICY "Secretaries full access finance"
  ON public.financial_transactions FOR ALL
  USING (has_role(auth.uid(), 'secretary'::app_role))
  WITH CHECK (has_role(auth.uid(), 'secretary'::app_role));

DROP POLICY IF EXISTS "Technicians read finance" ON public.financial_transactions;
CREATE POLICY "Technicians read finance"
  ON public.financial_transactions FOR SELECT
  USING (has_role(auth.uid(), 'technician'::app_role));

-- 4. Storage bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('finance-docs', 'finance-docs', false)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage policies (idempotent with DROP IF EXISTS)
DROP POLICY IF EXISTS "Admin secretary upload finance docs" ON storage.objects;
CREATE POLICY "Admin secretary upload finance docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'finance-docs'
    AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretary'::app_role))
  );

DROP POLICY IF EXISTS "Admin secretary read finance docs" ON storage.objects;
CREATE POLICY "Admin secretary read finance docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'finance-docs'
    AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretary'::app_role))
  );

DROP POLICY IF EXISTS "Admin secretary delete finance docs" ON storage.objects;
CREATE POLICY "Admin secretary delete finance docs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'finance-docs'
    AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'secretary'::app_role))
  );
