
-- Add priority column to service_calls (default: 'medium')
ALTER TABLE public.service_calls
ADD COLUMN priority text NOT NULL DEFAULT 'medium';

-- Add notes column to service_calls
ALTER TABLE public.service_calls
ADD COLUMN notes text;
