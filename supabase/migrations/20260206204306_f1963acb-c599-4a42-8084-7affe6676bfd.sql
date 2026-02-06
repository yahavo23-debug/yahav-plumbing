
-- Add professional diagnosis columns to service_calls
-- Safe additive migration: NO drops of tables/columns, NO RLS changes

ALTER TABLE public.service_calls
  ADD COLUMN IF NOT EXISTS water_pressure_status text,
  ADD COLUMN IF NOT EXISTS property_occupied boolean,
  ADD COLUMN IF NOT EXISTS main_valve_closed boolean,
  ADD COLUMN IF NOT EXISTS test_limitations text,
  ADD COLUMN IF NOT EXISTS diagnosis_confidence text,
  ADD COLUMN IF NOT EXISTS leak_location text,
  ADD COLUMN IF NOT EXISTS visible_damage text[],
  ADD COLUMN IF NOT EXISTS urgency_level text,
  ADD COLUMN IF NOT EXISTS areas_not_inspected text,
  ADD COLUMN IF NOT EXISTS customer_signature_path text,
  ADD COLUMN IF NOT EXISTS customer_signature_date timestamptz;

-- Validation trigger for diagnosis_confidence (high / medium / suspicion)
DROP TRIGGER IF EXISTS validate_sc_diagnosis_confidence ON public.service_calls;

CREATE OR REPLACE FUNCTION public.validate_sc_diagnosis_confidence()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.diagnosis_confidence IS NOT NULL
     AND NEW.diagnosis_confidence NOT IN ('high', 'medium', 'suspicion') THEN
    RAISE EXCEPTION 'Invalid diagnosis_confidence: %', NEW.diagnosis_confidence;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_sc_diagnosis_confidence
  BEFORE INSERT OR UPDATE ON public.service_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_sc_diagnosis_confidence();

-- Validation trigger for urgency_level (immediate / soon / monitor)
DROP TRIGGER IF EXISTS validate_sc_urgency_level ON public.service_calls;

CREATE OR REPLACE FUNCTION public.validate_sc_urgency_level()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.urgency_level IS NOT NULL
     AND NEW.urgency_level NOT IN ('immediate', 'soon', 'monitor') THEN
    RAISE EXCEPTION 'Invalid urgency_level: %', NEW.urgency_level;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_sc_urgency_level
  BEFORE INSERT OR UPDATE ON public.service_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_sc_urgency_level();
