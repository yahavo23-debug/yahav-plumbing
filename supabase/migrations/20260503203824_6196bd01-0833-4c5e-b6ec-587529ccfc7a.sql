
-- personal_events
CREATE TABLE IF NOT EXISTS public.personal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  time time NOT NULL,
  title text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.personal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own personal_events" ON public.personal_events
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- push_subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own push_subscriptions" ON public.push_subscriptions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- yesh_invoices
CREATE TABLE IF NOT EXISTS public.yesh_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yesh_doc_id bigint UNIQUE,
  doc_number text NOT NULL DEFAULT '',
  doc_type integer NOT NULL DEFAULT 9,
  doc_type_name text NOT NULL DEFAULT '',
  customer_name text NOT NULL DEFAULT '',
  customer_phone text NOT NULL DEFAULT '',
  customer_email text NOT NULL DEFAULT '',
  total_price numeric NOT NULL DEFAULT 0,
  total_vat numeric NOT NULL DEFAULT 0,
  total_with_vat numeric NOT NULL DEFAULT 0,
  date_created date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'open',
  service_call_id uuid,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.yesh_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage yesh_invoices" ON public.yesh_invoices
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "authenticated read yesh_invoices" ON public.yesh_invoices
  FOR SELECT TO authenticated USING (true);
