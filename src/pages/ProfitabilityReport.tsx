import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, TrendingUp, TrendingDown, FileDown, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
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
  vatAmount: number;      // מע"מ לתשלום (18% מרווח חיובי)
  vatProfit: number;      // רווח אחרי מע"מ (82% מרווח תפעולי)
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
  const [exporting, setExporting] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [txns, setTxns] = useState<TxnRow[]>([]);
  const [incomeTax, setIncomeTax] = useState<string>("");   // מס הכנסה ידני
  const [showVat, setShowVat] = useState(true);             // הצג/הסתר שורת מע"מ
  const [taxSaving, setTaxSaving] = useState(false);        // שמירה בתהליך

  const load = useCallback(async () => {
    setLoading(true);
    const [txnRes, settingsRes] = await Promise.all([
      (supabase as any)
        .from("financial_transactions")
        .select("txn_date, direction, amount, category")
        .gte("txn_date", `${year}-01-01`)
        .lte("txn_date", `${year}-12-31`),
      (supabase as any)
        .from("annual_settings")
        .select("income_tax")
        .eq("year", Number(year))
        .maybeSingle(),
    ]);
    if (txnRes.data) setTxns(txnRes.data as TxnRow[]);
    if (settingsRes.data) {
      setIncomeTax(String(settingsRes.data.income_tax || ""));
    } else {
      setIncomeTax("");
    }
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  // שמירה אוטומטית של מס הכנסה לאחר עצירת הקלדה
  const saveTax = useCallback(async (value: string) => {
    const num = Math.max(0, Number(value.replace(/[^\d.]/g, "")) || 0);
    setTaxSaving(true);
    await (supabase as any)
      .from("annual_settings")
      .upsert({ year: Number(year), income_tax: num }, { onConflict: "year" });
    setTaxSaving(false);
  }, [year]);

  // Debounce: שמור 1.5 שניות אחרי עצירת ההקלדה
  useEffect(() => {
    if (incomeTax === "") return;
    const t = setTimeout(() => saveTax(incomeTax), 1500);
    return () => clearTimeout(t);
  }, [incomeTax, saveTax]);

  const months = useMemo<MonthData[]>(() => {
    const map: Record<string, MonthData> = {};
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      map[key] = {
        key, label: MONTH_FULL[m - 1], shortLabel: MONTH_NAMES[m - 1],
        revenue: 0, directCosts: 0, labor: 0,
        grossProfit: 0, ga: 0, operatingProfit: 0,
        finance: 0, vatAmount: 0, vatProfit: 0, loans: 0,
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
      const vatAmount = operatingProfit > 0 ? operatingProfit * 0.18 : 0; // מע"מ לתשלום
      const vatProfit = operatingProfit > 0 ? operatingProfit * 0.82 : operatingProfit; // אחרי מע"מ
      const monthlyBalance = m.receipts - m.payments;
      cum += monthlyBalance;
      return { ...m, grossProfit, operatingProfit, vatAmount, vatProfit, monthlyBalance, cumulative: cum };
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
    vatAmount: a.vatAmount + m.vatAmount,
    vatProfit: a.vatProfit + m.vatProfit,
    loans: a.loans + m.loans,
    receipts: a.receipts + m.receipts,
    payments: a.payments + m.payments,
    monthlyBalance: a.monthlyBalance + m.monthlyBalance,
    cumulative: activeMonths[activeMonths.length - 1]?.cumulative ?? 0,
  }), {
    revenue: 0, directCosts: 0, labor: 0, grossProfit: 0,
    ga: 0, operatingProfit: 0, finance: 0, vatAmount: 0, vatProfit: 0,
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

  // מס הכנסה שנתי — מחולק שווה לכל חודש פעיל
  const incomeTaxNum = Math.max(0, Number(incomeTax.replace(/[^\d.]/g, "")) || 0);
  const taxPerMonth = activeMonths.length ? incomeTaxNum / activeMonths.length : 0;
  const netProfitMonths = activeMonths.map(m => (showVat ? m.vatProfit : m.operatingProfit) - taxPerMonth);
  const netProfitTotal = netProfitMonths.reduce((a, b) => a + b, 0);

  // ── PDF Export ────────────────────────────────────────────────────────────
  const exportPDF = useCallback(async () => {
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      doc.addFileToVFS("Helvetica-Bold.ttf", "");
      doc.setR2L(true);

      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 10;
      const colW = 22;
      const labelW = 58;

      // Header
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(`Profitability Report - ${year}`, pageW / 2, 16, { align: "center" });
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`VAT estimate 18% | Generated: ${new Date().toLocaleDateString("he-IL")}`, pageW / 2, 22, { align: "center" });

      // Column headers
      const months = activeMonths.map(m => m.shortLabel);
      const headers = ["Row", ...months, "Total"];
      let y = 30;
      doc.setFillColor(240, 240, 245);
      doc.rect(margin, y, pageW - margin * 2, 7, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Row", margin + 2, y + 5);
      headers.slice(1).forEach((h, i) => {
        doc.text(h, margin + labelW + i * colW + 2, y + 5);
      });
      y += 8;

      // Section bg colors
      const sectionBg: [number, number, number] = [220, 228, 240];
      const subtotalBg: [number, number, number] = [235, 245, 235];
      const totalBg: [number, number, number] = [210, 235, 210];

      type PDFRow =
        | { type: "section"; label: string }
        | { type: "data"; label: string; values: number[]; total: number; bold?: boolean; kind?: "sub" | "total" };

      const rows: PDFRow[] = [
        { type: "section", label: "1. Revenue" },
        { type: "data", label: "Revenue from services", values: V("revenue"), total: T.revenue, bold: true, kind: "sub" },
        { type: "section", label: "2. Cost of Sales" },
        { type: "data", label: "Direct costs (materials, contractor, tools)", values: V("directCosts"), total: T.directCosts },
        { type: "data", label: "Labor costs", values: activeMonths.map(() => 0), total: 0 },
        { type: "data", label: "Gross Profit", values: V("grossProfit"), total: T.grossProfit, bold: true, kind: "sub" },
        { type: "section", label: "3. G&A" },
        { type: "data", label: "G&A (car, phone, insurance, marketing...)", values: V("ga"), total: T.ga },
        { type: "data", label: "Operating Profit (EBIT)", values: V("operatingProfit"), total: T.operatingProfit, bold: true, kind: "sub" },
        { type: "section", label: "4. Finance" },
        { type: "data", label: "Finance & other expenses", values: V("finance"), total: T.finance },
        { type: "data", label: "Profit after VAT (18% est.)", values: V("vatProfit"), total: T.vatProfit, bold: true, kind: "sub" },
        { type: "section", label: "5. Cash Flow" },
        { type: "data", label: "Loans & funds (standing orders)", values: V("loans"), total: T.loans },
        { type: "data", label: "Receipts (cash in)", values: V("receipts"), total: T.receipts },
        { type: "data", label: "Payments (cash out)", values: V("payments"), total: T.payments },
        { type: "data", label: "Monthly surplus / deficit", values: V("monthlyBalance"), total: T.monthlyBalance, bold: true, kind: "sub" },
        { type: "data", label: "Cumulative balance", values: V("cumulative"), total: lastCum, bold: true, kind: "total" },
      ];

      for (const r of rows) {
        if (r.type === "section") {
          doc.setFillColor(...sectionBg);
          doc.rect(margin, y, pageW - margin * 2, 6, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(80, 80, 120);
          doc.text(r.label, margin + 2, y + 4.5);
          doc.setTextColor(0, 0, 0);
          y += 7;
        } else {
          const isSubtotal = r.kind === "sub";
          const isTotal = r.kind === "total";
          if (isTotal) { doc.setFillColor(...totalBg); doc.rect(margin, y, pageW - margin * 2, 6.5, "F"); }
          else if (isSubtotal) { doc.setFillColor(...subtotalBg); doc.rect(margin, y, pageW - margin * 2, 6.5, "F"); }
          doc.setFont("helvetica", r.bold ? "bold" : "normal");
          doc.setFontSize(7.5);
          doc.text(r.label, margin + (r.bold ? 2 : 5), y + 4.5);
          r.values.forEach((v, i) => {
            const x = margin + labelW + i * colW;
            const s = fmt(v);
            doc.setTextColor(v < 0 ? 200 : v > 0 && (isSubtotal || isTotal) ? 20 : 50, v < 0 ? 30 : 100, v < 0 ? 30 : 50);
            doc.text(s, x + colW - 2, y + 4.5, { align: "right" });
          });
          const tx = margin + labelW + r.values.length * colW;
          const tv = r.total;
          doc.setTextColor(tv < 0 ? 200 : 20, tv < 0 ? 30 : 100, tv < 0 ? 30 : 50);
          doc.setFont("helvetica", "bold");
          doc.text(fmt(tv), tx + colW - 2, y + 4.5, { align: "right" });
          doc.setTextColor(0, 0, 0);
          y += 7;
        }
        if (y > pageH - 20) { doc.addPage(); y = 15; }
      }

      // Footer
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text("* VAT is an estimate only. Generated by Yahav CRM.", margin, pageH - 5);

      doc.save(`profitability-${year}.pdf`);
    } finally {
      setExporting(false);
    }
  }, [activeMonths, V, T, lastCum, year]);

  return (
    <AppLayout title="דוח רווחיות חודשי">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold">דוח רווחיות — {year}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">אומדן מע״מ 18% | שכר עבודה = ₪0 (אין עובדים)</p>
        </div>
        <div className="mr-auto flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportPDF} disabled={exporting || loading} className="gap-1.5">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            ייצוא PDF
          </Button>
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
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-sm">דוח רווח והפסד + תזרים מזומנים</CardTitle>
            <div className="mr-auto flex flex-wrap items-center gap-3">
              {/* מס הכנסה שנתי */}
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">מס הכנסה שנתי (₪):</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={incomeTax}
                    onChange={e => setIncomeTax(e.target.value)}
                    className="w-28 h-7 text-xs pl-6"
                  />
                  {taxSaving && (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground absolute left-1.5 top-1/2 -translate-y-1/2" />
                  )}
                </div>
              </div>
              {/* כפתור מע"מ */}
              <Button
                variant={showVat ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setShowVat(v => !v)}
              >
                {showVat ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {showVat ? "עם מע״מ 18%" : "ללא מע״מ"}
              </Button>
            </div>
          </div>
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

                  {/* ══ 4. מימון + מע"מ ══ */}
                  <SectionRow label="④ מימון ומע״מ" cols={colCount} />
                  <DataRow
                    label="הוצאות מימון ואחר"
                    values={V("finance")} totVal={T.finance}
                    indent
                  />
                  {showVat && (
                    <DataRow
                      label="מע״מ לתשלום (18% מרווח חיובי)"
                      values={V("vatAmount").map(v => -v)}
                      totVal={-T.vatAmount}
                      indent positive="neg"
                    />
                  )}
                  <DataRow
                    label={showVat ? "רווח אחרי מע״מ" : "רווח תפעולי נטו (ללא מע״מ)"}
                    values={showVat ? V("vatProfit") : V("operatingProfit")}
                    totVal={showVat ? T.vatProfit : T.operatingProfit}
                    bold kind="subtotal" positive="auto"
                    showPct revValues={revVals}
                  />

                  {/* ══ 5. מס הכנסה ══ */}
                  <SectionRow label="⑤ מס הכנסה" cols={colCount} />
                  <DataRow
                    label="מס הכנסה שנתי (הזנה ידנית)"
                    values={activeMonths.map(() => taxPerMonth)}
                    totVal={incomeTaxNum}
                    indent
                  />
                  <DataRow
                    label="רווח נקי (אחרי מס)"
                    values={netProfitMonths}
                    totVal={netProfitTotal}
                    bold kind="subtotal" positive="auto"
                    showPct revValues={revVals}
                  />

                  {/* ══ 6. תזרים מזומנים ══ */}
                  <SectionRow label="⑥ תזרים מזומנים" cols={colCount} />
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
