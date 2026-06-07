import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { FileText, Phone, UserPlus } from "lucide-react";
import { WalkInQuoteDialog } from "@/components/quotes/WalkInQuoteDialog";

type QuoteFilter = "all" | "open" | "approved" | "rejected";

const filterTabs: { value: QuoteFilter; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "open", label: "פתוחות / בביצוע" },
  { value: "approved", label: "אושרו" },
  { value: "rejected", label: "מבוטלות" },
];

const statusLabels: Record<string, string> = {
  draft: "טיוטה",
  sent: "נשלחה",
  approved: "אושרה",
  rejected: "נדחתה",
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/15 text-primary border-primary/30",
  approved: "bg-success/15 text-success border-success/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
};

interface QuoteRow {
  id: string;
  quote_number: number;
  title: string | null;
  status: string;
  created_at: string;
  rejection_reason: string | null;
  service_call_id: string;
  total: number;
  customer_name: string | null;
  customer_phone: string | null;
}

const Quotes = () => {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<QuoteFilter>("open");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, title, status, created_at, rejection_reason, service_call_id, discount_percent, service_calls!quotes_service_call_id_fkey(customers(name, phone))")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data as any[]) || [];
      const ids = rows.map((q) => q.id);
      let totals: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: items } = await supabase
          .from("quote_items")
          .select("quote_id, quantity, unit_price")
          .in("quote_id", ids);
        (items as any[] || []).forEach((it) => {
          totals[it.quote_id] = (totals[it.quote_id] || 0) + Number(it.quantity) * Number(it.unit_price);
        });
      }

      setQuotes(
        rows.map((q) => {
          const subtotal = totals[q.id] || 0;
          const discount = Number(q.discount_percent) || 0;
          const customer = q.service_calls?.customers;
          return {
            id: q.id,
            quote_number: q.quote_number,
            title: q.title,
            status: q.status,
            created_at: q.created_at,
            rejection_reason: q.rejection_reason,
            service_call_id: q.service_call_id,
            total: subtotal * (1 - discount / 100),
            customer_name: customer?.name || null,
            customer_phone: customer?.phone || null,
          };
        })
      );
    } catch (err: any) {
      console.error(err);
      toast({ title: "שגיאה", description: "לא ניתן לטעון הצעות מחיר", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const counts = {
    all: quotes.length,
    open: quotes.filter((q) => q.status === "draft" || q.status === "sent").length,
    approved: quotes.filter((q) => q.status === "approved").length,
    rejected: quotes.filter((q) => q.status === "rejected").length,
  };

  const filtered = quotes.filter((q) => {
    if (filter === "all") return true;
    if (filter === "open") return q.status === "draft" || q.status === "sent";
    return q.status === filter;
  });

  const handleCall = (e: React.MouseEvent, phone: string | null) => {
    e.stopPropagation();
    if (!phone) {
      toast({ title: "אין מספר טלפון", variant: "destructive" });
      return;
    }
    window.location.href = `tel:${phone}`;
  };

  return (
    <AppLayout title="הצעות מחיר">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex gap-2 flex-wrap">
          {filterTabs.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={() => setFilter(f.value)}
            >
              {f.label}
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {counts[f.value]}
              </Badge>
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          className="gap-2"
          onClick={() => setWalkInOpen(true)}
        >
          <UserPlus className="w-4 h-4" />
          הצעה ללקוח מזדמן
        </Button>
      </div>

      <WalkInQuoteDialog open={walkInOpen} onOpenChange={setWalkInOpen} />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-16 h-16 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">אין הצעות מחיר בקטגוריה זו</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => (
            <Card
              key={q.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/service-calls/${q.service_call_id}?tab=quotes`)}
            >
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold truncate">
                      #{q.quote_number} — {q.title || "הצעת מחיר"}
                    </h3>
                    <Badge className={statusColors[q.status]}>
                      {statusLabels[q.status] || q.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {q.customer_name || "—"} • ₪{q.total.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(q.created_at).toLocaleDateString("he-IL")}
                  </p>
                  {q.status === "rejected" && q.rejection_reason && (
                    <p className="mt-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded px-2 py-1">
                      סיבת ביטול: {q.rejection_reason}
                    </p>
                  )}
                </div>
                {q.customer_phone && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    onClick={(e) => handleCall(e, q.customer_phone)}
                  >
                    <Phone className="w-3.5 h-3.5" /> חייג
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  );
};

export default Quotes;
