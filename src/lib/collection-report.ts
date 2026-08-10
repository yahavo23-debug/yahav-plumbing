import { supabase } from "@/integrations/supabase/client";

/**
 * מחלקת גבייה — יצירת דוח גבייה ללקוח.
 * הדוח נשמר כרשומת payment_request עם פירוט חיובים (items),
 * והלקוח צופה בו דרך קישור ציבורי /pay/:token (הצגת מידע בלבד).
 */

export interface LedgerEntryLite {
  entry_type: "charge" | "payment" | "credit";
  amount: number;
  entry_date: string | null;
  description: string | null;
}

export interface ReportItem {
  description: string;
  date: string | null;
  amount: number; // הסכום שנותר לתשלום על החיוב
  status: "פתוח" | "חלקי";
}

/**
 * הקצאת תשלומים/זיכויים לחיובים לפי סדר ותק (הישן קודם),
 * ומחזיר את החיובים שעדיין פתוחים עם הסכום שנותר על כל אחד.
 */
export function computeOpenItems(entries: LedgerEntryLite[]): { items: ReportItem[]; balance: number } {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.entry_date || 0).getTime() - new Date(b.entry_date || 0).getTime()
  );
  const charges = sorted.filter((e) => e.entry_type === "charge");
  let paid = sorted
    .filter((e) => e.entry_type === "payment" || e.entry_type === "credit")
    .reduce((s, e) => s + Number(e.amount), 0);

  const items: ReportItem[] = [];
  for (const c of charges) {
    const amt = Number(c.amount);
    if (paid >= amt) {
      paid -= amt; // חיוב מכוסה במלואו
      continue;
    }
    const remaining = amt - paid;
    items.push({
      description: c.description || "עבודת אינסטלציה",
      date: c.entry_date,
      amount: Math.round(remaining * 100) / 100,
      status: paid > 0 ? "חלקי" : "פתוח",
    });
    paid = 0;
  }
  const balance = items.reduce((s, it) => s + it.amount, 0);
  return { items, balance };
}

/** האם אנחנו בטלפון? (משפיע על אופן פתיחת וואטסאפ) */
export function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * קישור וואטסאפ: בטלפון — פתיחה ישירה של האפליקציה (whatsapp://, בלי דף ביניים בדפדפן);
 * במחשב — wa.me שפותח את וואטסאפ ווב.
 */
export function toWhatsApp(phone: string, text?: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? "972" + digits.slice(1) : digits;
  const encoded = text ? encodeURIComponent(text) : "";
  if (isMobileDevice()) {
    return `whatsapp://send?phone=${intl}` + (text ? `&text=${encoded}` : "");
  }
  return `https://wa.me/${intl}` + (text ? `?text=${encoded}` : "");
}

export function payPageOrigin() {
  return window.location.origin.includes("lovable.app")
    ? window.location.origin
    : "https://yahav-plumbing.lovable.app";
}

export function buildReportMessage(customerName: string, balance: number, payUrl: string) {
  const firstName = (customerName || "").trim().split(" ")[0] || "";
  const amount = "₪" + Math.round(balance).toLocaleString("he-IL");
  return (
    `היי ${firstName}, מצרף דוח מסודר של יתרת התשלום — סה״כ ${amount} 🙏\n` +
    `בקישור תמצאו את הפירוט המלא + אפשרות נוחה לתשלום בביט או בהעברה בנקאית:\n${payUrl}\n\n` +
    `יהב אינסטלציה - פתרונות ביוב ומים | 054-2121204`
  );
}

export interface CreatedReport {
  id: string;
  token: string;
  payUrl: string;
  waUrl: string | null;
  message: string;
  balance: number;
  items: ReportItem[];
}

/**
 * שולף את הכרטסת של הלקוח, מחשב חיובים פתוחים ויוצר דוח גבייה חדש.
 * מחזיר קישור לעמוד הדוח + הודעת וואטסאפ מוכנה.
 */
export async function createCollectionReport(params: {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  userId: string;
}): Promise<CreatedReport> {
  const { data: entries, error: ledgerErr } = await (supabase as any)
    .from("customer_ledger")
    .select("entry_type, amount, entry_date, description")
    .eq("customer_id", params.customerId);
  if (ledgerErr) throw ledgerErr;

  const { items, balance } = computeOpenItems((entries || []) as LedgerEntryLite[]);
  if (balance <= 0) throw new Error("ללקוח אין חוב פתוח — אין מה לכלול בדוח");

  // אם כבר קיים דוח פעיל שלא שולם על אותו סכום — משתמשים בו במקום ליצור כפילות
  const { data: existing } = await (supabase as any)
    .from("payment_requests")
    .select("id, share_token")
    .eq("customer_id", params.customerId)
    .eq("amount", Math.round(balance))
    .eq("is_active", true)
    .is("paid_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  let data: { id: string; share_token: string };
  if (existing && existing.length > 0) {
    data = existing[0];
    // מעדכנים את מועד השליחה האחרון
    await (supabase as any).from("payment_requests")
      .update({ sent_at: new Date().toISOString(), items })
      .eq("id", data.id);
  } else {
    const { data: created, error } = await (supabase as any)
      .from("payment_requests")
      .insert({
        customer_id: params.customerId,
        customer_name: params.customerName,
        customer_phone: params.customerPhone,
        amount: Math.round(balance),
        note: "דוח גבייה — יתרת תשלום עבור עבודות אינסטלציה",
        items,
        sent_at: new Date().toISOString(),
        created_by: params.userId,
      })
      .select("id, share_token")
      .single();
    if (error) throw error;
    data = created;
  }

  const payUrl = `${payPageOrigin()}/pay/${data.share_token}`;
  const message = buildReportMessage(params.customerName, balance, payUrl);
  return {
    id: data.id,
    token: data.share_token,
    payUrl,
    waUrl: params.customerPhone ? toWhatsApp(params.customerPhone, message) : null,
    message,
    balance,
    items,
  };
}
