
-- Add missing columns (IF NOT EXISTS skips existing ones)
ALTER TABLE public.service_calls 
ADD COLUMN IF NOT EXISTS resolution_text text,
ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Index for fast status lookups
CREATE INDEX IF NOT EXISTS idx_service_calls_status ON public.service_calls(status);
