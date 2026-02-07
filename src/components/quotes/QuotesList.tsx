import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { QuoteEditor } from "./QuoteEditor";
import { Plus, Edit, Trash2, FileText } from "lucide-react";
import { QuotePdfExport } from "./QuotePdfExport";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Quote {
  id: string;
  title: string;
  status: string;
  notes: string | null;
  valid_until: string | null;
  created_at: string;
  subtotal: number;
  discount_percent: number;
  total_with_vat: number;
}

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

interface QuotesListProps {
  serviceCallId: string;
  readOnly?: boolean;
}

export const QuotesList = ({ serviceCallId, readOnly = false }: QuotesListProps) => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadQuotes = useCallback(async () => {
    const { data: quotesData, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("service_call_id", serviceCallId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן לטעון הצעות מחיר", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Load totals for each quote
    const quoteIds = (quotesData as any[]).map((q) => q.id);
    let itemsByQuote: Record<string, number> = {};

    if (quoteIds.length > 0) {
      const { data: items } = await supabase
        .from("quote_items")
        .select("quote_id, quantity, unit_price")
        .in("quote_id", quoteIds);

      if (items) {
        (items as any[]).forEach((item) => {
          const total = Number(item.quantity) * Number(item.unit_price);
          itemsByQuote[item.quote_id] = (itemsByQuote[item.quote_id] || 0) + total;
        });
      }
    }

    setQuotes(
      (quotesData as any[]).map((q) => {
        const subtotal = itemsByQuote[q.id] || 0;
        const discount = Number(q.discount_percent) || 0;
        const afterDiscount = subtotal * (1 - discount / 100);
        const totalWithVat = afterDiscount * 1.18;
        return {
          id: q.id,
          title: q.title,
          status: q.status,
          notes: q.notes,
          valid_until: q.valid_until,
          created_at: q.created_at,
          subtotal,
          discount_percent: discount,
          total_with_vat: totalWithVat,
        };
      })
    );
    setLoading(false);
  }, [serviceCallId]);

  useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  const handleDelete = async (quoteId: string) => {
    const { error } = await supabase.from("quotes").delete().eq("id", quoteId);
    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן למחוק", variant: "destructive" });
    } else {
      toast({ title: "נמחק", description: "הצעת המחיר נמחקה" });
      setQuotes((prev) => prev.filter((q) => q.id !== quoteId));
    }
  };

  const handleStatusChange = async (quoteId: string, newStatus: string) => {
    const { error } = await supabase
      .from("quotes")
      .update({ status: newStatus } as any)
      .eq("id", quoteId);
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    } else {
      setQuotes((prev) =>
        prev.map((q) => (q.id === quoteId ? { ...q, status: newStatus } : q))
      );
    }
  };

  const handleSaved = () => {
    setCreating(false);
    setEditingId(null);
    loadQuotes();
  };

  if (!readOnly && (creating || editingId)) {
    return (
      <QuoteEditor
        serviceCallId={serviceCallId}
        quoteId={editingId || undefined}
        onSaved={handleSaved}
        onCancel={() => {
          setCreating(false);
          setEditingId(null);
        }}
      />
    );
  }

  if (loading) {
    return <p className="text-center py-8 text-muted-foreground">טוען...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-medium">הצעות מחיר ({quotes.length})</h3>
        {!readOnly && (
          <Button onClick={() => setCreating(true)} className="gap-2" size="sm">
            <Plus className="w-4 h-4" /> הצעה חדשה
          </Button>
        )}
      </div>

      {quotes.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground">אין הצעות מחיר עדיין</p>
            {!readOnly && (
              <Button onClick={() => setCreating(true)} variant="outline" className="mt-4 gap-2">
                <Plus className="w-4 h-4" /> צור הצעה ראשונה
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {quotes.map((quote) => (
            <Card key={quote.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">
                        {quote.title || "הצעת מחיר"}
                      </span>
                      <Badge className={statusColors[quote.status]}>
                        {statusLabels[quote.status] || quote.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">₪{quote.total_with_vat.toFixed(2)}</span>
                      {quote.discount_percent > 0 && (
                        <span className="text-destructive text-xs">הנחה {quote.discount_percent}%</span>
                      )}
                      <span>{new Date(quote.created_at).toLocaleDateString("he-IL")}</span>
                      {quote.valid_until && (
                        <span>
                          בתוקף עד {new Date(quote.valid_until).toLocaleDateString("he-IL")}
                        </span>
                      )}
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="flex items-center gap-1">
                      {quote.status === "draft" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusChange(quote.id, "sent")}
                        >
                          שלח
                        </Button>
                      )}
                      {quote.status === "sent" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusChange(quote.id, "approved")}
                            className="text-success"
                          >
                            אשר
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusChange(quote.id, "rejected")}
                            className="text-destructive"
                          >
                            דחה
                          </Button>
                        </>
                      )}
                      <QuotePdfExport quoteId={quote.id} serviceCallId={serviceCallId} />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditingId(quote.id)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>מחיקת הצעת מחיר</AlertDialogTitle>
                            <AlertDialogDescription>
                              האם למחוק את הצעת המחיר? פעולה זו אינה ניתנת לביטול.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>ביטול</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(quote.id)}>
                              מחק
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
