import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Receipt, AlertCircle, CheckCircle2, Link2, Upload } from "lucide-react";
import { format, isValid } from "date-fns";
import { he } from "date-fns/locale";
import { ImportInvoicesDialog } from "@/components/invoices/ImportInvoicesDialog";

function safeFormat(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isValid(d) ? format(d, "d MMM yyyy", { locale: he }) : null;
}

interface YeshInvoice {
  id: string;
  yesh_doc_id: number | null;
  doc_number: string;
  doc_type: number;
  doc_type_name: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  total_price: number;
  total_vat: number;
  total_with_vat: number;
  date_created: string;
  status: string;
  service_call_id: string | null;
  created_at: string;
}

const Invoices = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<YeshInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [importOpen, setImportOpen] = useState(false);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("yesh_invoices")
        .select("*")
        .order("date_created", { ascending: false });

      if (!error && data) setInvoices(data as YeshInvoice[]);
    } catch (err) {
      console.error("Invoices load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadInvoices(); }, []);

  const filtered = invoices.filter(inv => {
    if (filter === "linked")   return !!inv.service_call_id;
    if (filter === "unlinked") return !inv.service_call_id;
    return true;
  });

  const unlinkedCount = invoices.filter(i => !i.service_call_id).length;
  const totalAmount   = invoices.reduce((s, i) => s + (i.total_with_vat || 0), 0);

  return (
    <AppLayout title="קבלות וחשבוניות">
      <div dir="rtl">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">קבלות וחשבוניות</h1>
            <p className="text-sm text-muted-foreground mt-0.5">חשבוניות מתווספות אוטומטית בעת יצירה</p>
          </div>
          <Button onClick={loadInvoices} variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            רענן
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl border bg-card p-4 text-center">
            <p className="text-2xl font-bold">{invoices.length}</p>
            <p className="text-xs text-muted-foreground">סה"כ מסמכים</p>
          </div>
          <div className="rounded-xl border bg-red-50 dark:bg-red-900/10 p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{unlinkedCount}</p>
            <p className="text-xs text-muted-foreground">לא משויכות לקריאה</p>
          </div>
          <div className="rounded-xl border bg-green-50 dark:bg-green-900/10 p-4 text-center">
            <p className="text-2xl font-bold text-green-700">₪{totalAmount.toLocaleString("he-IL", { maximumFractionDigits: 0 })}</p>
            <p className="text-xs text-muted-foreground">סה"כ הכנסות</p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4">
          {(["all", "unlinked", "linked"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {f === "all" ? `הכל (${invoices.length})` :
               f === "unlinked" ? `לא משויך (${unlinkedCount})` :
               `משויך (${invoices.length - unlinkedCount})`}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {!loading && invoices.length === 0 && (
          <div className="text-center py-16 border border-dashed rounded-xl">
            <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">אין חשבוניות עדיין</p>
            <p className="text-sm text-muted-foreground mt-1">חשבוניות יופיעו כאן אחרי שתיצור אותן מתוך קריאת שירות</p>
          </div>
        )}

        {/* Invoice list */}
        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(inv => (
              <div
                key={inv.id}
                className={`rounded-xl border p-4 transition-colors ${
                  !inv.service_call_id
                    ? "border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-900/10"
                    : "border-border bg-card hover:bg-accent/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Right: details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{inv.customer_name || "לקוח לא ידוע"}</span>
                      {inv.doc_number && (
                        <span className="text-xs text-muted-foreground">#{inv.doc_number}</span>
                      )}
                      {inv.service_call_id ? (
                        <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                          <CheckCircle2 className="w-3 h-3 ml-1" /> משויך לקריאה
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
                          <AlertCircle className="w-3 h-3 ml-1" /> לא משויך
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                      {inv.customer_phone && <span>📞 {inv.customer_phone}</span>}
                      {safeFormat(inv.date_created) && (
                        <span>{safeFormat(inv.date_created)}</span>
                      )}
                      <span className="text-xs">{inv.doc_type_name || "חשבונית מס קבלה"}</span>
                    </div>
                  </div>

                  {/* Left: amount + actions */}
                  <div className="shrink-0 text-left flex flex-col items-end gap-2">
                    <span className="text-lg font-bold text-green-700">
                      ₪{(inv.total_with_vat || 0).toLocaleString("he-IL", { maximumFractionDigits: 0 })}
                    </span>
                    <div className="flex gap-1.5">
                      {inv.service_call_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => navigate(`/service-calls/${inv.service_call_id}`)}
                        >
                          <Link2 className="w-3 h-3" /> פתח קריאה
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Webhook setup instructions */}
        <div className="mt-8 rounded-xl border border-dashed p-4 bg-muted/30">
          <p className="text-sm font-medium mb-1">🔗 כדי לקבל עדכונים בזמן אמת מיש חשבונית:</p>
          <p className="text-xs text-muted-foreground mb-2">
            הכנס את ה-Webhook URL הזה ביש חשבונית → מפתחים → Webhooks:
          </p>
          <code className="text-xs bg-background border rounded px-3 py-1.5 block break-all select-all">
            https://xglagkbblribtztkkovo.supabase.co/functions/v1/yesh-webhook
          </code>
        </div>
      </div>
    </AppLayout>
  );
};

export default Invoices;
