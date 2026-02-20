import { useState, useMemo, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, Legend,
} from "recharts";

// ─── Category classification ─────────────────────────────────────────────────
// הוצאות ישירות = חומרים + קבלן משנה + כלים וציוד
const DIRECT_COST_CATS = ["materials", "subcontractor", "tools"];
// הנהלה וכלליות
const GA_CATS = ["car", "phone", "insurance", "office", "professional", "marketing", "fuel"];
// הלוואות וקרנות
const LOAN_CATS = ["standing_order"];
// כל שאר → מימון/אחר

const MONTH_NAMES = [
  "ינו׳", "פב׳", "מרץ", "אפר׳", "מאי", "יוני",
  "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳",
];
const MONTH_FULL = [
  "ינואר","פברואר","מרץ","אפריל","מאי","יוני",
  "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר",
];

function getYear() { return String(new Date().getFullYear()); }
function fmt(n: number): string {
  if (n === 0) return "₪0";
  const abs = Math.abs(n).toLocaleString("he-IL", { maximumFractionDigits: 0 });
  return n < 0 ? `-₪${abs}` : `₪${abs}`;
}
function pct(num: number, denom: number): string {
  if (!denom) return "";
  return `${((num / denom) * 100).toFixed(0)}%`;
}

interface MonthData {
  key: string;
  label: string;
  shortLabel: string;
  revenue: number;
  directCosts: number;
  labor: number;          // שכר עבודה — תמיד 0 (אין עובדים)
  grossProfit: number;
  ga: number;
  operatingProfit: number;
  finance: number;
  vatProfit: number;      // אומדן 83% מרווח תפעולי
  loans: number;
  receipts: number;
  payments: number;
  monthlyBalance: number;
  cumulative: number;
}

interface TxnRow {
  txn_date: string;
  direction: string;
  amount: number;
  category: string | null;
}

// ─── Table helpers ────────────────────────────────────────────────────────────
type RowKind = "section" | "data" | "subtotal" | "total";

function ValueCell({ v, positive, showPct, base, bold }: {
  v: number; positive?: "auto" | "neg"; showPct?: boolean; base?: number; bold?: boolean;
}) {
  let color = "text-foreground";
  if (positive === "auto") color = v > 0 ? "text-green-600 dark:text-green-400" : v < 0 ? "text-red-500 dark:text-red-400" : "text-muted-foreground";
  if (positive === "neg") color = v > 0 ? "text-red-500 dark:text-red-400" : v < 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground";
  return (
    <td className={`px-3 py-2 text-left tabular-nums text-sm ${bold ? "font-semibold" : ""} ${color}`}>
      {fmt(v)}
      {showPct && base ? <div className="text-[10px] text-muted-foreground leading-none mt-0.5">{pct(v, base)}</div> : null}
    </td>
  );
}

function SectionRow({ label, cols }: { label: string; cols: number }) {
  return (
    <tr className="bg-muted/70">
      <td colSpan={cols} className="px-4 py-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">
        {label}
      </td>
    </tr>
  );
}

