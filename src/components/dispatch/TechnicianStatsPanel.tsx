import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Users, ChevronRight, ChevronLeft } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { getTechnicianColor } from "@/lib/dispatch-constants";
import type { Technician } from "@/hooks/useTechnicians";
import { useTechnicianStats } from "@/hooks/useTechnicianStats";
import { cn } from "@/lib/utils";
import { format, addMonths, subMonths } from "date-fns";
import { he } from "date-fns/locale";

interface TechnicianStatsPanelProps {
  technicians: Technician[];
  techColorMap: Map<string, number>;
}

export function TechnicianStatsPanel({ technicians, techColorMap }: TechnicianStatsPanelProps) {
  const [month, setMonth] = useState(new Date());
  const { stats, loading } = useTechnicianStats(month);
  const monthLabel = format(month, "MMMM yyyy", { locale: he });

  // Totals
  const totalCalls = stats.reduce((s, st) => s + st.total, 0);
  const totalCompleted = stats.reduce((s, st) => s + st.completed, 0);
  const totalCancelled = stats.reduce((s, st) => s + st.cancelled, 0);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Users className="w-4 h-4" />
          סטטיסטיקות
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[400px] sm:w-[440px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-right">ביצועי טכנאים</SheetTitle>
        </SheetHeader>

        {/* Month navigation */}
        <div className="flex items-center justify-center gap-3 mt-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMonth((m) => addMonths(m, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[120px] text-center">{monthLabel}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMonth((m) => subMonths(m, 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold text-foreground">{totalCalls}</div>
            <div className="text-xs text-muted-foreground">סה״כ קריאות</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
            <div className="text-2xl font-bold text-green-600">{totalCompleted}</div>
            <div className="text-xs text-muted-foreground">הושלמו</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
            <div className="text-2xl font-bold text-red-600">{totalCancelled}</div>
            <div className="text-xs text-muted-foreground">בוטלו</div>
          </div>
        </div>

        {/* Per-technician cards */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">טוען נתונים...</div>
          ) : (
            technicians.map((tech) => {
              const stat = stats.find((s) => s.user_id === tech.user_id);
              const colorIdx = techColorMap.get(tech.user_id) ?? 0;
              const color = getTechnicianColor(colorIdx);
              const successRate =
                stat && stat.total > 0
                  ? Math.round((stat.completed / stat.total) * 100)
                  : 0;

              return (
                <div
                  key={tech.user_id}
                  className="p-4 rounded-lg border bg-card relative overflow-hidden"
                >
                  {/* Color strip */}
                  <div
                    className={cn(
                      "absolute top-0 bottom-0 right-0 w-1.5",
                      color.dot
                    )}
                  />

                  <div className="flex items-center gap-2 mb-3">
                    <div className={cn("w-4 h-4 rounded-full shrink-0", color.dot)} />
                    <span className="font-semibold text-sm">{tech.full_name}</span>
                    {tech.phone && (
                      <span className="text-xs text-muted-foreground mr-auto">
                        {tech.phone}
                      </span>
                    )}
                  </div>

                  {stat && stat.total > 0 ? (
                    <>
                      <div className="grid grid-cols-4 gap-2 text-center text-xs mb-3">
                        <div>
                          <div className="font-bold text-lg text-foreground">
                            {stat.total}
                          </div>
                          <div className="text-muted-foreground">סה״כ</div>
                        </div>
                        <div>
                          <div className="font-bold text-lg text-green-600">
                            {stat.completed}
                          </div>
                          <div className="text-muted-foreground">הושלמו</div>
                        </div>
                        <div>
                          <div className="font-bold text-lg text-yellow-600">
                            {stat.in_progress + stat.open}
                          </div>
                          <div className="text-muted-foreground">פתוחות</div>
                        </div>
                        <div>
                          <div className="font-bold text-lg text-red-600">
                            {stat.cancelled}
                          </div>
                          <div className="text-muted-foreground">בוטלו</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={successRate} className="flex-1 h-2" />
                        <span className="text-xs font-medium text-muted-foreground w-10 text-left">
                          {successRate}%
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">אין קריאות החודש</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
