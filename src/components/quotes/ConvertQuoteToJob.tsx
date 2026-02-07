import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { ArrowLeftRight, Loader2 } from "lucide-react";
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

interface ConvertQuoteToJobProps {
  quoteId: string;
  serviceCallId: string;
}

export const ConvertQuoteToJob = ({ quoteId, serviceCallId }: ConvertQuoteToJobProps) => {
  const [converting, setConverting] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleConvert = async () => {
    if (!user) return;
    setConverting(true);

    try {
      // 1. Fetch quote + items + parent service call (for customer info)
      const [quoteRes, itemsRes, scRes] = await Promise.all([
        supabase.from("quotes").select("*").eq("id", quoteId).single(),
        supabase.from("quote_items").select("*").eq("quote_id", quoteId).order("sort_order"),
        supabase.from("service_calls").select("*, customers(name, address, city)").eq("id", serviceCallId).single(),
      ]);

      if (quoteRes.error) throw quoteRes.error;
      if (scRes.error) throw scRes.error;

      const quote = quoteRes.data as any;
      const items = (itemsRes.data || []) as any[];
      const sc = scRes.data as any;

      // 2. Build job notes from line items
      const lineItemsText = items
        .map((item, i) => `${i + 1}. ${item.description} (x${item.quantity}) — ₪${(item.quantity * item.unit_price).toFixed(2)}`)
        .join("\n");

      const jobNotes = [
        `נוצר מהצעת מחיר #${quote.quote_number}`,
        quote.title ? `כותרת: ${quote.title}` : "",
        "",
        "פריטים:",
        lineItemsText,
        "",
        quote.notes ? `הערות הצעה: ${quote.notes}` : "",
      ].filter(Boolean).join("\n");

      // 3. Create new service call
      const { data: newCall, error: insertError } = await supabase
        .from("service_calls")
        .insert({
          customer_id: sc.customer_id,
          job_type: sc.job_type,
          description: quote.title || sc.description || "עבודה מהצעת מחיר",
          notes: jobNotes,
          status: "open",
          priority: "medium",
          quote_id: quoteId,
          created_by: user.id,
        } as any)
        .select()
        .single();

      if (insertError) throw insertError;

      // 4. Update quote status to approved if not already
      if (quote.status !== "approved") {
        await supabase
          .from("quotes")
          .update({ status: "approved" } as any)
          .eq("id", quoteId);
      }

      toast({
        title: "הקריאה נוצרה בהצלחה",
        description: `קריאת שירות חדשה נוצרה מהצעת מחיר #${quote.quote_number}`,
      });

      navigate(`/service-calls/${(newCall as any).id}`);
    } catch (err: any) {
      console.error("Convert quote to job error:", err);
      toast({
        title: "שגיאה",
        description: err.message || "אירעה שגיאה בהמרה",
        variant: "destructive",
      });
    } finally {
      setConverting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={converting}>
          {converting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
          הפוך לקריאה
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>המרת הצעה לקריאת שירות</AlertDialogTitle>
          <AlertDialogDescription>
            תיווצר קריאת שירות חדשה עם פרטי ההצעה, הלקוח ופריטי העבודה.
            ההצעה תסומן כ"אושרה" אם טרם אושרה.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>ביטול</AlertDialogCancel>
          <AlertDialogAction onClick={handleConvert}>
            צור קריאת שירות
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
