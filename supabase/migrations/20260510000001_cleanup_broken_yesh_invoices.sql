-- Delete yesh_invoice rows that have no useful data (empty customer + zero amount).
-- These were created when the webhook received a minimal ping and couldn't parse the payload.
-- After this cleanup, the fixed webhook will fetch full data from the יש חשבונית API.
DELETE FROM yesh_invoices
WHERE (customer_name IS NULL OR customer_name = '')
  AND (total_with_vat IS NULL OR total_with_vat = 0);
