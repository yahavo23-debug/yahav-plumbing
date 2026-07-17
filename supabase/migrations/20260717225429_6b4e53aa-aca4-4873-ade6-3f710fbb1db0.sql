ALTER TABLE public.warranties ADD COLUMN IF NOT EXISTS expiry_notified_at  TIMESTAMPTZ;
ALTER TABLE public.warranties ADD COLUMN IF NOT EXISTS expired_notified_at TIMESTAMPTZ;