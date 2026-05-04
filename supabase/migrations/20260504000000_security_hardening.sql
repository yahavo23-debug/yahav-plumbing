-- ============================================================
-- Security Hardening Migration
-- Fixes all vulnerabilities found in security scan
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. yesh_invoices: Restrict to admin + secretary only
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "yesh_invoices_auth" ON yesh_invoices;

CREATE POLICY "yesh_invoices_admin_secretary_read"
  ON yesh_invoices FOR SELECT
  TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'secretary'));

CREATE POLICY "yesh_invoices_admin_secretary_write"
  ON yesh_invoices FOR ALL
  TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'secretary'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'secretary'));

-- ────────────────────────────────────────────────────────────
-- 2. Storage: Restrict DELETE to admin + secretary only
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can delete own photos"  ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own videos"  ON storage.objects;

CREATE POLICY "Admin secretary can delete photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'photos'
    AND get_user_role(auth.uid()) IN ('admin', 'secretary')
  );

CREATE POLICY "Admin secretary can delete videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'videos'
    AND get_user_role(auth.uid()) IN ('admin', 'secretary')
  );

-- ────────────────────────────────────────────────────────────
-- 3. Storage: Restrict READ to non-contractor roles for sensitive buckets
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read photos"     ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read videos"     ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read signatures" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read PDFs"       ON storage.objects;

-- Photos: all staff can read (for viewing reports/calls)
CREATE POLICY "Staff can read photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'photos'
    AND get_user_role(auth.uid()) IN ('admin', 'secretary', 'technician')
  );

-- Videos: all staff can read
CREATE POLICY "Staff can read videos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'videos'
    AND get_user_role(auth.uid()) IN ('admin', 'secretary', 'technician')
  );

-- Signatures: admin + secretary only
CREATE POLICY "Admin secretary can read signatures"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'signatures'
    AND get_user_role(auth.uid()) IN ('admin', 'secretary')
  );

-- Reports PDF: admin + secretary only
CREATE POLICY "Admin secretary can read report PDFs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'reports-pdf'
    AND get_user_role(auth.uid()) IN ('admin', 'secretary')
  );

-- ────────────────────────────────────────────────────────────
-- 4. audit_logs: Ensure INSERT is locked to own user_id only
--    (already set, but re-enforcing for clarity)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.audit_logs;

CREATE POLICY "Users can insert own audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 5. SECURITY DEFINER functions: Revoke PUBLIC execute,
--    grant only to authenticated where appropriate
-- ────────────────────────────────────────────────────────────

-- get_user_role: only authenticated should call this
REVOKE ALL ON FUNCTION get_user_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_role(uuid) TO authenticated;

-- is_admin: only authenticated
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'is_admin'
  ) THEN
    REVOKE ALL ON FUNCTION is_admin(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION is_admin(uuid) TO authenticated;
  END IF;
END $$;

-- assign_call_number trigger function: internal use only
REVOKE ALL ON FUNCTION assign_call_number() FROM PUBLIC;

-- ────────────────────────────────────────────────────────────
-- 6. quotes-pdf bucket: Restrict contractors from reading
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Contractors can read quote PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read quote PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Staff can read quote PDFs" ON storage.objects;

-- Only admin + secretary can read quote PDFs
CREATE POLICY "Admin secretary can read quote PDFs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'quotes-pdf'
    AND get_user_role(auth.uid()) IN ('admin', 'secretary')
  );
