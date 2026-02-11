
-- 1. Update report status validation to support: draft, sent, signed, final
CREATE OR REPLACE FUNCTION public.validate_report_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('draft', 'sent', 'signed', 'final') THEN
    RAISE EXCEPTION 'Invalid report status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2. Add signature metadata columns to reports
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS signed_by text,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS device_info text;

-- 3. Add signature metadata columns to quotes
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS signed_by text,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS device_info text;
