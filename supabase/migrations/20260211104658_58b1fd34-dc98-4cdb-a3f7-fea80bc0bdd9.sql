
-- Add payment method to ledger entries
ALTER TABLE public.customer_ledger 
ADD COLUMN payment_method text DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN public.customer_ledger.payment_method IS 'Payment method: cash, transfer, bit, paybox, money, credit_card';
