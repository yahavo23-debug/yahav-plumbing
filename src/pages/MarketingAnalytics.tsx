import { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  PieChart,
  Pie,
  LineChart,
  Line,
  Dot,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { Users, TrendingUp, TrendingDown, DollarSign, Plus, X } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { he } from "date-fns/locale";

const SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
  facebook:      { label: "פייסבוק",    color: "#1877f2" },
  instagram:     { label: "אינסטגרם",  color: "#e1306c" },
  madrag:        { label: "מדרג",       color: "#7c3aed" },
  easy:          { label: "איזי",       color: "#92400e" },
  shapatz:       { label: "שפץ",        color: "#111827" },
  word_of_mouth: { label: "פה לאוזן", color: "#16a34a" },
  contractor:    { label: "קבלן",       color: "#ea580c" },
  organic:       { label: "אורגני",    color: "#059669" },
  lead:          { label: "ליד",        color: "#dc2626" },
  referral:      { label: "הפניה",     color: "#0891b2" },
  other:         { label: "אחר",        color: "#6b7280" },
};

const MONTHS_BACK = 6;

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  lead_source: string | null;
  created_at: string;
  revenue: number;
}

interface AdCostEntry {
  id: string;
  source: string;
  month: string; // YYYY-MM
  cost: number;
}

interface DrilldownState {
  source: string;
  customers: CustomerRow[];
}

const formatILS = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;

