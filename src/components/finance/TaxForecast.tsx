import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Landmark, ShieldCheck, PiggyBank, AlertTriangle, Sparkles, ChevronDown,
  UserRound, Plus, X, Check, Scale, Siren, TrendingDown,
} from "lucide-react";

/**
 * "רואה החשבון שלי" — תחזית מסים חיה לעוסק פטור.
 * גרסה 2 — אחרי ביקורת מועצת המומחים (24.8.26):
 *  • תגמולי מילואים נכללים כהכנסה חייבת (שדה בפרופיל)
 *  • טווח במקום מספר יחיד — תלוי כמה מההוצאות מוכרות
 *  • ביטוח לאומי מינימלי גם בשנת הפסד (רצפת עצמאי)
 *  • מסר אמת כשאין מס בגלל הפסד (במקום 🎉)
 *  • התראת קצב לתקרת עוסק פטור עם חודש חצייה צפוי
 *  • דגלי "הוראת שעה" על נקודות ילד 6–12 ומילואים
 * המדרגות והשיעורים לפי הידוע (2025, הקפאה עד 2027) — לא תחליף לרו"ח.
 */

// ── קבועי מס (שנתי, לפי 2025 — מרוכזים כאן לעדכון שנתי קל) ──────────────────
const TAX_YEAR = 2025; // שנת הקבועים. אם השנה הנוכחית גדולה — מוצגת אזהרה.
const TAX_BRACKETS: [number, number][] = [
  [84120, 0.10], [120720, 0.14], [193800, 0.20],
  [269280, 0.31], [560280, 0.35], [721560, 0.47],
];
const TOP_RATE = 0.50;
const CREDIT_POINT_VALUE = 2904;
const OSEK_PATUR_CEILING = 120000;
const AVG_WAGE_MONTHLY = 13316;
const BL_REDUCED_CEILING = AVG_WAGE_MONTHLY * 0.6 * 12;
const BL_MAX_INCOME = 49030 * 12;
const BL_REDUCED = { bl: 0.0287, health: 0.031 };
const BL_FULL = { bl: 0.1283, health: 0.05 };
const BL_DEDUCTION_PCT = 0.52;
const BL_MIN_INCOME = AVG_WAGE_MONTHLY * 0.25 * 12; // רצפת הכנסה לחישוב ב"ל לעצמאי (משוער — לאימות)
const PENSION_LOW = 0.0445;
const PENSION_HIGH = 0.1255;

const fmtILS = (n: number) => "₪" + Math.round(n).toLocaleString("he-IL");
const MONTH_NAMES = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

function childPoints(age: number): number {
  if (age < 0) return 0;
  if (age === 0) return 1.5;
  if (age <= 5) return 2.5;
  if (age <= 12) return 1; // הוראת שעה — טעון אימות לשנה הנוכחית
  return 0;
}

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

function bituahLeumi(annualBase: number): { bl: number; health: number } {
  const base = Math.min(Math.max(annualBase, 0), BL_MAX_INCOME);
  const reduced = Math.min(base, BL_REDUCED_CEILING);
  const full = Math.max(0, base - BL_REDUCED_CEILING);
  return {
    bl: reduced * BL_REDUCED.bl + full * BL_FULL.bl,
    health: reduced * BL_REDUCED.health + full * BL_FULL.health,
  };
}

interface TaxProfile {
  childBirthYears: number[];
  claimsChildPoints: boolean;   // האם יהב הוא זה שתובע את נקודות הילדים (לרוב אצל האם!)
  miluimActive: boolean;
  miluimPayments: number;       // תגמולי מילואים שהתקבלו השנה (₪) — הכנסה חייבת!
  expenseRecognitionPct: number; // איזה אחוז מההוצאות הרשומות באמת מוכר (עד לסיווג מסודר)
}

