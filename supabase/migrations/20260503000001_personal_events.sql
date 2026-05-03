-- Personal calendar events (stored server-side for push notification scheduling)
CREATE TABLE IF NOT EXISTS personal_events (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       date        NOT NULL,
  time       time        NOT NULL DEFAULT '09:00',
  title      text        NOT NULL,
  color      text        NOT NULL DEFAULT 'bg-orange-400',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE personal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personal_events_self"
  ON personal_events FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Cron job: fire check-upcoming Edge Function every 5 minutes
-- (pg_cron + pg_net must be enabled — Supabase enables them by default)
SELECT cron.schedule(
  'check-upcoming-appointments',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url     := 'https://xglagkbblribtztkkovo.supabase.co/functions/v1/check-upcoming',
      headers := '{"Content-Type":"application/json","x-cron-secret":"yahav-push-cron-k9x2m"}'::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);
