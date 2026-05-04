import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Clock, FileText } from "lucide-react";

interface PendingQuote {
  id: string;
  quote_number: number;
  title: string;
  status: string;
  created_at: string;
  service_call_id: string;
  customer_name: string;
  call_status: string;
  total: number;
}

const statusLabels: Record<string, string> = {
  draft: "טיוטה",
  sent: "נשלח",
  approved: "אושר",
  rejected: "נדחה",
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const callStatusLabels: Record<string, string> = {
  open: "פתוח", in_progress: "בטיפול", completed: "הושלם",
  cancelled: "בוטל", pending_customer: "ממתין לאישור",
};

export function PendingQuotesPanel() {
  const [quotes, setQuotes] = useState<PendingQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadPendingQuotes();
  }, []);

  const loadPendingQuotes = async () => {
    const { data, error } = await supabase
      .from("quotes")
      .select("id, quote_number, title, status, created_at, service_call_id, service_calls!quotes_service_call_id_fkey!inner(status, customers!inner(name))")
      .in("status", ["draft", "sent"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Load pending quotes error:", error);
      setLoading(false);
      return;
    }

    // Also load totals
    const quoteIds = (data || []).map((q: any) => q.id);
    let itemTotals: Record<string, number> = {};
    if (quoteIds.length > 0) {
      const { data: items } = await supabase
        .from("quote_items")
        .select("quote_id, quantity, unit_price")
        .in("quote_id", quoteIds);
      if (items) {
        for (const item of items) {
          const total = Number(item.quantity) * Number(item.unit_price);
          itemTotals[item.quote_id] = (itemTotals[item.quote_id] || 0) + total;
        }
      }
    }

    const mapped: PendingQuote[] = (data || []).map((q: any) => ({
      id: q.id,
      quote_number: q.quote_number,
      title: q.title,
      status: q.status,
      created_at: q.created_at,
      service_call_id: q.service_call_id,
      customer_name: q.service_calls?.customers?.name || "",
      call_status: q.service_calls?.status || "",
      total: itemTotals[q.id] || 0,
    }));

    setQuotes(mapped);
    setLoading(false);
  };

  if (loading || quotes.length === 0) return null;

  const getDaysOpen = (createdAt: string) => {
    const diff = Date.now() - new Date(createdAt).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-600" />
          הצעות מחיר פתוחות ({quotes.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-right px-4 py-2 font-medium">מס׳</th>
                <th className="text-right px-4 py-2 font-medium">לקוח</th>
                <th className="text-right px-4 py-2 font-medium">סכום</th>
                <th className="text-right px-4 py-2 font-medium">סטטוס הצעה</th>
                <th className="text-right px-4 py-2 font-medium">סטטוס קריאה</th>
                <th className="text-right px-4 py-2 font-medium">ימים פתוח</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const days = getDaysOpen(q.created_at);
                return (
                  <tr
                    key={q.id}
                    className="border-b border-border/50 hover:bg-accent/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/service-calls/${q.service_call_id}`)}
                  >
                    <td className="px-4 py-2 font-medium">#{q.quote_number}</td>
                    <td className="px-4 py-2">{q.customer_name}</td>
                    <td className="px-4 py-2 font-medium">₪{q.total.toLocaleString("he-IL", { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className={`text-xs ${statusColors[q.status] || ""}`}>
                        {statusLabels[q.status] || q.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {callStatusLabels[q.call_status] || q.call_status}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`flex items-center gap-1 ${days > 14 ? "text-destructive font-medium" : days > 7 ? "text-amber-600" : "text-muted-foreground"}`}>
                        <Clock className="w-3.5 h-3.5" />
                        {days} ימים
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
