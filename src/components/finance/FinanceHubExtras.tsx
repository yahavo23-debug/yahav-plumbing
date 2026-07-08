import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Landmark, CreditCard, Shield, AlertTriangle, Plus, Trash2, ChevronDown,
  CalendarClock, Pencil, Check, X,
} from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";

/**
 * הרחבת מרכז הכספים: הלוואות, כרטיסי אשראי/חיובים קבועים, ביטוחים, וכפילויות.
 * הפריטים הידניים נשמרים כקובץ JSON ב-storage (finance-docs/personal/finance-items.json),
 * כך שהם משותפים בין המכשירים בלי צורך בטבלה חדשה.
 */

const STORAGE_PATH = "personal/finance-items.json";

interface LoanItem { id: string; name: string; remaining: number; monthly: number; endDate?: string }
interface CreditItem { id: string; name: string; monthly: number; day?: string }
interface InsuranceItem { id: string; name: string; monthly: number; renewDate?: string }
interface ItemsFile { loans: LoanItem[]; credit: CreditItem[]; insurance: InsuranceItem[] }

interface Txn { amount: number; txn_date: string; counterparty_name?: string | null; direction: string; notes?: string | null }

const fmtILS = (n: number) => "₪" + Math.round(n).toLocaleString("he-IL");
const uid = () => Math.random().toString(36).slice(2, 9);

const empty: ItemsFile = { loans: [], credit: [], insurance: [] };

