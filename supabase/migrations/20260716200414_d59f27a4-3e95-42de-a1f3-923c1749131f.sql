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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_requests TO authenticated;
GRANT ALL ON public.payment_requests TO service_role;

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and secretary manage payment requests"
  ON public.payment_requests FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'secretary'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'secretary'));

CREATE INDEX IF NOT EXISTS idx_payment_requests_customer ON public.payment_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_token ON public.payment_requests(share_token);

ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS items JSONB;
ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS collection_flag BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS collection_flag_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.business_payment_settings (
  id               INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  business_name    TEXT NOT NULL DEFAULT 'יהב אינסטלציה - פתרונות ביוב ומים',
  business_license TEXT,
  bank_name        TEXT NOT NULL DEFAULT 'בנק מזרחי טפחות',
  bank_number      TEXT NOT NULL DEFAULT '20',
  branch_number    TEXT NOT NULL DEFAULT '615',
  account_number   TEXT NOT NULL DEFAULT '155793',
  beneficiary_name TEXT NOT NULL DEFAULT 'יהב אוחנה',
  bit_phone        TEXT NOT NULL DEFAULT '054-2121204',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_payment_settings TO authenticated;
GRANT ALL ON public.business_payment_settings TO service_role;

ALTER TABLE public.business_payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage payment settings"
  ON public.business_payment_settings FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Staff read payment settings"
  ON public.business_payment_settings FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'secretary'));

INSERT INTO public.business_payment_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;