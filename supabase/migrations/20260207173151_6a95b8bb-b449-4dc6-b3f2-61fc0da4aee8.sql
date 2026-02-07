
-- Drop the old staff insert policy that allows secretary and technician
DROP POLICY IF EXISTS "Staff insert ledger" ON public.customer_ledger;

-- Create admin-only insert policy
CREATE POLICY "Admin insert ledger"
ON public.customer_ledger FOR INSERT
WITH CHECK (is_admin(auth.uid()) AND (created_by = auth.uid()));

-- Drop the old technician edit policy (admin handles all updates)
DROP POLICY IF EXISTS "Technician edit IF NOT LOCKED" ON public.customer_ledger;
