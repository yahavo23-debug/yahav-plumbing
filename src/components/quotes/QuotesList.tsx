import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { QuoteEditor } from "./QuoteEditor";
import { QuoteSignaturePad } from "./QuoteSignaturePad";
import { ConvertQuoteToJob } from "./ConvertQuoteToJob";
import { Plus, Edit, Trash2, FileText, Pen, Unlock, Send, Loader2, Copy, Check as CheckIcon } from "lucide-react";
import { QuotePdfExport } from "./QuotePdfExport";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  quote_number: number;
  title: string;
  status: string;
  notes: string | null;
  valid_until: string | null;
  created_at: string;
  subtotal: number;
  discount_percent: number;
  total_with_vat: number;
  include_vat: boolean;
  signature_path: string | null;
  signed_at: string | null;
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

// Get the public-facing base URL for share links
const getPublicBaseUrl = (): string => {
  const origin = window.location.origin;
  if (
    origin.includes("preview--") ||
    origin.includes("lovableproject.com") ||
    origin.includes("localhost")
  ) {
    return "https://yahav-plumbing.lovable.app";
  }
  return origin;
};

export const QuotesList = ({ serviceCallId, readOnly = false }: QuotesListProps) => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [signingQuoteId, setSigningQuoteId] = useState<string | null>(null);
  const [sendingQuoteId, setSendingQuoteId] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareMode, setShareMode] = useState<"view" | "sign">("sign");
  const [shareQuoteNumber, setShareQuoteNumber] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const { user, isAdmin } = useAuth();

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
        return {
          id: q.id,
          quote_number: q.quote_number,
          title: q.title,
          status: q.status,
          notes: q.notes,
          valid_until: q.valid_until,
          created_at: q.created_at,
          subtotal,
          discount_percent: discount,
          total_with_vat: afterDiscount,
          include_vat: false,
          signature_path: q.signature_path || null,
          signed_at: q.signed_at || null,
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

  const handleSigned = (quoteId: string, path: string, date: string) => {
    setSigningQuoteId(null);
    setQuotes((prev) =>
      prev.map((q) =>
        q.id === quoteId ? { ...q, signature_path: path, signed_at: date, status: "approved" } : q
      )
    );
  };

  const handleUnlock = async (quoteId: string) => {
    const { error } = await supabase
      .from("quotes")
      .update({ signature_path: null, signed_at: null, signed_by: null, status: "sent" } as any)
      .eq("id", quoteId);
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "נעילה הוסרה", description: "ההצעה נפתחה לעריכה מחדש" });
      setQuotes((prev) =>
        prev.map((q) =>
          q.id === quoteId ? { ...q, signature_path: null, signed_at: null, status: "sent" } : q
        )
      );
    }
  };

  const handleSendToCustomer = async (quoteId: string, quoteNumber: number, mode: "view" | "sign") => {
    if (!user) return;
    setSendingQuoteId(quoteId);
    setShareQuoteNumber(quoteNumber);
    setShareMode(mode);
    try {
      const quote = quotes.find(q => q.id === quoteId);
      if (mode === "sign" && quote && quote.status === "draft") {
        await handleStatusChange(quoteId, "sent");
      }

      // Use quote_shares table with access_mode
      const { data: existing } = await supabase
        .from("quote_shares")
        .select("share_token")
        .eq("quote_id", quoteId)
        .eq("access_mode", mode)
        .eq("is_active", true)
        .is("revoked_at", null)
        .limit(1) as any;

      let token: string;
      if (existing && existing.length > 0) {
        token = existing[0].share_token;
      } else {
        const { data, error } = await supabase
          .from("quote_shares")
          .insert({
            quote_id: quoteId,
            access_mode: mode,
            created_by: user.id,
          } as any)
          .select("share_token")
          .single() as any;
        if (error) throw error;
        token = data.share_token;
      }

      const baseUrl = getPublicBaseUrl();
      const url = `${baseUrl}/q/${token}`;
      setShareUrl(url);
      setShareDialogOpen(true);
    } catch (err: any) {
      console.error("Send to customer error:", err);
      toast({ title: "שגיאה", description: "לא ניתן ליצור קישור שיתוף", variant: "destructive" });
    } finally {
      setSendingQuoteId(null);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast({ title: "הועתק!", description: "הקישור הועתק ללוח" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    if (!shareUrl) return;
    const actionText = shareMode === "sign" ? "לצפייה ולחתימה" : "לצפייה";
    const text = encodeURIComponent(`הצעת מחיר #${shareQuoteNumber} ${actionText}:\n${shareUrl}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
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
          {quotes.map((quote) => {
            const isSigned = !!quote.signature_path;
            return (
            <Card
              key={quote.id}
              className={`hover:shadow-md transition-shadow ${!readOnly && !isSigned ? 'cursor-pointer' : ''}`}
              onClick={() => {
                if (!readOnly && !isSigned) setEditingId(quote.id);
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium truncate">
                        #{quote.quote_number} — {quote.title || "הצעת מחיר"}
                      </span>
                      <Badge className={statusColors[quote.status]}>
                        {statusLabels[quote.status] || quote.status}
                      </Badge>
                      {quote.signature_path && (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-xs">
                          ✓ נחתמה
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
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
                  {!readOnly && isSigned && (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={sendingQuoteId === quote.id}
                        onClick={() => handleSendToCustomer(quote.id, quote.quote_number, "view")}
                      >
                        {sendingQuoteId === quote.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        שלח ללקוח
                      </Button>
                      <QuotePdfExport quoteId={quote.id} serviceCallId={serviceCallId} />
                      {isAdmin && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="פתח נעילה">
                              <Unlock className="w-4 h-4 text-amber-600" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>פתיחת נעילת הצעת מחיר</AlertDialogTitle>
                              <AlertDialogDescription>
                                פעולה זו תסיר את חתימת הלקוח ותפתח את ההצעה לעריכה מחדש. האם להמשיך?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>ביטול</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleUnlock(quote.id)}>
                                פתח נעילה
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  )}
                  {!readOnly && !isSigned && (
                    <div className="flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                      {/* Send to customer for viewing */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={sendingQuoteId === quote.id}
                        onClick={() => handleSendToCustomer(quote.id, quote.quote_number, "view")}
                      >
                        {sendingQuoteId === quote.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        שלח ללקוח
                      </Button>

                      {/* Send to customer for signing */}
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-1.5"
                        disabled={sendingQuoteId === quote.id}
                        onClick={() => handleSendToCustomer(quote.id, quote.quote_number, "sign")}
                      >
                        {sendingQuoteId === quote.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pen className="w-3.5 h-3.5" />}
                        שלח לחתימה
                      </Button>

                      {/* Convert to job — for approved or sent quotes */}
                      {(quote.status === "approved" || quote.status === "sent") && (
                        <ConvertQuoteToJob quoteId={quote.id} serviceCallId={serviceCallId} />
                      )}

                      {/* Signature — for sent/approved quotes without signature */}
                      {(quote.status === "sent" || quote.status === "approved") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => setSigningQuoteId(signingQuoteId === quote.id ? null : quote.id)}
                        >
                          <Pen className="w-3.5 h-3.5" /> חתימה
                        </Button>
                      )}

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

                {/* Inline signature pad */}
                {signingQuoteId === quote.id && (
                  <div className="mt-4 border-t pt-4">
                    <QuoteSignaturePad
                      quoteId={quote.id}
                      existingSignaturePath={quote.signature_path}
                      existingSignedAt={quote.signed_at}
                      onSigned={(path, date) => handleSigned(quote.id, path, date)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
