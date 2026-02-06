
-- Add call_number column (nullable initially for backfill)
ALTER TABLE public.service_calls ADD COLUMN call_number integer;

-- Add diagnosis fields
ALTER TABLE public.service_calls ADD COLUMN detection_method text;
ALTER TABLE public.service_calls ADD COLUMN cause_assessment text;

-- Backfill existing rows with sequential call_number per customer
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at) AS rn
  FROM public.service_calls
)
UPDATE public.service_calls sc
SET call_number = numbered.rn
FROM numbered
WHERE sc.id = numbered.id;

-- Now make call_number NOT NULL
ALTER TABLE public.service_calls ALTER COLUMN call_number SET NOT NULL;

-- Create function to auto-assign call_number per customer on insert
CREATE OR REPLACE FUNCTION public.assign_call_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT COALESCE(MAX(call_number), 0) + 1
  INTO NEW.call_number
  FROM public.service_calls
  WHERE customer_id = NEW.customer_id;
  RETURN NEW;
END;
$$;

-- Create trigger for auto call_number
CREATE TRIGGER trg_assign_call_number
BEFORE INSERT ON public.service_calls
FOR EACH ROW
EXECUTE FUNCTION public.assign_call_number();
