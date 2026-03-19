DROP POLICY "System create change audit logs" ON public.change_audit_logs;

CREATE POLICY "System create change audit logs"
  ON public.change_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);