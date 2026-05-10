-- Fix existing yesh_invoices rows where data was not parsed correctly from the webhook.
-- The webhook was looking for camelCase fields but יש חשבונית sends PascalCase (CustomerName, TotalWithVAT, etc.).
-- This migration reads from the raw_data JSONB column and fills in the missing values.

UPDATE yesh_invoices
SET
  -- Customer name: try all known variants from יש חשבונית
  customer_name = COALESCE(
    NULLIF(customer_name, ''),
    raw_data->>'CustomerName',
    raw_data->>'customerName',
    raw_data->'Customer'->>'Name',
    raw_data->'customer'->>'name',
    ''
  ),

  -- Customer phone
  customer_phone = COALESCE(
    NULLIF(customer_phone, ''),
    raw_data->>'CustomerPhone',
    raw_data->>'customerPhone',
    raw_data->'Customer'->>'Phone',
    raw_data->'customer'->>'phone',
    ''
  ),

  -- Customer email
  customer_email = COALESCE(
    NULLIF(customer_email, ''),
    raw_data->>'CustomerEmail',
    raw_data->>'customerEmail',
    raw_data->'Customer'->>'Email',
    raw_data->'customer'->>'email',
    ''
  ),

  -- Doc number
  doc_number = COALESCE(
    NULLIF(doc_number, ''),
    raw_data->>'DocNumber',
    raw_data->>'docNumber',
    raw_data->>'DocumentNumber',
    raw_data->>'documentNumber',
    ''
  ),

  -- Doc ID (yesh_doc_id) — only set if currently null
  yesh_doc_id = COALESCE(
    yesh_doc_id,
    (raw_data->>'DocID')::bigint,
    (raw_data->>'docID')::bigint,
    (raw_data->>'DocumentID')::bigint,
    (raw_data->>'id')::bigint
  ),

  -- Amounts: total_with_vat
  total_with_vat = CASE
    WHEN total_with_vat IS NULL OR total_with_vat = 0 THEN
      COALESCE(
        (raw_data->>'TotalWithVAT')::numeric,
        (raw_data->>'totalWithVAT')::numeric,
        (raw_data->>'TotalWithVat')::numeric,
        (raw_data->>'totalWithVat')::numeric,
        (raw_data->>'GrandTotal')::numeric,
        (raw_data->>'Total')::numeric,
        (raw_data->>'total')::numeric,
        0
      )
    ELSE total_with_vat
  END,

  -- total_price (before VAT)
  total_price = CASE
    WHEN total_price IS NULL OR total_price = 0 THEN
      COALESCE(
        (raw_data->>'TotalPrice')::numeric,
        (raw_data->>'totalPrice')::numeric,
        (raw_data->>'Price')::numeric,
        (raw_data->>'price')::numeric,
        0
      )
    ELSE total_price
  END,

  -- total_vat
  total_vat = CASE
    WHEN total_vat IS NULL OR total_vat = 0 THEN
      COALESCE(
        (raw_data->>'TotalVAT')::numeric,
        (raw_data->>'TotalVat')::numeric,
        (raw_data->>'totalVat')::numeric,
        (raw_data->>'VAT')::numeric,
        (raw_data->>'vat')::numeric,
        0
      )
    ELSE total_vat
  END,

  updated_at = now()

WHERE
  raw_data IS NOT NULL
  AND (
    customer_name = '' OR customer_name IS NULL
    OR total_with_vat IS NULL OR total_with_vat = 0
  );

-- Delete exact duplicates (same yesh_doc_id, keep the most recently updated one)
-- These were created when the webhook couldn't parse docId and inserted multiple null rows
DELETE FROM yesh_invoices a
USING yesh_invoices b
WHERE
  a.yesh_doc_id IS NOT NULL
  AND a.yesh_doc_id = b.yesh_doc_id
  AND a.updated_at < b.updated_at;
