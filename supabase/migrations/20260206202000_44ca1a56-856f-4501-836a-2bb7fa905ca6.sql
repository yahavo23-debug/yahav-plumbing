
-- Add discount_percent column to quotes
ALTER TABLE public.quotes
ADD COLUMN discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
