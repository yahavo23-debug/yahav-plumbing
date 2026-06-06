import { useState, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import { ReceiptUpload } from "@/components/billing/ReceiptUpload";
import { MaterialsTab } from "@/components/inventory/MaterialsTab";
import { financePaymentMethods } from "@/lib/finance-constants";
import { leadSources } from "@/lib/constants";
import {
  Loader2, History, User, Briefcase, Package, CreditCard,
  CheckCircle2, ArrowRight, ArrowLeft, TrendingUp, Heart,
  Sparkles, DollarSign, Receipt as ReceiptIcon, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PAID_LEAD_SOURCES = ["facebook", "instagram", "google", "google_ads", "easy", "alufim", "tiktok", "madrag", "shapatz"];
const RECOMMENDATION_SOURCES = ["recommendation", "referral", "word_of_mouth"];

const isPaidLead = (src: string) => PAID_LEAD_SOURCES.includes(src);
const isRecommendation = (src: string) => RECOMMENDATION_SOURCES.includes(src);

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function RetroactiveCustomerDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [leadCost, setLeadCost] = useState("");
  const [referrerName, setReferrerName] = useState("");
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [jobType, setJobType] = useState("");
  const [description, setDescription] = useState("");

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);

  const netProfit = useMemo(() => {
    const amt = parseFloat(amount) || 0;
    const cost = parseFloat(leadCost) || 0;
    return amt - cost;
  }, [amount, leadCost]);

  const reset = () => {
    setStep(1); setSaving(false);
    setName(""); setPhone(""); setAddress(""); setCity("");
    setLeadSource(""); setLeadCost(""); setReferrerName("");
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

  const setDateOffset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    setWorkDate(d.toISOString().slice(0, 10));
  };

  const handleStep1 = async () => {
    if (!user) return;
    if (!name.trim()) { toast({ title: "חסר שם לקוח", variant: "destructive" }); return; }
    if (!jobType.trim()) { toast({ title: "חסר סוג עבודה", variant: "destructive" }); return; }

    setSaving(true);
    try {
      const sourceNotes = isRecommendation(leadSource) && referrerName.trim()
        ? `המלצה מ-${referrerName.trim()}`
        : null;

      const { data: cust, error: cErr } = await supabase.from("customers").insert({
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        lead_source: leadSource || null,
        referrer_name: isRecommendation(leadSource) ? referrerName.trim() || null : null,
        lead_cost: isPaidLead(leadSource) && leadCost ? parseFloat(leadCost) : null,
        notes: sourceNotes,
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

      if (isPaidLead(leadSource) && leadCost) {
        const cost = parseFloat(leadCost);
        if (cost > 0) {
          await (supabase as any).from("financial_transactions").insert({
            direction: "expense",
            amount: cost,
            txn_date: workDate,
            category: "marketing",
            payment_method: "credit_card",
            customer_id: cust.id,
            counterparty_name: leadSources.find(s => s.value === leadSource)?.label || leadSource,
            notes: `עלות ליד עבור ${name.trim()}`,
            status: "paid",
            created_by: user.id,
          });
        }
      }

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

      const profitMsg = netProfit > 0 && parseFloat(leadCost) > 0
        ? ` • רווח נקי: ₪${netProfit.toLocaleString()}`
        : "";
      toast({
        title: "✓ הלקוח והעבודה נוספו",
        description: `נרשמו ₪${amt.toLocaleString()} כהכנסה${profitMsg}`,
      });
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
      <DialogContent dir="rtl" className="max-w-2xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-4 bg-gradient-to-l from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-b">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
              <History className="w-5 h-5 text-amber-700 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-lg">לקוח רטרואקטיבי</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                עבודה שכבר בוצעה — תיעוד מלא בלחיצה אחת
              </p>
            </div>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-2 mt-4">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              step === 1 ? "bg-amber-500 text-white" : "bg-green-500 text-white"
            )}>
              {step === 1 ? <span>1</span> : <CheckCircle2 className="w-4 h-4" />}
              פרטי לקוח ועבודה
            </div>
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              step === 2 ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"
            )}>
              <span>2</span>
              תשלום וחומרים
            </div>
          </div>
        </DialogHeader>

        {step === 1 && (
          <div className="px-6 py-4 space-y-5">
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <User className="w-4 h-4" />
                <h3 className="font-semibold text-sm">פרטי הלקוח</h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>שם לקוח *</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} className="h-11" placeholder="לדוגמה: יוסי כהן" />
                </div>
                <div>
                  <Label>טלפון</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" className="h-11" placeholder="050-1234567" />
                </div>
                <div>
                  <Label>כתובת</Label>
                  <Input value={address} onChange={e => setAddress(e.target.value)} className="h-11" />
                </div>
                <div>
                  <Label>עיר</Label>
                  <Input value={city} onChange={e => setCity(e.target.value)} className="h-11" />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                <TrendingUp className="w-4 h-4" />
                <h3 className="font-semibold text-sm">מאיפה הלקוח הגיע?</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <Label>מקור הגעה</Label>
                  <Select value={leadSource} onValueChange={setLeadSource}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="בחר מקור..." /></SelectTrigger>
                    <SelectContent>
                      {leadSources.map(s => (
                        <SelectItem key={s.value} value={s.value}>
                          <span className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                            {s.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isPaidLead(leadSource) && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-amber-600" />
                      עלות הליד (₪)
                      <Badge variant="outline" className="text-[10px] mr-1">ירשם כהוצאה שיווקית</Badge>
                    </Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={leadCost}
                      onChange={e => setLeadCost(e.target.value)}
                      className="h-11"
                      placeholder="לדוגמה: 50"
                    />
                    <p className="text-xs text-muted-foreground">
                      ככה תדע בסוף החודש כמה הלידים מ-{leadSources.find(s => s.value === leadSource)?.label} מחזירים לך
                    </p>
                  </div>
                )}

                {isRecommendation(leadSource) && (
                  <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Heart className="w-4 h-4 text-rose-600" />
                      מי המליץ עליך?
                      <Badge variant="outline" className="text-[10px] mr-1">שווה לזכור כדי להודות</Badge>
                    </Label>
                    <Input
                      value={referrerName}
                      onChange={e => setReferrerName(e.target.value)}
                      className="h-11"
                      placeholder="לדוגמה: דנה משולם / שכן מהבניין"
                    />
                    <p className="text-xs text-muted-foreground">
                      תוכל אחר כך לראות מי הכי ממליץ עליך ולתת לו תודה (או הנחה)
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                <Briefcase className="w-4 h-4" />
                <h3 className="font-semibold text-sm">פרטי העבודה</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <Label>תאריך העבודה *</Label>
                  <Input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} className="h-11" />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setDateOffset(0)}>היום</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setDateOffset(1)}>אתמול</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setDateOffset(7)}>שבוע שעבר</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setDateOffset(30)}>חודש שעבר</Button>
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
              </div>
            </section>

            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => handleClose(false)} disabled={saving}>ביטול</Button>
              <Button onClick={handleStep1} disabled={saving} className="gap-2 bg-blue-600 hover:bg-blue-700">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                המשך לתשלום וחומרים
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && callId && customerId && (
          <div className="px-6 py-4 space-y-5">
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                <Package className="w-4 h-4" />
                <h3 className="font-semibold text-sm">
                  חומרים מהמחסן <Badge variant="outline" className="text-xs mr-1">אופציונלי</Badge>
                </h3>
              </div>
              <div className="p-4 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
                <MaterialsTab serviceCallId={callId} />
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CreditCard className="w-4 h-4" />
                <h3 className="font-semibold text-sm">תשלום</h3>
              </div>
              <div className="space-y-3 p-4 rounded-lg bg-green-50/50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/40">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>סכום שנגבה (₪) <span className="text-red-500">*</span></Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className="h-11 text-lg font-semibold"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>אמצעי תשלום <span className="text-red-500">*</span></Label>
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

                {parseFloat(leadCost) > 0 && parseFloat(amount) > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-background border-2 border-dashed border-green-300 dark:border-green-800">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium">רווח נקי (אחרי עלות הליד):</span>
                    </div>
                    <div className={cn(
                      "text-lg font-bold",
                      netProfit > 0 ? "text-green-600 dark:text-green-400" : "text-red-600"
                    )}>
                      ₪{netProfit.toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
                <ReceiptIcon className="w-4 h-4" />
                <h3 className="font-semibold text-sm">
                  קבלה <span className="text-red-500">*</span>
                  {receipt && (
                    <Badge className="mr-2 bg-green-500 hover:bg-green-600 gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      הועלתה
                    </Badge>
                  )}
                </h3>
              </div>
              <div className={cn(
                "p-4 rounded-lg border transition-colors",
                receipt
                  ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900/40"
                  : "bg-rose-50/50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/40"
              )}>
                <ReceiptUpload
                  customerId={customerId}
                  currentPath={receipt}
                  onUploaded={p => setReceipt(p)}
                  onRemoved={() => setReceipt(null)}
                />
                {!receipt && (
                  <p className="text-xs text-muted-foreground mt-2">חובה לצרף קבלה לסיום הרישום הרטרואקטיבי.</p>
                )}
              </div>
            </section>

            <DialogFooter className="border-t pt-4 flex-row-reverse sm:flex-row-reverse gap-2">
              <Button
                onClick={handleStep2}
                disabled={saving || !receipt}
                className="gap-2 bg-green-600 hover:bg-green-700 flex-1 sm:flex-none"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <CheckCircle2 className="w-4 h-4" />
                שמור וסגור
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                disabled={saving}
                className="gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                חזור לשלב 1
              </Button>
              <Button variant="ghost" onClick={() => handleClose(false)} disabled={saving} className="text-muted-foreground">
                סיים מאוחר יותר
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
