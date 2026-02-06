
-- 1. Add UNIQUE constraint on (customer_id, call_number)
ALTER TABLE public.service_calls
ADD CONSTRAINT unique_customer_call_number UNIQUE (customer_id, call_number);

-- 2. Replace trigger function with concurrency-safe version
CREATE OR REPLACE FUNCTION public.assign_call_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_call_number INT;
BEGIN
  -- Reject NULL customer_id
  IF NEW.customer_id IS NULL THEN
    RAISE EXCEPTION 'Service calls must belong to a customer.';
  END IF;

  -- Advisory lock per customer to serialize inserts
  PERFORM pg_advisory_xact_lock(hashtext('service_call_lock_' || NEW.customer_id::text));

  SELECT COALESCE(MAX(call_number), 0) + 1
  INTO next_call_number
  FROM public.service_calls
  WHERE customer_id = NEW.customer_id;

  NEW.call_number = next_call_number;
  RETURN NEW;
END;
$$;
