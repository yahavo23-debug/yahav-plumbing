
-- Step 1: Add columns to quotes
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS signer_id_number TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS pdf_path TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS pdf_hash TEXT;

-- Step 2: Add columns to reports
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS signer_id_number TEXT;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS pdf_hash TEXT;

-- Step 3: Add access_mode to report_shares
ALTER TABLE public.report_shares ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'sign';

-- Step 4: Create quote_shares table
CREATE TABLE IF NOT EXISTS public.quote_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  access_mode TEXT NOT NULL DEFAULT 'sign',
  share_token TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(share_token)
);

ALTER TABLE public.quote_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage quote_shares"
  ON public.quote_shares FOR ALL
  TO authenticated
  USING (
    NOT has_role(auth.uid(), 'contractor'::app_role)
    AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'technician'::app_role) OR has_role(auth.uid(), 'secretary'::app_role))
  );

-- Step 5: Create quotes-pdf storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('quotes-pdf', 'quotes-pdf', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for quotes-pdf bucket
CREATE POLICY "Staff can upload quotes-pdf"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'quotes-pdf'
    AND NOT public.has_role(auth.uid(), 'contractor'::app_role)
  );

CREATE POLICY "Staff can read quotes-pdf"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'quotes-pdf'
    AND NOT public.has_role(auth.uid(), 'contractor'::app_role)
  );

CREATE POLICY "Admins can delete quotes-pdf"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'quotes-pdf'
    AND public.is_admin(auth.uid())
  );
