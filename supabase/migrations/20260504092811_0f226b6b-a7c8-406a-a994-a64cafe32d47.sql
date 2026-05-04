
-- 1. yesh_invoices: restrict SELECT to staff only
DROP POLICY IF EXISTS "authenticated read yesh_invoices" ON public.yesh_invoices;
CREATE POLICY "Staff read yesh_invoices"
  ON public.yesh_invoices FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'secretary')
    OR public.has_role(auth.uid(), 'technician')
  );

-- 2. Storage: drop overly broad SELECT + DELETE on photos/videos/signatures/reports-pdf
DROP POLICY IF EXISTS "Authenticated users can read photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read signatures" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own videos" ON storage.objects;

-- Helper: check whether the authenticated user can access the service-call folder
-- referenced by an object name (path is "<service_call_id>/<filename>")
CREATE OR REPLACE FUNCTION public.user_can_access_storage_object(_user_id uuid, _name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sc_id uuid;
  cust_id uuid;
BEGIN
  IF _user_id IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;

  -- Admins / staff always allowed
  IF public.is_admin(_user_id)
     OR public.has_role(_user_id, 'technician')
     OR public.has_role(_user_id, 'secretary') THEN
    RETURN true;
  END IF;

  -- Try to interpret the first path segment as a service_call_id
  BEGIN
    sc_id := (split_part(_name, '/', 1))::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  SELECT customer_id INTO cust_id FROM public.service_calls WHERE id = sc_id;
  IF cust_id IS NULL THEN
    RETURN false;
  END IF;

  -- Contractors may access files for their assigned customers
  IF public.has_role(_user_id, 'contractor')
     AND public.contractor_can_access_customer(_user_id, cust_id) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.user_can_access_storage_object(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.user_can_access_storage_object(uuid, text) TO authenticated, service_role;

-- Scoped SELECT policies
CREATE POLICY "Scoped read photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'photos' AND public.user_can_access_storage_object(auth.uid(), name));

CREATE POLICY "Scoped read videos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'videos' AND public.user_can_access_storage_object(auth.uid(), name));

CREATE POLICY "Scoped read signatures"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'signatures' AND public.user_can_access_storage_object(auth.uid(), name));

-- 3. audit_logs: remove user INSERT — only service role / SECURITY DEFINER triggers may insert
DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.audit_logs;

-- 4. Lock down SECURITY DEFINER helpers — they should only be invoked from RLS / server code,
--    not directly callable by signed-in or anonymous users.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname IN (
        'has_role','is_admin','has_any_role',
        'can_access_service_call','contractor_can_access_customer',
        'get_sc_id_for_photo','get_sc_id_for_video','get_sc_id_for_report','get_sc_id_for_quote',
        'get_customer_for_sc','get_storage_size_bytes','get_database_size_bytes',
        'user_can_access_storage_object'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon', fn.nspname, fn.proname, fn.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role', fn.nspname, fn.proname, fn.args);
  END LOOP;
END $$;
