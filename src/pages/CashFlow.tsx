import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { FinanceHubExtras } from "@/components/finance/FinanceHubExtras";
import {
  TrendingUp, TrendingDown, HandCoins, Pencil, Check, ChevronDown,
  Landmark, Briefcase, Home, RefreshCw, PlugZap,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  startOfWeek, startOfMonth, addWeeks, format, isBefore, parseISO, subWeeks,
  formatDistanceToNow,
} from "date-fns";
import { he } from "date-fns/locale";

/**
 * מצב הכסף — מסך אחד שאומר לבעל העסק כמה כסף יש לו באמת:
 * יתרות בנק אמיתיות (מסונכרנות אוטומטית מהמחשב), מה קרה החודש, ומי חייב לו.
 */

interface Txn { direction: string; amount: number; txn_date: string; counterparty_name?: string | null; notes?: string | null }
interface LedgerRow { customer_id: string; entry_type: string; amount: number }
interface BankAccount { key: string; bank: string; label: string; accountNumber: string; balance: number | null }
interface BankData { updated_at: string; accounts: BankAccount[]; errors?: { bank: string; message: string }[] }

const PAST_WEEKS = 4;
const FUTURE_WEEKS = 13;
const OPENING_BALANCE_KEY = "cashflow_opening_balance";

const fmtILS = (n: number) => "₪" + Math.round(n).toLocaleString("he-IL");

