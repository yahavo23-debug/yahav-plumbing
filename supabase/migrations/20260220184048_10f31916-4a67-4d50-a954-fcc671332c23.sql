-- Add lead_cost column to customers table (cost per lead/acquisition)
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS lead_cost numeric DEFAULT NULL;

COMMENT ON COLUMN public.customers.lead_cost IS 'Cost paid to acquire this customer (advertising/lead cost in ILS)';