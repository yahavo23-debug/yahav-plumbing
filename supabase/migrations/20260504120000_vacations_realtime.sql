-- ── 1. Create personal_vacations table (previously stored in localStorage) ──
CREATE TABLE IF NOT EXISTS personal_vacations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_date  date        NOT NULL,
  to_date    date        NOT NULL,
  title      text        NOT NULL,
  color      text        NOT NULL DEFAULT 'bg-teal-400',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vacation_dates_valid CHECK (to_date >= from_date)
);

ALTER TABLE personal_vacations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vacations_self"
  ON personal_vacations FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 2. Enable Supabase Realtime on all calendar-related tables ───────────────
ALTER PUBLICATION supabase_realtime ADD TABLE personal_events;
ALTER PUBLICATION supabase_realtime ADD TABLE personal_vacations;
ALTER PUBLICATION supabase_realtime ADD TABLE service_calls;
