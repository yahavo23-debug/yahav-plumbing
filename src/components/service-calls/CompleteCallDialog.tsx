import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReceiptUpload } from "@/components/billing/ReceiptUpload";
import { financePaymentMethods } from "@/lib/finance-constants";
import { AlertTriangle } from "lucide-react";

interface CompleteCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  call: { id: string; customer_id: string; job_type?: string; customers?: { name?: string } } | null;
  onCompleted?: () => void;
}

/** מידע על חוב פתוח של הלקוח — להתאמה חכמה בין תשלום הקריאה לחוב */
interface OpenDebt {
  balance: number;
  since: string | null;
}

export function CompleteCallDialog({ open, onOpenChange, call, onCompleted }: CompleteCallDialogProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [method, setMethod] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  // מודאל התאמה חכמה: ללקוח יש חוב פתוח — האם התשלום מכסה אותו?
  const [debtPrompt, setDebtPrompt] = useState<OpenDebt | null>(null);

  useEffect(() => {
    if (open && call) {
      setAmount("");
      setDesc(call.job_type ? `שירות: ${call.job_type}` : "");
      setMethod("");
      setReceipt(null);
      setPhotos([]);
      setDebtPrompt(null);
    }
  }, [open, call]);

  const validate = (): number | null => {
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      toast({ title: "חסר סכום", description: "יש להזין סכום שנגבה", variant: "destructive" });
      return null;
    }
    if (!desc.trim()) {
      toast({ title: "חסר פירוט", description: "יש לפרט על מה נגבה הסכום", variant: "destructive" });
      return null;
    }
    if (!method) {
      toast({ title: "חסר אמצעי תשלום", description: "יש לבחור אמצעי תשלום", variant: "destructive" });
      return null;
    }
    if (!receipt) {
      toast({ title: "חובה לצרף קבלה", description: "לא ניתן לסגור קריאה ללא קבלה", variant: "destructive" });
      return null;
    }
    return amt;
  };

  /** בדיקת חוב פתוח לפני שמירה — אם קיים, שואלים את המשתמש למה מיועד התשלום */
  const handleSave = async () => {
    if (!user || !call) return;
    const amt = validate();
    if (amt === null) return;

    setSaving(true);
    try {
      const { data: entries } = await (supabase as any)
        .from("customer_ledger")
        .select("entry_type, amount, entry_date")
        .eq("customer_id", call.customer_id)
        .order("entry_date", { ascending: true });
      const list = (entries || []) as any[];
      const charges = list.filter((e) => e.entry_type === "charge");
      const balance =
        charges.reduce((s, e) => s + Number(e.amount), 0) -
        list.filter((e) => e.entry_type === "payment" || e.entry_type === "credit")
          .reduce((s, e) => s + Number(e.amount), 0);

      if (balance > 0.5) {
        // יש חוב פתוח — עוצרים ושואלים במקום לסגור אותו בטעות
        setDebtPrompt({ balance, since: charges[0]?.entry_date || null });
        setSaving(false);
        return;
      }
      await doSave(amt, null);
    } catch (err: any) {
      console.error("Complete call error:", err);
      toast({ title: "שגיאה בסגירת קריאה", description: err.message, variant: "destructive" });
      setSaving(false);
    }
  };

  /**
   * שמירה בפועל.
   * coversDebt=true  → התשלום מכסה את החוב הישן (רישום תשלום רגיל שמקזז את הכרטסת).
   * coversDebt=false → תשלום נפרד על הקריאה: נרשם גם חיוב מקביל על העבודה הנוכחית
   *                    כדי שהחוב הישן יישאר פתוח, והלקוח מסומן בדגל "לתזכר" בגבייה.
   * coversDebt=null  → אין חוב פתוח, זרימה רגילה.
   */
  const doSave = async (amt: number, coversDebt: boolean | null) => {
    if (!user || !call) return;
    setSaving(true);
    try {
      for (const file of photos) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${call.id}/complete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("photos").upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        await supabase.from("service_call_photos").insert({
          service_call_id: call.id,
          storage_path: path,
          tag: "after",
          uploaded_by: user.id,
          caption: "תיעוד סיום קריאה",
        });
      }

      const today = new Date().toISOString().slice(0, 10);

      if (coversDebt === false) {
        // חיוב מקביל על העבודה הנוכחית — כך התשלום לא "בולע" את החוב הישן
        const { error: chargeErr } = await (supabase as any).from("customer_ledger").insert({
          customer_id: call.customer_id,
          service_call_id: call.id,
          entry_date: today,
          entry_type: "charge",
          amount: amt,
          description: desc.trim(),
          created_by: user.id,
        });
        if (chargeErr) throw chargeErr;
      }

      const { error: ledgerErr } = await (supabase as any).from("customer_ledger").insert({
        customer_id: call.customer_id,
        service_call_id: call.id,
        entry_date: today,
        entry_type: "payment",
        amount: amt,
        description: coversDebt === true ? `${desc.trim()} (כיסוי חוב פתוח)` : desc.trim(),
        receipt_path: receipt,
        payment_method: method,
        created_by: user.id,
      });
      if (ledgerErr) throw ledgerErr;

      await (supabase as any).from("financial_transactions").insert({
        direction: "income",
        amount: amt,
        txn_date: today,
        category: "service_income",
        payment_method: method,
        customer_id: call.customer_id,
        service_call_id: call.id,
        counterparty_name: call.customers?.name || null,
        notes: desc.trim(),
        status: "paid",
        doc_type: "receipt",
        doc_path: receipt,
        created_by: user.id,
      });

      if (coversDebt === true && debtPrompt && amt >= debtPrompt.balance - 0.5) {
        // החוב כוסה במלואו — סוגרים גם בקשות תשלום/דוחות גבייה פתוחים של הלקוח
        await (supabase as any)
          .from("payment_requests")
          .update({ paid_at: new Date().toISOString() })
          .eq("customer_id", call.customer_id)
          .eq("is_active", true)
          .is("paid_at", null);
      }

      if (coversDebt === false) {
        // דגל תזכורת בלוח הבקרה של מחלקת הגבייה
        await (supabase as any)
          .from("customers")
          .update({ collection_flag: true, collection_flag_at: new Date().toISOString() })
          .eq("id", call.customer_id);
      }

      const { error: callErr } = await supabase
        .from("service_calls")
        .update({ status: "completed", completed_at: new Date().toISOString() } as any)
        .eq("id", call.id);
      if (callErr) throw callErr;

      const extra =
        coversDebt === true
          ? " — התשלום נזקף לכיסוי החוב הפתוח"
          : coversDebt === false
          ? " — החוב הישן נשאר פתוח וסומן לתזכורת בגבייה"
          : "";
      toast({ title: "הקריאה הושלמה", description: `נגבו ₪${amt.toLocaleString()} ונשמרה קבלה${extra}` });
      setDebtPrompt(null);
      onOpenChange(false);
      onCompleted?.();
    } catch (err: any) {
      console.error("Complete call error:", err);
      toast({ title: "שגיאה בסגירת קריאה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const firstName = (call?.customers?.name || "הלקוח").trim().split(" ")[0];

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            סגירת קריאה - {call?.customers?.name || "גביית תשלום"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">סכום שנגבה (₪) <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </div>
            <div>
              <Label className="mb-1.5 block">אמצעי תשלום <span className="text-destructive">*</span></Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue placeholder="בחר אמצעי" /></SelectTrigger>
                <SelectContent>
                  {financePaymentMethods.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">על מה נגבה <span className="text-destructive">*</span></Label>
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="פירוט העבודה / החלקים שהוחלפו..."
            />
          </div>

          <div>
            <Label className="mb-1.5 block">קבלה <span className="text-destructive">*</span></Label>
            {call && (
              <ReceiptUpload
                customerId={call.customer_id}
                currentPath={receipt}
                onUploaded={(p) => setReceipt(p)}
                onRemoved={() => setReceipt(null)}
              />
            )}
            <p className="text-xs text-muted-foreground mt-1">חובה לצרף קבלה - לא ניתן לסגור קריאה ללא קבלה.</p>
          </div>

          <div>
            <Label className="mb-1.5 block">תמונות סיום (אופציונלי)</Label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setPhotos(Array.from(e.target.files || []))}
              className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-md file:border file:border-input file:bg-background file:text-sm file:font-medium hover:file:bg-accent"
            />
            {photos.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{photos.length} תמונות נבחרו</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>ביטול</Button>
          <Button onClick={handleSave} disabled={saving || !receipt} className="gap-2">
            {saving ? "שומר..." : "סגור קריאה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* התאמה חכמה — ללקוח יש חוב פתוח במחלקת הגבייה */}
    <Dialog open={!!debtPrompt} onOpenChange={(o) => { if (!o && !saving) setDebtPrompt(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            ל{firstName} יש חוב פתוח
          </DialogTitle>
        </DialogHeader>
        {debtPrompt && (
          <div className="py-1 space-y-2 text-sm">
            <p>
              במחלקת הגבייה רשום ל{call?.customers?.name || "לקוח"} חוב פתוח על סך{" "}
              <b className="text-destructive">₪{Math.round(debtPrompt.balance).toLocaleString("he-IL")}</b>
              {debtPrompt.since && (
                <> מתאריך <b>{new Date(debtPrompt.since).toLocaleDateString("he-IL")}</b></>
              )}.
            </p>
            <p className="font-medium">האם התשלום של ₪{Math.round(parseFloat(amount) || 0).toLocaleString("he-IL")} מיועד לכיסוי החוב הזה?</p>
            <p className="text-xs text-muted-foreground">
              אם תבחר "לא" — התשלום יירשם על העבודה הנוכחית בלבד, החוב הישן יישאר פתוח,
              והלקוח יסומן בדגל תזכורת ⚠ במחלקת הגבייה.
            </p>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => doSave(parseFloat(amount), false)}
          >
            לא — תשלום נפרד על הקריאה
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={saving}
            onClick={() => doSave(parseFloat(amount), true)}
          >
            {saving ? "שומר..." : "כן — לכיסוי החוב"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