export default function MarketingAnalytics() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [adCosts, setAdCosts] = useState<AdCostEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);

  // Add cost form
  const [addingCost, setAddingCost] = useState(false);
  const [costSource, setCostSource] = useState("");
  const [costMonth, setCostMonth] = useState(format(new Date(), "yyyy-MM"));
  const [costAmount, setCostAmount] = useState("");
  const [savingCost, setSavingCost] = useState(false);

  // Month filter
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  const months = useMemo(() => {
    const arr: { value: string; label: string }[] = [{ value: "all", label: "כל התקופות" }];
    for (let i = 0; i < MONTHS_BACK; i++) {
      const d = subMonths(new Date(), i);
      arr.push({ value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy", { locale: he }) });
    }
    return arr;
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const since = format(subMonths(new Date(), MONTHS_BACK - 1), "yyyy-MM-01");

      // Load customers with their revenue from customer_ledger
      const { data: custs } = await supabase
        .from("customers")
        .select("id, name, phone, lead_source, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false });

      const customerIds = (custs || []).map((c) => c.id);

      // Load payments for these customers
      const { data: ledger } = customerIds.length
        ? await supabase
            .from("customer_ledger")
            .select("customer_id, amount, entry_type")
            .in("customer_id", customerIds)
            .in("entry_type", ["charge", "payment"])
        : { data: [] };

      const revenueMap: Record<string, number> = {};
      (ledger || []).forEach((row) => {
        if (row.entry_type === "payment") {
          revenueMap[row.customer_id] = (revenueMap[row.customer_id] || 0) + Number(row.amount);
        }
      });

      const enriched: CustomerRow[] = (custs || []).map((c) => ({
        ...c,
        revenue: revenueMap[c.id] || 0,
      }));

      setCustomers(enriched);

      // Load ad costs from financial_transactions (category=marketing)
      const { data: txns } = await supabase
        .from("financial_transactions")
        .select("id, txn_date, amount, counterparty_name, notes")
        .eq("category", "marketing")
        .eq("direction", "expense")
        .gte("txn_date", since);

      const costs: AdCostEntry[] = (txns || []).map((t) => ({
        id: t.id,
        source: t.counterparty_name || "other",
        month: t.txn_date.slice(0, 7),
        cost: Number(t.amount),
      }));
      setAdCosts(costs);
    } finally {
      setLoading(false);
    }
  }

  // Filter by selected month
  const filteredCustomers = useMemo(() => {
    if (selectedMonth === "all") return customers;
    return customers.filter((c) => c.created_at.startsWith(selectedMonth));
  }, [customers, selectedMonth]);

  const filteredAdCosts = useMemo(() => {
    if (selectedMonth === "all") return adCosts;
    return adCosts.filter((c) => c.month === selectedMonth);
  }, [adCosts, selectedMonth]);

  // Aggregate per source
  const sourceData = useMemo(() => {
    const map: Record<string, { count: number; revenue: number; adCost: number }> = {};
    filteredCustomers.forEach((c) => {
      const src = c.lead_source || "other";
      if (!map[src]) map[src] = { count: 0, revenue: 0, adCost: 0 };
      map[src].count++;
      map[src].revenue += c.revenue;
    });
    filteredAdCosts.forEach((e) => {
      if (!map[e.source]) map[e.source] = { count: 0, revenue: 0, adCost: 0 };
      map[e.source].adCost += e.cost;
    });

    return Object.entries(map)
      .map(([source, data]) => ({
        source,
        label: SOURCE_CONFIG[source]?.label || source,
        color: SOURCE_CONFIG[source]?.color || "#6b7280",
        ...data,
        profit: data.revenue - data.adCost,
        roi: data.adCost > 0 ? ((data.revenue - data.adCost) / data.adCost) * 100 : null,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredCustomers, filteredAdCosts]);

  // Monthly customers by source (for stacked bar)
  const monthlyData = useMemo(() => {
    const monthMap: Record<string, Record<string, number>> = {};
    customers.forEach((c) => {
      const month = c.created_at.slice(0, 7);
      const src = c.lead_source || "other";
      if (!monthMap[month]) monthMap[month] = {};
      monthMap[month][src] = (monthMap[month][src] || 0) + 1;
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, srcs]) => ({
        month,
        monthLabel: format(new Date(month + "-01"), "MMM yy", { locale: he }),
        ...srcs,
      }));
  }, [customers]);

  const allSources = useMemo(
    () => [...new Set(customers.map((c) => c.lead_source || "other"))],
    [customers]
  );

  function openDrilldown(source: string) {
    const custs = filteredCustomers.filter((c) => (c.lead_source || "other") === source);
    setDrilldown({ source, customers: custs });
  }

  async function saveCost() {
    if (!costSource || !costAmount || !costMonth) return;
    setSavingCost(true);
    try {
      await supabase.from("financial_transactions").insert({
        direction: "expense",
        category: "marketing",
        counterparty_name: costSource,
        amount: parseFloat(costAmount),
        txn_date: costMonth + "-01",
        notes: `עלות פרסום - ${SOURCE_CONFIG[costSource]?.label || costSource}`,
        status: "paid",
      });
      setCostAmount("");
      setAddingCost(false);
      loadData();
    } finally {
      setSavingCost(false);
    }
  }

  const totalRevenue = filteredCustomers.reduce((s, c) => s + c.revenue, 0);
  const totalAdCost = filteredAdCosts.reduce((s, e) => s + e.cost, 0);
  const totalCustomers = filteredCustomers.length;

  return (
    <AppLayout title="אנליטיקת שיווק">
      {/* Filters + Add Cost */}
      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div className="space-y-1">
          <Label className="text-xs">תקופה</Label>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 h-10 mt-auto"
          onClick={() => setAddingCost(true)}
        >
          <Plus className="w-4 h-4" /> הוסף עלות פרסום
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">לקוחות חדשים</span>
            </div>
            <p className="text-2xl font-bold">{loading ? "..." : totalCustomers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-success" />
              <span className="text-xs text-muted-foreground">הכנסות</span>
            </div>
            <p className="text-2xl font-bold text-success">{loading ? "..." : formatILS(totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-destructive" />
              <span className="text-xs text-muted-foreground">עלות פרסום</span>
            </div>
            <p className="text-2xl font-bold text-destructive">{loading ? "..." : formatILS(totalAdCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">רווח נקי</span>
            </div>
            <p className={`text-2xl font-bold ${totalRevenue - totalAdCost >= 0 ? "text-success" : "text-destructive"}`}>
              {loading ? "..." : formatILS(totalRevenue - totalAdCost)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Customers Stacked Bar */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">לקוחות חדשים לפי חודש ופלטפורמה</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number, name: string) => [value, SOURCE_CONFIG[name]?.label || name]}
                contentStyle={{ direction: "rtl", fontSize: 12 }}
              />
              <Legend
                formatter={(v) => SOURCE_CONFIG[v]?.label || v}
                wrapperStyle={{ fontSize: 12 }}
              />
              {allSources.map((src) => (
                <Bar key={src} dataKey={src} stackId="a" fill={SOURCE_CONFIG[src]?.color || "#6b7280"} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Trend Line Chart */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">מגמת לקוחות לאורך זמן לפי פלטפורמה</CardTitle>
          <p className="text-xs text-muted-foreground">זיהוי פלטפורמות צומחות ומתכווצות</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number, name: string) => [value + " לקוחות", SOURCE_CONFIG[name]?.label || name]}
                contentStyle={{ direction: "rtl", fontSize: 12 }}
              />
              <Legend
                formatter={(v) => SOURCE_CONFIG[v]?.label || v}
                wrapperStyle={{ fontSize: 12 }}
              />
              {allSources.map((src) => (
                <Line
                  key={src}
                  type="monotone"
                  dataKey={src}
                  name={src}
                  stroke={SOURCE_CONFIG[src]?.color || "#6b7280"}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: SOURCE_CONFIG[src]?.color || "#6b7280" }}
                  activeDot={{ r: 6, cursor: "pointer", onClick: (_: any, payload: any) => openDrilldown(src) }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground text-center mt-1">לחץ על נקודה לצפות בלקוחות של אותה פלטפורמה</p>
        </CardContent>
      </Card>


      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Revenue vs Ad Cost Bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">הכנסות מול עלות פרסום לפי פלטפורמה</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={sourceData}
                layout="vertical"
                margin={{ top: 5, right: 40, left: 5, bottom: 5 }}
                onClick={(d) => d?.activePayload?.[0] && openDrilldown(d.activePayload[0].payload.source)}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                <YAxis dataKey="label" type="category" tick={{ fontSize: 12 }} width={55} />
                <Tooltip
                  formatter={(v: number) => formatILS(v)}
                  contentStyle={{ direction: "rtl", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" name="הכנסות" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} />
                <Bar dataKey="adCost" name="עלות פרסום" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground text-center mt-1">לחץ על שורה לצפות בלקוחות</p>
          </CardContent>
        </Card>

        {/* Customers Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">התפלגות לקוחות לפי מקור</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={sourceData}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  onClick={(d) => openDrilldown(d.source)}
                  label={({ label, count }) => `${label} (${count})`}
                  labelLine={false}
                >
                  {sourceData.map((entry) => (
                    <Cell key={entry.source} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, name: string) => [v, name]}
                  contentStyle={{ direction: "rtl", fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground text-center mt-1">לחץ על פלח לצפות בלקוחות</p>
          </CardContent>
        </Card>
      </div>

      {/* Source ROI Table */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">טבלת ROI לפי פלטפורמה</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs">
                <th className="text-right pb-2 font-medium">פלטפורמה</th>
                <th className="text-center pb-2 font-medium">לקוחות</th>
                <th className="text-center pb-2 font-medium">הכנסות</th>
                <th className="text-center pb-2 font-medium">עלות פרסום</th>
                <th className="text-center pb-2 font-medium">רווח</th>
                <th className="text-center pb-2 font-medium">ROI</th>
              </tr>
            </thead>
            <tbody>
              {sourceData.map((row) => (
                <tr
                  key={row.source}
                  className="border-b border-border/50 hover:bg-accent/30 cursor-pointer transition-colors"
                  onClick={() => openDrilldown(row.source)}
                >
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                      <span className="font-medium">{row.label}</span>
                    </div>
                  </td>
                  <td className="text-center py-2.5">{row.count}</td>
                  <td className="text-center py-2.5 text-success font-medium">{formatILS(row.revenue)}</td>
                  <td className="text-center py-2.5 text-destructive">{row.adCost > 0 ? formatILS(row.adCost) : "—"}</td>
                  <td className={`text-center py-2.5 font-bold ${row.profit >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatILS(row.profit)}
                  </td>
                  <td className="text-center py-2.5">
                    {row.roi !== null ? (
                      <Badge
                        variant="outline"
                        className={row.roi >= 0 ? "border-success text-success" : "border-destructive text-destructive"}
                      >
                        {Math.round(row.roi)}%
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">אין נתון</span>
                    )}
                  </td>
                </tr>
              ))}
              {sourceData.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">אין נתונים לתקופה הנבחרת</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Add Cost Dialog */}
      <Dialog open={addingCost} onOpenChange={setAddingCost}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>הוסף עלות פרסום</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-sm">פלטפורמה</Label>
              <Select value={costSource} onValueChange={setCostSource}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר פלטפורמה" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">חודש</Label>
              <Input
                type="month"
                value={costMonth}
                onChange={(e) => setCostMonth(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">סכום (₪)</Label>
              <Input
                type="number"
                placeholder="0"
                value={costAmount}
                onChange={(e) => setCostAmount(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={saveCost} disabled={savingCost || !costSource || !costAmount}>
                {savingCost ? "שומר..." : "שמור"}
              </Button>
              <Button variant="outline" onClick={() => setAddingCost(false)}>ביטול</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Drilldown Dialog */}
      <Dialog open={!!drilldown} onOpenChange={() => setDrilldown(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {drilldown && (
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: SOURCE_CONFIG[drilldown.source]?.color }}
                />
              )}
              לקוחות מ{drilldown ? SOURCE_CONFIG[drilldown.source]?.label || drilldown.source : ""}
            </DialogTitle>
          </DialogHeader>
          {drilldown && (
            <div className="space-y-2">
              <div className="flex gap-3 text-sm text-muted-foreground mb-3">
                <span>{drilldown.customers.length} לקוחות</span>
                <span>•</span>
                <span className="text-success font-medium">
                  {formatILS(drilldown.customers.reduce((s, c) => s + c.revenue, 0))} הכנסות
                </span>
              </div>
              {drilldown.customers.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">אין לקוחות בתקופה זו</p>
              ) : (
                drilldown.customers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setDrilldown(null); navigate(`/customers/${c.id}`); }}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors text-right"
                  >
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.phone} • {format(new Date(c.created_at), "dd/MM/yyyy")}
                      </p>
                    </div>
                    {c.revenue > 0 && (
                      <span className="text-success text-sm font-medium">{formatILS(c.revenue)}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
