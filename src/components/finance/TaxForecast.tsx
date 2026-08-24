import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Landmark, ShieldCheck, PiggyBank, AlertTriangle, Sparkles, ChevronDown,
  UserRound, Plus, X, Check, Scale,
} from "lucide-react";

/**
 * "רואה החשבון שלי" — תחזית מסים חיה לעוסק פטור.
 * מחושב תמיד מהנתונים האמיתיים (הכנסות/הוצאות במערכת), כולל נקודות זיכוי אישיות,
 * ביטוח לאומי לעצמאי, תקרת עוסק פטור ופנסיית חובה — כדי שסוף שנה לא יפתיע.
 *
 * ⚠️ המדרגות והשיעורים לפי הידוע לשנת 2025 (2026 טרם פורסם רשמית) — מסומן בתחתית.
 */

// ── קבועי מס (שנתי, לפי 2025) ──────────────────────────────────────────────
const TAX_BRACKETS: [number, number][] = [
  [84120, 0.10], [120720, 0.14], [193800, 0.20],
  [269280, 0.31], [560280, 0.35], [721560, 0.47],
];
const TOP_RATE = 0.50; // 47% + 3% מס יסף
const CREDIT_POINT_VALUE = 2904;        // שווי נקודת זיכוי לשנה
const OSEK_PATUR_CEILING = 120000;      // תקרת עוסק פטור
const AVG_WAGE_MONTHLY = 13316;         // השכר הממוצע במשק
const BL_REDUCED_CEILING = AVG_WAGE_MONTHLY * 0.6 * 12;   // 60% מהשכר הממוצע (שנתי)
const BL_MAX_INCOME = 49030 * 12;       // תקרת הכנסה לדמי ביטוח
const BL_REDUCED = { bl: 0.0287, health: 0.031 };  // עד 60% מהשכר הממוצע
const BL_FULL = { bl: 0.1283, health: 0.05 };      // מעל
const BL_DEDUCTION_PCT = 0.52;          // 52% מדמי הב"ל (ללא בריאות) מוכרים כניכוי ממס הכנסה
// פנסיית חובה לעצמאים
const PENSION_LOW = 0.0445;             // עד מחצית השכר הממוצע
const PENSION_HIGH = 0.1255;            // מעל

const fmtILS = (n: number) => "₪" + Math.round(n).toLocaleString("he-IL");

/** נקודות זיכוי לילד — לאב, לפי גיל (כולל הוראת השעה לגילאי 6–12) */
function childPoints(age: number): number {
  if (age < 0) return 0;
  if (age === 0) return 1.5;
  if (age <= 5) return 2.5;
  if (age <= 12) return 1;
  return 0; // 13–17: אין נקודות לאב (רק לאם)
}

/** מס הכנסה שנתי לפי מדרגות (לפני זיכויים) */
function incomeTaxBefore(annual: number): number {
  let tax = 0, prev = 0;
  for (const [cap, rate] of TAX_BRACKETS) {
    if (annual <= prev) break;
    tax += (Math.min(annual, cap) - prev) * rate;
    prev = cap;
  }
  if (annual > prev) tax += (annual - prev) * TOP_RATE;
  return Math.max(0, tax);
}

/** ביטוח לאומי + בריאות לעצמאי (שנתי) */
function bituahLeumi(annual: number): { bl: number; health: number } {
  const base = Math.min(Math.max(annual, 0), BL_MAX_INCOME);
  const reduced = Math.min(base, BL_REDUCED_CEILING);
  const full = Math.max(0, base - BL_REDUCED_CEILING);
  return {
    bl: reduced * BL_REDUCED.bl + full * BL_FULL.bl,
    health: reduced * BL_REDUCED.health + full * BL_FULL.health,
  };
}

interface TaxProfile {
  childBirthYears: number[];
  miluimActive: boolean;
}

const PROFILE_PATH = "personal/tax-profile.json";
const DEFAULT_PROFILE: TaxProfile = { childBirthYears: [new Date().getFullYear() - 8], miluimActive: true };

