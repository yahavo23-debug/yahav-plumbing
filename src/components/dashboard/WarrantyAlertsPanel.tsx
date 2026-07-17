import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Phone, MessageCircle, ChevronLeft } from "lucide-react";

/**
 * פאנל דשבורד: אחריות שעומדת להיגמר (30 יום קדימה) או שנגמרה לאחרונה (30 יום אחורה).
 * המערכת סופרת את הימים ומציגה בדיוק כמה נשאר / מתי נגמרה — הזדמנות ליצור קשר עם הלקוח.
 */

interface WarrantyAlert {
  id: string;
  product_name: string;
  warranty_until: string;
  customer_id: string;
  customerName: string;
  customerPhone: string | null;
  daysLeft: number; // שלילי = פגה
}

const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("he-IL");

function toWhatsApp(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? "972" + digits.slice(1) : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

export function WarrantyAlertsPanel() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<WarrantyAlert[]>([]);

  useEffect(() => {
    (async () => {
      const today = new Date();
      const in30 = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
      const back30 = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
      const { data } = await (supabase as any)
        .from("warranties")
        .select("id, product_name, warranty_until, customer_id, customers(name, phone)")
        .gte("warranty_until", back30)
        .lte("warranty_until", in30)
        .order("warranty_until", { ascending: true })
        .limit(8);
      const rows: WarrantyAlert[] = ((data || []) as any[]).map((w) => ({
        id: w.id,
        product_name: w.product_name,
        warranty_until: w.warranty_until,
        customer_id: w.customer_id,
        customerName: w.customers?.name || "לקוח",
        customerPhone: w.customers?.phone || null,
        daysLeft: Math.ceil((new Date(w.warranty_until + "T23:59:59").getTime() - Date.now()) / 86400000),
      }));
      setAlerts(rows);
    })();
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white dark:border-amber-700/50 dark:from-amber-900/30 dark:to-amber-950/10 dark:shadow-[0_4px_20px_-8px_rgba(251,191,36,0.35)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center" aria-hidden="true">
          <ShieldAlert className="w-4.5 h-4.5 text-white" />
        </div>
        <h2 className="font-semibold">אחריות בספירה לאחור</h2>
        <span className="text-xs bg-amber-500 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold">
          {alerts.length}
        </span>
      </div>
      <div className="space-y-2">
        {alerts.map((a) => {
          const expired = a.daysLeft < 0;
          const reminderMsg = `היי ${a.customerName.split(" ")[0]}, כאן יהב אינסטלציה 🔧\nרציתי לעדכן שהאחריות על ${a.product_name} ${expired ? "הסתיימה" : `מסתיימת ב-${fmtDate(a.warranty_until)}`}.\nאם יש משהו לבדוק או לטפל — עדיף לפני שנגמרת. אשמח לעזור!\n054-2121204`;
          return (
            <div key={a.id} className="flex items-center gap-3 flex-wrap p-3 rounded-xl bg-card border border-border">
              <button onClick={() => navigate(`/customers/${a.customer_id}?tab=warranties`)} className="flex-1 min-w-0 text-right">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{a.product_name}</span>
                  <span className="text-xs text-muted-foreground">· {a.customerName}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    expired
                      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                      : a.daysLeft <= 7
                      ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                  }`}>
                    {expired ? `נגמרה לפני ${Math.abs(a.daysLeft)} ימים` : `נגמרת בעוד ${a.daysLeft} ימים`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">בתוקף עד {fmtDate(a.warranty_until)}</p>
              </button>
              <div className="flex items-center gap-1.5 shrink-0">
                {a.customerPhone && (
                  <>
                    <a href={`tel:${a.customerPhone}`} className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors" title="התקשר" aria-label={`חייג אל ${a.customerName}`}>
                      <Phone className="w-4 h-4" />
                    </a>
                    <a href={toWhatsApp(a.customerPhone, reminderMsg)} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-green-100 text-green-600 dark:hover:bg-green-900/40 dark:text-green-400 transition-colors" title="וואטסאפ ללקוח" aria-label={`וואטסאפ אל ${a.customerName}`}>
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  </>
                )}
                <button onClick={() => navigate(`/customers/${a.customer_id}?tab=warranties`)} className="p-1 rounded hover:bg-accent transition-colors" aria-label="פתח כרטיס לקוח">
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