function DataRow({ label, values, totVal, indent, bold, kind, positive, showPct, revValues }: {
  label: string;
  values: number[];
  totVal: number;
  indent?: boolean;
  bold?: boolean;
  kind?: RowKind;
  positive?: "auto" | "neg";
  showPct?: boolean;
  revValues?: number[]; // for % of revenue
}) {
  const isSubtotal = kind === "subtotal";
  const isTotal = kind === "total";
  const bg = isTotal ? "bg-primary/10" : isSubtotal ? "bg-muted/40" : "";
  return (
    <tr className={`border-b border-border/40 ${bg} hover:bg-muted/20 transition-colors`}>
      <td className={`px-4 py-2.5 text-sm sticky right-0 bg-inherit min-w-[200px] max-w-[240px]
        ${bold || isSubtotal || isTotal ? "font-semibold" : "text-muted-foreground"}
        ${indent ? "pr-8" : ""}`}>
        {label}
      </td>
      {values.map((v, i) => (
        <ValueCell
          key={i} v={v} bold={bold || isSubtotal || isTotal}
          positive={positive}
          showPct={showPct} base={revValues?.[i]}
        />
      ))}
      <ValueCell
        v={totVal} bold positive={positive}
        showPct={showPct} base={revValues ? revValues.reduce((a, b) => a + b, 0) : undefined}
      />
    </tr>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ProfitabilityReport() {
  const [year, setYear] = useState(getYear);
  const [loading, setLoading] = useState(true);
  const [txns, setTxns] = useState<TxnRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("financial_transactions")
      .select("txn_date, direction, amount, category")
      .gte("txn_date", `${year}-01-01`)
      .lte("txn_date", `${year}-12-31`);
    if (data) setTxns(data as TxnRow[]);
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const months = useMemo<MonthData[]>(() => {
    const map: Record<string, MonthData> = {};
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      map[key] = {
        key, label: MONTH_FULL[m - 1], shortLabel: MONTH_NAMES[m - 1],
        revenue: 0, directCosts: 0, labor: 0,
        grossProfit: 0, ga: 0, operatingProfit: 0,
        finance: 0, vatProfit: 0, loans: 0,
        receipts: 0, payments: 0, monthlyBalance: 0, cumulative: 0,
      };
    }
    txns.forEach(t => {
      const key = t.txn_date.slice(0, 7);
      if (!map[key]) return;
      const amt = Number(t.amount);
      const cat = t.category || "other";
      if (t.direction === "income") {
        map[key].revenue += amt;
        map[key].receipts += amt;
      } else {
        map[key].payments += amt;
        if (DIRECT_COST_CATS.includes(cat)) map[key].directCosts += amt;
        else if (GA_CATS.includes(cat)) map[key].ga += amt;
        else if (LOAN_CATS.includes(cat)) map[key].loans += amt;
        else map[key].finance += amt;
      }
    });
    let cum = 0;
    return Object.values(map).map(m => {
      const grossProfit = m.revenue - m.directCosts; // שכר עבודה = 0
      const operatingProfit = grossProfit - m.ga;
      const vatProfit = operatingProfit > 0 ? operatingProfit * 0.83 : operatingProfit;
      const monthlyBalance = m.receipts - m.payments;
      cum += monthlyBalance;
      return { ...m, grossProfit, operatingProfit, vatProfit, monthlyBalance, cumulative: cum };
    });
  }, [txns, year]);

  const now = new Date();
  const activeMonths = useMemo(() => {
    const maxM = Number(year) < now.getFullYear() ? 12 : now.getMonth() + 1;
    return months.slice(0, maxM);
  }, [months, year, now.getFullYear(), now.getMonth()]);

  const T = useMemo(() => activeMonths.reduce((a, m) => ({
    revenue: a.revenue + m.revenue,
    directCosts: a.directCosts + m.directCosts,
    labor: 0,
    grossProfit: a.grossProfit + m.grossProfit,
    ga: a.ga + m.ga,
    operatingProfit: a.operatingProfit + m.operatingProfit,
    finance: a.finance + m.finance,
    vatProfit: a.vatProfit + m.vatProfit,
    loans: a.loans + m.loans,
    receipts: a.receipts + m.receipts,
    payments: a.payments + m.payments,
    monthlyBalance: a.monthlyBalance + m.monthlyBalance,
    cumulative: activeMonths[activeMonths.length - 1]?.cumulative ?? 0,
  }), {
    revenue: 0, directCosts: 0, labor: 0, grossProfit: 0,
    ga: 0, operatingProfit: 0, finance: 0, vatProfit: 0,
    loans: 0, receipts: 0, payments: 0, monthlyBalance: 0, cumulative: 0,
  }), [activeMonths]);

  const V = (f: keyof MonthData) => activeMonths.map(m => Number(m[f]));
  const revVals = V("revenue");
  const colCount = activeMonths.length + 2; // months + total col + label

  const chartData = activeMonths.map(m => ({
    name: m.shortLabel,
    "הכנסות": m.revenue,
    "הוצאות ישירות": m.directCosts,
    "הנהלה": m.ga,
    "רווח תפעולי": m.operatingProfit,
    "יתרה מצטברת": m.cumulative,
  }));

  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

  const lastCum = activeMonths[activeMonths.length - 1]?.cumulative ?? 0;

  return (
    <AppLayout title="דוח רווחיות חודשי">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold">דוח רווחיות — {year}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">אומדן מע״מ 17% | שכר עבודה = ₪0 (אין עובדים)</p>
        </div>
        <div className="mr-auto flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {([
          { label: "הכנסות", val: T.revenue, green: true },
          { label: "הוצאות", val: T.payments, green: false },
          { label: "רווח תפעולי", val: T.operatingProfit, auto: true },
          { label: "יתרה מצטברת", val: lastCum, auto: true },
        ] as const).map(k => {
          const pos = "auto" in k && k.auto ? k.val >= 0 : "green" in k && k.green;
          const bg = pos ? "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800"
                        : "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800";
          const icon = pos ? <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                           : <TrendingDown className="w-4 h-4 text-red-500" />;
          const valColor = pos ? "text-green-700 dark:text-green-300" : "text-red-600 dark:text-red-400";
          return (
            <Card key={k.label} className={`border ${bg}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground font-medium">{k.label}</span>
                  {icon}
                </div>
                <p className={`text-xl font-bold tabular-nums ${valColor}`}>{fmt(k.val)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-sm">הכנסות מול הוצאות לפי חודש</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => v === 0 ? "0" : `${(v / 1000).toFixed(0)}K`} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="הכנסות" fill="#22c55e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="הוצאות ישירות" fill="#f97316" radius={[3, 3, 0, 0]} />
                <Bar dataKey="הנהלה" fill="#94a3b8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-sm">יתרה מצטברת לאורך השנה</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => v === 0 ? "0" : `${(v / 1000).toFixed(0)}K`} axisLine={false} tickLine={false} />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="יתרה מצטברת" radius={[3, 3, 0, 0]}>
                  {chartData.map((e, i) => (
                    <Cell key={i} fill={e["יתרה מצטברת"] >= 0 ? "#22c55e" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── P&L Table ── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">דוח רווח והפסד + תזרים מזומנים</CardTitle>
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
                  <tr className="border-b-2 border-border bg-muted/60">
                    <th className="text-right px-4 py-3 font-semibold sticky right-0 bg-muted/60 min-w-[200px] text-sm">
                      שורה
                    </th>
                    {activeMonths.map(m => (
                      <th key={m.key} className="text-left px-3 py-3 font-medium text-muted-foreground text-xs whitespace-nowrap min-w-[95px]">
                        {m.shortLabel}
                      </th>
                    ))}
                    <th className="text-left px-3 py-3 font-bold text-primary text-xs whitespace-nowrap min-w-[95px] border-r-2 border-primary/30 bg-primary/5">
                      סה״כ שנתי
                    </th>
                  </tr>
                </thead>
                <tbody>

                  {/* ══ 1. הכנסות ══ */}
                  <SectionRow label="① הכנסות" cols={colCount} />
                  <DataRow
                    label="הכנסות ממכירות / שירות"
                    values={V("revenue")} totVal={T.revenue}
                    bold kind="subtotal"
                  />

                  {/* ══ 2. עלות המכר ══ */}
                  <SectionRow label="② עלות המכר" cols={colCount} />
                  <DataRow
                    label="הוצאות ישירות (חומרים, קבלן, כלים)"
                    values={V("directCosts")} totVal={T.directCosts}
                    indent
                  />
                  <DataRow
                    label="שכר עבודה"
                    values={activeMonths.map(() => 0)} totVal={0}
                    indent
                  />
                  <DataRow
                    label="רווח גולמי"
                    values={V("grossProfit")} totVal={T.grossProfit}
                    bold kind="subtotal" positive="auto"
                    showPct revValues={revVals}
                  />

                  {/* ══ 3. הנהלה וכלליות ══ */}
                  <SectionRow label="③ הנהלה וכלליות" cols={colCount} />
                  <DataRow
                    label="רכב, טלפון, ביטוח, משרד, שיווק, דלק..."
                    values={V("ga")} totVal={T.ga}
                    indent
                  />
                  <DataRow
                    label="רווח תפעולי"
                    values={V("operatingProfit")} totVal={T.operatingProfit}
                    bold kind="subtotal" positive="auto"
                    showPct revValues={revVals}
                  />

                  {/* ══ 4. מימון ══ */}
                  <SectionRow label="④ מימון" cols={colCount} />
                  <DataRow
                    label="הוצאות מימון ואחר"
                    values={V("finance")} totVal={T.finance}
                    indent
                  />
                  <DataRow
                    label="רווח לאחר מע״מ (אומדן 17%)"
                    values={V("vatProfit")} totVal={T.vatProfit}
                    bold kind="subtotal" positive="auto"
                    showPct revValues={revVals}
                  />

                  {/* ══ 5. תזרים מזומנים ══ */}
                  <SectionRow label="⑤ תזרים מזומנים" cols={colCount} />
                  <DataRow
                    label="הלוואות וקרנות (הוראות קבע)"
                    values={V("loans")} totVal={T.loans}
                    indent
                  />
                  <DataRow
                    label="תקבולים (כסף שנכנס)"
                    values={V("receipts")} totVal={T.receipts}
                    indent
                  />
                  <DataRow
                    label="תשלומים (כסף שיצא)"
                    values={V("payments")} totVal={T.payments}
                    indent
                  />
                  <DataRow
                    label="עודף / גרעון חודשי"
                    values={V("monthlyBalance")} totVal={T.monthlyBalance}
                    bold kind="subtotal" positive="auto"
                  />
                  <DataRow
                    label="יתרה מצטברת"
                    values={V("cumulative")} totVal={lastCum}
                    bold kind="total" positive="auto"
                  />

                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </AppLayout>
  );
}