export function TaxForecast({ income, expenses }: { income: number; expenses: number }) {
  const [profile, setProfile] = useState<TaxProfile>(DEFAULT_PROFILE);
  const [loaded, setLoaded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.storage.from("finance-docs").download(PROFILE_PATH);
        if (data) setProfile({ ...DEFAULT_PROFILE, ...JSON.parse(await data.text()) });
      } catch { /* ברירת מחדל */ }
      setLoaded(true);
    })();
  }, []);

  const saveProfile = async (next: TaxProfile) => {
    setProfile(next);
    try {
      const blob = new Blob([JSON.stringify(next, null, 2)], { type: "application/json" });
      await supabase.storage.from("finance-docs").upload(PROFILE_PATH, blob, { upsert: true, contentType: "application/json" });
      toast({ title: "פרופיל המס נשמר ✓" });
    } catch (e: any) {
      toast({ title: "שגיאה בשמירה", description: e.message, variant: "destructive" });
    }
  };

  const model = useMemo(() => {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
    const daysElapsed = Math.max(1, Math.floor((now.getTime() - yearStart) / 86400000) + 1);
    const factor = 365 / daysElapsed;

    // רווח עד היום ותחזית שנתית לפי הקצב
    const profitYtd = Math.max(0, income - expenses);
    const projIncome = income * factor;
    const projExpenses = expenses * factor;
    const projProfit = Math.max(0, projIncome - projExpenses);

    // נקודות זיכוי
    const base = 2.25; // תושב ישראל (כולל נסיעות)
    const kids = profile.childBirthYears.map(y => childPoints(now.getFullYear() - y));
    const kidsTotal = kids.reduce((s, p) => s + p, 0);
    const miluim = profile.miluimActive ? 1 : 0;
    const totalPoints = base + kidsTotal + miluim;
    const creditValue = totalPoints * CREDIT_POINT_VALUE;

    // חישוב לפי תחזית שנתית (מה שקובע בסוף השנה)
    const calc = (annualProfit: number) => {
      const bl = bituahLeumi(annualProfit);
      // 52% מדמי הב"ל (לא בריאות) מוכרים כניכוי — מקטין את ההכנסה החייבת במס
      const taxable = Math.max(0, annualProfit - bl.bl * BL_DEDUCTION_PCT);
      const taxBefore = incomeTaxBefore(taxable);
      const incomeTax = Math.max(0, taxBefore - creditValue);
      return { bl: bl.bl, health: bl.health, taxBefore, incomeTax, taxable, total: incomeTax + bl.bl + bl.health };
    };
    const proj = calc(projProfit);
    const ytd = calc(profitYtd); // "אילו השנה הייתה נגמרת היום"

    // פנסיית חובה לעצמאים
    const halfAvg = (AVG_WAGE_MONTHLY / 2) * 12;
    const pensionRequired = Math.min(projProfit, halfAvg) * PENSION_LOW + Math.max(0, Math.min(projProfit, AVG_WAGE_MONTHLY * 12) - halfAvg) * PENSION_HIGH;

    // תקרת עוסק פטור
    const paturPct = (projIncome / OSEK_PATUR_CEILING) * 100;

    const monthsLeft = Math.max(1, 12 - now.getMonth());
    return {
      profitYtd, projIncome, projExpenses, projProfit, proj, ytd,
      totalPoints, base, kidsTotal, miluim, creditValue,
      pensionRequired, paturPct, monthsLeft,
      monthlySetAside: proj.total / 12,
    };
  }, [income, expenses, profile]);

  if (!loaded) return <div className="h-40 rounded-2xl bg-muted animate-pulse mb-6" />;

  const m = model;
  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-4 mb-8" dir="rtl">
      {/* ── הכרטיס הגדול: כמה לשים בצד ── */}
      <div className="rounded-2xl bg-gradient-to-l from-blue-950 via-blue-800 to-cyan-600 text-white p-6 shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-white/75 text-sm flex items-center gap-2"><Scale className="w-4 h-4" /> רואה החשבון שלי — תחזית סוף שנה {currentYear}</p>
            <p className="text-4xl font-bold mt-1">{fmtILS(m.proj.total)}</p>
            <p className="text-white/80 text-sm mt-1">
              סה״כ צפוי לרשויות השנה · שים בצד <b className="text-orange-300">{fmtILS(m.monthlySetAside)}</b> בחודש ואתה מכוסה
            </p>
          </div>
          <div className="text-left text-sm bg-white/10 rounded-xl p-3 space-y-1">
            <p>רווח עד היום: <b>{fmtILS(m.profitYtd)}</b></p>
            <p>תחזית רווח שנתי (לפי הקצב): <b>{fmtILS(m.projProfit)}</b></p>
          </div>
        </div>
      </div>

      {/* ── פירוק לפי רשות ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="rounded-2xl border-indigo-200 dark:border-indigo-900/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1"><Landmark className="w-3.5 h-3.5" /> מס הכנסה</p>
            <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{fmtILS(m.proj.incomeTax)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {m.proj.incomeTax === 0
                ? `נקודות הזיכוי (${m.totalPoints}) מכסות את כל המס 🎉`
                : `אחרי ${m.totalPoints} נקודות זיכוי (שווי ${fmtILS(m.creditValue)})`}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-emerald-200 dark:border-emerald-900/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1"><ShieldCheck className="w-3.5 h-3.5" /> ביטוח לאומי + בריאות</p>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{fmtILS(m.proj.bl + m.proj.health)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">ב״ל {fmtILS(m.proj.bl)} · בריאות {fmtILS(m.proj.health)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-orange-200 dark:border-orange-900/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1"><PiggyBank className="w-3.5 h-3.5" /> להפרשה חודשית</p>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-300">{fmtILS(m.monthlySetAside)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">כל חודש לחשבון נפרד — ובסוף השנה אין הפתעות</p>
          </CardContent>
        </Card>
      </div>

      {/* ── התראות והפתעות ── */}
      <div className="space-y-2">
        {m.paturPct >= 75 && (
          <div className={`rounded-xl border p-3 text-sm flex items-start gap-2 ${m.paturPct >= 95 ? "border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50" : "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800"}`}>
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
            <span>
              <b>תקרת עוסק פטור:</b> לפי הקצב הנוכחי תגיע ל-<b>{fmtILS(m.projIncome)}</b> הכנסות השנה —
              {" "}<b>{Math.round(m.paturPct)}%</b> מהתקרה ({fmtILS(OSEK_PATUR_CEILING)}).
              {m.paturPct >= 100
                ? " צפוי לעבור את התקרה! חובה לדבר עם רו״ח על מעבר לעוסק מורשה לפני שזה קורה."
                : " אם תעבור את התקרה תידרש להפוך לעוסק מורשה — כדאי להתכונן מראש."}
            </span>
          </div>
        )}
        {m.pensionRequired > 0 && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900/50 p-3 text-sm flex items-start gap-2">
            <Sparkles className="w-5 h-5 shrink-0 mt-0.5 text-blue-600" />
            <span>
              <b>הפתעה שכדאי להכיר — פנסיית חובה לעצמאים:</b> החוק מחייב אותך להפקיד השנה כ-<b>{fmtILS(m.pensionRequired)}</b> לפנסיה
              (לפי הרווח החזוי). מי שלא מפקיד חשוף לקנס ₪500 — ובנוסף, ההפקדה מקנה הטבת מס. שווה לסגור את זה לפני דצמבר.
            </span>
          </div>
        )}
        {expenses > income && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900/50 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
            <span>
              <b>ההוצאות הרשומות גבוהות מההכנסות</b> — ולכן חבות המס מחושבת כאפס. ודא שכל ההוצאות במערכת הן באמת עסקיות
              (הוצאה פרטית שנרשמה כעסקית = בעיה בביקורת מס).
            </span>
          </div>
        )}
      </div>

      {/* ── נקודות הזיכוי שלי + עריכת פרופיל ── */}
      <Collapsible open={editOpen} onOpenChange={setEditOpen}>
        <Card className="rounded-2xl">
          <CollapsibleTrigger asChild>
            <button className="w-full p-4 flex items-center gap-3 text-right">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-violet-600">
                <UserRound className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">נקודות הזיכוי שלי — {m.totalPoints} נקודות (שווי {fmtILS(m.creditValue)} בשנה)</p>
                <p className="text-xs text-muted-foreground">
                  תושב ישראל {m.base} · ילדים {m.kidsTotal} · מילואים {m.miluim} — לחץ לעדכון הפרופיל
                </p>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${editOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-4 space-y-3">
              <div>
                <p className="text-sm font-medium mb-1.5">שנות לידה של הילדים (מתחת ל-18):</p>
                <div className="flex flex-wrap gap-2">
                  {profile.childBirthYears.map((y, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-muted rounded-full pl-1 pr-2 py-1 text-sm">
                      <Input
                        type="number" value={y}
                        onChange={(e) => {
                          const next = [...profile.childBirthYears];
                          next[i] = parseInt(e.target.value) || y;
                          setProfile({ ...profile, childBirthYears: next });
                        }}
                        className="h-7 w-20 text-center border-0 bg-transparent p-0"
                      />
                      <button onClick={() => saveProfile({ ...profile, childBirthYears: profile.childBirthYears.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                  <Button variant="outline" size="sm" className="h-8 gap-1 rounded-full"
                    onClick={() => setProfile({ ...profile, childBirthYears: [...profile.childBirthYears, currentYear - 1] })}>
                    <Plus className="w-3.5 h-3.5" /> ילד/ה
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  נקודות לאב לפי גיל: שנת לידה 1.5 · גילאי 1–5: 2.5 · גילאי 6–12: 1 · גילאי 13–17: 0
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={profile.miluimActive}
                  onChange={(e) => setProfile({ ...profile, miluimActive: e.target.checked })}
                  className="w-4 h-4" />
                משרת מילואים פעיל (נקודת זיכוי לפי הוראת השעה)
              </label>
              <Button size="sm" onClick={() => saveProfile(profile)} className="gap-1.5">
                <Check className="w-4 h-4" /> שמור פרופיל
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <p className="text-[11px] text-muted-foreground text-center">
        החישוב לפי מדרגות המס ושיעורי הביטוח הלאומי הידועים (2025) · עוסק פטור — ללא מע״מ · כולל ניכוי 52% מדמי הב״ל ממס הכנסה ·
        מקדמות למס הכנסה יתווספו אחרי בדיקה · זו הערכה מסודרת, לא תחליף לרו״ח מוסמך.
      </p>
    </div>
  );
}