const PROFILE_PATH = "personal/tax-profile.json";
const DEFAULT_PROFILE: TaxProfile = {
  childBirthYears: [new Date().getFullYear() - 8],
  claimsChildPoints: true,
  miluimActive: true,
  miluimPayments: 0,
  expenseRecognitionPct: 70,
};

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
    const daysElapsed = Math.max(1, Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000) + 1);
    const factor = 365 / daysElapsed;

    // מחזור עסקי (לתקרת עוסק פטור — מחזור, לא רווח!)
    const projTurnover = income * factor;
    const paturPct = (projTurnover / OSEK_PATUR_CEILING) * 100;
    // חודש חצייה צפוי לפי הקצב היומי
    let crossMonth: string | null = null;
    if (projTurnover >= OSEK_PATUR_CEILING) {
      const dailyRate = income / daysElapsed;
      const crossDay = Math.min(364, Math.ceil(OSEK_PATUR_CEILING / dailyRate));
      crossMonth = MONTH_NAMES[new Date(now.getFullYear(), 0, 1 + crossDay).getMonth()];
    }

    // נקודות זיכוי
    const base = 2.25;
    const kidsTotal = profile.claimsChildPoints
      ? profile.childBirthYears.reduce((s, y) => s + childPoints(now.getFullYear() - y), 0)
      : 0;
    const miluimPts = profile.miluimActive ? 1 : 0;
    const totalPoints = base + kidsTotal + miluimPts;
    const creditValue = totalPoints * CREDIT_POINT_VALUE;

    /**
     * תרחיש מס: רווח עסקי לפי אחוז הכרה בהוצאות + תגמולי מילואים (הכנסה חייבת),
     * ב"ל על בסיס עם רצפת מינימום, ניכוי 52% מהב"ל ממס הכנסה.
     */
    const scenario = (recognitionPct: number) => {
      const recognizedExpenses = expenses * (recognitionPct / 100);
      const bizProfitYtd = Math.max(0, income - recognizedExpenses);
      const projBizProfit = bizProfitYtd * factor;
      const annualProfit = projBizProfit + Number(profile.miluimPayments || 0);
      const blBase = Math.max(annualProfit, BL_MIN_INCOME); // רצפת עצמאי — גם בהפסד משלמים
      const bl = bituahLeumi(blBase);
      const taxable = Math.max(0, annualProfit - bl.bl * BL_DEDUCTION_PCT);
      const incomeTax = Math.max(0, incomeTaxBefore(taxable) - creditValue);
      return { annualProfit, bl: bl.bl, health: bl.health, incomeTax, total: incomeTax + bl.bl + bl.health };
    };

    // טווח: כל ההוצאות מוכרות (אופטימי) ↔ רק האחוז שהוגדר (שמרני)
    const optimistic = scenario(100);
    const conservative = scenario(profile.expenseRecognitionPct);
    const isRange = Math.round(optimistic.total) !== Math.round(conservative.total);

    const bizLoss = income - expenses < 0;
    const projProfitConservative = conservative.annualProfit;

    // פנסיית חובה (על הרווח השמרני)
    const halfAvg = (AVG_WAGE_MONTHLY / 2) * 12;
    const pensionRequired =
      Math.min(projProfitConservative, halfAvg) * PENSION_LOW +
      Math.max(0, Math.min(projProfitConservative, AVG_WAGE_MONTHLY * 12) - halfAvg) * PENSION_HIGH;

    return {
      optimistic, conservative, isRange, bizLoss,
      projTurnover, paturPct, crossMonth,
      totalPoints, base, kidsTotal, miluimPts, creditValue,
      pensionRequired,
      monthlySetAside: conservative.total / 12,
      staleConstants: now.getFullYear() > TAX_YEAR + 2, // ההקפאה עד 2027
    };
  }, [income, expenses, profile]);

  if (!loaded) return <div className="h-40 rounded-2xl bg-muted animate-pulse mb-6" />;

  const m = model;
  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-4 mb-8" dir="rtl">

      {/* ── התראת תקרה — לפני הכל, כי זה הדחוף ── */}
      {m.crossMonth && (
        <div className="rounded-2xl border-2 border-red-400 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-4 flex items-start gap-3">
          <Siren className="w-7 h-7 text-red-600 shrink-0 animate-pulse" />
          <div className="text-sm">
            <p className="font-bold text-red-700 dark:text-red-300 text-base">
              בקצב הנוכחי תחצה את תקרת עוסק פטור ({fmtILS(OSEK_PATUR_CEILING)}) בחודש {m.crossMonth}!
            </p>
            <p className="mt-1 text-red-800/80 dark:text-red-200/80">
              מחזור חזוי: <b>{fmtILS(m.projTurnover)}</b> ({Math.round(m.paturPct)}% מהתקרה). התקרה נמדדת לפי <b>מחזור</b> (הכנסות),
              לא רווח. חצייה בלי היערכות = מע״מ רטרואקטיבי על העודף. <b>קבע פגישה עם רו״ח החודש</b> — להחליט: מעבר לעוסק מורשה או ויסות הכנסות.
            </p>
          </div>
        </div>
      )}
      {!m.crossMonth && m.paturPct >= 75 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
          <span><b>תקרת עוסק פטור:</b> מחזור חזוי {fmtILS(m.projTurnover)} — {Math.round(m.paturPct)}% מהתקרה. עוקבים.</span>
        </div>
      )}

      {/* ── הכרטיס הגדול: כמה לשים בצד ── */}
      <div className="rounded-2xl bg-gradient-to-l from-blue-950 via-blue-800 to-cyan-600 text-white p-6 shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-white/75 text-sm flex items-center gap-2"><Scale className="w-4 h-4" /> רואה החשבון שלי — תחזית סוף שנה {currentYear}</p>
            <p className="text-4xl font-bold mt-1">
              {m.isRange ? `${fmtILS(m.optimistic.total)}–${fmtILS(m.conservative.total)}` : fmtILS(m.conservative.total)}
            </p>
            <p className="text-white/80 text-sm mt-1">
              צפוי לרשויות השנה{m.isRange ? " (טווח — תלוי כמה מההוצאות באמת עסקיות)" : ""} ·
              שים בצד <b className="text-orange-300">{fmtILS(m.monthlySetAside)}</b> בחודש לפי התרחיש הזהיר
            </p>
          </div>
          <div className="text-left text-sm bg-white/10 rounded-xl p-3 space-y-1">
            <p>מחזור חזוי: <b>{fmtILS(m.projTurnover)}</b></p>
            <p>רווח חייב חזוי (זהיר): <b>{fmtILS(m.conservative.annualProfit)}</b></p>
            {Number(profile.miluimPayments) > 0 && <p>כולל תגמולי מילואים: <b>{fmtILS(profile.miluimPayments)}</b></p>}
          </div>
        </div>
      </div>

      {/* ── מסר אמת על הפסד ── */}
      {m.bizLoss && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900/50 p-3 text-sm flex items-start gap-2">
          <TrendingDown className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
          <span>
            <b>שים לב — ההוצאות הרשומות גבוהות מההכנסות.</b> זה לא "יש! אין מס" — זה אומר שהעסק רשום בהפסד,
            וזה או בעיה אמיתית או הוצאות פרטיות שנרשמו כעסקיות. שווה לעבור על ההוצאות ולסמן מה באמת עסקי.
            (בונוס קטן: הפסד עסקי אמיתי עובר לקיזוז מול רווחים בשנה הבאה.)
          </span>
        </div>
      )}

      {/* ── פירוק לפי רשות (תרחיש זהיר) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="rounded-2xl border-indigo-200 dark:border-indigo-900/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1"><Landmark className="w-3.5 h-3.5" /> מס הכנסה</p>
            <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
              {m.isRange ? `${fmtILS(m.optimistic.incomeTax)}–${fmtILS(m.conservative.incomeTax)}` : fmtILS(m.conservative.incomeTax)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              אחרי {m.totalPoints} נקודות זיכוי (שווי {fmtILS(m.creditValue)}) · נקודות שלא נוצלו לא מוחזרות בכסף
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-emerald-200 dark:border-emerald-900/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1"><ShieldCheck className="w-3.5 h-3.5" /> ביטוח לאומי + בריאות</p>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{fmtILS(m.conservative.bl + m.conservative.health)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              ב״ל {fmtILS(m.conservative.bl)} · בריאות {fmtILS(m.conservative.health)} · לעצמאי יש מינימום גם בהפסד
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-orange-200 dark:border-orange-900/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1"><PiggyBank className="w-3.5 h-3.5" /> להפרשה חודשית</p>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-300">{fmtILS(m.monthlySetAside)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">לחשבון נפרד, לפי התרחיש הזהיר — עודף יחזור אליך</p>
          </CardContent>
        </Card>
      </div>

      {/* ── פנסיית חובה ── */}
      {m.pensionRequired > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900/50 p-3 text-sm flex items-start gap-2">
          <Sparkles className="w-5 h-5 shrink-0 mt-0.5 text-blue-600" />
          <span>
            <b>פנסיית חובה לעצמאים:</b> נדרש להפקיד השנה כ-<b>{fmtILS(m.pensionRequired)}</b> עד 31.12.
            מעבר לחובה — ההפקדה גם <b>מקטינה את המס</b> (ניכוי + זיכוי 35%). שווה לסגור לפני דצמבר.
          </span>
        </div>
      )}

      {/* ── נקודות הזיכוי + פרופיל ── */}
      <Collapsible open={editOpen} onOpenChange={setEditOpen}>
        <Card className="rounded-2xl">
          <CollapsibleTrigger asChild>
            <button className="w-full p-4 flex items-center gap-3 text-right">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-violet-600">
                <UserRound className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">הפרופיל שלי — {m.totalPoints} נקודות זיכוי (שווי {fmtILS(m.creditValue)})</p>
                <p className="text-xs text-muted-foreground">
                  תושב {m.base} · ילדים {m.kidsTotal} · מילואים {m.miluimPts} · הכרה בהוצאות {profile.expenseRecognitionPct}% · מילואים {fmtILS(profile.miluimPayments)} — לחץ לעדכון
                </p>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${editOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-4 space-y-4">
              <div>
                <p className="text-sm font-medium mb-1.5">תגמולי מילואים שקיבלת השנה (₪) — הכנסה חייבת במס:</p>
                <Input
                  type="number" value={profile.miluimPayments || ""}
                  onChange={(e) => setProfile({ ...profile, miluimPayments: parseFloat(e.target.value) || 0 })}
                  placeholder="בדוק באזור האישי בביטוח לאומי"
                  className="h-10 w-56"
                />
                <p className="text-[11px] text-muted-foreground mt-1">חצי שנת מילואים = סכום משמעותי. אל תשאיר 0 אם קיבלת תגמולים!</p>
              </div>
              <div>
                <p className="text-sm font-medium mb-1.5">שנות לידה של הילדים:</p>
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
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={profile.claimsChildPoints}
                  onChange={(e) => setProfile({ ...profile, claimsChildPoints: e.target.checked })}
                  className="w-4 h-4" />
                אני זה שתובע את נקודות הילדים (⚠️ לרוב הנקודות אצל האמא — לוודא מול רו״ח מי תובע)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={profile.miluimActive}
                  onChange={(e) => setProfile({ ...profile, miluimActive: e.target.checked })}
                  className="w-4 h-4" />
                משרת מילואים פעיל — נקודת זיכוי (הוראת שעה, טעון אימות לשנה הנוכחית)
              </label>
              <div>
                <p className="text-sm font-medium mb-1.5">כמה מההוצאות הרשומות באמת עסקיות ומוכרות? ({profile.expenseRecognitionPct}%)</p>
                <input
                  type="range" min={30} max={100} step={5}
                  value={profile.expenseRecognitionPct}
                  onChange={(e) => setProfile({ ...profile, expenseRecognitionPct: parseInt(e.target.value) })}
                  className="w-full max-w-sm"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  זה מה שקובע את הטווח למעלה. רכב מוכר חלקית (~45%), טלפון וחשבונות בית — חלקית. עד שנסווג הוצאה-הוצאה, זו הערכה.
                </p>
              </div>
              <Button size="sm" onClick={() => saveProfile(profile)} className="gap-1.5">
                <Check className="w-4 h-4" /> שמור פרופיל
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <p className="text-[11px] text-muted-foreground text-center">
        קבועים לפי {TAX_YEAR} (מדרגות ושווי נקודה מוקפאים עד 2027) · עוסק פטור — ללא מע״מ · כולל ניכוי 52% מדמי ב״ל ·
        מקדמות מס הכנסה יתווספו אחרי בדיקה · נבדק ע״י מועצת מומחים 24.8.26 · הערכה מסודרת — לא תחליף לרו״ח, ומומלצת פגישת רו״ח לפני סוף השנה.
      </p>
    </div>
  );
}
