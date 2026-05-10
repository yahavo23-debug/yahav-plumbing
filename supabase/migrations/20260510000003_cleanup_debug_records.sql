-- Clean up debug/test records created during webhook diagnostics.
-- These are rows inserted with status='debug' or doc_number='__debug__'
-- and have no real invoice data.
DELETE FROM yesh_invoices
WHERE status = 'debug'
   OR doc_number = '__debug__';

-- Also remove any remaining empty records (no customer, no amount)
DELETE FROM yesh_invoices
WHERE (customer_name IS NULL OR customer_name = '' OR customer_name LIKE 'method:%')
  AND (total_with_vat IS NULL OR total_with_vat = 0);
