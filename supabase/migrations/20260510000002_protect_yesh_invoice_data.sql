-- Database-level protection: prevent the webhook from overwriting valid invoice data.
-- When create-yesh-invoice saves correct customer_name + total_with_vat,
-- a subsequent webhook ping must NOT be able to wipe those fields with empty values.

CREATE OR REPLACE FUNCTION protect_valid_yesh_invoice()
RETURNS TRIGGER AS $$
BEGIN
  -- Protect customer_name: if existing row has a real name, keep it
  IF OLD.customer_name IS NOT NULL AND OLD.customer_name <> ''
     AND (NEW.customer_name IS NULL OR NEW.customer_name = '') THEN
    NEW.customer_name := OLD.customer_name;
  END IF;

  -- Protect customer_phone
  IF OLD.customer_phone IS NOT NULL AND OLD.customer_phone <> ''
     AND (NEW.customer_phone IS NULL OR NEW.customer_phone = '') THEN
    NEW.customer_phone := OLD.customer_phone;
  END IF;

  -- Protect total_with_vat: if existing row has a positive amount, keep it
  IF OLD.total_with_vat IS NOT NULL AND OLD.total_with_vat > 0
     AND (NEW.total_with_vat IS NULL OR NEW.total_with_vat = 0) THEN
    NEW.total_with_vat := OLD.total_with_vat;
    NEW.total_price    := OLD.total_price;
    NEW.total_vat      := OLD.total_vat;
  END IF;

  -- Protect service_call_id: if linked, don't unlink
  IF OLD.service_call_id IS NOT NULL AND NEW.service_call_id IS NULL THEN
    NEW.service_call_id := OLD.service_call_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_yesh_invoice_data ON yesh_invoices;
CREATE TRIGGER protect_yesh_invoice_data
  BEFORE UPDATE ON yesh_invoices
  FOR EACH ROW
  EXECUTE FUNCTION protect_valid_yesh_invoice();
