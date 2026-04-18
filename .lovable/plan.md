
המשתמש מבקש דוח טכני סקירתי על האפליקציה - לא משימת בנייה אלא בקשת מידע/אנליזה. אני יכול לייצר מסמך PDF/DOCX קריא ומסודר.

## מה אכלול בדוח:
1. **תשתית ענן** - Lovable Cloud (מבוסס Supabase, רץ על AWS)
2. **בסיס נתונים** - PostgreSQL עם RLS
3. **אוטנטיקציה** - Supabase Auth (Email+Password), טבלת user_roles נפרדת
4. **שפות וטכנולוגיות** - React 18, TypeScript, Vite, Tailwind, shadcn/ui, Edge Functions ב-Deno
5. **מסכים** - מהקוד: Dashboard, Customers, ServiceCalls, Reports, DispatchBoard, Finance, MarketingAnalytics, ProfitabilityReport, Settings, Auth, PublicQuote/Report/Share
6. **תפקידים (RBAC)** - admin, technician, secretary, contractor + מה כל אחד רואה
7. **אחסון קבצים** - 8 buckets
8. **אבטחה** - RLS, Magic Bytes, PDF hashes, audit logs
9. **פונקציות צד-שרת** - 11 Edge Functions

## פורמט מועדף:
מסמך PDF בעברית RTL, נקי ומסודר עם כותרות, טבלאות לתפקידים ומסכים.

## תוכנית ביצוע:
1. ייצור PDF בעברית עם reportlab או דרך HTML+playwright/weasyprint
2. שמירה ב-`/mnt/documents/system-overview.pdf`
3. QA חזותי - המרה לתמונות ובדיקה
4. הצגה ב-presentation-artifact

אשתמש ב-Python + reportlab (תומך RTL) או עדיף - HTML מעוצב + המרה ל-PDF דרך chromium headless. HTML יהיה הכי קל לעיצוב נקי בעברית.

## הדוח יכלול את הסעיפים:
- סקירה כללית
- תשתית ענן ואחסון
- בסיס נתונים
- אוטנטיקציה ואבטחה
- שפות פיתוח וטכנולוגיות
- מסכים ראשיים (טבלה)
- תפקידי משתמשים והרשאות (טבלה)
- מודולים עיקריים
- פונקציות צד-שרת
- סיכום

אחרי אישור, אעבור למצב default ואייצר את המסמך.
