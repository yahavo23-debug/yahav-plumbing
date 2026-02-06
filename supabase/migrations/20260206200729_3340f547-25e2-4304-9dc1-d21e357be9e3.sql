
-- Quotes table
CREATE TABLE public.quotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_call_id UUID NOT NULL REFERENCES public.service_calls(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  valid_until DATE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Quote line items
CREATE TABLE public.quote_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Validation trigger for quote status
CREATE OR REPLACE FUNCTION public.validate_quote_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'sent', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid quote status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_quote_status_trigger
BEFORE INSERT OR UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.validate_quote_status();

-- Updated_at trigger
CREATE TRIGGER update_quotes_updated_at
BEFORE UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS for quotes
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage quotes"
ON public.quotes FOR ALL
USING (is_admin(auth.uid()));

CREATE POLICY "Users can read quotes for accessible calls"
ON public.quotes FOR SELECT
USING (can_access_service_call(auth.uid(), service_call_id));

CREATE POLICY "Users can insert quotes for accessible calls"
ON public.quotes FOR INSERT
WITH CHECK (can_access_service_call(auth.uid(), service_call_id) AND created_by = auth.uid());

CREATE POLICY "Users can update quotes for accessible calls"
ON public.quotes FOR UPDATE
USING (can_access_service_call(auth.uid(), service_call_id));

CREATE POLICY "Users can delete own quotes"
ON public.quotes FOR DELETE
USING (created_by = auth.uid() OR is_admin(auth.uid()));

-- RLS for quote_items
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- Helper function
CREATE OR REPLACE FUNCTION public.get_sc_id_for_quote(_quote_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT service_call_id FROM public.quotes WHERE id = _quote_id
$$;

CREATE POLICY "Admins can manage quote_items"
ON public.quote_items FOR ALL
USING (is_admin(auth.uid()));

CREATE POLICY "Users can read quote_items for accessible calls"
ON public.quote_items FOR SELECT
USING (can_access_service_call(auth.uid(), get_sc_id_for_quote(quote_id)));

CREATE POLICY "Users can insert quote_items for accessible calls"
ON public.quote_items FOR INSERT
WITH CHECK (can_access_service_call(auth.uid(), get_sc_id_for_quote(quote_id)));

CREATE POLICY "Users can update quote_items for accessible calls"
ON public.quote_items FOR UPDATE
USING (can_access_service_call(auth.uid(), get_sc_id_for_quote(quote_id)));

CREATE POLICY "Users can delete quote_items for accessible calls"
ON public.quote_items FOR DELETE
USING (can_access_service_call(auth.uid(), get_sc_id_for_quote(quote_id)));
