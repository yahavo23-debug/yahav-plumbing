-- מחלקת גבייה — שלב 2+3
-- 1) הרחבת payment_requests לדוחות גבייה מלאים (פירוט חיובים + מעקב שליחה)
-- 2) טבלת הגדרות תשלום של העסק (בנק/ביט) — מוזנת פעם אחת ע"י המנהל
-- 3) דגל תזכורת גבייה על לקוח (נדלק כשמאשרים שתשלום קריאה לא מכסה חוב ישן)
-- הצגת מידע בלבד — המערכת לא מבצעת שום העברת כספים.

-- פירוט חיובים לדוח (מערך JSON: [{description, date, amount, status}])
ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS items JSONB;
ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- דגל "לתזכר על חוב" בלוח הבקרה של הגבייה
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS collection_flag BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS collection_flag_at TIMESTAMPTZ;

-- הגדרות תשלום של העסק — שורה אחת בלבד
CREATE TABLE IF NOT EXISTS public.business_payment_settings (
  id               INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  business_name    TEXT NOT NULL DEFAULT 'יהב אינסטלציה - פתרונות ביוב ומים',
  business_license TEXT,
  bank_name        TEXT NOT NULL DEFAULT 'בנק מזרחי טפחות',
  bank_number      TEXT NOT NULL DEFAULT '20',
  branch_number    TEXT NOT NULL DEFAULT '615',
  account_number   TEXT NOT NULL DEFAULT '155793',
  beneficiary_name TEXT NOT NULL DEFAULT 'יהב אוחנה',
  bit_phone        TEXT NOT NULL DEFAULT '054-2121204',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.business_payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage payment settings"
  ON public.business_payment_settings FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Staff read payment settings"
  ON public.business_payment_settings FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'secretary'));

INSERT INTO public.business_payment_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
