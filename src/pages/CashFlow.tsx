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
import {
  TrendingUp, TrendingDown, HandCoins, Pencil, Check, ChevronDown,
  PiggyBank, CircleCheck, CircleAlert, CircleX,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  startOfWeek, addWeeks, format, isBefore, parseISO, subWeeks,
} from "date-fns";
import { he } from "date-fns/locale";

/**
 * תזרים מזומנים בגובה העיניים:
 * שאלה אחת גדולה — "יש לך מספיק כסף?" — ותחזית 3 חודשים קדימה בשפה פשוטה.
 * מבוסס מודל 13-Week Rolling Forecast, מוגש בלי ז'רגון.
 */

interface Txn { direction: string; amount: number; txn_date: string }
interface LedgerRow { customer_id: string; entry_type: string; amount: number }

interface WeekRow {
  key: string;
  label: string;
  isPast: boolean;
  inflow: number;
  outflow: number;
  debtCollection: number;
  net: number;
  balance: number;
}

const PAST_WEEKS = 4;
const FUTURE_WEEKS = 13;
const OPENING_BALANCE_KEY = "cashflow_opening_balance";

const fmtILS = (n: number) => "₪" + Math.round(n).toLocaleString("he-IL");

const CashFlow = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [txns, setTxns] = useState<Txn[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [openingBalance, setOpeningBalance] = useState<number>(() => {
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
        const [txnRes, ledgerRes] = await Promise.all([
          supabase
            .from("financial_transactions")
            .select("direction, amount, txn_date")
            .gte("txn_date", since)
            .order("txn_date", { ascending: true }),
          (supabase as any).from("customer_ledger").select("customer_id, entry_type, amount"),
        ]);
        if (txnRes.error) throw txnRes.error;
        setTxns((txnRes.data as Txn[]) || []);
        setLedger((ledgerRes.data as LedgerRow[]) || []);
      } catch (err) {
        console.error("cashflow load error:", err);
        toast({ title: "שגיאה", description: "לא ניתן לטעון נתונים", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const saveOpeningBalance = () => {
    const n = Number(tempBalance.replace(/[^\d.-]/g, ""));
    if (isNaN(n)) {
      toast({ title: "סכום לא תקין", variant: "destructive" });
      return;
    }
    setOpeningBalance(n);
    localStorage.setItem(OPENING_BALANCE_KEY, String(n));
    setEditingBalance(false);
    toast({ title: "✅ עודכן! התחזית חושבה מחדש" });
  };

  const model = useMemo(() => {
    const now = new Date();
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 0 });

    // ממוצעים מ-8 השבועות האחרונים
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

    // חובות פתוחים של לקוחות — חישוב פר לקוח, כמו במסך החובות
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

    // בניית ציר שבועות — "יתרת הבנק" מעגנת את היום, והעבר מחושב אחורה ממנה
    const weeks: WeekRow[] = [];
    const windowStart = subWeeks(thisWeekStart, PAST_WEEKS);
    let netLast4Weeks = 0;
    txns.forEach((t) => {
      const d = parseISO(t.txn_date);
      if (!isBefore(d, windowStart) && isBefore(d, thisWeekStart)) {
        netLast4Weeks += t.direction === "income" ? Number(t.amount) : -Number(t.amount);
      }
    });
    let balance = openingBalance - netLast4Weeks;

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

      const net = inflow + debtCollection - outflow;
      balance += net;
      weeks.push({
        key: format(wStart, "yyyy-MM-dd"),
        label: format(wStart, "d/M", { locale: he }),
        isPast,
        inflow,
        outflow,
        debtCollection,
        net,
        balance,
      });
    }

    const safetyBuffer = avgWeeklyExpense * 4.33; // חודש הוצאות
    const futureWeeks = weeks.filter((w) => !w.isPast);
    const lowestWeek = futureWeeks.reduce(
      (min, w) => (w.balance < min.balance ? w : min),
      futureWeeks[0]
    );
    const endBalance = weeks[weeks.length - 1]?.balance ?? 0;
    const currentBalance = weeks[PAST_WEEKS - 1]?.balance ?? openingBalance;

    // סטטוס פשוט: ירוק / צהוב / אדום
    let status: "green" | "amber" | "red" = "green";
    if (lowestWeek && lowestWeek.balance < 0) status = "red";
    else if (lowestWeek && lowestWeek.balance < safetyBuffer) status = "amber";

    return {
      weeks, avgWeeklyIncome, avgWeeklyExpense, openDebts,
      safetyBuffer, lowestWeek, endBalance, currentBalance, status,
    };
  }, [txns, ledger, openingBalance]);

  const monthlyIncome = model.avgWeeklyIncome * 4.33;
  const monthlyExpense = model.avgWeeklyExpense * 4.33;

  const statusConfig = {
    green: {
      icon: CircleCheck,
      bg: "from-emerald-500 to-green-600",
      title: "אתה בירוק! 🟢",
      text: `לפי הקצב שלך, בעוד 3 חודשים יהיו לך בערך ${fmtILS(model.endBalance)}. העסק מכניס יותר ממה שהוא מוציא — תמשיך ככה.`,
    },
    amber: {
      icon: CircleAlert,
      bg: "from-amber-400 to-orange-500",
      title: "שים לב 🟡",
      text: `בסביבות ${model.lowestWeek?.label || ""} הכסף צפוי לרדת ל-${fmtILS(model.lowestWeek?.balance || 0)} — קצת נמוך. כדאי לגבות מהלקוחות שחייבים לך (${fmtILS(model.openDebts)}) ולא לקנות ציוד גדול החודש.`,
    },
    red: {
      icon: CircleX,
      bg: "from-red-500 to-rose-600",
      title: "אזהרה — צפוי מינוס 🔴",
      text: `בסביבות ${model.lowestWeek?.label || ""} אתה צפוי להיכנס למינוס (${fmtILS(model.lowestWeek?.balance || 0)}). הדבר הכי מהיר: לגבות עכשיו את ה-${fmtILS(model.openDebts)} שלקוחות חייבים לך.`,
    },
  } as const;

  const sc = statusConfig[model.status];
  const StatusIcon = sc.icon;

  return (
    <AppLayout title="תזרים מזומנים">
      <div dir="rtl" className="space-y-5 max-w-4xl mx-auto">

        {/* כותרת */}
        <div>
          <h1 className="text-2xl font-bold">💰 הכסף שלך — קדימה 3 חודשים</h1>
          <p className="text-sm text-muted-foreground mt-1">
            המערכת מסתכלת על ההכנסות, ההוצאות והחובות שלך — ואומרת לך פשוט: הכול בסדר או לא.
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="h-36 rounded-2xl bg-muted animate-pulse" />
            <div className="h-24 rounded-2xl bg-muted animate-pulse" />
            <div className="h-64 rounded-2xl bg-muted animate-pulse" />
          </div>
        ) : (
          <>
            {/* התשובה הגדולה */}
            <div className={`rounded-2xl bg-gradient-to-l ${sc.bg} text-white p-6 shadow-lg`}>
              <div className="flex items-start gap-4">
                <StatusIcon className="w-12 h-12 shrink-0 opacity-90" />
                <div>
                  <p className="text-2xl font-bold">{sc.title}</p>
                  <p className="mt-1 text-white/90 leading-relaxed">{sc.text}</p>
                </div>
              </div>
            </div>

            {/* היתרה בבנק — קלט פשוט */}
            <Card className="rounded-2xl">
              <CardContent className="p-5 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <PiggyBank className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">כמה יש לך עכשיו בבנק?</p>
                    <p className="text-xs text-muted-foreground/70">
                      עדכן פעם בשבוע — וכל התחזית מתכיילת למציאות
                    </p>
                  </div>
                </div>
                {editingBalance ? (
                  <div className="flex items-center gap-2">
                    <Input
                      className="w-32 h-10 text-lg text-left font-bold"
                      value={tempBalance}
                      onChange={(e) => setTempBalance(e.target.value)}
                      placeholder="₪"
                      autoFocus
                    />
                    <Button className="h-10" onClick={saveOpeningBalance}>
                      <Check className="w-4 h-4 ml-1" /> שמור
                    </Button>
                  </div>
                ) : (
                  <button
                    className="text-2xl font-bold flex items-center gap-2 hover:text-primary transition-colors"
                    onClick={() => {
                      setTempBalance(String(openingBalance || ""));
                      setEditingBalance(true);
                    }}
                  >
                    {openingBalance ? fmtILS(openingBalance) : "לחץ להזנה"}
                    <Pencil className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </CardContent>
            </Card>

            {/* שלושה מספרים פשוטים */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="rounded-2xl border-green-200 dark:border-green-900/40">
                <CardContent className="p-4 text-center">
                  <TrendingUp className="w-6 h-6 mx-auto text-green-600 mb-1" />
                  <p className="text-lg sm:text-xl font-bold text-green-700">{fmtILS(monthlyIncome)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">נכנס בחודש</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-red-200 dark:border-red-900/40">
                <CardContent className="p-4 text-center">
                  <TrendingDown className="w-6 h-6 mx-auto text-red-500 mb-1" />
                  <p className="text-lg sm:text-xl font-bold text-red-600">{fmtILS(monthlyExpense)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">יוצא בחודש</p>
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

            {/* הגרף — קו אחד פשוט */}
            <Card className="rounded-2xl">
              <CardContent className="p-5">
                <p className="font-semibold mb-1">📈 כמה כסף יהיה לך — שבוע אחרי שבוע</p>
                <p className="text-xs text-muted-foreground mb-4">
                  הקו הכחול = הכסף שלך. מעל הקו המקווקו = מצב בריא. מתחת לאדום = מינוס.
                </p>
                <div className="h-64" dir="ltr">
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
                        tickFormatter={(v) => (v >= 1000 || v <= -1000 ? (v / 1000).toFixed(0) + "K" : v)}
                        width={42}
                      />
                      <Tooltip
                        formatter={(value: number) => [fmtILS(value), "הכסף שלך"]}
                        labelFormatter={(l) => "שבוע שמתחיל ב-" + l}
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

            {/* פירוט מלא — מוסתר כברירת מחדל */}
            <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full rounded-xl gap-2">
                  <ChevronDown className={`w-4 h-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
                  {detailsOpen ? "הסתר את הפירוט המלא" : "רוצה לראות את החישוב המלא? לחץ כאן"}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Card className="rounded-2xl mt-3">
                  <CardContent className="p-5 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-right py-2 font-medium">שבוע</th>
                          <th className="text-right py-2 font-medium">נכנס</th>
                          <th className="text-right py-2 font-medium">גבייה צפויה</th>
                          <th className="text-right py-2 font-medium">יוצא</th>
                          <th className="text-right py-2 font-medium">נשאר בסוף</th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.weeks.map((w) => (
                          <tr
                            key={w.key}
                            className={`border-b last:border-0 ${w.isPast ? "text-muted-foreground" : ""} ${
                              w.balance < 0 ? "bg-red-50 dark:bg-red-900/10" : ""
                            }`}
                          >
                            <td className="py-2">
                              {w.label}
                              {w.isPast && <span className="text-xs mr-1">(היה בפועל)</span>}
                            </td>
                            <td className="py-2 text-green-700">{fmtILS(w.inflow)}</td>
                            <td className="py-2 text-green-600">{w.debtCollection ? fmtILS(w.debtCollection) : "—"}</td>
                            <td className="py-2 text-red-600">{fmtILS(w.outflow)}</td>
                            <td className={`py-2 font-bold ${w.balance < 0 ? "text-destructive" : ""}`}>
                              {fmtILS(w.balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                      איך זה עובד? התחזית מבוססת על הממוצע שלך מ-8 השבועות האחרונים. "גבייה צפויה" =
                      החובות של הלקוחות, בהנחה שתגבה אותם בחודש הקרוב. ככל שתעדכן את היתרה בבנק —
                      התחזית מדויקת יותר.
                    </p>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default CashFlow;
