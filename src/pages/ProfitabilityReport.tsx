import { useState, useMemo, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, Legend,
} from "recharts";

// ─── Category classification ───────────────────────────────────────────────
const DIRECT_COST_CATEGORIES = ["materials", "subcontractor"];
const LABOR_CATEGORIES = ["tools"]; // כלים וציוד = עלות ישירה + שכר עבודה
const GA_CATEGORIES = ["car", "phone", "insurance", "office", "professional", "marketing", "fuel"];
const FINANCE_CATEGORIES: string[] = []; // לא בשימוש ברירת מחדל — ניתן לכלול "other"
const LOAN_CATEGORIES = ["standing_order"]; // הוראות קבע → הלוואות

// ─── Helpers ────────────────────────────────────────────────────────────────
function getMonthDefault() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function getYearDefault() {
  return String(new Date().getFullYear());
}
function fmt(n: number, sign = false): string {
  const abs = Math.abs(n).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (sign && n !== 0) return `${n > 0 ? "+" : "-"}₪${abs}`;
  return `₪${abs}`;
}
function pct(num: number, denom: number): string {
  if (!denom) return "—";
  return `${((num / denom) * 100).toFixed(1)}%`;
}

const MONTH_NAMES = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

// ─── Types ───────────────────────────────────────────────────────────────────
interface MonthData {
  monthKey: string; // "2025-01"
  label: string;    // "ינואר 2025"
  revenue: number;
  directCosts: number;  // חומרים + קבלן משנה
  labor: number;        // כלים וציוד
  grossProfit: number;  // הכנסות - (ישירות + שכר)
  ga: number;           // הנהלה וכלליות
  operatingProfit: number; // גולמי - הנהלה
  finance: number;      // מימון (other + unlabeled expenses)
  vatProfit: number;    // רווח לאחר מע"מ (אומדן: operatingProfit * 0.83)
  loans: number;        // הלוואות וקרנות (הוראות קבע)
  receipts: number;     // תקבולים (הכנסות בפועל שנכנסו — income)
  payments: number;     // תשלומים (הוצאות ששולמו — expense)
  monthlyBalance: number; // תקבולים - תשלומים
  cumulativeBalance: number; // יתרה מצטברת (מחושב מחוץ)
}

interface TxnRow {
  txn_date: string;
  direction: string;
  amount: number;
  category: string | null;
  status: string;
}

// ─── Row component ────────────────────────────────────────────────────────────
function PLRow({
  label, values, bold, indent, positive, sub,
  showPct, pctBase, highlight,
}: {
  label: string;
  values: number[];
  bold?: boolean;
  indent?: boolean;
  positive?: boolean | "auto";
  sub?: boolean;
  showPct?: boolean;
  pctBase?: number[];
  highlight?: boolean;
}) {
  return (
    <tr className={`border-b border-border/50 ${highlight ? "bg-primary/5" : sub ? "bg-muted/30" : ""}`}>
      <td className={`px-4 py-2.5 text-sm sticky right-0 bg-inherit min-w-[160px] ${bold ? "font-semibold" : "font-normal"} ${indent ? "pr-7 text-muted-foreground" : ""}`}>
        {label}
      </td>
      {values.map((v, i) => {
        const color =
          positive === "auto"
            ? v > 0 ? "text-green-600 dark:text-green-400" : v < 0 ? "text-red-500 dark:text-red-400" : "text-muted-foreground"
            : positive === true
            ? v >= 0 ? "text-foreground" : "text-red-500 dark:text-red-400"
            : "text-foreground";
        return (
          <td key={i} className={`px-4 py-2.5 text-sm text-left tabular-nums ${bold ? "font-semibold" : ""} ${color}`}>
            <div>{fmt(v)}</div>
            {showPct && pctBase && (
              <div className="text-xs text-muted-foreground">{pct(v, pctBase[i])}</div>
            )}
          </td>
        );
      })}
    </tr>
  );
}

