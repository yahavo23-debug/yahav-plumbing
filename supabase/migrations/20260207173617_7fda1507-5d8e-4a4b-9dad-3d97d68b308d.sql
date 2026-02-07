
-- Add receipt_path column to customer_ledger
ALTER TABLE public.customer_ledger ADD COLUMN receipt_path text DEFAULT NULL;

-- Create receipts storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for receipts bucket
CREATE POLICY "Staff can upload receipts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'receipts' AND (
  public.is_admin(auth.uid()) OR
  public.has_role(auth.uid(), 'technician') OR
  public.has_role(auth.uid(), 'secretary')
));

CREATE POLICY "Staff can view receipts"
ON storage.objects FOR SELECT
USING (bucket_id = 'receipts' AND (
  public.is_admin(auth.uid()) OR
  public.has_role(auth.uid(), 'technician') OR
  public.has_role(auth.uid(), 'secretary') OR
  (public.has_role(auth.uid(), 'contractor'))
));

CREATE POLICY "Admins can delete receipts"
ON storage.objects FOR DELETE
USING (bucket_id = 'receipts' AND public.is_admin(auth.uid()));

-- Add admin-only DELETE policy for ledger entries
CREATE POLICY "Admin delete ledger"
ON public.customer_ledger FOR DELETE
USING (public.is_admin(auth.uid()));
