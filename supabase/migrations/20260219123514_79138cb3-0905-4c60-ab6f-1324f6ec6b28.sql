
-- Add lead source fields to customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS lead_source text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS lead_source_note text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS source_contractor_id uuid;

-- Validation trigger for lead_source
CREATE OR REPLACE FUNCTION public.validate_customer_lead_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lead_source IS NOT NULL AND NEW.lead_source NOT IN ('facebook', 'instagram', 'madrag', 'easy_shapatz', 'word_of_mouth', 'contractor', 'referral') THEN
    RAISE EXCEPTION 'Invalid lead_source: %', NEW.lead_source;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_customer_lead_source_trigger
BEFORE INSERT OR UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.validate_customer_lead_source();
