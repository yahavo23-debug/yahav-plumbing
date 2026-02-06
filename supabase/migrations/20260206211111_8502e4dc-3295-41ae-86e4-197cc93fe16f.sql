
-- Table for sharing individual sections of a service call publicly
CREATE TABLE public.service_call_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_call_id UUID NOT NULL REFERENCES public.service_calls(id) ON DELETE CASCADE,
  share_type TEXT NOT NULL, -- 'details', 'diagnosis', 'media', 'quotes', 'report'
  share_token TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NULL,
  revoked_at TIMESTAMP WITH TIME ZONE NULL,
  CONSTRAINT unique_share_token UNIQUE (share_token)
);

-- Validation trigger for share_type
CREATE OR REPLACE FUNCTION public.validate_share_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.share_type NOT IN ('details', 'diagnosis', 'media', 'quotes', 'report') THEN
    RAISE EXCEPTION 'Invalid share_type: %', NEW.share_type;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_service_call_share_type
  BEFORE INSERT OR UPDATE ON public.service_call_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_share_type();

-- Enable RLS
ALTER TABLE public.service_call_shares ENABLE ROW LEVEL SECURITY;

-- Users who can access the service call can manage shares
CREATE POLICY "Users can manage shares for accessible calls"
  ON public.service_call_shares
  FOR ALL
  USING (can_access_service_call(auth.uid(), service_call_id));

-- Public can verify active share tokens (for the edge function)
CREATE POLICY "Public can verify active share tokens"
  ON public.service_call_shares
  FOR SELECT
  USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND revoked_at IS NULL
  );

-- Index for fast token lookups
CREATE INDEX idx_service_call_shares_token ON public.service_call_shares(share_token);
CREATE INDEX idx_service_call_shares_call_type ON public.service_call_shares(service_call_id, share_type);
