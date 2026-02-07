
-- ============================================================
-- SAFE STORAGE LOCKDOWN: Staff-only upload/delete (allow-list)
-- ============================================================

-- 1. DROP all existing broad policies (IF EXISTS for safety)
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload signatures" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload reports-pdf" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete signatures" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete reports-pdf" ON storage.objects;

-- Also drop any old broad patterns
DROP POLICY IF EXISTS "Authenticated users can upload to photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to signatures" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to reports-pdf" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete from photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete from videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete from signatures" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete from reports-pdf" ON storage.objects;

-- 2. DROP new policy names IF EXISTS (idempotent re-run safety)
DROP POLICY IF EXISTS "Staff can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload signatures" ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload reports-pdf" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete videos" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete signatures" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete reports-pdf" ON storage.objects;

-- ============================================================
-- 3. CREATE INSERT policies — staff allow-list only
-- ============================================================

CREATE POLICY "Staff can upload photos" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'photos'
  AND auth.role() = 'authenticated'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'technician')
    OR public.has_role(auth.uid(), 'secretary')
  )
);

CREATE POLICY "Staff can upload videos" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'videos'
  AND auth.role() = 'authenticated'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'technician')
    OR public.has_role(auth.uid(), 'secretary')
  )
);

CREATE POLICY "Staff can upload signatures" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'signatures'
  AND auth.role() = 'authenticated'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'technician')
    OR public.has_role(auth.uid(), 'secretary')
  )
);

CREATE POLICY "Staff can upload reports-pdf" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'reports-pdf'
  AND auth.role() = 'authenticated'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'technician')
    OR public.has_role(auth.uid(), 'secretary')
  )
);

-- ============================================================
-- 4. CREATE DELETE policies — all 4 buckets, staff allow-list
-- ============================================================

CREATE POLICY "Staff can delete photos" ON storage.objects
FOR DELETE USING (
  bucket_id = 'photos'
  AND auth.role() = 'authenticated'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'technician')
    OR public.has_role(auth.uid(), 'secretary')
  )
);

CREATE POLICY "Staff can delete videos" ON storage.objects
FOR DELETE USING (
  bucket_id = 'videos'
  AND auth.role() = 'authenticated'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'technician')
    OR public.has_role(auth.uid(), 'secretary')
  )
);

CREATE POLICY "Staff can delete signatures" ON storage.objects
FOR DELETE USING (
  bucket_id = 'signatures'
  AND auth.role() = 'authenticated'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'technician')
    OR public.has_role(auth.uid(), 'secretary')
  )
);

CREATE POLICY "Staff can delete reports-pdf" ON storage.objects
FOR DELETE USING (
  bucket_id = 'reports-pdf'
  AND auth.role() = 'authenticated'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'technician')
    OR public.has_role(auth.uid(), 'secretary')
  )
);
