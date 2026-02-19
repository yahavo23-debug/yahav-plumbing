-- Add a JSONB column to store extra details for contractor expenses
ALTER TABLE public.customer_expenses
ADD COLUMN details jsonb DEFAULT NULL;