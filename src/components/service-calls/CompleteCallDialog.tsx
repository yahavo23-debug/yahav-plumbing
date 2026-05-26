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

interface CompleteCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  call: { id: string; customer_id: string; job_type?: string; customers?: { name?: string } } | null;
  onCompleted?: () => void;
}

export function CompleteCallDialog({ open, onOpenChange, call, onCompleted }: CompleteCallDialogProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [method, setMethod] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && call) {
      setAmount("");
      setDesc(call.job_type ? `שירות: ${call.job_type}` : "");
      setMethod("");
      setReceipt(null);
      setPhotos([]);
    }
  }, [open, call]);

  const handleSave = async () => {
    if (!user || !call) return;
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      toast({ title: "חסר סכום", description: "יש להזין סכום שנגבה", variant: "destructive" });
      return;
    }
    if (!desc.trim()) {
      toast({ title: "חסר פירוט", description: "יש לפרט על מה נגבה הסכום", variant: "destructive" });
      return;
    }
    if (!method) {
      toast({ title: "חסר אמצעי תשלום", description: "יש לבחור אמצעי תשלום", variant: "destructive" });
      return;
    }
    if (!receipt) {
      toast({ title: "חובה לצרף קבלה", description: "לא ניתן לסגור קריאה ללא קבלה", variant: "destructive" });
      return;
    }

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

      const { error: ledgerErr } = await (supabase as any).from("customer_ledger").insert({
        customer_id: call.customer_id,
        service_call_id: call.id,
        entry_date: today,
        entry_type: "payment",
        amount: amt,
        description: desc.trim(),
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

      const { error: callErr } = await supabase
        .from("service_calls")
        .update({ status: "completed", completed_at: new Date().toISOString() } as any)
        .eq("id", call.id);
      if (callErr) throw callErr;

      toast({ title: "הקריאה הושלמה", description: `נגבו ₪${amt.toLocaleString()} ונשמרה קבלה` });
      onOpenChange(false);
      onCompleted?.();
    } catch (err: any) {
      console.error("Complete call error:", err);
      toast({ title: "שגיאה בסגירת קריאה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
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
  );
}
