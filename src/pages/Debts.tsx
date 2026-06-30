import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  AlertCircle, FileDown, ChevronLeft, Search, Phone, MessageCircle,
  Wallet, Scale, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DebtorRow {
  customer_id: string;
  name: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  has_legal_action: boolean;
  balance: number;
  totalCharges: number;
  totalPayments: number;
  totalCredits: number;
  overdueSince: string | null;
  overdueDays: number;
  lastEntryDate: string | null;
}

function toWhatsApp(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? "972" + digits.slice(1) : digits;
  return `https://wa.me/${intl}`;
}

const Debts = () => {
  const navigate = useNavigate();
  const { user, isAdmin, role } = useAuth();
  const canSee = isAdmin || role === "secretary";
  const [rows, setRows] = useState<DebtorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"days" | "amount">("days");

  useEffect(() => {
    if (!user || !canSee) return;
    load();
  }, [user, canSee]);

  const load = async () => {
    setLoading(true);
    try {
      const [ledgerRes, customersRes] = await Promise.all([
        (supabase as any)
          .from("customer_ledger")
          .select("customer_id, entry_type, amount, entry_date")
          .order("entry_date", { ascending: true }),
        supabase
          .from("customers")
          .select("id, name, phone, city, address, has_legal_action")
          .eq("is_walkin", false as any),
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
    const total = filtered.reduce((s, r) => s + r.balance, 0);
    const over90 = filtered.filter((r) => r.overdueDays > 90).reduce((s, r) => s + r.balance, 0);
    const legal = filtered.filter((r) => r.has_legal_action).length;
    return { total, over90, legal, count: filtered.length };
  }, [filtered]);

  if (!canSee) {
    return (
      <AppLayout title="חובות">
        <p className="text-muted-foreground text-center py-12">אין הרשאה לצפות בעמוד זה.</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="חובות לקוחות">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Wallet className="w-3.5 h-3.5" /> סה״כ חוב פתוח
            </div>
            <p className="text-2xl font-bold text-destructive">₪{totals.total.toLocaleString("he-IL", { maximumFractionDigits: 0 })}</p>
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
            <p className="text-2xl font-bold text-orange-600">₪{totals.over90.toLocaleString("he-IL", { maximumFractionDigits: 0 })}</p>
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
                        <a href={toWhatsApp(r.phone)} target="_blank" rel="noopener noreferrer">
                          <MessageCircle className="w-4 h-4" /> WhatsApp
                        </a>
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5"
                    onClick={() => navigate(`/customers/${r.customer_id}?tab=billing&autoPdf=1`)}
                    title="הפק דוח גבייה PDF"
                  >
                    <FileDown className="w-4 h-4" /> הורד דוח גבייה
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
    </AppLayout>
  );
};

export default Debts;
