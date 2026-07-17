CREATE TABLE IF NOT EXISTS public.warranties (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  service_call_id  UUID REFERENCES public.service_calls(id) ON DELETE SET NULL,
  product_name     TEXT NOT NULL,
  description      TEXT,
  installed_at     DATE NOT NULL DEFAULT CURRENT_DATE,
  warranty_until   DATE NOT NULL,
  certificate_path TEXT,
  notes            TEXT,
  created_by       UUID NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranties TO authenticated;
GRANT ALL ON public.warranties TO service_role;

ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage warranties" ON public.warranties FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'technician') OR public.has_role(auth.uid(),'secretary'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'technician') OR public.has_role(auth.uid(),'secretary'));

CREATE INDEX IF NOT EXISTS idx_warranties_customer ON public.warranties(customer_id);
CREATE INDEX IF NOT EXISTS idx_warranties_until ON public.warranties(warranty_until);

CREATE POLICY "Staff read warranty certs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'warranties' AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'technician') OR public.has_role(auth.uid(),'secretary')));
CREATE POLICY "Staff upload warranty certs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'warranties' AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'technician') OR public.has_role(auth.uid(),'secretary')));
CREATE POLICY "Staff delete warranty certs" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'warranties' AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'technician') OR public.has_role(auth.uid(),'secretary')));