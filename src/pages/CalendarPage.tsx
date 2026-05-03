import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getJobTypeLabel, statusColors, statusLabels } from "@/lib/constants";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
} from "date-fns";
import { he } from "date-fns/locale";
import { ChevronRight, ChevronLeft, CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ServiceCall {
  id: string;
  scheduled_date: string;
  status: string;
  job_type: string | null;
  customers: { name: string } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const STATUS_DOT_COLORS: Record<string, string> = {
  open: "bg-blue-400",
  in_progress: "bg-amber-400",
  pending_customer: "bg-purple-400",
  completed: "bg-green-400",
  cancelled: "bg-gray-300",
};

const NOTES_STORAGE_KEY = "calendar_notes";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function getNotes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveNote(dateKey: string, note: string) {
  const notes = getNotes();
  if (note.trim()) {
    notes[dateKey] = note;
  } else {
    delete notes[dateKey];
  }
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
}

// Build calendar grid: weeks starting Sunday, 6 rows max
function buildCalendarDays(currentMonth: Date): Date[] {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  // weekStartsOn: 0 = Sunday
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days: Date[] = [];
  let d = gridStart;
  while (d <= gridEnd) {
    days.push(d);
    d = addDays(d, 1);
  }
  return days;
}

// ─── Main Component ───────────────────────────────────────────────────────────

const CalendarPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [calls, setCalls] = useState<ServiceCall[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>(getNotes);
  const [noteText, setNoteText] = useState("");

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadCalls = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const from = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const to = format(endOfMonth(currentMonth), "yyyy-MM-dd");

    const { data, error } = await supabase
      .from("service_calls")
      .select("id, scheduled_date, status, job_type, customers(name)")
      .not("scheduled_date", "is", null)
      .gte("scheduled_date", from)
      .lte("scheduled_date", to);

    if (!error && data) {
      setCalls(data as ServiceCall[]);
    }
    setLoading(false);
  }, [user, currentMonth]);

  useEffect(() => {
    loadCalls();
  }, [loadCalls]);

  // ── Day selection ───────────────────────────────────────────────────────────

  const handleDayClick = (day: Date) => {
    if (selectedDay && isSameDay(day, selectedDay)) {
      setSelectedDay(null);
      setNoteText("");
    } else {
      setSelectedDay(day);
      const key = getDateKey(day);
      setNoteText(notes[key] || "");
    }
  };

  const handleNoteChange = (text: string) => {
    setNoteText(text);
    if (selectedDay) {
      const key = getDateKey(selectedDay);
      saveNote(key, text);
      setNotes(getNotes());
    }
  };

  // ── Navigation ──────────────────────────────────────────────────────────────

  const goPrev = () => setCurrentMonth((m) => subMonths(m, 1));
  const goNext = () => setCurrentMonth((m) => addMonths(m, 1));
  const goToday = () => {
    setCurrentMonth(new Date());
    setSelectedDay(new Date());
    setNoteText(getNotes()[getDateKey(new Date())] || "");
  };

  // ── Derived data ─────────────────────────────────────────────────────────────

  const calendarDays = buildCalendarDays(currentMonth);

  const callsByDate = calls.reduce<Record<string, ServiceCall[]>>((acc, call) => {
    const key = call.scheduled_date.slice(0, 10);
    if (!acc[key]) acc[key] = [];
    acc[key].push(call);
    return acc;
  }, {});

  const selectedDayCalls = selectedDay
    ? callsByDate[getDateKey(selectedDay)] || []
    : [];

  const monthLabel = format(currentMonth, "MMMM yyyy", { locale: he });

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <AppLayout title="יומן">
      <div dir="rtl" className="flex flex-col gap-4 pb-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goNext} aria-label="חודש הבא">
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={goPrev} aria-label="חודש קודם">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h2 className="text-lg font-semibold text-foreground min-w-[130px] text-center">
              {monthLabel}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {loading && (
              <span className="text-xs text-muted-foreground animate-pulse">טוען...</span>
            )}
            <Button variant="outline" size="sm" onClick={goToday} className="gap-1">
              <CalendarDays className="w-4 h-4" />
              היום
            </Button>
          </div>
        </div>

        {/* ── Calendar Grid ── */}
        <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-border bg-muted/50">
            {HEBREW_DAYS.map((day) => (
              <div
                key={day}
                className="py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, idx) => {
              const key = getDateKey(day);
              const dayCalls = callsByDate[key] || [];
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
              const isTodayDay = isToday(day);
              const hasNote = !!notes[key];

              // Collect unique statuses for dots (max 4 dots shown)
              const dotStatuses = dayCalls.slice(0, 4).map((c) => c.status);

              return (
                <button
                  key={idx}
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    "relative min-h-[72px] sm:min-h-[88px] p-1.5 text-right border-b border-r border-border",
                    "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "hover:bg-accent/60",
                    !isCurrentMonth && "opacity-40",
                    isSelected && "bg-primary/10 ring-1 ring-inset ring-primary",
                    isTodayDay && !isSelected && "bg-blue-50 dark:bg-blue-950/30",
                    // Remove right border from last column, bottom border from last row
                    (idx + 1) % 7 === 0 && "border-r-0",
                    idx >= calendarDays.length - 7 && "border-b-0",
                  )}
                >
                  {/* Day number */}
                  <span
                    className={cn(
                      "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium mb-0.5",
                      isTodayDay
                        ? "bg-primary text-primary-foreground font-bold"
                        : "text-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </span>

                  {/* Customer names (truncated) */}
                  {dayCalls.length > 0 && (
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      {dayCalls.slice(0, 2).map((call) => (
                        <span
                          key={call.id}
                          className="text-[10px] leading-tight truncate text-muted-foreground"
                        >
                          {call.customers?.name || "—"}
                        </span>
                      ))}
                      {dayCalls.length > 2 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{dayCalls.length - 2} נוספים
                        </span>
                      )}
                    </div>
                  )}

                  {/* Status dots row */}
                  {dotStatuses.length > 0 && (
                    <div className="flex gap-0.5 mt-1 flex-wrap">
                      {dotStatuses.map((status, i) => (
                        <span
                          key={i}
                          className={cn(
                            "w-2 h-2 rounded-full shrink-0",
                            STATUS_DOT_COLORS[status] || "bg-gray-300",
                          )}
                        />
                      ))}
                      {dayCalls.length > 4 && (
                        <span className="text-[9px] text-muted-foreground leading-none self-center">
                          +{dayCalls.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Note indicator */}
                  {hasNote && (
                    <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Legend ── */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-1">
          {Object.entries(STATUS_DOT_COLORS).map(([status, dotClass]) => (
            <div key={status} className="flex items-center gap-1.5">
              <span className={cn("w-2.5 h-2.5 rounded-full", dotClass)} />
              <span className="text-xs text-muted-foreground">{statusLabels[status] || status}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 opacity-60" />
            <span className="text-xs text-muted-foreground">יש הערה</span>
          </div>
        </div>

        {/* ── Day Panel ── */}
        {selectedDay && (
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
              <h3 className="font-semibold text-foreground">
                {format(selectedDay, "EEEE, d בMMMM yyyy", { locale: he })}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => { setSelectedDay(null); setNoteText(""); }}
                aria-label="סגור"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-4 flex flex-col gap-4">
              {/* Calls list */}
              {selectedDayCalls.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  אין קריאות שירות ביום זה
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    קריאות שירות ({selectedDayCalls.length})
                  </p>
                  {selectedDayCalls.map((call) => (
                    <button
                      key={call.id}
                      onClick={() => navigate(`/service-calls/${call.id}`)}
                      className={cn(
                        "w-full text-right rounded-lg border border-border px-4 py-3",
                        "hover:bg-accent/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "flex items-center justify-between gap-3",
                      )}
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-medium text-sm truncate">
                          {call.customers?.name || "לקוח לא ידוע"}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {getJobTypeLabel(call.job_type)}
                        </span>
                      </div>
                      <Badge
                        className={cn(
                          "shrink-0 text-xs",
                          statusColors[call.status],
                        )}
                        variant="outline"
                      >
                        {statusLabels[call.status] || call.status}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}

              {/* Personal notes */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  הערה אישית
                </label>
                <textarea
                  dir="rtl"
                  rows={3}
                  value={noteText}
                  onChange={(e) => handleNoteChange(e.target.value)}
                  placeholder="הוסף הערה ליום זה..."
                  className={cn(
                    "w-full resize-none rounded-lg border border-border bg-background px-3 py-2",
                    "text-sm text-foreground placeholder:text-muted-foreground",
                    "focus:outline-none focus:ring-2 focus:ring-ring",
                  )}
                />
                {noteText && (
                  <p className="text-[11px] text-muted-foreground text-left">
                    ההערה נשמרת אוטומטית
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default CalendarPage;
