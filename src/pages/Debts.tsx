import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  AlertCircle, FileDown, ChevronLeft, Search, Phone, MessageCircle,
  Wallet, Scale, Clock, Loader2, FileText, Copy, Check, Ban, ExternalLink, BellRing, X, Eraser,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReceiptUpload } from "@/components/billing/ReceiptUpload";
import { HandCoins } from "lucide-react";
import { cn } from "@/lib/utils";
import { createCollectionReport, toWhatsApp, payPageOrigin, buildReportMessage } from "@/lib/collection-report";

const PAYMENT_METHODS = [
  { value: "cash", label: "מזומן" },
  { value: "transfer", label: "העברה בנקאית" },
  { value: "bit", label: "ביט" },
  { value: "paybox", label: "פייבוקס" },
  { value: "money", label: "מאני" },
  { value: "credit_card", label: "סליקה" },
  { value: "credit", label: "אשראי" },
];
const methodLabel = (v: string) => PAYMENT_METHODS.find((m) => m.value === v)?.label || v;

/**
 * מחלקת גבייה — מודול מבודד בניווט אך מסונכרן בזמן אמת עם שאר המערכת:
 * החובות מחושבים ישירות מכרטסת הלקוחות (customer_ledger), כך שכל תשלום
 * שנרשם בקריאת שירות או בכרטיס לקוח מתעדכן כאן מיידית — בלי טבלה כפולה.
 */

interface DebtorRow {
  customer_id: string;
  name: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  has_legal_action: boolean;
  collection_flag: boolean;
  balance: number;
  totalCharges: number;
  totalPayments: number;
  totalCredits: number;
  overdueSince: string | null;
  overdueDays: number;
  lastEntryDate: string | null;
  /** הכנסה שנרשמה ללקוח בכספים אך לא שויכה לחוב (יש חשבונית / הכנסה ידנית) */
  separatePaid: number;
}

interface SentReport {
  id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  amount: number;
  items: any[] | null;
  share_token: string;
  is_active: boolean;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
}

/** הודעת תזכורת אוטומטית — הטון מתאים את עצמו לוותק החוב */
function buildReminder(r: DebtorRow) {
  const amount = "₪" + Math.round(r.balance).toLocaleString("he-IL");
  const firstName = (r.name || "").trim().split(" ")[0] || "";
  if (r.overdueDays <= 30) {
    return `היי ${firstName}, מה נשמע? 🙂
רק תזכורת קטנה על יתרת תשלום של ${amount} מהעבודה האחרונה.
אפשר בהעברה בנקאית / ביט / מזומן — מה שנוח לך.
תודה רבה! 🔧
יהב אינסטלציה - פתרונות ביוב ומים | 054-2121204`;
  }
  if (r.overdueDays <= 90) {
    return `שלום ${firstName},
מזכיר שקיימת יתרת תשלום פתוחה של ${amount} (מלפני ${r.overdueDays} ימים).
אשמח להסדרה השבוע — העברה בנקאית / ביט / מזומן.
לכל שאלה אני זמין 🙏
יהב אינסטלציה - פתרונות ביוב ומים | 054-2121204`;
  }
  return `שלום ${firstName},
בהמשך לפניות קודמות — קיימת יתרת חוב פתוחה של ${amount}, מזה ${r.overdueDays} ימים.
אבקש להסדיר את התשלום עד סוף השבוע.
בתודה, יהב אוחנה | יהב אינסטלציה | 054-2121204`;
}

const fmtILS = (n: number) => "₪" + Math.round(n).toLocaleString("he-IL");
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

