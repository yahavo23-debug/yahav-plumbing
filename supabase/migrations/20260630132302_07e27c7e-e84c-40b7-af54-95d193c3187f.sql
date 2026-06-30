CREATE OR REPLACE FUNCTION public.validate_service_call_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('open', 'in_progress', 'completed', 'cancelled', 'pending_customer', 'awaiting_payment') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.service_calls
  ADD COLUMN IF NOT EXISTS pending_payment_at timestamptz;