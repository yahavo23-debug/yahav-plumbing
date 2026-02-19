
CREATE OR REPLACE FUNCTION public.validate_customer_lead_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lead_source IS NOT NULL AND NEW.lead_source NOT IN ('facebook', 'instagram', 'madrag', 'easy', 'shapatz', 'word_of_mouth', 'contractor', 'referral') THEN
    RAISE EXCEPTION 'Invalid lead_source: %', NEW.lead_source;
  END IF;
  RETURN NEW;
END;
$function$;
