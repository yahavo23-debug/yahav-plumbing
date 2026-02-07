-- Allow secretaries and technicians to read all user roles (needed for dispatch board technician list)
CREATE POLICY "Staff can read all roles"
ON public.user_roles
FOR SELECT
USING (
  has_role(auth.uid(), 'secretary'::app_role) OR 
  has_role(auth.uid(), 'technician'::app_role)
);