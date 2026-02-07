
-- Add auto-incrementing quote_number column
ALTER TABLE public.quotes ADD COLUMN quote_number integer;

-- Create a sequence for quote numbers
CREATE SEQUENCE public.quotes_quote_number_seq START WITH 1001;

-- Set default for new rows
ALTER TABLE public.quotes ALTER COLUMN quote_number SET DEFAULT nextval('public.quotes_quote_number_seq');

-- Backfill existing quotes with sequential numbers based on creation order
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) + 1000 AS num
  FROM public.quotes
)
UPDATE public.quotes SET quote_number = numbered.num
FROM numbered WHERE public.quotes.id = numbered.id;

-- Make it NOT NULL after backfill
ALTER TABLE public.quotes ALTER COLUMN quote_number SET NOT NULL;

-- Add unique constraint
ALTER TABLE public.quotes ADD CONSTRAINT quotes_quote_number_unique UNIQUE (quote_number);

-- Update the sequence to start after existing numbers
SELECT setval('public.quotes_quote_number_seq', COALESCE((SELECT MAX(quote_number) FROM public.quotes), 1000));
