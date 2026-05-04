import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getJobTypeLabel, statusColors, statusLabels } from "@/lib/constants";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameDay, isSameMonth, isToday, parseISO,
  eachMonthOfInterval,
} from "date-fns";
import { he } from "date-fns/locale";
import { ChevronRight, ChevronLeft, CalendarDays, X, Plus, Wrench, Star, Trash2, Plane } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceCall {
  id: string;
  scheduled_at: string;
  status: string;
  job_type: string | null;
  notes: string | null;
  customers: { name: string } | null;
}

interface PersonalEvent {
  id: string;
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM
  title: string;
  color: string;
}

interface Vacation {
  id: string;
  from: string;   // YYYY-MM-DD
  to: string;     // YYYY-MM-DD
  title: string;
  color: string;
}

// ─── Vacation encoding ────────────────────────────────────────────────────────
// Vacations are stored in personal_events with color = "__vac__:YYYY-MM-DD:hex"
// where YYYY-MM-DD = to_date and hex = tailwind color class encoded

const VAC_PREFIX = "__vac__:";

function encodeVacColor(toDate: string, color: string): string {
  return `${VAC_PREFIX}${toDate}:${color}`;
}

function isVacationRow(row: PersonalEvent): boolean {
  return row.color.startsWith(VAC_PREFIX);
}

function decodeVacation(row: PersonalEvent): Vacation {
  // color = "__vac__:YYYY-MM-DD:bg-xxx-400"
  const parts = row.color.slice(VAC_PREFIX.length).split(":");
  const toDate   = parts[0] ?? row.date;
  const color    = parts.slice(1).join(":") || "bg-teal-400";
  return { id: row.id, from: row.date, to: toDate, title: row.title, color };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const STATUS_DOT: Record<string, string> = {
  open:             "bg-blue-400",
  in_progress:      "bg-amber-400",
  pending_customer: "bg-purple-400",
  completed:        "bg-green-400",
  cancelled:        "bg-gray-300",
};

const EVENT_COLORS = [
  { label: "כתום",   value: "bg-orange-400",  ring: "ring-orange-400",  badge: "bg-orange-100 text-orange-700" },
  { label: "ורוד",   value: "bg-pink-400",    ring: "ring-pink-400",    badge: "bg-pink-100 text-pink-700" },
  { label: "טורקיז", value: "bg-teal-400",    ring: "ring-teal-400",    badge: "bg-teal-100 text-teal-700" },
  { label: "אדום",   value: "bg-red-400",     ring: "ring-red-400",     badge: "bg-red-100 text-red-700" },
  { label: "סגול",   value: "bg-violet-400",  ring: "ring-violet-400",  badge: "bg-violet-100 text-violet-700" },
  { label: "ירוק",   value: "bg-emerald-400", ring: "ring-emerald-400", badge: "bg-emerald-100 text-emerald-700" },
];

const NOTES_KEY = "calendar_notes";

const VACATION_RGBA: Record<string, string> = {
  "bg-orange-400":  "rgba(251,146,60,0.40)",
  "bg-pink-400":    "rgba(244,114,182,0.40)",
  "bg-teal-400":    "rgba(45,212,191,0.40)",
  "bg-red-400":     "rgba(248,113,113,0.40)",
  "bg-violet-400":  "rgba(167,139,250,0.40)",
  "bg-emerald-400": "rgba(52,211,153,0.40)",
};

const STATUS_RGBA: Record<string, string> = {
  open:             "rgba(251,146,60,0.30)",
  in_progress:      "rgba(245,158,11,0.30)",
  pending_customer: "rgba(167,139,250,0.30)",
  cancelled:        "rgba(248,113,113,0.30)",
  completed:        "rgba(52,211,153,0.30)",
};

const STATUS_PRIORITY = ["open", "in_progress", "pending_customer", "cancelled", "completed"];

function getDominantStatus(calls: ServiceCall[]): string | null {
  if (!calls.length) return null;
  for (const s of STATUS_PRIORITY) {
    if (calls.some(c => c.status === s)) return s;
  }
  return calls[0].status;
}

const EVENT_RGBA: Record<string, string> = {
  "bg-orange-400":  "rgba(251,146,60,0.28)",
  "bg-pink-400":    "rgba(244,114,182,0.28)",
  "bg-teal-400":    "rgba(45,212,191,0.28)",
  "bg-red-400":     "rgba(248,113,113,0.28)",
  "bg-violet-400":  "rgba(167,139,250,0.28)",
  "bg-emerald-400": "rgba(52,211,153,0.28)",
};

function getCellBackground(calls: ServiceCall[], events: PersonalEvent[], vacation: Vacation | null): string {
  if (vacation) return VACATION_RGBA[vacation.color] || "rgba(167,139,250,0.40)";
  const hasCalls  = calls.length > 0;
  const hasEvents = events.length > 0;
  if (!hasCalls && !hasEvents) return "";
  const dominant  = getDominantStatus(calls);
  const callsRgba = dominant ? (STATUS_RGBA[dominant] || "") : "";
  const eventRgba = hasEvents ? (EVENT_RGBA[events[0].color] || "") : "";
  if (hasCalls && !hasEvents) return callsRgba;
  if (!hasCalls && hasEvents) return eventRgba;
  return `linear-gradient(to left, ${callsRgba} 50%, ${eventRgba} 50%)`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadNotes(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || "{}"); }
  catch { return {}; }
}
function saveNote(key: string, val: string) {
  const n = loadNotes();
  if (val.trim()) n[key] = val; else delete n[key];
  localStorage.setItem(NOTES_KEY, JSON.stringify(n));
}
function getDateKey(d: Date) { return format(d, "yyyy-MM-dd"); }

