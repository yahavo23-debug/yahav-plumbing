
-- Table for per-customer work expenses (materials, subcontractor receipts, etc.)
CREATE TABLE public.customer_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'materials',
  receipt_path TEXT,
  supplier_name TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Validation trigger for category
CREATE OR REPLACE FUNCTION public.validate_expense_category()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.category NOT IN ('materials', 'contractor', 'other') THEN
    RAISE EXCEPTION 'Invalid expense category: %', NEW.category;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_expense_category_trigger
BEFORE INSERT OR UPDATE ON public.customer_expenses
FOR EACH ROW EXECUTE FUNCTION public.validate_expense_category();

-- Enable RLS
ALTER TABLE public.customer_expenses ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access expenses"
ON public.customer_expenses FOR ALL
USING (is_admin(auth.uid()));

-- Staff read
CREATE POLICY "Staff read expenses"
ON public.customer_expenses FOR SELECT
USING (
  has_role(auth.uid(), 'technician'::app_role)
  OR has_role(auth.uid(), 'secretary'::app_role)
);

-- Contractors read assigned
CREATE POLICY "Contractors read assigned expenses"
ON public.customer_expenses FOR SELECT
USING (
  has_role(auth.uid(), 'contractor'::app_role)
  AND contractor_can_access_customer(auth.uid(), customer_id)
);
