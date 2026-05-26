-- Remove arbitrary audit log insert by authenticated users; only SECURITY DEFINER triggers should write
DROP POLICY IF EXISTS "Authenticated users insert own audit logs" ON public.change_audit_logs;

-- Remove overly permissive reports-pdf upload policy
DROP POLICY IF EXISTS "Authenticated users can upload PDFs" ON storage.objects;

-- Tighten receipts SELECT to exclude contractors
DROP POLICY IF EXISTS "Staff can view receipts" ON storage.objects;
CREATE POLICY "Staff can view receipts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'receipts'
  AND (
    is_admin(auth.uid())
    OR has_role(auth.uid(), 'technician'::app_role)
    OR has_role(auth.uid(), 'secretary'::app_role)
  )
);