const CashFlow = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [txns, setTxns] = useState<Txn[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [bankData, setBankData] = useState<BankData | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [manualBalance, setManualBalance] = useState<number>(() => {
    const saved = localStorage.getItem(OPENING_BALANCE_KEY);
    return saved ? Number(saved) : 0;
  });
  const [editingBalance, setEditingBalance] = useState(false);
  const [tempBalance, setTempBalance] = useState("");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const since = format(subWeeks(new Date(), 26), "yyyy-MM-dd");
        const [txnRes, ledgerRes, bankRes] = await Promise.all([
          supabase
            .from("financial_transactions")
            .select("direction, amount, txn_date, counterparty_name, notes")
            .gte("txn_date", since)
            .order("txn_date", { ascending: true }),
          (supabase as any).from("customer_ledger").select("customer_id, entry_type, amount"),
          supabase.storage.from("finance-docs").download("bank/balances.json"),
        ]);
        if (txnRes.error) throw txnRes.error;
        setTxns((txnRes.data as Txn[]) || []);
        setLedger((ledgerRes.data as LedgerRow[]) || []);
        if (bankRes.data) {
          try {
            const parsed = JSON.parse(await bankRes.data.text());
            setBankData(parsed);
          } catch { /* קובץ לא תקין — נתעלם */ }
        }
      } catch (err) {
        console.error("cashflow load error:", err);
        toast({ title: "שגיאה", description: "לא ניתן לטעון נתונים", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const saveManualBalance = () => {
    const n = Number(tempBalance.replace(/[^\d.-]/g, ""));
    if (isNaN(n)) {
      toast({ title: "סכום לא תקין", variant: "destructive" });
      return;
    }
    setManualBalance(n);
    localStorage.setItem(OPENING_BALANCE_KEY, String(n));
    setEditingBalance(false);
    toast({ title: "✅ עודכן!" });
  };

  // יתרות מהבנק (אם סונכרנו)
  const bank = useMemo(() => {
    const accounts = (bankData?.accounts || []).filter((a) => a.balance !== null);
    const business = accounts.filter((a) => a.key === "mizrahi").reduce((s, a) => s + Number(a.balance), 0);
    const family = accounts.filter((a) => a.key === "leumi").reduce((s, a) => s + Number(a.balance), 0);
    const total = business + family;
    const hasBusiness = accounts.some((a) => a.key === "mizrahi");
    const hasFamily = accounts.some((a) => a.key === "leumi");
    return { connected: accounts.length > 0, hasBusiness, hasFamily, business, family, total, updatedAt: bankData?.updated_at };
  }, [bankData]);

  const model = useMemo(() => {
    const now = new Date();
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 0 });
    const monthStart = startOfMonth(now);

    // החודש הנוכחי — בפועל
    let monthIn = 0;
    let monthOut = 0;
    txns.forEach((t) => {
      const d = parseISO(t.txn_date);
      if (!isBefore(d, monthStart)) {
        if (t.direction === "income") monthIn += Number(t.amount);
        else monthOut += Number(t.amount);
      }
    });

    // ממוצעים (8 שבועות) לתחזית
    const histStart = subWeeks(thisWeekStart, 8);
    let histIncome = 0;
    let histExpense = 0;
    txns.forEach((t) => {
      const d = parseISO(t.txn_date);
      if (!isBefore(d, histStart) && isBefore(d, thisWeekStart)) {
        if (t.direction === "income") histIncome += Number(t.amount);
        else histExpense += Number(t.amount);
      }
    });
    const avgWeeklyIncome = histIncome / 8;
    const avgWeeklyExpense = histExpense / 8;

    // חובות פתוחים — פר לקוח, כמו במסך החובות
    const perCustomer = new Map<string, number>();
    ledger.forEach((e) => {
      const amt = Number(e.amount);
      let delta = 0;
      if (e.entry_type === "charge") delta = amt;
      else if (e.entry_type === "payment" || e.entry_type === "credit") delta = -amt;
      perCustomer.set(e.customer_id, (perCustomer.get(e.customer_id) || 0) + delta);
    });
    let openDebts = 0;
    perCustomer.forEach((bal) => { if (bal > 0.5) openDebts += bal; });

    // עוגן התחזית: יתרת העסק מהבנק אם מחוברת, אחרת ידני
    const anchor = bank.hasBusiness ? bank.business : manualBalance;

    // ציר שבועות — העוגן הוא היום, העבר מחושב אחורה
    const weeks: { key: string; label: string; isPast: boolean; inflow: number; outflow: number; debtCollection: number; balance: number }[] = [];
    const windowStart = subWeeks(thisWeekStart, PAST_WEEKS);
    let netLast4Weeks = 0;
    txns.forEach((t) => {
      const d = parseISO(t.txn_date);
      if (!isBefore(d, windowStart) && isBefore(d, thisWeekStart)) {
        netLast4Weeks += t.direction === "income" ? Number(t.amount) : -Number(t.amount);
      }
    });
    let balance = anchor - netLast4Weeks;

    for (let i = -PAST_WEEKS; i < FUTURE_WEEKS; i++) {
      const wStart = addWeeks(thisWeekStart, i);
      const wEnd = addWeeks(wStart, 1);
      const isPast = i < 0;
      let inflow = 0;
      let outflow = 0;
      let debtCollection = 0;

      if (isPast || i === 0) {
        txns.forEach((t) => {
          const d = parseISO(t.txn_date);
          if (!isBefore(d, wStart) && isBefore(d, wEnd)) {
            if (t.direction === "income") inflow += Number(t.amount);
            else outflow += Number(t.amount);
          }
        });
      }
      if (!isPast) {
        if (i === 0) {
          inflow = Math.max(inflow, avgWeeklyIncome);
          outflow = Math.max(outflow, avgWeeklyExpense);
        } else {
          inflow = avgWeeklyIncome;
          outflow = avgWeeklyExpense;
        }
        if (i >= 0 && i < 4 && openDebts > 0) debtCollection = openDebts / 4;
      }

      balance += inflow + debtCollection - outflow;
      weeks.push({
        key: format(wStart, "yyyy-MM-dd"),
        label: format(wStart, "d/M", { locale: he }),
        isPast,
        inflow,
        outflow,
        debtCollection,
        balance,
      });
    }

    const monthlyExpense = avgWeeklyExpense * 4.33;
    const runwayMonths = monthlyExpense > 0 ? anchor / monthlyExpense : 0;

    return { monthIn, monthOut, openDebts, weeks, monthlyExpense, runwayMonths, anchor, safetyBuffer: monthlyExpense };
  }, [txns, ledger, bank, manualBalance]);

  return (
    <AppLayout title="מצב הכסף">
      <div dir="rtl" className="space-y-5 max-w-4xl mx-auto">

        <div>
          <h1 className="text-2xl font-bold">💰 מצב הכסף שלך</h1>
          <p className="text-sm text-muted-foreground mt-1">
            כל הכסף שלכם במקום אחד — הבנקים, העסק, והחובות. פשוט וברור.
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="h-40 rounded-2xl bg-muted animate-pulse" />
            <div className="h-24 rounded-2xl bg-muted animate-pulse" />
          </div>
        ) : (
          <>
            {/* ── הכרטיס הגדול: כמה כסף יש ── */}
            {bank.connected ? (
              <div className="rounded-2xl bg-gradient-to-l from-blue-600 to-indigo-700 text-white p-6 shadow-lg space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/80 text-sm">סך הכול בשני הבנקים</p>
                    <p className="text-4xl font-bold mt-1">{fmtILS(bank.total)}</p>
                  </div>
                  <Landmark className="w-12 h-12 opacity-60" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/10 p-3 flex items-center gap-3">
                    <Briefcase className="w-8 h-8 opacity-80" />
                    <div>
                      <p className="text-xs text-white/75">העסק — מזרחי טפחות</p>
                      <p className="text-xl font-bold">{bank.hasBusiness ? fmtILS(bank.business) : "לא מחובר"}</p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/10 p-3 flex items-center gap-3">
                    <Home className="w-8 h-8 opacity-80" />
                    <div>
                      <p className="text-xs text-white/75">משפחתי — לאומי (אתה ואשתך)</p>
                      <p className="text-xl font-bold">{bank.hasFamily ? fmtILS(bank.family) : "לא מחובר"}</p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-white/70 flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3" />
                  עודכן {bank.updatedAt ? formatDistanceToNow(parseISO(bank.updatedAt), { locale: he, addSuffix: true }) : ""} · מתעדכן אוטומטית פעמיים ביום
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/50 dark:bg-blue-900/10 p-6">
                <div className="flex items-start gap-4">
                  <PlugZap className="w-10 h-10 text-blue-500 shrink-0" />
                  <div className="flex-1">
                    <p className="font-bold text-lg">החיבור לבנקים כמעט מוכן ⚡</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      ברגע שתמלא את פרטי הכניסה לבנק במחשב (קובץ אחד, פעם אחת) — היתרות של לאומי
                      ומזרחי יופיעו כאן אוטומטית כל בוקר. בינתיים אפשר להזין ידנית:
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">יתרת חשבון העסק:</span>
                      {editingBalance ? (
                        <div className="flex items-center gap-2">
                          <Input
                            className="w-32 h-9 text-left font-bold"
                            value={tempBalance}
                            onChange={(e) => setTempBalance(e.target.value)}
                            placeholder="₪"
                            autoFocus
                          />
                          <Button size="sm" onClick={saveManualBalance}>
                            <Check className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="text-lg font-bold flex items-center gap-1.5 hover:text-primary"
                          onClick={() => {
                            setTempBalance(String(manualBalance || ""));
                            setEditingBalance(true);
                          }}
                        >
                          {manualBalance ? fmtILS(manualBalance) : "לחץ להזנה"}
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── משפט הכרית — כמה זמן העסק מחזיק ── */}
            {model.anchor > 0 && model.monthlyExpense > 0 && (
              <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/40 p-4 text-sm">
                🛡️ <b>כרית הביטחון שלך:</b> עם {fmtILS(model.anchor)} בחשבון העסק והוצאות של{" "}
                {fmtILS(model.monthlyExpense)} בחודש — העסק מחזיק{" "}
                <b>{model.runwayMonths >= 12 ? "יותר משנה" : Math.floor(model.runwayMonths) + " חודשים"}</b>{" "}
                גם בלי שקל הכנסה. {model.runwayMonths >= 3 ? "מצב מצוין. 💪" : "שווה לבנות כרית של 3 חודשים."}
              </div>
            )}

            {/* ── שלושת המספרים של החודש ── */}
            <div>
              <p className="font-semibold mb-2">📅 מה קורה החודש בעסק</p>
              <div className="grid grid-cols-3 gap-3">
                <Card className="rounded-2xl border-green-200 dark:border-green-900/40">
                  <CardContent className="p-4 text-center">
                    <TrendingUp className="w-6 h-6 mx-auto text-green-600 mb-1" />
                    <p className="text-lg sm:text-xl font-bold text-green-700">{fmtILS(model.monthIn)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">נכנס החודש</p>
                  </CardContent>
                </Card>
                <Card className="rounded-2xl border-red-200 dark:border-red-900/40">
                  <CardContent className="p-4 text-center">
                    <TrendingDown className="w-6 h-6 mx-auto text-red-500 mb-1" />
                    <p className="text-lg sm:text-xl font-bold text-red-600">{fmtILS(model.monthOut)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">יצא החודש</p>
                  </CardContent>
                </Card>
                <Card
                  className="rounded-2xl border-amber-200 dark:border-amber-900/40 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate("/debts")}
                >
                  <CardContent className="p-4 text-center">
                    <HandCoins className="w-6 h-6 mx-auto text-amber-500 mb-1" />
                    <p className="text-lg sm:text-xl font-bold text-amber-600">{fmtILS(model.openDebts)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">חייבים לך — לחץ לגבייה</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* ── תחזית — מוסתרת למי שרוצה ── */}
            <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full rounded-xl gap-2">
                  <ChevronDown className={`w-4 h-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
                  {detailsOpen ? "הסתר את התחזית" : "📈 מה צפוי בחודשים הקרובים? לחץ לתחזית"}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Card className="rounded-2xl mt-3">
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground mb-3">
                      הקו הכחול = הכסף בחשבון העסק, שבוע אחרי שבוע, לפי הקצב הנוכחי שלך.
                      מעל הקו הכתום = בריא. אדום = מינוס.
                    </p>
                    <div className="h-60" dir="ltr">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={model.weeks} margin={{ top: 5, right: 8, left: 8, bottom: 5 }}>
                          <defs>
                            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.03} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.25} vertical={false} />
                          <XAxis dataKey="label" fontSize={11} tickMargin={6} />
                          <YAxis
                            fontSize={11}
                            tickFormatter={(v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + "K" : v)}
                            width={42}
                          />
                          <Tooltip
                            formatter={(value: number) => [fmtILS(value), "יתרת העסק"]}
                            labelFormatter={(l) => "שבוע " + l}
                            contentStyle={{ direction: "rtl", borderRadius: 12 }}
                          />
                          <ReferenceLine
                            y={model.safetyBuffer}
                            stroke="#f59e0b"
                            strokeDasharray="6 4"
                            label={{ value: "רף ביטחון", position: "insideTopRight", fontSize: 10, fill: "#b45309" }}
                          />
                          <ReferenceLine y={0} stroke="#ef4444" strokeWidth={1.5} />
                          <Area
                            dataKey="balance"
                            type="monotone"
                            stroke="#2563eb"
                            strokeWidth={3}
                            fill="url(#balanceFill)"
                            dot={false}
                            activeDot={{ r: 5 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>

            {/* ── מרכז הכספים המלא: הלוואות, אשראי, ביטוחים, כפילויות ── */}
            <div className="pt-2">
              <p className="font-semibold mb-2">🗂️ כל הכסף שלך במקום אחד</p>
              <FinanceHubExtras txns={txns} />
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default CashFlow;
