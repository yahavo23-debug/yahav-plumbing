
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS unit_price numeric,
  ADD COLUMN IF NOT EXISTS supplier text,
  ADD COLUMN IF NOT EXISTS borrower text,
  ADD COLUMN IF NOT EXISTS loan_status text;

CREATE OR REPLACE FUNCTION public.validate_movement_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.movement_type NOT IN ('use','restock','adjustment','add_from_oneoff','loan','return') THEN
    RAISE EXCEPTION 'Invalid movement_type: %', NEW.movement_type;
  END IF;
  RETURN NEW;
END; $function$;

CREATE POLICY "Staff update movements"
  ON public.inventory_movements
  FOR UPDATE
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'technician'::app_role) OR has_role(auth.uid(), 'secretary'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'technician'::app_role) OR has_role(auth.uid(), 'secretary'::app_role));
