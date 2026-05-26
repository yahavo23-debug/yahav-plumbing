ALTER TABLE public.service_calls
  ADD COLUMN IF NOT EXISTS restore_reason text,
  ADD COLUMN IF NOT EXISTS restored_at timestamptz,
  ADD COLUMN IF NOT EXISTS restored_by uuid;