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
  Wallet, Scale, Clock, Loader2, FileText, Copy, Check, Ban, ExternalLink, BellRing, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createCollectionReport, toWhatsApp, payPageOrigin, buildReportMessage } from "@/lib/collection-report";

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
      const [ledgerRes, customersRes] = await Promise.all([
        (supabase as any)
          .from("customer_ledger")
          .select("customer_id, entry_type, amount, entry_date")
          .order("entry_date", { ascending: true }),
        // select * — עמיד גם אם עמודת collection_flag עוד לא קיימת ב-DB
        (supabase as any)
          .from("customers")
          .select("*")
          .eq("is_walkin", false),
      ]);
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
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <AlertCircle className="w-3.5 h-3.5" /> לקוחות חייבים
            </div>
            <p className="text-2xl font-bold">{totals.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock className="w-3.5 h-3.5" /> בפיגור מעל 90 יום
            </div>
            <p className="text-2xl font-bold text-orange-600">{fmtILS(totals.over90)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Scale className="w-3.5 h-3.5" /> בטיפול משפטי
            </div>
            <p className="text-2xl font-bold">{totals.legal}</p>
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
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800 border border-amber-300">
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
                  ? { label: "בוטל", cls: "bg-slate-100 text-slate-500" }
                  : rep.paid_at
                  ? { label: "שולם ✓", cls: "bg-emerald-100 text-emerald-700" }
                  : { label: "ממתין לתשלום", cls: "bg-amber-100 text-amber-800" };
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
    </AppLayout>
  );
};

export default Debts;
