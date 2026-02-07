
-- Feature 2: Link service_calls back to originating quote
ALTER TABLE public.service_calls ADD COLUMN quote_id uuid REFERENCES public.quotes(id);

-- Feature 3: Digital signature for quotes
ALTER TABLE public.quotes ADD COLUMN signature_path text;
ALTER TABLE public.quotes ADD COLUMN signed_at timestamp with time zone;

-- Feature 1 (prep): Add scheduling fields for dispatch board
ALTER TABLE public.service_calls ADD COLUMN scheduled_at timestamp with time zone;
ALTER TABLE public.service_calls ADD COLUMN duration_minutes integer DEFAULT 60;
