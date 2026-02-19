import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calendar,
  Lock,
  CreditCard,
  Receipt,
  ArrowDownCircle,
  Scale,
  Clock,
  Trash2,
  Image as ImageIcon,
  CheckCircle,
  StickyNote,
  BarChart3,
} from "lucide-react";
import { BillingPdfExport } from "./BillingPdfExport";
import { ReceiptUpload } from "./ReceiptUpload";

interface LedgerEntry {
  id: string;
  entry_date: string;
  entry_type: string;
  amount: number;
  description: string | null;
  service_call_id: string | null;
  is_locked: boolean;
  created_at: string;
  created_by: string;
  receipt_path?: string | null;
  payment_method?: string | null;
  installments?: number | null;
}

const paymentMethods = [
  { value: "cash", label: "מזומן" },
  { value: "transfer", label: "העברה בנקאית" },
  { value: "bit", label: "ביט" },
  { value: "paybox", label: "פייבוקס" },
  { value: "money", label: "מאני" },
  { value: "credit_card", label: "סליקה" },
  { value: "credit", label: "אשראי" },
];

const paymentMethodLabels: Record<string, string> = Object.fromEntries(
  paymentMethods.map((m) => [m.value, m.label])
);

interface BillingTabProps {
  customerId: string;
  customerName?: string;
  customerPhone?: string | null;
  customerCity?: string | null;
  customerAddress?: string | null;
  onBillingChange?: () => void;
}

const entryTypeConfig: Record<
  string,
  { label: string; icon: typeof Receipt; color: string }
> = {
  charge: {
    label: "חיוב",
    icon: Receipt,
    color: "bg-destructive/10 text-destructive",
  },
  payment: {
    label: "תשלום",
    icon: CreditCard,
    color: "bg-success/10 text-success",
  },
  credit: {
    label: "זיכוי",
    icon: ArrowDownCircle,
    color: "bg-primary/10 text-primary",
  },
  settled: {
    label: "שילם",
    icon: CheckCircle,
    color: "bg-success/10 text-success",
  },
};

