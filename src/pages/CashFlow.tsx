import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  TrendingUp, TrendingDown, Wallet, AlertTriangle, Scale, Pencil, Check,
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  startOfWeek, addWeeks, format, isBefore, parseISO, subWeeks,
} from "date-fns";
import { he } from "date-fns/locale";

/**
 * תזרים מזומנים — תחזית מתגלגלת 13 שבועות (מודל 13-Week Rolling Forecast).
 * עבר: 4 שבועות אחרונים בפועל. עתיד: תחזית לפי ממוצעים + גביית חובות צפויה.
 */

interface Txn {
  direction: string;
  amount: number;
  txn_date: string;
}

interface LedgerRow {
  entry_type: string;
  amount: number;
}

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

const fmtILS = (n: number) =>
  "₪" + Math.round(n).toLocaleString("he-IL");

const CashFlow = () => {
  const { user } = useAuth();
  const [txns, setTxns] = useState<Txn[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
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
          (supabase as any)
            .from("customer_ledger")
            .select("entry_type, amount"),
        ]);
        if (txnRes.error) throw txnRes.error;
        setTxns((txnRes.data as Txn[]) || []);
        setLedger((ledgerRes.data as LedgerRow[]) || []);
      } catch (err) {
        console.error("cashflow load error:", err);
        toast({ title: "שגיאה", description: "לא ניתן לטעון נתוני תזרים", variant: "destructive" });
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
    toast({ title: "✅ יתרת הפתיחה עודכנה" });
  };

  const model = useMemo(() => {
    const now = new Date();
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 0 });

    // ---- ממוצעים היסטוריים (8 שבועות אחרונים, לא כולל השבוע הנוכחי) ----
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

    // ---- חובות פתוחים (צד הלקוחות): חיובים פחות תשלומים/זיכויים ----
    let owed = 0;
    ledger.forEach((e) => {
      const amt = Number(e.amount);
      if (e.entry_type === "charge") owed += amt;
      else owed -= amt;
    });
    const openDebts = Math.max(0, owed);

    // ---- בניית שבועות: עבר בפועל + עתיד תחזית ----
    const weeks: WeekRow[] = [];
    let balance = openingBalance;

    // יתרה מצטברת עד תחילת חלון התצוגה
    const windowStart = subWeeks(thisWeekStart, PAST_WEEKS);
    txns.forEach((t) => {
      const d = parseISO(t.txn_date);
      if (isBefore(d, windowStart)) {
        balance += t.direction === "income" ? Number(t.amount) : -Number(t.amount);
      }
    });

    for (let i = -PAST_WEEKS; i < FUTURE_WEEKS; i++) {
      const wStart = addWeeks(thisWeekStart, i);
      const wEnd = addWeeks(wStart, 1);
      const isPast = i < 0;
      let inflow = 0;
      let outflow = 0;
      let debtCollection = 0;

      if (isPast || i === 0) {
        // בפועל (השבוע הנוכחי: בפועל עד כה + השלמת תחזית יחסית)
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
          // השלמת השבוע הנוכחי לפי ממוצע (אם בפועל נמוך מהממוצע)
          inflow = Math.max(inflow, avgWeeklyIncome);
          outflow = Math.max(outflow, avgWeeklyExpense);
        } else {
          inflow = avgWeeklyIncome;
          outflow = avgWeeklyExpense;
        }
        // גביית חובות: פריסה על פני 4 השבועות הקרובים
        if (i >= 0 && i < 4 && openDebts > 0) {
          debtCollection = openDebts / 4;
        }
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

    // רף ביטחון: חודש הוצאות ממוצע
    const safetyBuffer = avgWeeklyExpense * 4.33;
    const lowestWeek = weeks
      .filter((w) => !w.isPast)
      .reduce((min, w) => (w.balance < min.balance ? w : min), weeks[weeks.length - 1]);

    return { weeks, avgWeeklyIncome, avgWeeklyExpense, openDebts, safetyBuffer, lowestWeek };
  }, [txns, ledger, openingBalance]);

  const currentBalance = model.weeks.length
    ? model.weeks[PAST_WEEKS - 1]?.balance ?? openingBalance
    : openingBalance;

  const belowBuffer = model.lowestWeek && model.lowestWeek.balance < model.safetyBuffer;

  return (
    <AppLayout title="תזרים מזומנים">
      <div dir="rtl" className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Scale className="w-5 h-5" /> תזרים מזומנים
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              תחזית מתגלגלת ל-13 שבועות קדימה — מבוסס על ההכנסות, ההוצאות והחובות שלך
            </p>
          </div>
          {/* יתרת פתיחה */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">יתרת פתיחה בבנק:</span>
            {editingBalance ? (
              <div className="flex items-center gap-1">
                <Input
                  className="w-28 h-8 text-left"
                  value={tempBalance}
                  onChange={(e) => setTempBalance(e.target.value)}
                  placeholder="₪"
                  autoFocus
                />
                <Button size="sm" className="h-8 px-2" onClick={saveOpeningBalance}>
                  <Check className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <button
                className="font-semibold flex items-center gap-1 hover:text-primary"
                onClick={() => {
                  setTempBalance(String(openingBalance));
                  setEditingBalance(true);
                }}
              >
                {fmtILS(openingBalance)}
                <Pencil className="w-3 h-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* כרטיסי סיכום */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <Wallet className="w-5 h-5 mx-auto text-primary mb-1" />
              <p className={`text-xl font-bold ${currentBalance < 0 ? "text-destructive" : ""}`}>
                {fmtILS(currentBalance)}
              </p>
              <p className="text-xs text-muted-foreground">יתרה משוערת היום</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <TrendingUp className="w-5 h-5 mx-auto text-green-600 mb-1" />
              <p className="text-xl font-bold text-green-700">{fmtILS(model.avgWeeklyIncome)}</p>
              <p className="text-xs text-muted-foreground">הכנסה ממוצעת לשבוע</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <TrendingDown className="w-5 h-5 mx-auto text-red-500 mb-1" />
              <p className="text-xl font-bold text-red-600">{fmtILS(model.avgWeeklyExpense)}</p>
              <p className="text-xs text-muted-foreground">הוצאה ממוצעת לשבוע</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <AlertTriangle className="w-5 h-5 mx-auto text-amber-500 mb-1" />
              <p className="text-xl font-bold text-amber-600">{fmtILS(model.openDebts)}</p>
              <p className="text-xs text-muted-foreground">חובות פתוחים לגבייה</p>
            </CardContent>
          </Card>
        </div>

        {/* אזהרת תזרים */}
        {belowBuffer && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/10 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">שים לב לתזרים</p>
              <p className="text-muted-foreground">
                בשבוע של {model.lowestWeek.label} היתרה הצפויה ({fmtILS(model.lowestWeek.balance)})
                יורדת מתחת לרף הביטחון המומלץ ({fmtILS(model.safetyBuffer)} — חודש הוצאות).
                שווה להקדים גבייה מלקוחות חייבים או לדחות הוצאה גדולה.
              </p>
            </div>
          </div>
        )}

        {/* גרף */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">17 שבועות — 4 אחורה בפועל + 13 קדימה תחזית</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-72 rounded-xl bg-muted animate-pulse" />
            ) : (
              <div className="h-72" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={model.weeks} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => (v / 1000).toFixed(0) + "K"} />
                    <Tooltip
                      formatter={(value: number, name: string) => [fmtILS(value), name]}
                      labelFormatter={(l) => "שבוע " + l}
                    />
                    <Legend />
                    <ReferenceLine y={model.safetyBuffer} stroke="#f59e0b" strokeDasharray="4 4" />
                    <ReferenceLine y={0} stroke="#ef4444" />
                    <Bar dataKey="inflow" name="הכנסות" fill="#22c55e" radius={[3, 3, 0, 0]} stackId="in" />
                    <Bar dataKey="debtCollection" name="גבייה צפויה" fill="#86efac" radius={[3, 3, 0, 0]} stackId="in" />
                    <Bar dataKey="outflow" name="הוצאות" fill="#f87171" radius={[3, 3, 0, 0]} />
                    <Line dataKey="balance" name="יתרה" stroke="#2563eb" strokeWidth={2.5} dot={false} type="monotone" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* טבלת שבועות */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">פירוט שבועי</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-right py-2 font-medium">שבוע</th>
                  <th className="text-right py-2 font-medium">הכנסות</th>
                  <th className="text-right py-2 font-medium">גבייה צפויה</th>
                  <th className="text-right py-2 font-medium">הוצאות</th>
                  <th className="text-right py-2 font-medium">נטו</th>
                  <th className="text-right py-2 font-medium">יתרה</th>
                </tr>
              </thead>
              <tbody>
                {model.weeks.map((w) => (
                  <tr
                    key={w.key}
                    className={`border-b last:border-0 ${
                      w.isPast ? "text-muted-foreground" : ""
                    } ${w.balance < 0 ? "bg-red-50 dark:bg-red-900/10" : ""}`}
                  >
                    <td className="py-2">
                      {w.label}
                      {w.isPast && <span className="text-xs mr-1">(בפועל)</span>}
                    </td>
                    <td className="py-2 text-green-700">{fmtILS(w.inflow)}</td>
                    <td className="py-2 text-green-600">{w.debtCollection ? fmtILS(w.debtCollection) : "—"}</td>
                    <td className="py-2 text-red-600">{fmtILS(w.outflow)}</td>
                    <td className={`py-2 font-medium ${w.net < 0 ? "text-red-600" : "text-green-700"}`}>
                      {fmtILS(w.net)}
                    </td>
                    <td className={`py-2 font-bold ${w.balance < 0 ? "text-destructive" : ""}`}>
                      {fmtILS(w.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
              איך זה מחושב? ההכנסות וההוצאות העתידיות מבוססות על הממוצע השבועי שלך ב-8 השבועות
              האחרונים. "גבייה צפויה" = החובות הפתוחים של הלקוחות, בפריסה על פני 4 שבועות.
              עדכן את "יתרת הפתיחה" ליתרה האמיתית בבנק כדי שהקו הכחול ישקף את המציאות.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default CashFlow;
