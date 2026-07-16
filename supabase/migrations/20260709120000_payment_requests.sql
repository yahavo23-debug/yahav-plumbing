-- מחלקת גבייה — טבלת בקשות תשלום (עמוד תשלום ציבורי ללקוח)
CREATE TABLE IF NOT EXISTS public.payment_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_name  TEXT NOT NULL,
  customer_phone TEXT,
  amount      NUMERIC NOT NULL,
  note        TEXT,
  share_token TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  paid_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID
);

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

-- מנהל/מזכירה מנהלים בקשות תשלום
CREATE POLICY "Admin and secretary manage payment requests"
  ON public.payment_requests FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'secretary'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'secretary'));

CREATE INDEX IF NOT EXISTS idx_payment_requests_customer ON public.payment_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_token ON public.payment_requests(share_token);
