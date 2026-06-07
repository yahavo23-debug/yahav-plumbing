ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_walkin BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_customers_is_walkin ON public.customers(is_walkin);