function buildGrid(month: Date): Date[] {
  const s = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const e = endOfWeek(endOfMonth(month),     { weekStartsOn: 0 });
  const days: Date[] = [];
  let cur = s;
  while (cur <= e) { days.push(cur); cur = addDays(cur, 1); }
  return days;
}

function getVacationForDay(day: Date, vacations: Vacation[]): Vacation | null {
  const key = getDateKey(day);
  return vacations.find(v => key >= v.from && key <= v.to) || null;
}

// ─── Component ────────────────────────────────────────────────────────────────

const CalendarPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calls, setCalls]               = useState<ServiceCall[]>([]);
  const [loading, setLoading]           = useState(false);
  const [selectedDay, setSelectedDay]   = useState<Date | null>(null);
  const [notes, setNotes]               = useState<Record<string, string>>(loadNotes);
  const [noteText, setNoteText]         = useState("");
  const [events, setEvents]             = useState<PersonalEvent[]>([]);
  const [vacations, setVacations]       = useState<Vacation[]>([]);

  // Vacation form
  const [showVacForm, setShowVacForm] = useState(false);
  const [vacTo, setVacTo]             = useState("");
  const [vacTitle, setVacTitle]       = useState("");
  const [vacColor, setVacColor]       = useState(EVENT_COLORS[2].value);

  // Range mode
  const [rangeFrom, setRangeFrom]     = useState("");
  const [rangeTo, setRangeTo]         = useState("");
  const [rangeActive, setRangeActive] = useState(false);
  const [rangeMonths, setRangeMonths] = useState<Date[]>([]);

  // Inline call notes
  const [callNotes, setCallNotes]     = useState<Record<string, string>>({});
  const [savingNote, setSavingNote]   = useState<string | null>(null);

  // Add-event form
  const [showForm, setShowForm]       = useState(false);
  const [formTitle, setFormTitle]     = useState("");
  const [formTime, setFormTime]       = useState("09:00");
  const [formColor, setFormColor]     = useState(EVENT_COLORS[0].value);

  // ── Load events + vacations from Supabase (same table) ──────────────────────

  const loadEvents = useCallback(async () => {
    if (!user) return;

    // Personal events — only current user's
    const { data: myEvents } = await supabase
      .from("personal_events")
      .select("id, date, time, title, color")
      .eq("user_id", user.id)
      .not("color", "like", `${VAC_PREFIX}%`)
      .order("date").order("time");

    // Vacations — all users (everyone sees everyone's vacations)
    const { data: allVacs } = await supabase
      .from("personal_events")
      .select("id, date, time, title, color")
      .like("color", `${VAC_PREFIX}%`)
      .order("date");

    setEvents((myEvents || []).map(r => ({
      id: r.id, date: r.date,
      time: (r.time as string).slice(0, 5),
      title: r.title, color: r.color,
    })));
    setVacations((allVacs || []).map(r => decodeVacation({
      id: r.id, date: r.date,
      time: (r.time as string).slice(0, 5),
      title: r.title, color: r.color,
    })));

    // One-time migration: localStorage events → Supabase
    const EVENTS_KEY = "calendar_personal_events";
    const localEvts = (() => { try { return JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]"); } catch { return []; } })();
    if (localEvts.length > 0 && data.filter(r => !isVacationRow({ color: r.color } as PersonalEvent)).length === 0) {
      await supabase.from("personal_events").insert(
        localEvts.map((e: PersonalEvent) => ({ user_id: user.id, date: e.date, time: e.time, title: e.title, color: e.color }))
      );
      localStorage.removeItem(EVENTS_KEY);
    } else if (localEvts.length > 0) {
      localStorage.removeItem(EVENTS_KEY);
    }

    // One-time migration: localStorage vacations → Supabase
    const VACATIONS_KEY = "calendar_vacations";
    const localVacs = (() => { try { return JSON.parse(localStorage.getItem(VACATIONS_KEY) || "[]"); } catch { return []; } })();
    if (localVacs.length > 0) {
      await supabase.from("personal_events").insert(
        localVacs.map((v: Vacation) => ({
          user_id: user.id,
          date:    v.from,
          time:    "00:00",
          title:   v.title,
          color:   encodeVacColor(v.to, v.color),
        }))
      );
      localStorage.removeItem(VACATIONS_KEY);
      // Reload after migration
      const { data: d2 } = await supabase.from("personal_events").select("id, date, time, title, color").eq("user_id", user.id).order("date").order("time");
      if (d2) {
        const rows2 = d2.map(r => ({ id: r.id, date: r.date, time: (r.time as string).slice(0, 5), title: r.title, color: r.color }));
        setEvents(rows2.filter(r => !isVacationRow(r)));
        setVacations(rows2.filter(isVacationRow).map(decodeVacation));
      }
    }
  }, [user]);

  // ── Load service calls ───────────────────────────────────────────────────────

  const loadCalls = useCallback(async (fromDate: Date, toDate: Date) => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("service_calls")
      .select("id, scheduled_at, status, job_type, notes, customers(name)")
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString());
    if (!error && data) setCalls(data as ServiceCall[]);
    setLoading(false);
  }, [user]);

  // ── Initial load ─────────────────────────────────────────────────────────────

  useEffect(() => { loadEvents(); }, [loadEvents]);

  useEffect(() => {
    if (!rangeActive) loadCalls(startOfMonth(currentMonth), endOfMonth(currentMonth));
  }, [loadCalls, currentMonth, rangeActive]);

  // ── Real-time sync ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("calendar-realtime-v3")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "personal_events", filter: `user_id=eq.${user.id}` },
        () => loadEvents()
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "service_calls" },
        () => {
          if (rangeActive && rangeFrom && rangeTo) {
            loadCalls(startOfMonth(new Date(rangeFrom)), endOfMonth(new Date(rangeTo)));
          } else {
            loadCalls(startOfMonth(currentMonth), endOfMonth(currentMonth));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadEvents, loadCalls, currentMonth, rangeActive, rangeFrom, rangeTo]);

  // ── Range ────────────────────────────────────────────────────────────────────

  const applyRange = () => {
    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) return;
    const from = new Date(rangeFrom);
    const to   = new Date(rangeTo);
    setRangeMonths(eachMonthOfInterval({ start: from, end: to }));
    setRangeActive(true);
    setSelectedDay(null);
    loadCalls(startOfMonth(from), endOfMonth(to));
  };

  const clearRange = () => {
    setRangeActive(false); setRangeFrom(""); setRangeTo(""); setRangeMonths([]);
    loadCalls(startOfMonth(currentMonth), endOfMonth(currentMonth));
  };

  // ── Day selection ────────────────────────────────────────────────────────────

  const handleDayClick = (day: Date) => {
    if (selectedDay && isSameDay(day, selectedDay)) {
      setSelectedDay(null); setNoteText(""); setShowForm(false);
    } else {
      setSelectedDay(day);
      setNoteText(loadNotes()[getDateKey(day)] || "");
      setShowForm(false);
    }
  };

  const handleNoteChange = (text: string) => {
    setNoteText(text);
    if (selectedDay) { saveNote(getDateKey(selectedDay), text); setNotes(loadNotes()); }
  };

  // ── Call notes ───────────────────────────────────────────────────────────────

  const saveCallNote = async (callId: string) => {
    const text = callNotes[callId] ?? "";
    setSavingNote(callId);
    await supabase.from("service_calls").update({ notes: text } as any).eq("id", callId);
    setCalls(prev => prev.map(c => c.id === callId ? { ...c, notes: text } : c));
    setSavingNote(null);
  };

  // ── Vacations (stored as personal_events with encoded color) ─────────────────

  const addVacation = async () => {
    if (!vacTitle.trim() || !selectedDay || !vacTo || !user) return;
    const fromDate = getDateKey(selectedDay);
    if (vacTo < fromDate) return;
    const { data, error } = await supabase
      .from("personal_events")
      .insert({
        user_id: user.id,
        date:    fromDate,
        time:    "00:00",
        title:   vacTitle.trim(),
        color:   encodeVacColor(vacTo, vacColor),
      })
      .select("id, date, time, title, color")
      .single();
    if (!error && data) {
      setVacations(prev => [...prev, decodeVacation({
        id: data.id, date: data.date, time: (data.time as string).slice(0, 5), title: data.title, color: data.color,
      })]);
    }
    setVacTo(""); setVacTitle(""); setShowVacForm(false);
  };

  const deleteVacation = async (id: string) => {
    await supabase.from("personal_events").delete().eq("id", id);
    setVacations(prev => prev.filter(v => v.id !== id));
  };

  // ── Personal events ──────────────────────────────────────────────────────────

  const addEvent = async () => {
    if (!formTitle.trim() || !selectedDay || !user) return;
    const { data, error } = await supabase
      .from("personal_events")
      .insert({ user_id: user.id, date: getDateKey(selectedDay), time: formTime, title: formTitle.trim(), color: formColor })
      .select("id, date, time, title, color")
      .single();
    if (!error && data) {
      setEvents(prev => [...prev, { id: data.id, date: data.date, time: (data.time as string).slice(0, 5), title: data.title, color: data.color }]
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)));
    }
    setFormTitle(""); setFormTime("09:00"); setShowForm(false);
  };

  const deleteEvent = async (id: string) => {
    await supabase.from("personal_events").delete().eq("id", id);
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  // ── Derived data ─────────────────────────────────────────────────────────────

  const callsByDate = calls.reduce<Record<string, ServiceCall[]>>((acc, c) => {
    const key = c.scheduled_at.slice(0, 10);
    (acc[key] ??= []).push(c);
    return acc;
  }, {});

  const eventsByDate = events.reduce<Record<string, PersonalEvent[]>>((acc, e) => {
    (acc[e.date] ??= []).push(e);
    return acc;
  }, {});

  const selectedKey    = selectedDay ? getDateKey(selectedDay) : "";
  const selectedCalls  = selectedKey ? (callsByDate[selectedKey] || []).sort((a,b) => a.scheduled_at.localeCompare(b.scheduled_at)) : [];
  const selectedEvents = selectedKey ? (eventsByDate[selectedKey] || []).sort((a,b) => a.time.localeCompare(b.time)) : [];
  const monthLabel     = format(currentMonth, "MMMM yyyy", { locale: he });
  const colorMeta      = (val: string) => EVENT_COLORS.find(c => c.value === val) || EVENT_COLORS[0];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <AppLayout title="יומן">
      <div dir="rtl" className="flex flex-col gap-4 pb-10">

        {/* Header */}
        <div className="flex flex-col gap-3">
          {!rangeActive && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <h2 className="text-lg font-semibold min-w-[140px] text-center">{monthLabel}</h2>
              </div>
              <div className="flex items-center gap-2">
                {loading && <span className="text-xs text-muted-foreground animate-pulse">טוען...</span>}
                <Button variant="outline" size="sm" className="gap-1"
                  onClick={() => { setCurrentMonth(new Date()); setSelectedDay(new Date()); setNoteText(loadNotes()[getDateKey(new Date())] || ""); }}>
                  <CalendarDays className="w-4 h-4" /> היום
                </Button>
              </div>
            </div>
          )}

          {/* Range picker */}
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-border bg-muted/30">
            <span className="text-sm font-medium shrink-0">טווח תאריכים:</span>
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">מ-</label>
                <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
                  className="h-8 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">עד</label>
                <input type="date" value={rangeTo} min={rangeFrom} onChange={e => setRangeTo(e.target.value)}
                  className="h-8 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <Button size="sm" onClick={applyRange} disabled={!rangeFrom || !rangeTo || rangeFrom > rangeTo || loading} className="h-8 gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" /> הצג
              </Button>
              {rangeActive && (
                <Button size="sm" variant="ghost" onClick={clearRange} className="h-8 gap-1 text-muted-foreground">
                  <X className="w-3.5 h-3.5" /> נקה
                </Button>
              )}
            </div>
          </div>

          {rangeActive && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-primary">
                {format(new Date(rangeFrom), "d MMM yyyy", { locale: he })} — {format(new Date(rangeTo), "d MMM yyyy", { locale: he })}
              </span>
              <span className="text-xs text-muted-foreground">({rangeMonths.length} חודשים)</span>
            </div>
          )}
        </div>

        {/* Calendar grid(s) */}
        {(rangeActive ? rangeMonths : [currentMonth]).map((month, monthIdx) => {
          const monthGrid = buildGrid(month);
          const mLabel    = format(month, "MMMM yyyy", { locale: he });
          return (
            <div key={monthIdx} className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
              {rangeActive && (
                <div className="px-4 py-2 border-b border-border bg-muted/40 font-semibold text-sm">{mLabel}</div>
              )}
              <div className="grid grid-cols-7 border-b border-border bg-muted/50">
                {HEBREW_DAYS.map(d => (
                  <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthGrid.map((day, idx) => {
                  const key        = getDateKey(day);
                  const dayCalls   = callsByDate[key] || [];
                  const dayEvents  = eventsByDate[key] || [];
                  const isMonthDay = isSameMonth(day, month);
                  const vacation   = isMonthDay ? getVacationForDay(day, vacations) : null;
                  const isSel      = selectedDay ? isSameDay(day, selectedDay) : false;
                  const isTod      = isToday(day);
                  const hasNote    = !!notes[key];

                  return (
                    <button
                      key={idx}
                      onClick={() => handleDayClick(day)}
                      style={{ background: isMonthDay ? getCellBackground(dayCalls, dayEvents, vacation) : undefined }}
                      className={cn(
                        "relative min-h-[76px] sm:min-h-[90px] p-1.5 text-right border-b border-r border-border",
                        "transition-colors hover:brightness-95 focus:outline-none",
                        !isMonthDay && "opacity-35",
                        isSel && "ring-2 ring-inset ring-primary",
                        isTod && !isSel && "bg-blue-50 dark:bg-blue-950/30",
                        (idx + 1) % 7 === 0 && "border-r-0",
                        idx >= monthGrid.length - 7 && "border-b-0",
                      )}
                    >
                      <span className={cn(
                        "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium mb-0.5",
                        isTod ? "bg-primary text-primary-foreground font-bold" : "text-foreground"
                      )}>
                        {format(day, "d")}
                      </span>
                      <div className="flex flex-col gap-px overflow-hidden">
                        {vacation && (
                          <span className="text-[10px] leading-tight truncate font-semibold flex items-center gap-0.5">
                            <Plane className="w-2.5 h-2.5 shrink-0" />{vacation.title}
                          </span>
                        )}
                        {!vacation && dayCalls.slice(0, 1).map(c => (
                          <span key={c.id} className="text-[10px] leading-tight truncate text-muted-foreground flex items-center gap-0.5">
                            <Wrench className="w-2.5 h-2.5 shrink-0 opacity-60" />{c.customers?.name || "—"}
                          </span>
                        ))}
                        {!vacation && dayEvents.slice(0, 1).map(e => (
                          <span key={e.id} className="text-[10px] leading-tight truncate flex items-center gap-0.5">
                            <span className={cn("w-2 h-2 rounded-full shrink-0", e.color)} />{e.title}
                          </span>
                        ))}
                        {!vacation && (dayCalls.length + dayEvents.length) > 2 && (
                          <span className="text-[10px] text-muted-foreground">+{dayCalls.length + dayEvents.length - 2} עוד</span>
                        )}
                      </div>
                      {dayCalls.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5 flex-wrap">
                          {dayCalls.slice(0, 4).map((c, i) => (
                            <span key={i} className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[c.status] || "bg-gray-300")} />
                          ))}
                          {dayCalls.length > 4 && <span className="text-[8px] text-muted-foreground">+{dayCalls.length - 4}</span>}
                        </div>
                      )}
                      {hasNote && <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-amber-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-1">
          {Object.entries(STATUS_RGBA).map(([st, rgba]) => (
            <div key={st} className="flex items-center gap-1.5">
              <span className="w-5 h-3 rounded-sm shrink-0" style={{ background: rgba, border: "1px solid rgba(0,0,0,0.1)" }} />
              <span className="text-xs text-muted-foreground">{statusLabels[st] || st}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-3 rounded-sm shrink-0" style={{ background: "rgba(251,146,60,0.28)", border: "1px solid rgba(251,146,60,0.4)" }} />
            <span className="text-xs text-muted-foreground">פגישה אישית</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-3 rounded-full bg-amber-400 opacity-60" />
            <span className="text-xs text-muted-foreground">יש הערה</span>
          </div>
        </div>

        {/* Day panel */}
        {selectedDay && (
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
              <h3 className="font-semibold">{format(selectedDay, "EEEE, d בMMMM yyyy", { locale: he })}</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => { setSelectedDay(null); setNoteText(""); setShowForm(false); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-4 space-y-5">

              {/* Vacation on this day */}
              {(() => {
                const vac = getVacationForDay(selectedDay, vacations);
                if (!vac) return null;
                const meta = EVENT_COLORS.find(c => c.value === vac.color) || EVENT_COLORS[2];
                return (
                  <div className={cn("flex items-center gap-3 rounded-xl px-4 py-3 border-2", meta.badge)}>
                    <Plane className="w-5 h-5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">✈️ {vac.title}</p>
                      <p className="text-xs opacity-70">{vac.from === vac.to ? vac.from : `${vac.from} עד ${vac.to}`}</p>
                    </div>
                    <button onClick={() => deleteVacation(vac.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 text-xs font-medium transition-colors shrink-0">
                      <Trash2 className="w-3 h-3" /> מחק
                    </button>
                  </div>
                );
              })()}

              {/* Vacation form */}
              {showVacForm ? (
                <div className="rounded-xl border-2 border-dashed border-teal-300 bg-teal-50/50 dark:bg-teal-900/10 p-4 space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <Plane className="w-4 h-4" /> סמן היעדרות / חופשה
                  </p>
                  <p className="text-xs text-muted-foreground">מתאריך: <strong>{getDateKey(selectedDay)}</strong></p>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground shrink-0">עד תאריך:</label>
                    <input type="date" value={vacTo} min={getDateKey(selectedDay)} onChange={e => setVacTo(e.target.value)}
                      className="h-9 rounded-lg border border-border bg-background px-3 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <input type="text" placeholder="איפה אתה? (אילת, חופשה משפחתית...)"
                    value={vacTitle} onChange={e => setVacTitle(e.target.value)} dir="rtl" autoFocus
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground shrink-0">צבע:</span>
                    {EVENT_COLORS.map(c => (
                      <button key={c.value} onClick={() => setVacColor(c.value)} title={c.label}
                        className={cn("w-6 h-6 rounded-full transition-all", c.value,
                          vacColor === c.value ? `ring-2 ring-offset-1 ${c.ring}` : "opacity-70 hover:opacity-100")} />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={addVacation} disabled={!vacTitle.trim() || !vacTo} className="gap-1.5 flex-1">
                      <Plane className="w-3.5 h-3.5" /> שמור חופשה
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowVacForm(false)}>ביטול</Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full gap-1.5 border-dashed"
                  onClick={() => { setShowVacForm(true); setVacTo(getDateKey(selectedDay)); }}>
                  <Plane className="w-3.5 h-3.5" /> סמן היעדרות / חופשה
                </Button>
              )}

              {/* Service calls */}
              {selectedCalls.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" /> קריאות שירות ({selectedCalls.length})
                  </p>
                  {selectedCalls.map(c => {
                    const draftNote = callNotes[c.id] ?? c.notes ?? "";
                    const isDirty   = callNotes[c.id] !== undefined && callNotes[c.id] !== (c.notes ?? "");
                    return (
                      <div key={c.id} className="rounded-lg border border-border overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/40 transition-colors cursor-pointer"
                          onClick={() => navigate(`/service-calls/${c.id}`)}>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="font-medium text-sm truncate">{c.customers?.name || "לקוח לא ידוע"}</span>
                            <span className="text-xs text-muted-foreground">
                              {format(parseISO(c.scheduled_at), "HH:mm")} · {getJobTypeLabel(c.job_type)}
                            </span>
                          </div>
                          <Badge className={cn("shrink-0 text-xs", statusColors[c.status])} variant="outline">
                            {statusLabels[c.status] || c.status}
                          </Badge>
                        </div>
                        <div className="border-t border-border px-4 py-2 bg-muted/20">
                          <textarea dir="rtl" rows={2} value={draftNote}
                            onChange={e => setCallNotes(n => ({ ...n, [c.id]: e.target.value }))}
                            placeholder="הוסף הערה לקריאה..."
                            className="w-full resize-none bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none" />
                          {isDirty && (
                            <button onClick={() => saveCallNote(c.id)} disabled={savingNote === c.id}
                              className="text-xs text-primary font-medium hover:underline disabled:opacity-50">
                              {savingNote === c.id ? "שומר..." : "שמור הערה ✓"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Personal events */}
              {(selectedEvents.length > 0 || showForm) && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5" /> פגישות אישיות
                  </p>
                  {selectedEvents.map(e => {
                    const meta = colorMeta(e.color);
                    return (
                      <div key={e.id} className={cn("flex items-center gap-3 rounded-lg px-4 py-3 border", meta.badge)}>
                        <span className={cn("w-3 h-3 rounded-full shrink-0", e.color)} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{e.title}</p>
                          <p className="text-xs opacity-70">{e.time}</p>
                        </div>
                        <button onClick={() => deleteEvent(e.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 text-xs font-medium transition-colors shrink-0">
                          <Trash2 className="w-3 h-3" /> מחק
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add event form */}
              {showForm ? (
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <p className="text-sm font-semibold">פגישה אישית חדשה</p>
                  <input type="text" placeholder="כותרת הפגישה..." value={formTitle}
                    onChange={e => setFormTitle(e.target.value)} dir="rtl" autoFocus
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground shrink-0">שעה:</label>
                    <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)}
                      className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground shrink-0">צבע:</span>
                    {EVENT_COLORS.map(c => (
                      <button key={c.value} onClick={() => setFormColor(c.value)} title={c.label}
                        className={cn("w-6 h-6 rounded-full transition-all", c.value,
                          formColor === c.value ? `ring-2 ring-offset-1 ${c.ring}` : "opacity-70 hover:opacity-100")} />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={addEvent} disabled={!formTitle.trim()} className="gap-1.5 flex-1">
                      <Plus className="w-3.5 h-3.5" /> הוסף
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>ביטול</Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setShowForm(true)}>
                  <Plus className="w-3.5 h-3.5" /> הוסף פגישה אישית
                </Button>
              )}

              {/* Personal note */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">הערה ליום</label>
                <textarea dir="rtl" rows={3} value={noteText} onChange={e => handleNoteChange(e.target.value)}
                  placeholder="הוסף הערה ליום זה..."
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                {noteText && <p className="text-[11px] text-muted-foreground">נשמר אוטומטית</p>}
              </div>

            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default CalendarPage;
