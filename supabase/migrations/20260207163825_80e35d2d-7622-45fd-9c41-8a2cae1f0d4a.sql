
-- Add legal action tracking columns to customers table
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS has_legal_action boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS legal_action_note text;
