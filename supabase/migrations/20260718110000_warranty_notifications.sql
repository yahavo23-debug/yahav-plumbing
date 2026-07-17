-- ספירת אחריות והתראות: סימון חד-פעמי שההתראה נשלחה (עומדת לפוג / פגה)
ALTER TABLE public.warranties ADD COLUMN IF NOT EXISTS expiry_notified_at  TIMESTAMPTZ;
ALTER TABLE public.warranties ADD COLUMN IF NOT EXISTS expired_notified_at TIMESTAMPTZ;

-- הערה לסוכן המריץ: יש לתזמן pg_cron יומי (06:00 UTC = 09:00 שעון ישראל) שקורא
-- לפונקציית הענן check-warranties עם אותו x-cron-secret שבו מתוזמן check-upcoming.