function SectionHeader({ label, colCount }: { label: string; colCount: number }) {
  return (
    <tr className="bg-muted/60">
      <td colSpan={colCount + 1} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ProfitabilityReport() {
  const [year, setYear] = useState(getYearDefault);
  const [loading, setLoading] = useState(true);
  const [rawTxns, setRawTxns] = useState<TxnRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("financial_transactions")
      .select("txn_date, direction, amount, category, status")
      .gte("txn_date", `${year}-01-01`)
      .lte("txn_date", `${year}-12-31`)
      .in("status", ["paid", "debt"]);
    if (!error && data) setRawTxns(data as TxnRow[]);
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  // ─── Aggregate by month ───────────────────────────────────────────────────
  const months: MonthData[] = useMemo(() => {
    const map: Record<string, Omit<MonthData, "label" | "cumulativeBalance">> = {};

    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      map[key] = {
        monthKey: key,
        revenue: 0, directCosts: 0, labor: 0,
        grossProfit: 0, ga: 0, operatingProfit: 0,
        finance: 0, vatProfit: 0, loans: 0,
        receipts: 0, payments: 0, monthlyBalance: 0,
      };
    }

    rawTxns.forEach(t => {
      const key = t.txn_date.slice(0, 7);
      if (!map[key]) return;
      const amt = Number(t.amount);
      const cat = t.category || "other";

      if (t.direction === "income") {
        map[key].revenue += amt;
        map[key].receipts += amt;
      } else {
        map[key].payments += amt;
        if (DIRECT_COST_CATEGORIES.includes(cat)) map[key].directCosts += amt;
        else if (LABOR_CATEGORIES.includes(cat)) map[key].labor += amt;
        else if (GA_CATEGORIES.includes(cat)) map[key].ga += amt;
        else if (LOAN_CATEGORIES.includes(cat)) map[key].loans += amt;
        else map[key].finance += amt; // other / unlabeled → מימון
      }
    });

    // Compute derived fields
    let cumulative = 0;
    return Object.values(map).map(m => {
      const grossProfit = m.revenue - m.directCosts - m.labor;
      const operatingProfit = grossProfit - m.ga;
      const vatProfit = operatingProfit * 0.83; // מע"מ 17%
      const monthlyBalance = m.receipts - m.payments;
      cumulative += monthlyBalance;
      const [, monthNum] = m.monthKey.split("-").map(Number);
      return {
        ...m,
        grossProfit,
        operatingProfit,
        vatProfit,
        monthlyBalance,
        cumulativeBalance: cumulative,
        label: `${MONTH_NAMES[monthNum - 1]}`,
      };
    });
  }, [rawTxns, year]);

  // Only show months with data OR current year partially
  const activeMonths = useMemo(() => {
    const now = new Date();
    const currentYearNum = now.getFullYear();
    const maxMonth = Number(year) < currentYearNum ? 12 : now.getMonth() + 1;
    return months.filter((_, i) => i < maxMonth);
  }, [months, year]);

  const totals = useMemo<Omit<MonthData, "monthKey" | "label" | "cumulativeBalance">>(() => {
    return activeMonths.reduce((acc, m) => ({
      revenue: acc.revenue + m.revenue,
      directCosts: acc.directCosts + m.directCosts,
      labor: acc.labor + m.labor,
      grossProfit: acc.grossProfit + m.grossProfit,
      ga: acc.ga + m.ga,
      operatingProfit: acc.operatingProfit + m.operatingProfit,
      finance: acc.finance + m.finance,
      vatProfit: acc.vatProfit + m.vatProfit,
      loans: acc.loans + m.loans,
      receipts: acc.receipts + m.receipts,
      payments: acc.payments + m.payments,
      monthlyBalance: acc.monthlyBalance + m.monthlyBalance,
    }), {
      revenue: 0, directCosts: 0, labor: 0, grossProfit: 0,
      ga: 0, operatingProfit: 0, finance: 0, vatProfit: 0,
      loans: 0, receipts: 0, payments: 0, monthlyBalance: 0,
    });
  }, [activeMonths]);

  const chartData = activeMonths.map(m => ({
    name: m.label,
    הכנסות: m.revenue,
    הוצאות: -(m.directCosts + m.labor + m.ga + m.finance + m.loans),
    "רווח תפעולי": m.operatingProfit,
    "יתרה מצטברת": m.cumulativeBalance,
  }));

  const colCount = activeMonths.length;

  // helper to get row of values
  const row = (field: keyof MonthData) => activeMonths.map(m => Number(m[field]));
  const totalVal = (field: keyof typeof totals) => [totals[field as keyof typeof totals] as number];

  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

  return (
    <AppLayout title="דוח רווחיות חודשי">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h2 className="text-xl font-bold">דוח רווחיות {year}</h2>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        <Badge variant="outline" className="mr-auto text-xs">
          * מע"מ מחושב אומדן 17% • הוראות קבע = הלוואות
        </Badge>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "סה״כ הכנסות", value: totals.revenue, icon: TrendingUp, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30" },
          { label: "סה״כ הוצאות", value: totals.payments, icon: TrendingDown, color: "text-red-500 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30" },
          { label: "רווח תפעולי", value: totals.operatingProfit, icon: totals.operatingProfit >= 0 ? TrendingUp : TrendingDown, color: totals.operatingProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500", bg: totals.operatingProfit >= 0 ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30" },
          { label: "יתרה מצטברת", value: activeMonths[activeMonths.length - 1]?.cumulativeBalance ?? 0, icon: activeMonths[activeMonths.length - 1]?.cumulativeBalance ?? 0 >= 0 ? TrendingUp : AlertTriangle, color: (activeMonths[activeMonths.length - 1]?.cumulativeBalance ?? 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500", bg: (activeMonths[activeMonths.length - 1]?.cumulativeBalance ?? 0) >= 0 ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30" },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${kpi.bg} flex items-center justify-center shrink-0`}>
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                <p className={`text-base font-bold tabular-nums ${kpi.color}`}>{fmt(kpi.value)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">הכנסות מול הוצאות חודשי</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ right: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₪${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="הכנסות" fill="#22c55e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="הוצאות" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">יתרה מצטברת לאורך השנה</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ right: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₪${(v / 1000).toFixed(0)}K`} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={2} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="יתרה מצטברת" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry["יתרה מצטברת"] >= 0 ? "#22c55e" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* P&L Table */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">דוח רווח והפסד + תזרים מזומנים</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    <th className="text-right px-4 py-3 font-semibold sticky right-0 bg-muted min-w-[160px]">
                      שורה \ חודש
                    </th>
                    {activeMonths.map(m => (
                      <th key={m.monthKey} className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap min-w-[110px]">
                        {m.label}
                      </th>
                    ))}
                    <th className="text-left px-4 py-3 font-semibold text-primary whitespace-nowrap min-w-[110px] border-r border-border">
                      סה״כ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* ═══ הכנסות ═══ */}
                  <SectionHeader label="📈 הכנסות" colCount={colCount + 1} />
                  <PLRow label="הכנסות ברוטו" values={[...row("revenue"), totals.revenue]} bold />

                  {/* ═══ עלות המכר ═══ */}
                  <SectionHeader label="🔧 עלות המכר" colCount={colCount + 1} />
                  <PLRow label="הוצאות ישירות (חומרים + קבלן)" values={[...row("directCosts"), totals.directCosts]} indent />
                  <PLRow label="שכר עבודה (כלים וציוד)" values={[...row("labor"), totals.labor]} indent />
                  <PLRow
                    label="רווח גולמי"
                    values={[...row("grossProfit"), totals.grossProfit]}
                    bold highlight positive="auto"
                    showPct pctBase={[...row("revenue"), totals.revenue]}
                  />

                  {/* ═══ הנהלה וכלליות ═══ */}
                  <SectionHeader label="🏢 הנהלה וכלליות" colCount={colCount + 1} />
                  <PLRow label="הנהלה וכלליות (רכב, טל׳, ביטוח...)" values={[...row("ga"), totals.ga]} indent />
                  <PLRow
                    label="רווח תפעולי (EBIT)"
                    values={[...row("operatingProfit"), totals.operatingProfit]}
                    bold highlight positive="auto"
                    showPct pctBase={[...row("revenue"), totals.revenue]}
                  />

                  {/* ═══ מימון ═══ */}
                  <SectionHeader label="💳 מימון ואחר" colCount={colCount + 1} />
                  <PLRow label="הוצאות מימון ואחר" values={[...row("finance"), totals.finance]} indent />
                  <PLRow
                    label="רווח לאחר מע״מ (אומדן 17%)"
                    values={[...row("vatProfit"), totals.vatProfit]}
                    bold positive="auto"
                    showPct pctBase={[...row("revenue"), totals.revenue]}
                  />

                  {/* ═══ תזרים ═══ */}
                  <SectionHeader label="💰 תזרים מזומנים" colCount={colCount + 1} />
                  <PLRow label="הלוואות וקרנות (הוראות קבע)" values={[...row("loans"), totals.loans]} indent />
                  <PLRow label="תקבולים (כסף שנכנס)" values={[...row("receipts"), totals.receipts]} indent />
                  <PLRow label="תשלומים (כסף שיצא)" values={[...row("payments"), totals.payments]} indent />
                  <PLRow
                    label="עודף / גרעון חודשי"
                    values={[...row("monthlyBalance"), totals.monthlyBalance]}
                    bold highlight positive="auto"
                  />
                  <PLRow
                    label="יתרה מצטברת"
                    values={[...activeMonths.map(m => m.cumulativeBalance), activeMonths[activeMonths.length - 1]?.cumulativeBalance ?? 0]}
                    bold positive="auto"
                    highlight
                  />
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card className="border-dashed">
        <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground mb-2">📝 מקרא קטגוריות</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            <p>• <strong>הוצאות ישירות:</strong> חומרים, קבלן משנה</p>
            <p>• <strong>שכר עבודה:</strong> כלים וציוד</p>
            <p>• <strong>הנהלה וכלליות:</strong> רכב, טלפון, ביטוח, משרד, שירותים מקצועיים, שיווק, דלק</p>
            <p>• <strong>הלוואות וקרנות:</strong> הוראות קבע</p>
            <p>• <strong>מימון ואחר:</strong> כל שאר ההוצאות שאינן מסווגות</p>
            <p>• <strong>מע״מ:</strong> אומדן 17% בלבד — לא חישוב מס מדויק</p>
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
