import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Phone, Clock, ChevronDown, ChevronUp, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface OpenQuote {
  id: string;
  quote_number: number;
  title: string;
  status: string;
  created_at: string;
  service_call_id: string;
  customer_name: string;
  customer_phone: string | null;
  total: number;
}

const statusLabels: Record<string, string> = {
  draft: "טיוטה",
  sent: "נשלח",
};

const REASONS = [
  { value: "no_answer", label: "לקוח לא ענה" },
  { value: "found_cheaper", label: "מצא זול יותר" },
  { value: "other", label: "אחר (טקסט חופשי)" },
];

function getDaysOpen(createdAt: string) {
  const diff = Date.now() - new Date(createdAt).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function OpenQuotesPanel() {
  const [quotes, setQuotes] = useState<OpenQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<OpenQuote | null>(null);
  const [reasonChoice, setReasonChoice] = useState<string>("no_answer");
  const [reasonText, setReasonText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quotes")
      .select(
        "id, quote_number, title, status, created_at, service_call_id, service_calls!quotes_service_call_id_fkey!inner(customers!inner(name, phone))"
      )
      .in("status", ["draft", "sent"])
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Load open quotes error:", error);
      setLoading(false);
      return;
    }

    const ids = (data || []).map((q: any) => q.id);
    const totals: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: items } = await supabase
        .from("quote_items")
        .select("quote_id, quantity, unit_price")
        .in("quote_id", ids);
      for (const it of items || []) {
        totals[it.quote_id] =
          (totals[it.quote_id] || 0) + Number(it.quantity) * Number(it.unit_price);
      }
    }

    setQuotes(
      (data || []).map((q: any) => ({
        id: q.id,
        quote_number: q.quote_number,
        title: q.title,
        status: q.status,
        created_at: q.created_at,
        service_call_id: q.service_call_id,
        customer_name: q.service_calls?.customers?.name || "",
        customer_phone: q.service_calls?.customers?.phone || null,
        total: totals[q.id] || 0,
      }))
    );
    setLoading(false);
  };

  const openCancelDialog = (q: OpenQuote) => {
    setCancelTarget(q);
    setReasonChoice("no_answer");
    setReasonText("");
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    const reasonLabel =
      REASONS.find((r) => r.value === reasonChoice)?.label || "אחר";
    const finalReason =
      reasonChoice === "other"
        ? reasonText.trim() || "אחר"
        : reasonText.trim()
        ? `${reasonLabel} — ${reasonText.trim()}`
        : reasonLabel;

    setSubmitting(true);
    const { error } = await supabase
      .from("quotes")
      .update({
        status: "rejected",
        rejection_reason: finalReason,
      } as any)
      .eq("id", cancelTarget.id);
    setSubmitting(false);

    if (error) {
      toast({
        title: "שגיאה",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "ההצעה בוטלה", description: finalReason });
    setQuotes((prev) => prev.filter((q) => q.id !== cancelTarget.id));
    setCancelTarget(null);
  };

  if (loading || quotes.length === 0) return null;

  return (
    <>
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 mb-6 overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-amber-500/10 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileText className="w-4 h-4 text-amber-600" />
            <span>הצעות מחיר פתוחות</span>
            <Badge variant="outline" className="text-[10px] h-5">
              {quotes.length}
            </Badge>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {expanded && (
          <div className="flex gap-2 px-3 pb-2 overflow-x-auto">
            {quotes.map((q) => {
              const days = getDaysOpen(q.created_at);
              const stale = days >= 2;
              return (
                <div
                  key={q.id}
                  className={cn(
                    "shrink-0 w-64 rounded-lg border-2 p-2 bg-card transition-all",
                    stale
                      ? "border-destructive animate-pulse shadow-[0_0_0_2px_hsl(var(--destructive)/0.2)]"
                      : "border-border hover:border-amber-500/40"
                  )}
                >
                  <div
                    className="cursor-pointer"
                    onClick={() => navigate(`/service-calls/${q.service_call_id}`)}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-semibold text-sm truncate">
                        {q.customer_name}
                      </span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        #{q.quote_number}
                      </Badge>
                    </div>
                    {q.title && (
                      <p className="text-xs text-muted-foreground truncate mb-1">
                        {q.title}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-foreground">
                        ₪
                        {q.total.toLocaleString("he-IL", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          q.status === "sent"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-muted"
                        )}
                      >
                        {statusLabels[q.status] || q.status}
                      </Badge>
                    </div>
                    <div
                      className={cn(
                        "flex items-center gap-1 text-[11px] mt-1",
                        stale
                          ? "text-destructive font-semibold"
                          : "text-muted-foreground"
                      )}
                    >
                      <Clock className="w-3 h-3" />
                      {days === 0 ? "פחות מיום" : `${days} ימים פתוח`}
                    </div>
                  </div>

                  <div className="flex gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                    {q.customer_phone && (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 gap-1 text-xs"
                      >
                        <a href={`tel:${q.customer_phone}`}>
                          <Phone className="w-3 h-3" />
                          התקשר
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => openCancelDialog(q)}
                    >
                      <X className="w-3 h-3" />
                      בטל
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              ביטול הצעת מחיר #{cancelTarget?.quote_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {cancelTarget?.customer_name} — בחר סיבת ביטול:
            </p>
            <RadioGroup value={reasonChoice} onValueChange={setReasonChoice}>
              {REASONS.map((r) => (
                <div key={r.value} className="flex items-center gap-2">
                  <RadioGroupItem value={r.value} id={`reason-${r.value}`} />
                  <Label htmlFor={`reason-${r.value}`} className="cursor-pointer">
                    {r.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <div>
              <Label htmlFor="reason-text" className="text-xs">
                הערה {reasonChoice === "other" ? "(חובה)" : "(אופציונלי)"}
              </Label>
              <Textarea
                id="reason-text"
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="פרטים נוספים..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              חזור
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancel}
              disabled={
                submitting ||
                (reasonChoice === "other" && !reasonText.trim())
              }
            >
              {submitting ? "מבטל..." : "בטל הצעה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