export function FinanceHubExtras({ txns }: { txns: Txn[] }) {
  const [items, setItems] = useState<ItemsFile>(empty);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.storage.from("finance-docs").download(STORAGE_PATH);
        if (data) {
          const parsed = JSON.parse(await data.text());
          setItems({ ...empty, ...parsed });
        }
      } catch { /* קובץ עוד לא קיים — נתחיל ריק */ }
      setLoaded(true);
    })();
  }, []);

  const persist = async (next: ItemsFile) => {
    setItems(next);
    setSaving(true);
    try {
      const blob = new Blob([JSON.stringify(next, null, 2)], { type: "application/json" });
      const { error } = await supabase.storage
        .from("finance-docs")
        .upload(STORAGE_PATH, blob, { upsert: true, contentType: "application/json" });
      if (error) throw error;
    } catch (e: any) {
      toast({ title: "שגיאה בשמירה", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── זיהוי כפילויות: אותו סכום + אותו שם, בטווח של 3 ימים ──
  const duplicates = useMemo(() => {
    const groups = new Map<string, Txn[]>();
    txns.forEach((t) => {
      const name = (t.counterparty_name || "").trim();
      if (!name || !t.amount) return;
      const key = name + "|" + Math.round(Number(t.amount));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    });
    const dups: { name: string; amount: number; dates: string[]; direction: string }[] = [];
    groups.forEach((list) => {
      if (list.length < 2) return;
      const sorted = [...list].sort((a, b) => a.txn_date.localeCompare(b.txn_date));
      for (let i = 1; i < sorted.length; i++) {
        const gap = Math.abs(differenceInDays(parseISO(sorted[i].txn_date), parseISO(sorted[i - 1].txn_date)));
        if (gap <= 3) {
          dups.push({
            name: (sorted[i].counterparty_name || "").trim(),
            amount: Number(sorted[i].amount),
            dates: [sorted[i - 1].txn_date, sorted[i].txn_date],
            direction: sorted[i].direction,
          });
          break;
        }
      }
    });
    return dups;
  }, [txns]);

  const loanTotal = items.loans.reduce((s, l) => s + Number(l.remaining || 0), 0);
  const loanMonthly = items.loans.reduce((s, l) => s + Number(l.monthly || 0), 0);
  const creditMonthly = items.credit.reduce((s, c) => s + Number(c.monthly || 0), 0);
  const insuranceMonthly = items.insurance.reduce((s, c) => s + Number(c.monthly || 0), 0);

  if (!loaded) return <div className="h-24 rounded-2xl bg-muted animate-pulse" />;

  return (
    <div className="space-y-4">
      {/* ── כפילויות ── */}
      {duplicates.length > 0 && (
        <Card className="rounded-2xl border-amber-300 bg-amber-50 dark:bg-amber-900/10">
          <CardContent className="p-4">
            <p className="font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" /> אולי יש כפילויות — {duplicates.length} חשודות
            </p>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              רשומות עם אותו שם ואותו סכום בהפרש של כמה ימים. שווה לבדוק שלא נרשם פעמיים.
            </p>
            <div className="space-y-1.5">
              {duplicates.slice(0, 6).map((d, i) => (
                <div key={i} className="flex items-center justify-between text-sm bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2">
                  <span className="font-medium">{d.name}</span>
                  <span className={d.direction === "income" ? "text-green-700" : "text-red-600"}>
                    {fmtILS(d.amount)} × 2
                  </span>
                  <span className="text-xs text-muted-foreground">{d.dates.join(" · ")}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── הלוואות ── */}
      <ManagedSection
        title="הלוואות"
        icon={Landmark}
        color="text-purple-600"
        summary={items.loans.length ? `${fmtILS(loanTotal)} נותר · ${fmtILS(loanMonthly)} לחודש` : "אין הלוואות רשומות"}
        addLabel="הוסף הלוואה"
        fields={[
          { key: "name", label: "שם ההלוואה (למשל: הלוואת רכב)", type: "text" },
          { key: "remaining", label: "כמה נשאר להחזיר (₪)", type: "number" },
          { key: "monthly", label: "החזר חודשי (₪)", type: "number" },
          { key: "endDate", label: "תאריך סיום (לא חובה)", type: "date" },
        ]}
        rows={items.loans}
        onAdd={(v) => persist({ ...items, loans: [...items.loans, { id: uid(), name: v.name, remaining: Number(v.remaining) || 0, monthly: Number(v.monthly) || 0, endDate: v.endDate } as LoanItem] })}
        onDelete={(id) => persist({ ...items, loans: items.loans.filter((x) => x.id !== id) })}
        renderRow={(l: LoanItem) => (
          <>
            <span className="font-medium flex-1">{l.name}</span>
            <span className="text-sm">{fmtILS(l.remaining)} <span className="text-muted-foreground">נותר</span></span>
            <span className="text-sm text-red-600">{fmtILS(l.monthly)}/חודש</span>
            {l.endDate && <span className="text-xs text-muted-foreground hidden sm:inline">עד {l.endDate}</span>}
          </>
        )}
      />

      {/* ── כרטיסי אשראי / חיובים קבועים ── */}
      <ManagedSection
        title="כרטיסי אשראי וחיובים קבועים"
        icon={CreditCard}
        color="text-blue-600"
        summary={items.credit.length ? `${fmtILS(creditMonthly)} חיובים קבועים בחודש` : "אין חיובים רשומים"}
        addLabel="הוסף חיוב"
        fields={[
          { key: "name", label: "שם החיוב (למשל: ויזה / נטפליקס)", type: "text" },
          { key: "monthly", label: "סכום חודשי (₪)", type: "number" },
          { key: "day", label: "יום חיוב בחודש (לא חובה)", type: "text" },
        ]}
        rows={items.credit}
        onAdd={(v) => persist({ ...items, credit: [...items.credit, { id: uid(), name: v.name, monthly: Number(v.monthly) || 0, day: v.day } as CreditItem] })}
        onDelete={(id) => persist({ ...items, credit: items.credit.filter((x) => x.id !== id) })}
        renderRow={(c: CreditItem) => (
          <>
            <span className="font-medium flex-1">{c.name}</span>
            <span className="text-sm text-red-600">{fmtILS(c.monthly)}/חודש</span>
            {c.day && <span className="text-xs text-muted-foreground">ב-{c.day} לחודש</span>}
          </>
        )}
      />

      {/* ── ביטוחים ── */}
      <ManagedSection
        title="ביטוחים"
        icon={Shield}
        color="text-emerald-600"
        summary={items.insurance.length ? `${fmtILS(insuranceMonthly)} ביטוחים בחודש` : "אין ביטוחים רשומים"}
        addLabel="הוסף ביטוח"
        fields={[
          { key: "name", label: "שם הביטוח (למשל: ביטוח רכב / עסק)", type: "text" },
          { key: "monthly", label: "עלות חודשית (₪)", type: "number" },
          { key: "renewDate", label: "תאריך חידוש (לא חובה)", type: "date" },
        ]}
        rows={items.insurance}
        onAdd={(v) => persist({ ...items, insurance: [...items.insurance, { id: uid(), name: v.name, monthly: Number(v.monthly) || 0, renewDate: v.renewDate } as InsuranceItem] })}
        onDelete={(id) => persist({ ...items, insurance: items.insurance.filter((x) => x.id !== id) })}
        renderRow={(ins: InsuranceItem) => {
          const daysToRenew = ins.renewDate ? differenceInDays(parseISO(ins.renewDate), new Date()) : null;
          const soon = daysToRenew !== null && daysToRenew >= 0 && daysToRenew <= 30;
          return (
            <>
              <span className="font-medium flex-1">{ins.name}</span>
              <span className="text-sm text-red-600">{fmtILS(ins.monthly)}/חודש</span>
              {ins.renewDate && (
                <span className={`text-xs flex items-center gap-1 ${soon ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>
                  <CalendarClock className="w-3 h-3" /> חידוש {ins.renewDate}{soon ? " ⚠️" : ""}
                </span>
              )}
            </>
          );
        }}
      />

      {saving && <p className="text-xs text-muted-foreground text-center">שומר...</p>}
    </div>
  );
}

// ── רכיב סקציה גנרי עם הוספה/מחיקה ──
interface FieldDef { key: string; label: string; type: string }

function ManagedSection<T extends { id: string }>({
  title, icon: Icon, color, summary, addLabel, fields, rows, onAdd, onDelete, renderRow,
}: {
  title: string;
  icon: typeof Landmark;
  color: string;
  summary: string;
  addLabel: string;
  fields: FieldDef[];
  rows: T[];
  onAdd: (values: Record<string, string>) => void;
  onDelete: (id: string) => void;
  renderRow: (row: T) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  const submit = () => {
    if (!values.name?.trim()) {
      toast({ title: "חסר שם", variant: "destructive" });
      return;
    }
    onAdd(values);
    setValues({});
    setAdding(false);
  };

  return (
    <Card className="rounded-2xl">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full p-4 flex items-center gap-3 text-right">
            <div className={`w-10 h-10 rounded-xl bg-muted flex items-center justify-center ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{summary}</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-2 flex-wrap bg-muted/50 rounded-lg px-3 py-2">
                {renderRow(row)}
                <button
                  onClick={() => onDelete(row.id)}
                  className="text-muted-foreground hover:text-destructive"
                  title="מחק"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {adding ? (
              <div className="space-y-2 border rounded-xl p-3 bg-background">
                {fields.map((f) => (
                  <div key={f.key}>
                    <label className="text-xs text-muted-foreground">{f.label}</label>
                    <Input
                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      value={values[f.key] || ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="h-9 mt-0.5"
                    />
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={submit} className="gap-1">
                    <Check className="w-4 h-4" /> שמור
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setAdding(false); setValues({}); }} className="gap-1">
                    <X className="w-4 h-4" /> ביטול
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full gap-1 rounded-lg" onClick={() => setAdding(true)}>
                <Plus className="w-4 h-4" /> {addLabel}
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
