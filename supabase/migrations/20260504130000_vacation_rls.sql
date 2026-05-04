-- Allow all authenticated users to READ vacation-type events (color starts with __vac__)
-- Personal events remain private (existing policy covers own rows)
-- This lets the whole team see who is on vacation

CREATE POLICY "personal_events_read_vacations"
  ON personal_events FOR SELECT
  TO authenticated
  USING (color LIKE '__vac__%');
