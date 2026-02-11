
-- Add installments column to customer_ledger
ALTER TABLE public.customer_ledger ADD COLUMN installments integer DEFAULT NULL;