export function BillingTab({
  customerId,
  customerName,
  customerPhone,
  customerCity,
  customerAddress,
  onBillingChange,
}: BillingTabProps) {
  const { user, role, isAdmin } = useAuth();
  const isContractor = role === "contractor";
  const canAdd = isAdmin;
  const canLock = isAdmin;
  const canDelete = isAdmin;

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasLegalAction, setHasLegalAction] = useState(false);
  const [legalActionNote, setLegalActionNote] = useState("");
  const [billingNotes, setBillingNotes] = useState("");

  const [formDate, setFormDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [formType, setFormType] = useState<string>("charge");
  const [formAmount, setFormAmount] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formReceiptPath, setFormReceiptPath] = useState<string | null>(null);
  const [formPaymentMethod, setFormPaymentMethod] = useState<string>("");
  const [formInstallments, setFormInstallments] = useState<string>("");

  // Detail dialog state
  const [detailEntry, setDetailEntry] = useState<LedgerEntry | null>(null);
  const [editingPaymentMethod, setEditingPaymentMethod] = useState<string>("");
  const [editingAmount, setEditingAmount] = useState<string>("");
  const [editingInstallments, setEditingInstallments] = useState<string>("");
  const [savingDetail, setSavingDetail] = useState(false);

  // Filter state
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("all");

  // Quick payment dialog state
  const [showQuickPayment, setShowQuickPayment] = useState(false);
  const [quickPaymentMethod, setQuickPaymentMethod] = useState<string>("");
  const [quickPaymentAmount, setQuickPaymentAmount] = useState<string>("");
  const [quickPaymentInstallments, setQuickPaymentInstallments] = useState<string>("");
  const [quickPaymentReceipt, setQuickPaymentReceipt] = useState<string | null>(null);
  const [savingQuickPayment, setSavingQuickPayment] = useState(false);

  // Receipt thumbnail URLs cache
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});

  const loadEntries = useCallback(async () => {
    const [ledgerRes, customerRes] = await Promise.all([
      (supabase as any)
        .from("customer_ledger")
        .select("*")
        .eq("customer_id", customerId)
        .order("entry_date", { ascending: false }),
      supabase
        .from("customers")
        .select("has_legal_action, legal_action_note, billing_notes")
        .eq("id", customerId)
        .single(),
    ]);

    if (ledgerRes.error) {
      console.error("Load ledger error:", ledgerRes.error);
      toast({
        title: "שגיאה",
        description: "לא ניתן לטעון נתוני חשבון",
        variant: "destructive",
      });
    } else {
      const loadedEntries = (ledgerRes.data as LedgerEntry[]) || [];
      setEntries(loadedEntries);

      // Load receipt thumbnails
      const receiptsToLoad = loadedEntries.filter((e) => e.receipt_path);
      if (receiptsToLoad.length > 0) {
        const urls: Record<string, string> = {};
        await Promise.all(
          receiptsToLoad.map(async (e) => {
            const { data } = await supabase.storage
              .from("receipts")
              .createSignedUrl(e.receipt_path!, 3600);
            if (data) urls[e.id] = data.signedUrl;
          })
        );
        setReceiptUrls(urls);
      }
    }

    if (customerRes.data) {
      setHasLegalAction((customerRes.data as any).has_legal_action ?? false);
      setLegalActionNote((customerRes.data as any).legal_action_note ?? "");
      setBillingNotes((customerRes.data as any).billing_notes ?? "");
    }

    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    if (!user) return;
    loadEntries();
  }, [user, loadEntries]);

  // Calculations
  const totalCharges = entries
    .filter((e) => e.entry_type === "charge")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const totalPayments = entries
    .filter((e) => e.entry_type === "payment")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const totalCredits = entries
    .filter((e) => e.entry_type === "credit")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const balance = totalCharges - totalPayments - totalCredits;

  const lastPayment = entries
    .filter((e) => e.entry_type === "payment")
    .sort(
      (a, b) =>
        new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
    )[0];

  const overdueSince =
    balance > 0
      ? entries
          .filter((e) => e.entry_type === "charge")
          .sort(
            (a, b) =>
              new Date(a.entry_date).getTime() -
              new Date(b.entry_date).getTime()
          )[0]?.entry_date
      : null;

  let overdueDays = 0;
  let overdueMonths = 0;
  if (overdueSince) {
    const diffMs = new Date().getTime() - new Date(overdueSince).getTime();
    overdueDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    overdueMonths = Math.floor(overdueDays / 30);
  }

  const overdueDurationText = overdueSince
    ? overdueMonths > 0
      ? `${overdueMonths} חודשים (${overdueDays} ימים)`
      : `${overdueDays} ימים`
    : null;

  // Calculate payment delay stats per charge
  const chargeEntries = [...entries].filter(e => e.entry_type === "charge").sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime());
  const paymentEntries = [...entries].filter(e => e.entry_type === "payment").sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime());

  // Calculate average days to payment
  const paymentDelays: number[] = [];
  let runningCharges = 0;
  let lastChargeDate: string | null = null;
  for (const charge of chargeEntries) {
    runningCharges += Number(charge.amount);
    if (!lastChargeDate) lastChargeDate = charge.entry_date;
  }
  // For each payment, calculate delay from oldest unpaid charge
  const sortedAll = [...entries].sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime());
  let pendingCharges: { date: string; amount: number }[] = [];
  for (const entry of sortedAll) {
    if (entry.entry_type === "charge") {
      pendingCharges.push({ date: entry.entry_date, amount: Number(entry.amount) });
    } else if (entry.entry_type === "payment" || entry.entry_type === "credit") {
      let remaining = Number(entry.amount);
      while (remaining > 0 && pendingCharges.length > 0) {
        const oldest = pendingCharges[0];
        const covered = Math.min(remaining, oldest.amount);
        const delayDays = Math.floor((new Date(entry.entry_date).getTime() - new Date(oldest.date).getTime()) / (1000 * 60 * 60 * 24));
        if (delayDays >= 0) paymentDelays.push(delayDays);
        oldest.amount -= covered;
        remaining -= covered;
        if (oldest.amount <= 0) pendingCharges.shift();
      }
    }
  }
  const avgPaymentDelay = paymentDelays.length > 0 ? Math.round(paymentDelays.reduce((a, b) => a + b, 0) / paymentDelays.length) : null;
  const maxPaymentDelay = paymentDelays.length > 0 ? Math.max(...paymentDelays) : null;

  // Group entries by month for timeline
  const groupedByMonth: Record<string, LedgerEntry[]> = {};
  for (const entry of entries) {
    const date = new Date(entry.entry_date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!groupedByMonth[key]) groupedByMonth[key] = [];
    groupedByMonth[key].push(entry);
  }
  const sortedMonths = Object.keys(groupedByMonth).sort((a, b) => b.localeCompare(a));

  const formatMonthHeader = (key: string) => {
    const [year, month] = key.split("-");
    const monthNames = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  };

  const handleSaveBillingNotes = async () => {
    const { error } = await supabase
      .from("customers")
      .update({ billing_notes: billingNotes.trim() || null } as any)
      .eq("id", customerId);
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "נשמר", description: "הערות חיוב עודכנו" });
    }
  };

  const handleSubmit = async () => {
    if (!user || !formAmount) return;
    setSaving(true);

    try {
      const { error } = await (supabase as any)
        .from("customer_ledger")
        .insert({
          customer_id: customerId,
          entry_date: formDate,
          entry_type: formType,
          amount: parseFloat(formAmount),
          description: formDescription.trim() || null,
          receipt_path: formReceiptPath,
          payment_method: formPaymentMethod || null,
          installments: formInstallments ? parseInt(formInstallments) : null,
          created_by: user.id,
        });

      if (error) throw error;

      // Auto-create income in financial_transactions for payment entries
      if (formType === "payment") {
        const methodLabel = paymentMethodLabels[formPaymentMethod] || formPaymentMethod || "";
        try {
          await (supabase as any).from("financial_transactions").insert({
            direction: "income",
            amount: parseFloat(formAmount),
            txn_date: formDate,
            category: "service_income",
            payment_method: formPaymentMethod || null,
            counterparty_name: customerName || null,
            customer_id: customerId,
            notes: formDescription.trim() || `תשלום - ${methodLabel}`,
            status: "paid",
            doc_path: formReceiptPath || null,
            doc_type: formReceiptPath ? "receipt" : null,
            created_by: user.id,
          });
        } catch (finErr) {
          console.error("Auto finance income error:", finErr);
        }
      }

      toast({ title: "נשמר", description: "הרשומה נוספה בהצלחה" + (formType === "payment" ? " (+ הכנסה בכספים)" : "") });
      setShowForm(false);
      resetForm();
      loadEntries();
      onBillingChange?.();
    } catch (err: any) {
      console.error("Add ledger entry error:", err);
      toast({
        title: "שגיאה",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: LedgerEntry) => {
    try {
      // Delete receipt from storage if exists
      if (entry.receipt_path) {
        await supabase.storage.from("receipts").remove([entry.receipt_path]);
      }

      const { error } = await (supabase as any)
        .from("customer_ledger")
        .delete()
        .eq("id", entry.id);

      if (error) throw error;

      toast({ title: "נמחק", description: "הרשומה נמחקה בהצלחה" });
      loadEntries();
      onBillingChange?.();
    } catch (err: any) {
      console.error("Delete ledger entry error:", err);
      toast({
        title: "שגיאה",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleLock = async (entryId: string) => {
    const { error } = await (supabase as any)
      .from("customer_ledger")
      .update({ is_locked: true })
      .eq("id", entryId);

    if (error) {
      toast({
        title: "שגיאה",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "ננעל", description: "הרשומה ננעלה לעריכה" });
      loadEntries();
    }
  };

  const resetForm = () => {
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormType("charge");
    setFormAmount("");
    setFormDescription("");
    setFormReceiptPath(null);
    setFormPaymentMethod("");
    setFormInstallments("");
  };

  const handleOpenDetail = (entry: LedgerEntry) => {
    setDetailEntry(entry);
    setEditingPaymentMethod(entry.payment_method || "");
    setEditingAmount(String(entry.amount));
    setEditingInstallments(entry.installments ? String(entry.installments) : "");
  };

  const handleSaveDetail = async () => {
    if (!detailEntry || !isAdmin) return;
    setSavingDetail(true);
    try {
      const { error } = await (supabase as any)
        .from("customer_ledger")
        .update({
          payment_method: editingPaymentMethod || null,
          amount: parseFloat(editingAmount) || detailEntry.amount,
          installments: editingInstallments ? parseInt(editingInstallments) : null,
        })
        .eq("id", detailEntry.id);
      if (error) throw error;

      // Auto-create/update income in financial_transactions for payment entries
      if (detailEntry.entry_type === "payment") {
        const finalAmount = parseFloat(editingAmount) || detailEntry.amount;
        const methodLabel = paymentMethodLabels[editingPaymentMethod] || editingPaymentMethod || "";
        try {
          await (supabase as any).from("financial_transactions").insert({
            direction: "income",
            amount: finalAmount,
            txn_date: detailEntry.entry_date,
            category: "service_income",
            payment_method: editingPaymentMethod || null,
            counterparty_name: customerName || null,
            customer_id: customerId,
            notes: `תשלום מגבייה - ${methodLabel}${editingInstallments ? ` (${editingInstallments} תשלומים)` : ""}`,
            status: "paid",
            doc_path: detailEntry.receipt_path || null,
            doc_type: detailEntry.receipt_path ? "receipt" : null,
            created_by: user!.id,
          });
        } catch (finErr) {
          console.error("Auto finance income error:", finErr);
        }
      }

      toast({ title: "נשמר", description: "פרטי הרשומה עודכנו" + (detailEntry.entry_type === "payment" ? " (+ הכנסה בכספים)" : "") });
      setDetailEntry(null);
      loadEntries();
      onBillingChange?.();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSavingDetail(false);
    }
  };

  const handleQuickPayment = async () => {
    if (!user || !quickPaymentMethod || !quickPaymentAmount) return;
    setSavingQuickPayment(true);
    try {
      const paymentAmount = parseFloat(quickPaymentAmount);
      if (isNaN(paymentAmount) || paymentAmount <= 0) throw new Error("סכום לא תקין");

      const { error } = await (supabase as any)
        .from("customer_ledger")
        .insert({
          customer_id: customerId,
          entry_date: new Date().toISOString().split("T")[0],
          entry_type: "payment",
          amount: paymentAmount,
          description: `אישור תשלום - ${paymentMethodLabels[quickPaymentMethod] || quickPaymentMethod}${quickPaymentInstallments ? ` (${quickPaymentInstallments} תשלומים)` : ""}`,
          payment_method: quickPaymentMethod,
          installments: quickPaymentInstallments ? parseInt(quickPaymentInstallments) : null,
          receipt_path: quickPaymentReceipt,
          created_by: user.id,
        });

      if (error) throw error;

      // Auto-create income entry in financial_transactions
      try {
        await (supabase as any).from("financial_transactions").insert({
          direction: "income",
          amount: paymentAmount,
          txn_date: new Date().toISOString().split("T")[0],
          category: "service_income",
          payment_method: quickPaymentMethod,
          counterparty_name: customerName || null,
          customer_id: customerId,
          notes: `אישור תשלום מגבייה - ${paymentMethodLabels[quickPaymentMethod] || quickPaymentMethod}${quickPaymentInstallments ? ` (${quickPaymentInstallments} תשלומים)` : ""}`,
          status: "paid",
          doc_path: quickPaymentReceipt || null,
          doc_type: quickPaymentReceipt ? "receipt" : null,
          created_by: user.id,
        });
      } catch (finErr) {
        console.error("Auto finance income error:", finErr);
        // Don't fail the whole operation if finance entry fails
      }

      toast({ title: "תשלום אושר", description: `תשלום של ₪${paymentAmount.toFixed(2)} נרשם בהצלחה (+ הכנסה בכספים)` });
      setShowQuickPayment(false);
      setQuickPaymentMethod("");
      setQuickPaymentAmount("");
      setQuickPaymentInstallments("");
      setQuickPaymentReceipt(null);
      loadEntries();
      onBillingChange?.();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSavingQuickPayment(false);
    }
  };

  const handleToggleLegalAction = async (checked: boolean) => {
    const { error } = await supabase
      .from("customers")
      .update({
        has_legal_action: checked,
        legal_action_note: checked ? legalActionNote || null : null,
      } as any)
      .eq("id", customerId);

    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    } else {
      setHasLegalAction(checked);
      if (!checked) setLegalActionNote("");
      toast({ title: "עודכן", description: checked ? "סומן כטיפול משפטי" : "הוסר סימון משפטי" });
      onBillingChange?.();
    }
  };

  const handleSaveLegalNote = async () => {
    const { error } = await supabase
      .from("customers")
      .update({ legal_action_note: legalActionNote.trim() || null } as any)
      .eq("id", customerId);

    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "נשמר", description: "הערת טיפול משפטי עודכנה" });
      onBillingChange?.();
    }
  };

  if (loading) {
    return (
      <p className="text-center py-8 text-muted-foreground">טוען...</p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                balance > 0
                  ? "bg-destructive/10"
                  : balance < 0
                  ? "bg-success/10"
                  : "bg-muted"
              }`}
            >
              {balance > 0 ? (
                <TrendingDown className="w-5 h-5 text-destructive" />
              ) : (
                <TrendingUp className="w-5 h-5 text-success" />
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">יתרה</p>
              <p
                className={`text-lg font-bold ${
                  balance > 0
                    ? "text-destructive"
                    : balance < 0
                    ? "text-success"
                    : ""
                }`}
              >
                ₪{Math.abs(balance).toFixed(2)}
                {balance > 0 ? " חוב" : balance < 0 ? " זכות" : ""}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">תשלום אחרון</p>
              <p className="text-sm font-medium">
                {lastPayment
                  ? new Date(lastPayment.entry_date).toLocaleDateString("he-IL")
                  : "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                overdueSince ? "bg-warning/10" : "bg-muted"
              }`}
            >
              {overdueSince ? (
                <AlertTriangle className="w-5 h-5 text-warning" />
              ) : (
                <Calendar className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">פיגור</p>
              <p className="text-sm font-medium">
                {overdueSince
                  ? new Date(overdueSince).toLocaleDateString("he-IL")
                  : "—"}
              </p>
              {overdueDurationText && (
                <p className="text-xs text-warning flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />
                  {overdueDurationText}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className={hasLegalAction ? "border-destructive/50 bg-destructive/5" : ""}>
          <CardContent className="p-4 flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                hasLegalAction ? "bg-destructive/15" : "bg-muted"
              }`}
            >
              <Scale className={`w-5 h-5 ${hasLegalAction ? "text-destructive" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">טיפול משפטי</p>
              <p className={`text-sm font-bold ${hasLegalAction ? "text-destructive" : ""}`}>
                {hasLegalAction ? "פעיל" : "לא"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Delay Stats */}
      {paymentDelays.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">סטטיסטיקת תשלומים</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">ממוצע ימי תשלום</p>
                <p className={`text-lg font-bold ${(avgPaymentDelay ?? 0) > 30 ? "text-destructive" : (avgPaymentDelay ?? 0) > 14 ? "text-warning" : "text-success"}`}>
                  {avgPaymentDelay} ימים
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">מקסימום פיגור</p>
                <p className={`text-lg font-bold ${(maxPaymentDelay ?? 0) > 60 ? "text-destructive" : (maxPaymentDelay ?? 0) > 30 ? "text-warning" : "text-success"}`}>
                  {maxPaymentDelay} ימים
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">מס׳ תשלומים</p>
                <p className="text-lg font-bold">{paymentEntries.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legal Action Section (Admin only) */}
      {isAdmin && (
        <Card className={hasLegalAction ? "border-destructive/30" : ""}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">טיפול משפטי</Label>
              </div>
              <Switch
                checked={hasLegalAction}
                onCheckedChange={handleToggleLegalAction}
              />
            </div>
            {hasLegalAction && (
              <div className="space-y-2">
                <Textarea
                  value={legalActionNote}
                  onChange={(e) => setLegalActionNote(e.target.value)}
                  placeholder="פרטי הטיפול המשפטי, עורך דין, תאריכי דיון..."
                  rows={2}
                />
                <Button size="sm" variant="outline" onClick={handleSaveLegalNote}>
                  שמור הערה
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Billing Notes (Admin only) */}
      {isAdmin && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm font-medium">הערות חיוב</Label>
            </div>
            <Textarea
              value={billingNotes}
              onChange={(e) => setBillingNotes(e.target.value)}
              placeholder="הערות לגבי התנהלות תשלומים, הנחות מיוחדות, הסכמים..."
              rows={3}
            />
            <Button size="sm" variant="outline" onClick={handleSaveBillingNotes}>
              שמור הערות
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <BillingPdfExport
          customerName={customerName || "לקוח"}
          customerPhone={customerPhone}
          customerCity={customerCity}
          customerAddress={customerAddress}
          entries={entries}
          balance={balance}
          totalCharges={totalCharges}
          totalPayments={totalPayments}
          totalCredits={totalCredits}
          overdueSince={overdueSince || null}
          overdueDays={overdueDays}
          hasLegalAction={hasLegalAction}
          legalActionNote={legalActionNote}
        />
        {canAdd && balance > 0 && (
          <Button
            onClick={() => {
              setQuickPaymentAmount(balance.toFixed(2));
              setQuickPaymentMethod("");
              setQuickPaymentReceipt(null);
              setShowQuickPayment(true);
            }}
            variant="outline"
            size="sm"
            className="gap-2 text-success border-success/30 hover:bg-success/10"
          >
            <CheckCircle className="w-4 h-4" /> אשר תשלום
          </Button>
        )}
        {canAdd && (
          <Button
            onClick={() => setShowForm(!showForm)}
            variant={showForm ? "secondary" : "default"}
            size="sm"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />{" "}
            {showForm ? "ביטול" : "הוסף רשומה"}
          </Button>
        )}
      </div>

      {/* Add Entry Form */}
      {showForm && canAdd && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">תאריך</Label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">סוג</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="charge">חיוב</SelectItem>
                    <SelectItem value="payment">תשלום</SelectItem>
                    <SelectItem value="credit">זיכוי</SelectItem>
                    <SelectItem value="settled">שילם</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">סכום (₪)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  dir="ltr"
                />
              </div>
            </div>
            {(formType === "payment" || formType === "credit") && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">אמצעי תשלום</Label>
                  <Select value={formPaymentMethod} onValueChange={setFormPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="בחר אמצעי תשלום..." />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">מס׳ תשלומים</Label>
                  <Input
                    type="number"
                    min="1"
                    max="36"
                    value={formInstallments}
                    onChange={(e) => setFormInstallments(e.target.value)}
                    placeholder={formPaymentMethod === "credit" ? "מס׳ תשלומים באשראי" : "תשלום אחד"}
                    dir="ltr"
                  />
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">תיאור</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
                placeholder="תיאור הפעולה..."
              />
            </div>
            <div className="flex items-center justify-between">
              <ReceiptUpload
                customerId={customerId}
                onUploaded={(path) => setFormReceiptPath(path)}
                onRemoved={() => setFormReceiptPath(null)}
              />
              <Button
                onClick={handleSubmit}
                disabled={saving || !formAmount}
                className="h-10"
              >
                {saving ? "שומר..." : "שמור"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Method Filter */}
      {entries.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">סנן לפי אמצעי תשלום:</span>
          <div className="flex gap-1 flex-wrap">
            <Button
              variant={filterPaymentMethod === "all" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setFilterPaymentMethod("all")}
            >
              הכל
            </Button>
            {paymentMethods.map((pm) => (
              <Button
                key={pm.value}
                variant={filterPaymentMethod === pm.value ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setFilterPaymentMethod(pm.value)}
              >
                {pm.label}
              </Button>
            ))}
            <Button
              variant={filterPaymentMethod === "none" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setFilterPaymentMethod("none")}
            >
              ללא
            </Button>
          </div>
        </div>
      )}

      {/* Entries List - Grouped by Month */}
      {entries.length === 0 ? (
        <p className="text-center text-muted-foreground py-6">
          אין רשומות חשבון
        </p>
      ) : (
        <div className="space-y-4">
          {sortedMonths.map((monthKey) => {
            const monthEntries = groupedByMonth[monthKey]
              .filter((entry) => {
                if (filterPaymentMethod === "all") return true;
                if (filterPaymentMethod === "none") return !entry.payment_method;
                return entry.payment_method === filterPaymentMethod;
              })
              .sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime());

            if (monthEntries.length === 0) return null;

            const monthCharges = monthEntries.filter(e => e.entry_type === "charge").reduce((s, e) => s + Number(e.amount), 0);
            const monthPayments = monthEntries.filter(e => e.entry_type === "payment" || e.entry_type === "credit").reduce((s, e) => s + Number(e.amount), 0);

            return (
              <div key={monthKey}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-semibold">{formatMonthHeader(monthKey)}</span>
                    <Badge variant="secondary" className="text-xs">{monthEntries.length} רשומות</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {monthCharges > 0 && <span className="text-destructive">חיובים: ₪{monthCharges.toFixed(0)}</span>}
                    {monthPayments > 0 && <span className="text-success">תשלומים: ₪{monthPayments.toFixed(0)}</span>}
                  </div>
                </div>
                <div className="space-y-1.5 relative">
                  {/* Timeline line */}
                  <div className="absolute right-[19px] top-4 bottom-4 w-0.5 bg-border" />
                  {monthEntries.map((entry) => {
                    const config = entryTypeConfig[entry.entry_type] || entryTypeConfig.charge;
                    const Icon = config.icon;
                    const hasReceipt = !!receiptUrls[entry.id];
                    return (
                      <Card key={entry.id} className="cursor-pointer hover:shadow-md transition-shadow relative" onClick={() => handleOpenDetail(entry)}>
                        <CardContent className="p-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 z-10 ${config.color}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={`text-xs ${config.color}`}>
                                  {config.label}
                                </Badge>
                                <span className="text-sm font-medium">₪{Number(entry.amount).toFixed(2)}</span>
                                {entry.is_locked && <Lock className="w-3 h-3 text-muted-foreground" />}
                                {hasReceipt && (
                                  <a href={receiptUrls[entry.id]} target="_blank" rel="noopener noreferrer" title="צפה בקבלה" onClick={(e) => e.stopPropagation()}>
                                    <ImageIcon className="w-3.5 h-3.5 text-primary cursor-pointer" />
                                  </a>
                                )}
                              </div>
                              {(entry.payment_method || entry.installments) && (
                                <span className="text-xs text-muted-foreground">
                                  {entry.payment_method ? (paymentMethodLabels[entry.payment_method] || entry.payment_method) : ""}
                                  {entry.installments && entry.installments > 1 ? ` · ${entry.installments} תשלומים` : ""}
                                </span>
                              )}
                              {!isContractor && entry.description && (
                                <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <span className="text-xs text-muted-foreground">
                              {new Date(entry.entry_date).toLocaleDateString("he-IL")}
                            </span>
                            {canLock && !entry.is_locked && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleLock(entry.id)} title="נעל רשומה">
                                <Lock className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {canDelete && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="מחק רשומה">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>מחיקת רשומה</AlertDialogTitle>
                                    <AlertDialogDescription>האם למחוק את הרשומה? פעולה זו לא ניתנת לביטול.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>ביטול</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(entry)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">מחק</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Entry Detail Dialog */}
      <Dialog open={!!detailEntry} onOpenChange={(open) => !open && setDetailEntry(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>פרטי רשומה</DialogTitle>
          </DialogHeader>
          {detailEntry && (() => {
            const config = entryTypeConfig[detailEntry.entry_type] || entryTypeConfig.charge;
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={`${config.color}`}>{config.label}</Badge>
                  <span className="text-lg font-bold">₪{Number(detailEntry.amount).toFixed(2)}</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(detailEntry.entry_date).toLocaleDateString("he-IL")}
                  </span>
                </div>

                {detailEntry.description && (
                  <div>
                    <Label className="text-xs text-muted-foreground">תיאור</Label>
                    <p className="text-sm">{detailEntry.description}</p>
                  </div>
                )}

                {/* Payment method display/edit */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">אמצעי תשלום</Label>
                  {isAdmin ? (
                    <Select value={editingPaymentMethod} onValueChange={setEditingPaymentMethod}>
                      <SelectTrigger>
                        <SelectValue placeholder="בחר אמצעי תשלום..." />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethods.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm font-medium">
                      {detailEntry.payment_method
                        ? paymentMethodLabels[detailEntry.payment_method] || detailEntry.payment_method
                        : "לא צוין"}
                    </p>
                  )}
                </div>

                {/* Amount edit */}
                {isAdmin && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">סכום (₪)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editingAmount}
                      onChange={(e) => setEditingAmount(e.target.value)}
                      dir="ltr"
                    />
                  </div>
                )}

                {/* Installments edit */}
                {isAdmin && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">מס׳ תשלומים</Label>
                    <Input
                      type="number"
                      min="1"
                      max="36"
                      value={editingInstallments}
                      onChange={(e) => setEditingInstallments(e.target.value)}
                      placeholder="תשלום אחד"
                      dir="ltr"
                    />
                  </div>
                )}

                {/* Balance context */}
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">סה"כ חיובים</span>
                    <span>₪{totalCharges.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">סה"כ תשלומים</span>
                    <span>₪{totalPayments.toFixed(2)}</span>
                  </div>
                  {totalCredits > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">סה"כ זיכויים</span>
                      <span>₪{totalCredits.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t pt-1 flex justify-between text-sm font-bold">
                    <span>נותר לתשלום</span>
                    <span className={balance > 0 ? "text-destructive" : "text-success"}>
                      ₪{Math.abs(balance).toFixed(2)} {balance > 0 ? "חוב" : balance < 0 ? "זכות" : ""}
                    </span>
                  </div>
                </div>

                {/* Receipt image */}
                {receiptUrls[detailEntry.id] && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">תמונת תשלום</Label>
                    <a href={receiptUrls[detailEntry.id]} target="_blank" rel="noopener noreferrer">
                      <img
                        src={receiptUrls[detailEntry.id]}
                        alt="קבלה"
                        className="w-full max-h-48 object-contain rounded-lg border border-input"
                      />
                    </a>
                  </div>
                )}

                {/* Upload receipt for existing entry */}
                {isAdmin && !receiptUrls[detailEntry.id] && (
                  <ReceiptUpload
                    entryId={detailEntry.id}
                    customerId={customerId}
                    onUploaded={async (path) => {
                      await (supabase as any)
                        .from("customer_ledger")
                        .update({ receipt_path: path })
                        .eq("id", detailEntry.id);
                      loadEntries();
                      toast({ title: "הועלה", description: "תמונת התשלום נשמרה" });
                    }}
                  />
                )}

                {/* Save button */}
                {isAdmin && (
                  <Button onClick={handleSaveDetail} disabled={savingDetail} className="w-full">
                    {savingDetail ? "שומר..." : "שמור שינויים"}
                  </Button>
                )}

                {detailEntry.is_locked && !isAdmin && (
                  <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                    <Lock className="w-3 h-3" /> רשומה נעולה - לא ניתן לערוך
                  </p>
                )}
                {detailEntry.is_locked && isAdmin && (
                  <p className="text-xs text-warning text-center flex items-center justify-center gap-1">
                    <Lock className="w-3 h-3" /> רשומה נעולה - ניתנת לעריכה כמנהל בלבד
                  </p>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Quick Payment Dialog */}
      <Dialog open={showQuickPayment} onOpenChange={setShowQuickPayment}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-success" />
              אישור תשלום
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">יתרת חוב</span>
                <span className="font-bold text-destructive">₪{balance.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">סכום לתשלום (₪)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={quickPaymentAmount}
                onChange={(e) => setQuickPaymentAmount(e.target.value)}
                dir="ltr"
              />
              {quickPaymentAmount && parseFloat(quickPaymentAmount) < balance && (
                <p className="text-xs text-muted-foreground">
                  נותר לאחר תשלום: ₪{(balance - parseFloat(quickPaymentAmount)).toFixed(2)}
                </p>
              )}
              {quickPaymentAmount && parseFloat(quickPaymentAmount) >= balance && (
                <p className="text-xs text-success font-medium">
                  ✓ החוב ייסגר במלואו
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">אמצעי תשלום</Label>
              <Select value={quickPaymentMethod} onValueChange={setQuickPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר אמצעי תשלום..." />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">מס׳ תשלומים</Label>
              <Input
                type="number"
                min="1"
                max="36"
                value={quickPaymentInstallments}
                onChange={(e) => setQuickPaymentInstallments(e.target.value)}
                placeholder={quickPaymentMethod === "credit" ? "מס׳ תשלומים באשראי" : "תשלום אחד"}
                dir="ltr"
              />
            </div>

            <ReceiptUpload
              customerId={customerId}
              onUploaded={(path) => setQuickPaymentReceipt(path)}
              onRemoved={() => setQuickPaymentReceipt(null)}
            />

            <Button
              onClick={handleQuickPayment}
              disabled={savingQuickPayment || !quickPaymentMethod || !quickPaymentAmount}
              className="w-full gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              {savingQuickPayment ? "שומר..." : "אשר תשלום"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
