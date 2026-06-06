import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { MaterialsTab } from "@/components/inventory/MaterialsTab";
import { financePaymentMethods } from "@/lib/finance-constants";
import { leadSources } from "@/lib/constants";
import { Loader2, History } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function RetroactiveCustomerDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);

  // Step 1: customer + work info
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [jobType, setJobType] = useState("");
  const [description, setDescription] = useState("");

  // Created entities (after step 1)
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);

  // Step 2: payment
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);

  const reset = () => {
    setStep(1); setSaving(false);
    setName(""); setPhone(""); setAddress(""); setCity(""); setLeadSource("");
    setWorkDate(new Date().toISOString().slice(0, 10));
    setJobType(""); setDescription("");
    setCustomerId(null); setCallId(null);
    setAmount(""); setMethod(""); setReceipt(null);
  };

  const handleClose = (v: boolean) => {
    if (saving) return;
    if (!v) reset();
    onOpenChange(v);
  };

  // Step 1 → create customer + completed call, move to step 2
  const handleStep1 = async () => {
    if (!user) return;
    if (!name.trim()) { toast({ title: "חסר שם לקוח", variant: "destructive" }); return; }
    if (!jobType.trim()) { toast({ title: "חסר סוג עבודה", variant: "destructive" }); return; }

    setSaving(true);
    try {
      const { data: cust, error: cErr } = await supabase.from("customers").insert({
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        lead_source: leadSource || null,
        created_by: user.id,
      } as any).select("id").single();
      if (cErr) throw cErr;

      const completedAt = new Date(`${workDate}T12:00:00`).toISOString();
      const { data: call, error: callErr } = await supabase.from("service_calls").insert({
        customer_id: cust.id,
        job_type: jobType.trim(),
        description: description.trim() || null,
        status: "completed",
        priority: "medium",
        scheduled_date: workDate,
        completed_date: workDate,
        completed_at: completedAt,
        created_by: user.id,
      } as any).select("id").single();
      if (callErr) throw callErr;

      setCustomerId(cust.id);
      setCallId(call.id);
      setStep(2);
    } catch (err: any) {
      console.error("Retro step1 error:", err);
      toast({ title: "שגיאה ביצירה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Step 2 → record payment + finalize
  const handleStep2 = async () => {
    if (!user || !customerId || !callId) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast({ title: "חסר סכום", variant: "destructive" }); return; }
    if (!method) { toast({ title: "חסר אמצעי תשלום", variant: "destructive" }); return; }
    if (!receipt) { toast({ title: "חובה לצרף קבלה", variant: "destructive" }); return; }

    setSaving(true);
    try {
      const { error: ledgerErr } = await (supabase as any).from("customer_ledger").insert({
        customer_id: customerId,
        service_call_id: callId,
        entry_date: workDate,
        entry_type: "payment",
        amount: amt,
        description: description.trim() || jobType.trim(),
        receipt_path: receipt,
        payment_method: method,
        created_by: user.id,
      });
      if (ledgerErr) throw ledgerErr;

      const { error: finErr } = await (supabase as any).from("financial_transactions").insert({
        direction: "income",
        amount: amt,
        txn_date: workDate,
        category: "service_income",
        payment_method: method,
        customer_id: customerId,
        service_call_id: callId,
        counterparty_name: name.trim(),
        notes: description.trim() || jobType.trim(),
        status: "paid",
        doc_type: "receipt",
        doc_path: receipt,
        created_by: user.id,
      });
      if (finErr) throw finErr;

      toast({ title: "הלקוח והעבודה נוספו", description: `נרשמו ₪${amt.toLocaleString()} כהכנסה` });
      const cid = customerId;
      reset();
      onOpenChange(false);
      navigate(`/customers/${cid}`);
    } catch (err: any) {
      console.error("Retro step2 error:", err);
      toast({ title: "שגיאה בשמירת תשלום", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            לקוח רטרואקטיבי — עבודה שכבר בוצעה
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              שלב 1 מתוך 2 — פרטי הלקוח והעבודה. הקריאה תסומן כמושלמת אוטומטית.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>שם לקוח *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} className="h-11" />
              </div>
              <div>
                <Label>טלפון</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" className="h-11" />
              </div>
              <div>
                <Label>כתובת</Label>
                <Input value={address} onChange={e => setAddress(e.target.value)} className="h-11" />
              </div>
              <div>
                <Label>עיר</Label>
                <Input value={city} onChange={e => setCity(e.target.value)} className="h-11" />
              </div>
              <div>
                <Label>מקור הגעה</Label>
                <Select value={leadSource} onValueChange={setLeadSource}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="בחר מקור..." /></SelectTrigger>
                  <SelectContent>
                    {leadSources.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>תאריך העבודה *</Label>
                <Input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} className="h-11" />
              </div>
            </div>
            <div>
              <Label>סוג עבודה *</Label>
              <Input value={jobType} onChange={e => setJobType(e.target.value)} placeholder="לדוגמה: פתיחת סתימה, איתור נזילה..." className="h-11" />
            </div>
            <div>
              <Label>תיאור העבודה שבוצעה</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="פירוט מה נעשה בפועל..." />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={saving}>ביטול</Button>
              <Button onClick={handleStep1} disabled={saving} className="gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                המשך לתשלום וחומרים
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && callId && customerId && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              שלב 2 מתוך 2 — חומרים שהוצאת מהמחסן, תשלום וקבלה. הכל יסונכרן עם הכספים והמלאי.
            </p>

            <div className="border rounded-lg p-3">
              <div className="font-semibold mb-2 text-sm">חומרים מהמחסן (אופציונלי)</div>
              <MaterialsTab serviceCallId={callId} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>סכום שנגבה (₪) *</Label>
                <Input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className="h-11" />
              </div>
              <div>
                <Label>אמצעי תשלום *</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="בחר..." /></SelectTrigger>
                  <SelectContent>
                    {financePaymentMethods.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block">קבלה *</Label>
              <ReceiptUpload
                customerId={customerId}
                currentPath={receipt}
                onUploaded={p => setReceipt(p)}
                onRemoved={() => setReceipt(null)}
              />
              <p className="text-xs text-muted-foreground mt-1">חובה לצרף קבלה לסיום הרישום הרטרואקטיבי.</p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={saving}>סיים מאוחר יותר</Button>
              <Button onClick={handleStep2} disabled={saving || !receipt} className="gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                שמור וסגור
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
