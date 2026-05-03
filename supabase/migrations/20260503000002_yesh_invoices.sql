-- Synced invoices from יש חשבונית
CREATE TABLE IF NOT EXISTS yesh_invoices (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  yesh_doc_id      bigint      UNIQUE,                          -- מזהה המסמך ביש חשבונית
  doc_number       text,                                        -- מספר חשבונית
  doc_type         integer,                                     -- סוג מסמך (9=חשבונית מס קבלה)
  doc_type_name    text,
  customer_name    text,
  customer_phone   text,
  customer_email   text,
  total_price      numeric(10,2),
  total_vat        numeric(10,2),
  total_with_vat   numeric(10,2),
  date_created     date,
  status           text DEFAULT 'open',
  service_call_id  uuid REFERENCES service_calls(id) ON DELETE SET NULL,
  raw_data         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE yesh_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "yesh_invoices_auth"
  ON yesh_invoices FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_yesh_invoices_phone ON yesh_invoices(customer_phone);
CREATE INDEX idx_yesh_invoices_date  ON yesh_invoices(date_created DESC);