const Debts = () => {
  const navigate = useNavigate();
  const { user, isAdmin, role } = useAuth();
  const canSee = isAdmin || role === "secretary";
  const [rows, setRows] = useState<DebtorRow[]>([]);
  const [reports, setReports] = useState<SentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"days" | "amount">("days");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // דיאלוג ביטול חוב — עם בחירת סוג (ויתור / כבר שולם)
  const [closeTarget, setCloseTarget] = useState<DebtorRow | null>(null);
  const [closeMode, setCloseMode] = useState<"paid" | "waive">("waive");
  const [closing, setClosing] = useState(false);
  // דיאלוג קבלת תשלום — רושם תשלום + הכנסה + קבלה (מסנכרן את שתי המערכות)
  const [collectTarget, setCollectTarget] = useState<DebtorRow | null>(null);
  const [collectMethod, setCollectMethod] = useState("");
  const [collectReceipt, setCollectReceipt] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);

  // יצירת דוח גבייה מפורט ושליחתו בוואטסאפ
  const sendReport = async (r: DebtorRow) => {
    if (!user) return;
    setSendingId(r.customer_id);
    try {
      const report = await createCollectionReport({
        customerId: r.customer_id,
        customerName: r.name,
        customerPhone: r.phone,
        userId: user.id,
      });
      if (report.waUrl) {
        window.open(report.waUrl, "_blank");
        toast({ title: "דוח גבייה נוצר", description: `דוח על ${fmtILS(report.balance)} נפתח לשליחה בוואטסאפ` });
      } else {
        await navigator.clipboard.writeText(report.payUrl);
        toast({ title: "הקישור הועתק", description: "אין טלפון ללקוח — קישור הדוח הועתק לשליחה ידנית" });
      }
      loadReports();
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message || "לא ניתן ליצור דוח גבייה", variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const removeRowAndFlag = async (r: DebtorRow) => {
    setRows((prev) => prev.filter((x) => x.customer_id !== r.customer_id));
    if (r.collection_flag) {
      await (supabase as any).from("customers")
        .update({ collection_flag: false, collection_flag_at: null })
        .eq("id", r.customer_id);
    }
  };

  /**
   * סגירת חוב — שתי אפשרויות, שתיהן רק בכרטסת (customer_ledger), בלי לגעת בהכנסות:
   *  paid  → רושם payment (הלקוח שילם, הכסף כבר נרשם בכספים במקום אחר — בלי כפל)
   *  waive → רושם credit (ויתור / חוב שגוי)
   */
  const closeDebt = async (r: DebtorRow, mode: "paid" | "waive") => {
    if (!user) return;
    setClosing(true);
    try {
      const today = new Date().toLocaleDateString("he-IL");
      const desc = mode === "paid"
        ? `סגירת חוב — הלקוח שילם, התשלום כבר נרשם בכספים במקום אחר (${fmtILS(r.balance)}). נסגר ע״י ${user.email || "מנהל"} ב-${today}.`
        : `ביטול חוב — זיכוי/ויתור על יתרה של ${fmtILS(r.balance)}. בוצע ע״י ${user.email || "מנהל"} ב-${today}.`;
      const { error } = await (supabase as any).from("customer_ledger").insert({
        customer_id: r.customer_id,
        entry_type: mode === "paid" ? "payment" : "credit",
        amount: r.balance,
        entry_date: new Date().toISOString().slice(0, 10),
        description: desc,
        created_by: user.id,
      });
      if (error) throw error;
      await removeRowAndFlag(r);
      toast({
        title: mode === "paid" ? "החוב נסגר ✓" : "החוב בוטל ✓",
        description: mode === "paid"
          ? `${r.name} סומן כשולם — ההכנסה שרשמת לא הושפעה`
          : `חוב של ${fmtILS(r.balance)} מ${r.name} נמחק מהמערכת`,
      });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message || "לא ניתן לסגור את החוב", variant: "destructive" });
    } finally {
      setClosing(false);
      setCloseTarget(null);
    }
  };

  /**
   * קבלת תשלום מהגבייה — כמו "אישור תשלום" בכרטיס הלקוח: רושם payment בכרטסת
   * וגם יוצר הכנסה בכספים (financial_transactions) + מצרף קבלה. מסנכרן את שתי המערכות.
   */
  const collectPayment = async (r: DebtorRow) => {
    if (!user || !collectMethod) return;
    setCollecting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const label = methodLabel(collectMethod);
      const { error } = await (supabase as any).from("customer_ledger").insert({
        customer_id: r.customer_id,
        entry_type: "payment",
        amount: r.balance,
        entry_date: today,
        description: `אישור תשלום מגבייה - ${label}`,
        payment_method: collectMethod,
        receipt_path: collectReceipt,
        created_by: user.id,
      });
      if (error) throw error;
      // הכנסה מקבילה בכספים (כמו בכרטיס הלקוח)
      try {
        await (supabase as any).from("financial_transactions").insert({
          direction: "income",
          amount: r.balance,
          txn_date: today,
          category: "service_income",
          payment_method: collectMethod,
          counterparty_name: r.name || null,
          customer_id: r.customer_id,
          notes: `אישור תשלום מגבייה - ${label}`,
          status: "paid",
          doc_path: collectReceipt || null,
          doc_type: collectReceipt ? "receipt" : null,
          created_by: user.id,
        });
      } catch (finErr) {
        console.error("Auto finance income error:", finErr);
      }
      await removeRowAndFlag(r);
      toast({ title: "תשלום התקבל ✓", description: `${fmtILS(r.balance)} מ${r.name} נרשם — כולל הכנסה בכספים` });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message || "לא ניתן לרשום תשלום", variant: "destructive" });
    } finally {
      setCollecting(false);
      setCollectTarget(null);
      setCollectMethod("");
      setCollectReceipt(null);
    }
  };

  const clearFlag = async (r: DebtorRow) => {
    const { error } = await (supabase as any)
      .from("customers")
      .update({ collection_flag: false, collection_flag_at: null })
      .eq("id", r.customer_id);
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }
    setRows((prev) => prev.map((x) => x.customer_id === r.customer_id ? { ...x, collection_flag: false } : x));
  };

  const copyReportLink = async (rep: SentReport) => {
    await navigator.clipboard.writeText(`${payPageOrigin()}/pay/${rep.share_token}`);
    setCopiedId(rep.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const markReportPaid = async (rep: SentReport) => {
    const { error } = await (supabase as any)
      .from("payment_requests")
      .update({ paid_at: new Date().toISOString() })
      .eq("id", rep.id);
    if (error) return toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    loadReports();
  };

  const revokeReport = async (rep: SentReport) => {
    const { error } = await (supabase as any)
      .from("payment_requests")
      .update({ is_active: false })
      .eq("id", rep.id);
    if (error) return toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    toast({ title: "הקישור בוטל", description: "הלקוח לא יוכל יותר לצפות בדוח הזה" });
    loadReports();
  };

  useEffect(() => {
    if (!user || !canSee) return;
    load();
    loadReports();
  }, [user, canSee]);

  const load = async () => {
    setLoading(true);
    try {
      const [ledgerRes, customersRes, incomeRes] = await Promise.all([
        (supabase as any)
          .from("customer_ledger")
          .select("customer_id, entry_type, amount, entry_date")
          .order("entry_date", { ascending: true }),
        // select * — עמיד גם אם עמודת collection_flag עוד לא קיימת ב-DB
        (supabase as any)
          .from("customers")
          .select("*")
          .eq("is_walkin", false),
        // הכנסות שמשויכות ללקוח בכספים — כדי לזהות תשלומים שנרשמו מחוץ לגבייה
        (supabase as any)
          .from("financial_transactions")
          .select("customer_id, amount")
          .eq("direction", "income")
          .not("customer_id", "is", null),
      ]);
      // סכום הכנסה בכספים פר לקוח (financial_transactions)
      const incomeByCustomer = new Map<string, number>();
      for (const t of (incomeRes.data || []) as any[]) {
        incomeByCustomer.set(t.customer_id, (incomeByCustomer.get(t.customer_id) || 0) + Number(t.amount));
      }
      const customers = (customersRes.data || []) as any[];
      const custMap = new Map(customers.map((c) => [c.id, c]));
      const grouped = new Map<string, any[]>();
      for (const e of (ledgerRes.data || []) as any[]) {
        if (!grouped.has(e.customer_id)) grouped.set(e.customer_id, []);
        grouped.get(e.customer_id)!.push(e);
      }
      const now = Date.now();
      const result: DebtorRow[] = [];
      grouped.forEach((entries, cid) => {
        const c = custMap.get(cid);
        if (!c) return;
        const totalCharges = entries.filter((e) => e.entry_type === "charge").reduce((s, e) => s + Number(e.amount), 0);
        const totalPayments = entries.filter((e) => e.entry_type === "payment").reduce((s, e) => s + Number(e.amount), 0);
        const totalCredits = entries.filter((e) => e.entry_type === "credit").reduce((s, e) => s + Number(e.amount), 0);
        const balance = totalCharges - totalPayments - totalCredits;
        if (balance <= 0.5) return;
        const firstCharge = entries.find((e) => e.entry_type === "charge");
        const overdueSince = firstCharge?.entry_date || null;
        const overdueDays = overdueSince
          ? Math.floor((now - new Date(overdueSince).getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        const last = entries[entries.length - 1]?.entry_date || null;
        // תשלום שנרשם ללקוח בכספים אבל לא כוסה בכרטסת (הכנסה בכספים פחות תשלומים בכרטסת)
        const financialIncome = incomeByCustomer.get(cid) || 0;
        const separatePaid = Math.max(0, financialIncome - totalPayments - totalCredits);
        result.push({
          customer_id: cid,
          name: c.name,
          phone: c.phone,
          city: c.city,
          address: c.address,
          has_legal_action: !!c.has_legal_action,
          collection_flag: !!c.collection_flag,
          balance,
          totalCharges,
          totalPayments,
          totalCredits,
          overdueSince,
          overdueDays,
          lastEntryDate: last,
          separatePaid,
        });
      });
      setRows(result);
    } catch (err: any) {
      console.error(err);
      toast({ title: "שגיאה", description: err.message || "טעינה נכשלה", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadReports = async () => {
    const { data } = await (supabase as any)
      .from("payment_requests")
      .select("id, customer_id, customer_name, customer_phone, amount, items, share_token, is_active, sent_at, paid_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setReports((data || []) as SentReport[]);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((r) =>
      !q ||
      r.name?.toLowerCase().includes(q) ||
      r.phone?.toLowerCase().includes(q) ||
      r.city?.toLowerCase().includes(q)
    );
    list = [...list].sort((a, b) => sortBy === "days" ? b.overdueDays - a.overdueDays : b.balance - a.balance);
    return list;
  }, [rows, search, sortBy]);

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.balance, 0);
    const over90 = rows.filter((r) => r.overdueDays > 90).reduce((s, r) => s + r.balance, 0);
    const legal = rows.filter((r) => r.has_legal_action).length;
    return { total, over90, legal, count: rows.length };
  }, [rows]);

  const flagged = useMemo(() => rows.filter((r) => r.collection_flag), [rows]);

  if (!canSee) {
    return (
      <AppLayout title="מחלקת גבייה">
        <p className="text-muted-foreground text-center py-12">אין הרשאה לצפות בעמוד זה.</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="מחלקת גבייה">
      {/* לוח בקרה — סיכום */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card className="bg-gradient-to-l from-blue-950 via-blue-800 to-cyan-600 text-white border-0 shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-white/70 text-xs mb-1">
              <Wallet className="w-3.5 h-3.5" /> סה״כ חוב פתוח
            </div>
            <p className="text-2xl font-bold">{fmtILS(totals.total)}</p>
          </CardContent>
        </Card>
        <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white dark:border-indigo-600/50 dark:from-indigo-900/40 dark:to-indigo-950/10 dark:shadow-[0_4px_20px_-8px_rgba(129,140,248,0.4)]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <AlertCircle className="w-3.5 h-3.5" /> לקוחות חייבים
            </div>
            <p className="text-2xl font-bold text-indigo-800 dark:text-indigo-200">{totals.count}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-white dark:border-orange-600/50 dark:from-orange-900/40 dark:to-orange-950/10 dark:shadow-[0_4px_20px_-8px_rgba(251,146,60,0.4)]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock className="w-3.5 h-3.5" /> בפיגור מעל 90 יום
            </div>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-300">{fmtILS(totals.over90)}</p>
          </CardContent>
        </Card>
        <Card className="border-rose-200 bg-gradient-to-br from-rose-50 to-white dark:border-rose-600/50 dark:from-rose-900/40 dark:to-rose-950/10 dark:shadow-[0_4px_20px_-8px_rgba(244,63,94,0.4)]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Scale className="w-3.5 h-3.5" /> בטיפול משפטי
            </div>
            <p className="text-2xl font-bold text-rose-800 dark:text-rose-200">{totals.legal}</p>
          </CardContent>
        </Card>
      </div>

      {/* לתזכר — לקוחות עם דגל תזכורת מסגירת קריאה */}
      {flagged.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-2">
            <BellRing className="w-4 h-4" /> לתזכר — לקוחות ששילמו על קריאה אבל החוב הישן עדיין פתוח
          </div>
          <div className="flex flex-wrap gap-2">
            {flagged.map((r) => (
              <span key={r.customer_id} className="inline-flex items-center gap-1.5 bg-white dark:bg-card border border-amber-300 dark:border-amber-700 rounded-full pl-1 pr-3 py-1 text-sm">
                <button className="font-medium hover:underline" onClick={() => navigate(`/customers/${r.customer_id}`)}>
                  {r.name}
                </button>
                <span className="text-destructive font-bold">{fmtILS(r.balance)}</span>
                {r.phone && (
                  <a href={toWhatsApp(r.phone, buildReminder(r))} target="_blank" rel="noopener noreferrer"
                    className="text-green-700 hover:text-green-800" title="שלח תזכורת">
                    <MessageCircle className="w-4 h-4" />
                  </a>
                )}
                <button onClick={() => clearFlag(r)} className="text-amber-500 hover:text-amber-700" title="הסר תזכורת">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <Tabs defaultValue="debtors" dir="rtl">
        <TabsList className="mb-4">
          <TabsTrigger value="debtors">לקוחות חייבים</TabsTrigger>
          <TabsTrigger value="reports">דוחות שנשלחו {reports.length > 0 && `(${reports.length})`}</TabsTrigger>
        </TabsList>

        <TabsContent value="debtors">
          {/* Filters */}
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש לפי שם / טלפון / עיר..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-10"
              />
            </div>
            <div className="flex rounded-md border border-input overflow-hidden">
              <button
                onClick={() => setSortBy("days")}
                className={cn("px-3 text-sm", sortBy === "days" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}
              >ותק חוב</button>
              <button
                onClick={() => setSortBy("amount")}
                className={cn("px-3 text-sm border-r border-input", sortBy === "amount" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}
              >סכום</button>
            </div>
          </div>

          {/* List */}
          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg">🎉 אין חובות פתוחים</p>
              <p className="text-sm mt-1">כל החשבונות מסולקים</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => {
                const overdueBadge =
                  r.overdueDays > 90 ? "bg-destructive text-destructive-foreground" :
                  r.overdueDays > 30 ? "bg-orange-500 text-white" :
                  "bg-amber-200 text-amber-900";
                return (
                  <div
                    key={r.customer_id}
                    className="rounded-xl border border-border bg-card p-4 hover:shadow-sm transition-all"
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <button
                        onClick={() => navigate(`/customers/${r.customer_id}`)}
                        className="flex-1 min-w-0 text-right"
                      >
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-base">{r.name}</span>
                          {r.has_legal_action && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-destructive/10 text-destructive border border-destructive/30">
                              ⚖ משפטי
                            </span>
                          )}
                          {r.collection_flag && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700">
                              ⚠ לתזכר
                            </span>
                          )}
                          <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-bold", overdueBadge)}>
                            {r.overdueDays} ימי חוב
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[r.city, r.address].filter(Boolean).join(" • ") || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          חיובים ₪{r.totalCharges.toFixed(0)} • תשלומים ₪{r.totalPayments.toFixed(0)}
                          {r.totalCredits > 0 && ` • זיכויים ₪${r.totalCredits.toFixed(0)}`}
                        </div>
                        {r.separatePaid > 0.5 && (
                          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 px-2 py-1 text-[11px] text-emerald-800 dark:text-emerald-300">
                            💡 נמצא תשלום של <b>{fmtILS(r.separatePaid)}</b> שנרשם בכספים אך לא שויך לחוב — כנראה כבר שולם
                          </div>
                        )}
                      </button>

                      <div className="text-left shrink-0">
                        <p className="text-xs text-muted-foreground">יתרת חוב</p>
                        <p className="text-2xl font-bold text-destructive">
                          ₪{r.balance.toLocaleString("he-IL", { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      {r.phone && (
                        <>
                          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
                            <a href={`tel:${r.phone}`}><Phone className="w-4 h-4" /> חייג</a>
                          </Button>
                          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 text-green-700">
                            <a href={toWhatsApp(r.phone, buildReminder(r))} target="_blank" rel="noopener noreferrer">
                              <MessageCircle className="w-4 h-4" /> תזכורת בוואטסאפ
                            </a>
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => sendReport(r)}
                        disabled={sendingId === r.customer_id}
                        title="דוח גבייה מפורט ללקוח: פירוט חיובים + תשלום בביט/העברה, נשלח בוואטסאפ"
                      >
                        {sendingId === r.customer_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                        דוח גבייה בוואטסאפ
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5"
                        onClick={() => navigate(`/customers/${r.customer_id}?tab=billing&autoPdf=1`)}
                        title="הפק דוח גבייה PDF"
                      >
                        <FileDown className="w-4 h-4" /> PDF
                      </Button>
                      <Button
                        size="sm"
                        className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => { setCollectTarget(r); setCollectMethod(""); setCollectReceipt(null); }}
                        title="הלקוח משלם עכשיו — רישום תשלום + הכנסה + קבלה (מסנכרן את הכל)"
                      >
                        <HandCoins className="w-4 h-4" /> קבל תשלום
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-950/30"
                        onClick={() => { setCloseTarget(r); setCloseMode(r.separatePaid > 0.5 ? "paid" : "waive"); }}
                        title="ביטול חוב — ויתור, או סגירה ללקוח ששילם ונרשם במקום אחר"
                      >
                        <Eraser className="w-4 h-4" /> ביטול חוב
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 gap-1.5 mr-auto"
                        onClick={() => navigate(`/customers/${r.customer_id}?tab=billing`)}
                      >
                        כרטסת לקוח <ChevronLeft className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports">
          {reports.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>עדיין לא נשלחו דוחות גבייה</p>
              <p className="text-sm mt-1">צור דוח מרשימת הלקוחות החייבים</p>
            </div>
          ) : (
            <div className="space-y-2">
              {reports.map((rep) => {
                const status = !rep.is_active
                  ? { label: "בוטל", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" }
                  : rep.paid_at
                  ? { label: "שולם ✓", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" }
                  : { label: "ממתין לתשלום", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" };
                return (
                  <div key={rep.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{rep.customer_name}</span>
                          <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold", status.cls)}>
                            {status.label}
                          </span>
                          {rep.items && rep.items.length > 0 && (
                            <span className="text-[11px] text-muted-foreground">{rep.items.length} חיובים בדוח</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          נשלח {fmtDate(rep.sent_at || rep.created_at)}
                        </p>
                      </div>
                      <span className="text-lg font-bold shrink-0">{fmtILS(Number(rep.amount))}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="פתח דוח"
                          onClick={() => window.open(`${payPageOrigin()}/pay/${rep.share_token}`, "_blank")}>
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="העתק קישור"
                          onClick={() => copyReportLink(rep)}>
                          {copiedId === rep.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        </Button>
                        {rep.customer_phone && rep.is_active && !rep.paid_at && (
                          <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-green-700" title="שלח שוב בוואטסאפ"
                            onClick={() => window.open(
                              toWhatsApp(rep.customer_phone!, buildReportMessage(rep.customer_name, Number(rep.amount), `${payPageOrigin()}/pay/${rep.share_token}`)),
                              "_blank"
                            )}>
                            <MessageCircle className="w-4 h-4" />
                          </Button>
                        )}
                        {rep.is_active && !rep.paid_at && (
                          <>
                            <Button variant="outline" size="sm" className="h-8 gap-1 text-emerald-700" title="סמן ששולם"
                              onClick={() => markReportPaid(rep)}>
                              <Check className="w-4 h-4" /> שולם
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" title="בטל קישור"
                              onClick={() => revokeReport(rep)}>
                              <Ban className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* דיאלוג קבלת תשלום — משלם עכשיו: תשלום + הכנסה + קבלה */}
      <Dialog open={!!collectTarget} onOpenChange={(o) => { if (!o) { setCollectTarget(null); setCollectMethod(""); setCollectReceipt(null); } }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandCoins className="w-5 h-5 text-emerald-600" /> קבלת תשלום
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 p-3 text-sm">
              <b>{collectTarget?.name}</b> משלם עכשיו{" "}
              <b className="text-emerald-700">{collectTarget ? fmtILS(collectTarget.balance) : ""}</b>.
              <div className="text-xs text-muted-foreground mt-1">
                יירשם תשלום בכרטסת <b>וגם</b> הכנסה בכספים — הכל מסונכרן אוטומטית.
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block">אמצעי תשלום</Label>
              <Select value={collectMethod} onValueChange={setCollectMethod}>
                <SelectTrigger><SelectValue placeholder="בחר אמצעי תשלום..." /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">קבלה (לא חובה)</Label>
              {collectTarget && (
                <ReceiptUpload
                  customerId={collectTarget.customer_id}
                  currentPath={collectReceipt}
                  onUploaded={(path) => setCollectReceipt(path)}
                  onRemoved={() => setCollectReceipt(null)}
                />
              )}
            </div>
            <Button
              className="w-full h-12 gap-2 bg-emerald-600 hover:bg-emerald-700 text-base"
              disabled={collecting || !collectMethod}
              onClick={() => collectTarget && collectPayment(collectTarget)}
            >
              {collecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              אשר תשלום של {collectTarget ? fmtILS(collectTarget.balance) : ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* דיאלוג ביטול חוב — בחירה בין ויתור לבין "כבר שולם" */}
      <AlertDialog open={!!closeTarget} onOpenChange={(o) => { if (!o) setCloseTarget(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Eraser className="w-5 h-5 text-rose-600" /> ביטול חוב — {closeTarget?.name}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 pt-1">
                <p className="text-sm">
                  איך לסגור את החוב על סך <b className="text-rose-600">{closeTarget ? fmtILS(closeTarget.balance) : ""}</b>?
                </p>
                {closeTarget && closeTarget.separatePaid > 0.5 && (
                  <p className="text-xs rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 p-2">
                    💡 נמצא תשלום של <b>{fmtILS(closeTarget.separatePaid)}</b> שכבר רשום בכספים — בחרתי עבורך "כבר שולם".
                  </p>
                )}
                {/* שתי אפשרויות */}
                <button
                  type="button"
                  onClick={() => setCloseMode("paid")}
                  className={cn(
                    "w-full text-right rounded-xl border-2 p-3 transition-colors",
                    closeMode === "paid"
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                      : "border-border hover:border-emerald-300"
                  )}
                >
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" /> כבר שולם — רשמתי במקום אחר
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    הלקוח שילם והכסף כבר בכספים (יש חשבונית / הכנסה ידנית). ייסגר כ"שולם" — <b>בלי לספור את הכסף פעמיים</b>.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setCloseMode("waive")}
                  className={cn(
                    "w-full text-right rounded-xl border-2 p-3 transition-colors",
                    closeMode === "waive"
                      ? "border-rose-500 bg-rose-50 dark:bg-rose-950/40"
                      : "border-border hover:border-rose-300"
                  )}
                >
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <Eraser className="w-4 h-4 text-rose-600" /> ויתור / חוב שגוי
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    ויתרת על החוב או שהוא נרשם בטעות. יימחק כזיכוי — בלי לרשום תשלום.
                  </div>
                </button>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={closing}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className={cn("text-white gap-1.5", closeMode === "paid" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700")}
              disabled={closing}
              onClick={(e) => { e.preventDefault(); if (closeTarget) closeDebt(closeTarget, closeMode); }}
            >
              {closing ? <Loader2 className="w-4 h-4 animate-spin" /> : closeMode === "paid" ? <Check className="w-4 h-4" /> : <Eraser className="w-4 h-4" />}
              {closeMode === "paid" ? "סגור כשולם" : "בטל את החוב"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Debts;
