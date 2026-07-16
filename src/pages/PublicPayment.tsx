import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Check, Loader2, ShieldCheck, Landmark, Smartphone, Phone } from "lucide-react";

/**
 * עמוד תשלום ציבורי יוקרתי ללקוח.
 * מוצג דרך קישור /pay/:token שנשלח בוואטסאפ. מאפשר העתקה בלחיצה של כל פרט,
 * העברה בנקאית או ביט. אין כאן הזנת פרטי אשראי — רק פרטים להעברה.
 */

interface PaymentData {
  customerName: string;
  amount: number;
  note: string | null;
  paid: boolean;
  businessName: string;
  bank: { bankName: string; bankNumber: string; branchNumber: string; accountNumber: string; beneficiaryName: string };
  bitPhone: string;
  logoUrl: string | null;
}

const fmtILS = (n: number) => "₪" + Math.round(n).toLocaleString("he-IL");

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* דפדפן ישן — הלקוח יעתיק ידנית */ }
  };
  return (
    <button
      onClick={copy}
      className="w-full flex items-center justify-between gap-3 py-3 px-4 rounded-xl bg-white/70 hover:bg-white transition-colors border border-slate-200 text-right"
    >
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className="flex items-center gap-2 font-semibold text-slate-800" dir="ltr">
        {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-400" />}
        {value}
      </span>
    </button>
  );
}

const PublicPayment = () => {
  const { token } = useParams();
  const [data, setData] = useState<PaymentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { data: res, error: fnErr } = await supabase.functions.invoke("get-payment-request", {
          body: { share_token: token },
        });
        if (fnErr || !res || res.error) {
          setError(res?.error === "revoked" ? "הקישור בוטל" : "הקישור אינו תקף");
        } else {
          setData(res as PaymentData);
        }
      } catch {
        setError("שגיאה בטעינת הדף");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6" dir="rtl">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-700">{error || "לא נמצא"}</p>
          <p className="text-sm text-slate-500 mt-1">אנא פנה אל יהב אינסטלציה לקבלת קישור מעודכן.</p>
        </div>
      </div>
    );
  }

  const bitLink = `https://www.bitpay.co.il/app/me/${data.bitPhone.replace(/\D/g, "")}`;
  const waBusiness = `https://wa.me/972${data.bitPhone.replace(/\D/g, "").replace(/^0/, "")}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-100 py-8 px-4" dir="rtl">
      <div className="max-w-md mx-auto">

        {/* כותרת יוקרתית */}
        <div className="text-center text-white mb-6">
          {data.logoUrl ? (
            <img src={data.logoUrl} alt="לוגו" className="w-20 h-20 rounded-2xl object-contain mx-auto mb-3 bg-white p-1.5 shadow-xl" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-3">
              <Landmark className="w-9 h-9" />
            </div>
          )}
          <h1 className="text-xl font-bold">{data.businessName}</h1>
          <p className="text-white/60 text-sm mt-0.5">בקשת תשלום</p>
        </div>

        {/* כרטיס הסכום */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-l from-emerald-600 to-teal-600 text-white p-6 text-center">
            <p className="text-white/80 text-sm">שלום {data.customerName},</p>
            <p className="text-white/80 text-sm">סכום לתשלום</p>
            <p className="text-5xl font-extrabold mt-1 tracking-tight">{fmtILS(data.amount)}</p>
            {data.note && <p className="text-white/90 text-sm mt-2">{data.note}</p>}
            {data.paid && (
              <div className="mt-3 inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 text-sm">
                <Check className="w-4 h-4" /> סומן כשולם — תודה!
              </div>
            )}
          </div>

          <div className="p-5 space-y-5">
            {/* ביט */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-500 to-fuchsia-600 flex items-center justify-center">
                  <Smartphone className="w-4 h-4 text-white" />
                </div>
                <p className="font-bold text-slate-800">תשלום מהיר ב-<span className="text-fuchsia-600">bit</span></p>
              </div>
              <CopyRow label="מספר לביט" value={data.bitPhone} />
              <a
                href={bitLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-l from-pink-500 to-fuchsia-600 text-white font-bold shadow-lg hover:opacity-95 transition-opacity"
              >
                <Smartphone className="w-5 h-5" /> פתח את bit לתשלום
              </a>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400">או בהעברה בנקאית</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* העברה בנקאית */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center">
                  <Landmark className="w-4 h-4 text-white" />
                </div>
                <p className="font-bold text-slate-800">העברה בנקאית</p>
              </div>
              <p className="text-xs text-slate-400 mb-2">לחץ על כל שורה כדי להעתיק אותה 👇</p>
              <div className="space-y-2">
                <CopyRow label="בנק" value={`${data.bank.bankName} (${data.bank.bankNumber})`} />
                <CopyRow label="סניף" value={data.bank.branchNumber} />
                <CopyRow label="מספר חשבון" value={data.bank.accountNumber} />
                <CopyRow label="על שם" value={data.bank.beneficiaryName} />
              </div>
            </div>

            {/* צור קשר */}
            <div className="flex gap-2 pt-1">
              <a href={waBusiness} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-50 text-green-700 font-semibold border border-green-200 hover:bg-green-100 transition-colors">
                וואטסאפ
              </a>
              <a href={`tel:${data.bitPhone}`}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-50 text-slate-700 font-semibold border border-slate-200 hover:bg-slate-100 transition-colors">
                <Phone className="w-4 h-4" /> התקשר
              </a>
            </div>
          </div>
        </div>

        <p className="text-center text-white/50 text-xs mt-5 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> דף מאובטח · אין צורך להזין פרטי אשראי
        </p>
      </div>
    </div>
  );
};

export default PublicPayment;
