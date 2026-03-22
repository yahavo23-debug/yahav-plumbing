

## תוכנית סופית מאושרת — הפרדת מסמכים, חתימה דיגיטלית, והגנה משפטית

כל הנקודות שהעלית כלולות. סיכום מהיר של שתי הנקודות האחרונות:
- תאריך + שעה יופיעו **בתוך ה-PDF** בבלוק החתימה (לא רק במסד).
- IP + Device נשמרים בטבלה וניתנים לשליפה. ה-IP מופיע גם בבלוק החתימה ב-PDF.

---

### שלב 1: מיגרציית מסד נתונים
- `quotes`: הוספת `signer_id_number TEXT`, `pdf_path TEXT`, `pdf_hash TEXT`
- `reports`: הוספת `signer_id_number TEXT`, `pdf_hash TEXT`
- `report_shares`: הוספת `access_mode TEXT DEFAULT 'sign'`
- טבלת `quote_shares` חדשה: `id`, `quote_id`, `access_mode`, `share_token`, `is_active`, `revoked_at`, `expires_at`, `created_by`, `created_at` + RLS
- Storage bucket: `quotes-pdf`

### שלב 2: נספח משפטי מרכזי
- קובץ חדש `src/lib/legal-constants.ts` — מקור אחד ל-`LEGAL_SECTIONS`
- עדכון כל הקומפוננטות לייבא משם

### שלב 3: Edge Functions
- חדש: `get-public-quote` — מחזיר הצעה + פריטים + לקוח + `access_mode`
- חדש: `save-signed-pdf` — מעלה PDF, מחשב SHA-256, שומר `pdf_path` + `pdf_hash`
- עדכון: `sign-public-quote` — ת"ז בשדה נפרד, ולידציה 9 ספרות
- עדכון: `sign-public-report` — ת"ז בשדה נפרד
- עדכון: `get-public-report` — החזרת `access_mode`

### שלב 4: דף ציבורי להצעת מחיר
- חדש: `src/pages/PublicQuote.tsx` (route `/q/:token`)
- מציג הצעה, נספח משפטי, טופס חתימה (שם + ת"ז + canvas)
- אחרי חתימה → PDF חתום אוטומטי + העלאה + hash

### שלב 5: UI — שני כפתורים נפרדים
- `QuotesList.tsx`: "שלח ללקוח" (view) + "שלח לחתימה" (sign) + כפתור PDF בולט
- `ReportEditor.tsx`: "שלח ללקוח" (view) + "שלח לחתימה" (sign)

### שלב 6: PDF הצעת מחיר
- `QuotePdfExport.tsx`: תבנית עצמאית ללא שדות דוח עבודה
- נספח משפטי בעמוד A4 נפרד (multi-canvas)
- בלוק חתימה: שם, ת"ז, חתימה, תאריך+שעה, IP

### שלב 7: PublicReport + access_mode
- `PublicReport.tsx`: view = ללא חתימה, sign = חתימה + PDF אוטומטי
- נספח משפטי מוצג לפני חתימה

### שלב 8: נעילת מסמך חתום
- מסמך חתום ננעל לעריכה
- שינוי דורש יצירת גרסה חדשה

### קבצים (15 קבצים)
| קובץ | פעולה |
|---|---|
| מיגרציה | quote_shares + עמודות + bucket |
| `src/lib/legal-constants.ts` | חדש |
| `src/pages/PublicQuote.tsx` | חדש |
| `src/App.tsx` | route `/q/:token` |
| `supabase/functions/get-public-quote/index.ts` | חדש |
| `supabase/functions/save-signed-pdf/index.ts` | חדש |
| `supabase/functions/sign-public-quote/index.ts` | עדכון |
| `supabase/functions/sign-public-report/index.ts` | עדכון |
| `supabase/functions/get-public-report/index.ts` | עדכון |
| `src/components/quotes/QuotesList.tsx` | שני כפתורים |
| `src/components/quotes/QuotePdfExport.tsx` | נספח + חתימה |
| `src/components/reports/PdfReportGenerator.tsx` | import legal-constants |
| `src/components/reports/PublicSignaturePad.tsx` | import legal-constants |
| `src/pages/PublicReport.tsx` | access_mode + PDF אוטומטי |
| `src/pages/ReportEditor.tsx` | שני כפתורים |

