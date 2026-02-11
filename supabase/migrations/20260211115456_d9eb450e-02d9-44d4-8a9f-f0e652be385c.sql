
-- Add billing notes column to customers table
ALTER TABLE public.customers ADD COLUMN billing_notes text DEFAULT NULL;
