
-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  resource_label text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all logs
CREATE POLICY "Admins can read audit logs"
ON public.audit_logs
FOR SELECT
USING (is_admin(auth.uid()));

-- Any authenticated user can insert their own log
CREATE POLICY "Users can insert own audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- No update or delete allowed

-- Index for fast queries
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs (user_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_resource ON public.audit_logs (resource_type, resource_id);
