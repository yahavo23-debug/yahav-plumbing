
-- Update the status validation trigger to include the new status
CREATE OR REPLACE FUNCTION public.validate_service_call_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('open', 'in_progress', 'completed', 'cancelled', 'pending_customer') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
