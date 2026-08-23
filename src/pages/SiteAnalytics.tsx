import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Globe, Phone, MessageCircle, Eye, RefreshCw, Radio, TrendingUp, Search, ExternalLink,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend,
} from "recharts";

/**
 * "האתר שלי" — כמה נכנסו לאתר yahav-o.com, כמה לחצו חיוג/וואטסאפ, מי גולש עכשיו,
 * ונתוני גוגל (קליקים והופעות בחיפוש). הנתונים נאספים באתר עצמו (בלי עוגיות, בלי מעקב אישי)
 * ונקראים כאן דרך נקודת קצה מאובטחת בטוקן.
 */

const SITE_URL = "https://yahav-o.com";

interface DayStats { day: string; pageview?: number; call?: number; whatsapp?: number; review_open?: number }
interface SiteStats { updated_at: string; liveNow: number; daily: DayStats[] }
interface GscData { updated_at: string; period_label?: string; clicks: number; impressions: number; daily?: { date: string; clicks: number; impressions: number }[] }

const fmtDay = (d: string) => {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
};

const SiteAnalytics = () => {
  const { isAdmin, role } = useAuth();
  const canSee = isAdmin || role === "secretary";
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [gsc, setGsc] = useState<GscData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // הטוקן שמור בקובץ הגדרות פרטי ב-storage (קריאה רק למנהל/מזכירה)
      const { data: cfgFile, error: cfgErr } = await supabase.storage
        .from("finance-docs")
        .download("marketing/site-config.json");
      if (cfgErr || !cfgFile) throw new Error("חסר קובץ הגדרות — פנה לקלוד להגדרה מחדש");
      const cfg = JSON.parse(await cfgFile.text());

      const res = await fetch(`${SITE_URL}/api/stats?token=${encodeURIComponent(cfg.statsToken)}&days=30`);
      if (!res.ok) throw new Error("האתר לא החזיר נתונים (" + res.status + ")");
      const parsed = (await res.json()) as SiteStats;
      parsed.daily.sort((a, b) => a.day.localeCompare(b.day));
      setStats(parsed);

      // נתוני גוגל — מסונכרנים ידנית ע"י קלוד מ-Search Console
      try {
        const { data: gscFile } = await supabase.storage.from("finance-docs").download("marketing/gsc.json");
        if (gscFile) setGsc(JSON.parse(await gscFile.text()));
      } catch { /* עוד אין נתוני גוגל */ }
    } catch (e: any) {
      setError(e.message || "שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (canSee) load(); }, [canSee]);

  const model = useMemo(() => {
    if (!stats) return null;
    const n = stats.daily.length;
    const today = stats.daily[n - 1] || {};
    const last7 = stats.daily.slice(-7);
    const sum = (arr: DayStats[], k: keyof DayStats) => arr.reduce((s, d) => s + Number(d[k] || 0), 0);
    return {
      today,
      week: { views: sum(last7, "pageview"), calls: sum(last7, "call"), wa: sum(last7, "whatsapp") },
      month: { views: sum(stats.daily, "pageview"), calls: sum(stats.daily, "call"), wa: sum(stats.daily, "whatsapp") },
      chart: stats.daily.map(d => ({
        label: fmtDay(d.day),
        "כניסות": d.pageview || 0,
        "חיוג": d.call || 0,
        "וואטסאפ": d.whatsapp || 0,
      })),
    };
  }, [stats]);

  if (!canSee) {
    return <AppLayout title="האתר שלי"><p className="text-muted-foreground text-center py-12">אין הרשאה לצפות בעמוד זה.</p></AppLayout>;
  }

  return (
    <AppLayout title="האתר שלי">
      <div dir="rtl" className="space-y-5 max-w-4xl mx-auto">

        {/* כותרת */}
        <div className="rounded-2xl bg-gradient-to-l from-blue-950 via-blue-800 to-cyan-600 text-white p-6 shadow-lg">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><Globe className="w-6 h-6" /> האתר שלי</h1>
              <p className="text-white/70 text-sm mt-1">yahav-o.com — כמה נכנסים, לוחצים ומתקשרים</p>
            </div>
            <div className="flex items-center gap-2">
              {stats && (
                <span className="inline-flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1.5 text-sm">
                  <Radio className="w-4 h-4 text-emerald-300 animate-pulse" />
                  {stats.liveNow > 0 ? <b>{stats.liveNow} באתר עכשיו!</b> : "אין גולשים כרגע"}
                </span>
              )}
              <Button variant="secondary" size="sm" className="h-9 gap-1.5" onClick={load} disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> רענן
              </Button>
              <Button asChild variant="secondary" size="sm" className="h-9 gap-1.5">
                <a href={SITE_URL} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /> פתח אתר</a>
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}</div>
        ) : error ? (
          <Card className="rounded-2xl border-destructive/40"><CardContent className="p-6 text-center text-destructive">{error}</CardContent></Card>
        ) : model && (
          <>
            {/* היום / השבוע / החודש */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "היום", views: model.today.pageview || 0, calls: model.today.call || 0, wa: model.today.whatsapp || 0 },
                { label: "7 ימים", views: model.week.views, calls: model.week.calls, wa: model.week.wa },
                { label: "30 יום", views: model.month.views, calls: model.month.calls, wa: model.month.wa },
              ].map((p) => (
                <Card key={p.label} className="rounded-2xl">
                  <CardContent className="p-4 text-center space-y-1.5">
                    <p className="text-xs text-muted-foreground font-semibold">{p.label}</p>
                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1.5">
                      <Eye className="w-5 h-5" /> {p.views}
                    </p>
                    <p className="text-[11px] text-muted-foreground">כניסות לאתר</p>
                    <div className="flex items-center justify-center gap-3 text-sm pt-1">
                      <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400"><Phone className="w-3.5 h-3.5" />{p.calls}</span>
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><MessageCircle className="w-3.5 h-3.5" />{p.wa}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* גרף 30 יום */}
            <Card className="rounded-2xl">
              <CardContent className="p-5">
                <p className="font-semibold mb-1 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-500" /> 30 הימים האחרונים</p>
                <p className="text-xs text-muted-foreground mb-3">כחול = כניסות לאתר · סגול = לחיצות חיוג · ירוק = לחיצות וואטסאפ</p>
                <div className="h-64" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={model.chart} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} vertical={false} />
                      <XAxis dataKey="label" fontSize={10} tickMargin={6} interval={4} />
                      <YAxis fontSize={11} width={30} allowDecimals={false} />
                      <Tooltip contentStyle={{ direction: "rtl", borderRadius: 12 }} />
                      <Area dataKey="כניסות" type="monotone" stroke="#2563eb" strokeWidth={2.5} fill="url(#viewsFill)" dot={false} />
                      <Area dataKey="חיוג" type="monotone" stroke="#8b5cf6" strokeWidth={2} fill="none" dot={false} />
                      <Area dataKey="וואטסאפ" type="monotone" stroke="#10b981" strokeWidth={2} fill="none" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* גוגל — Search Console */}
            <Card className="rounded-2xl">
              <CardContent className="p-5">
                <p className="font-semibold mb-1 flex items-center gap-2">
                  <Search className="w-4 h-4 text-orange-500" /> גוגל — כמה מצאו אותך בחיפוש
                </p>
                {gsc ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/50 p-4 text-center">
                        <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{gsc.clicks.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground mt-1">קליקים מגוגל לאתר</p>
                      </div>
                      <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 p-4 text-center">
                        <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{gsc.impressions.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground mt-1">פעמים שהאתר הופיע בתוצאות</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      {gsc.period_label || ""} · עודכן {new Date(gsc.updated_at).toLocaleDateString("he-IL")} · מתעדכן בכל סנכרון עם קלוד
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground mt-2">
                    עדיין אין נתוני גוגל — בסנכרון הבא קלוד ימשוך את הקליקים וההופעות מ-Google Search Console והם יופיעו כאן.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default SiteAnalytics;
