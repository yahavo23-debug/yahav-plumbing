
CREATE TABLE public.annual_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year integer NOT NULL UNIQUE,
  income_tax numeric NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.annual_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage annual settings"
  ON public.annual_settings
  FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Secretaries can read annual settings"
  ON public.annual_settings
  FOR SELECT
  USING (has_role(auth.uid(), 'secretary'::app_role));
