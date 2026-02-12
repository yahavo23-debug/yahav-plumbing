
CREATE OR REPLACE FUNCTION public.get_database_size_bytes()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT pg_database_size(current_database());
$$;
