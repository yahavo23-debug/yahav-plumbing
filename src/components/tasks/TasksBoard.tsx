import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListChecks, Plus, Bell, Repeat, Trash2, CalendarClock, Sparkles, GripVertical, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isBefore, addDays, addWeeks, addMonths, isToday, isTomorrow, differenceInMinutes } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  color: string;
  due_at: string | null;
  reminder_minutes_before: number | null;
  recurrence: "none" | "daily" | "weekly" | "monthly";
  is_done: boolean;
  completed_at: string | null;
  position: number;
}

const PRIORITY_META: Record<Task["priority"], { label: string; color: string; ring: string; bar: string }> = {
  high:   { label: "דחוף",  color: "bg-red-100 text-red-700 border-red-300",        ring: "ring-red-400",    bar: "bg-red-500" },
  medium: { label: "רגיל",   color: "bg-amber-100 text-amber-700 border-amber-300",  ring: "ring-amber-400",  bar: "bg-amber-500" },
  low:    { label: "נמוך",   color: "bg-slate-100 text-slate-600 border-slate-300",  ring: "ring-slate-400",  bar: "bg-slate-400" },
};

const COLOR_PALETTE = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#64748b"];

const RECURRENCE_LABEL: Record<Task["recurrence"], string> = {
  none: "ללא",
  daily: "יומי",
  weekly: "שבועי",
  monthly: "חודשי",
};

const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "ללא תזכורת" },
  { value: 0,    label: "בזמן האירוע" },
  { value: 15,   label: "15 דקות לפני" },
  { value: 60,   label: "שעה לפני" },
  { value: 180,  label: "3 שעות לפני" },
  { value: 1440, label: "יום לפני" },
];

const REMINDED_KEY = "tasks_reminded_v1";

function getRemindedSet(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(REMINDED_KEY) || "[]")); } catch { return new Set(); }
}
function saveRemindedSet(s: Set<string>) {
  localStorage.setItem(REMINDED_KEY, JSON.stringify([...s].slice(-500)));
}

function dueLabel(due_at: string | null): { text: string; tone: "danger" | "warn" | "muted" | "ok" } {
  if (!due_at) return { text: "ללא תאריך", tone: "muted" };
  const d = parseISO(due_at);
  const now = new Date();
  if (isBefore(d, now)) return { text: `באיחור · ${format(d, "d MMM HH:mm", { locale: he })}`, tone: "danger" };
  if (isToday(d))     return { text: `היום · ${format(d, "HH:mm")}`,    tone: "warn" };
  if (isTomorrow(d))  return { text: `מחר · ${format(d, "HH:mm")}`,    tone: "warn" };
  return { text: format(d, "EEEE d MMM · HH:mm", { locale: he }), tone: "ok" };
}

interface SortableTaskProps {
  task: Task;
  onToggle: (t: Task) => void;
  onDelete: (id: string) => void;
  onEdit: (t: Task) => void;
}

function SortableTaskRow({ task, onToggle, onDelete, onEdit }: SortableTaskProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const pri = PRIORITY_META[task.priority];
  const due = dueLabel(task.due_at);

  return (
    <div ref={setNodeRef} style={style}
      className={cn(
        "group flex items-stretch gap-2 rounded-lg border bg-card overflow-hidden transition-all",
        "hover:shadow-sm",
        task.is_done && "opacity-60"
      )}>
      <div className={cn("w-1.5 shrink-0", pri.bar)} style={{ background: task.color }} />
      <button
        {...attributes}
        {...listeners}
        className="touch-none px-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing self-center"
        aria-label="גרור"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-2 py-2 pl-3 pr-1 flex-1 min-w-0">
        <Checkbox checked={task.is_done} onCheckedChange={() => onToggle(task)} className="h-5 w-5" />
        <button onClick={() => onEdit(task)} className="flex-1 min-w-0 text-right">
          <div className={cn("font-medium text-sm truncate", task.is_done && "line-through")}>{task.title}</div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5", pri.color)}>{pri.label}</Badge>
            <span className={cn(
              "text-[11px] flex items-center gap-1",
              due.tone === "danger" && "text-red-600 font-semibold",
              due.tone === "warn"   && "text-amber-600 font-medium",
              due.tone === "muted"  && "text-muted-foreground",
              due.tone === "ok"     && "text-muted-foreground",
            )}>
              <CalendarClock className="w-3 h-3" />{due.text}
            </span>
            {task.recurrence !== "none" && (
              <span className="text-[11px] text-purple-600 flex items-center gap-0.5"><Repeat className="w-3 h-3" />{RECURRENCE_LABEL[task.recurrence]}</span>
            )}
            {task.reminder_minutes_before !== null && (
              <span className="text-[11px] text-sky-600 flex items-center gap-0.5"><Bell className="w-3 h-3" /></span>
            )}
          </div>
        </button>
        <button onClick={() => onDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-600 p-1">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

interface TaskFormState {
  id?: string;
  title: string;
  description: string;
  priority: Task["priority"];
  color: string;
  dueDate: string;
  dueTime: string;
  recurrence: Task["recurrence"];
  reminder_minutes_before: number | null;
}

const emptyForm = (): TaskFormState => ({
  title: "", description: "", priority: "medium", color: "#3b82f6",
  dueDate: "", dueTime: "", recurrence: "none", reminder_minutes_before: null,
});

interface TasksBoardProps {
  className?: string;
  /** Optional: notify parent when tasks change so it can refresh calendar overlays */
  onTasksChange?: (tasks: Task[]) => void;
}

export function TasksBoard({ className, onTasksChange }: TasksBoardProps) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"open" | "done">("open");
  const [quickTitle, setQuickTitle] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<TaskFormState>(emptyForm());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("is_done", { ascending: true })
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) { toast.error("שגיאה בטעינת משימות"); setLoading(false); return; }
    const list = (data as Task[]) || [];
    setTasks(list);
    onTasksChange?.(list);
    setLoading(false);
  }, [user, onTasksChange]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`tasks-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  // Reminders: scan every 30s
  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") Notification.requestPermission().catch(() => {});
    const check = () => {
      const reminded = getRemindedSet();
      const now = new Date();
      let mutated = false;
      for (const t of tasks) {
        if (t.is_done || !t.due_at || t.reminder_minutes_before === null) continue;
        const due = parseISO(t.due_at);
        const triggerAt = new Date(due.getTime() - t.reminder_minutes_before * 60_000);
        if (triggerAt <= now && due >= new Date(now.getTime() - 60 * 60_000)) {
          const key = `${t.id}:${t.due_at}:${t.reminder_minutes_before}`;
          if (!reminded.has(key)) {
            reminded.add(key); mutated = true;
            const mins = Math.max(0, differenceInMinutes(due, now));
            const body = mins > 0 ? `בעוד ${mins} דק׳ · ${format(due, "HH:mm")}` : `כעת · ${format(due, "HH:mm")}`;
            toast(`🔔 ${t.title}`, { description: body, duration: 10000 });
            try { if (Notification.permission === "granted") new Notification(`משימה: ${t.title}`, { body, tag: t.id }); } catch {}
          }
        }
      }
      if (mutated) saveRemindedSet(reminded);
    };
    check();
    const id = window.setInterval(check, 30_000);
    return () => window.clearInterval(id);
  }, [tasks]);

  const openList = useMemo(() => tasks.filter(t => !t.is_done), [tasks]);
  const doneList = useMemo(() => tasks.filter(t => t.is_done).slice(0, 50), [tasks]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = openList.filter(t => t.due_at && isToday(parseISO(t.due_at))).length;
    const overdue = openList.filter(t => t.due_at && isBefore(parseISO(t.due_at), now)).length;
    return { open: openList.length, today, overdue, done: doneList.length };
  }, [openList, doneList]);

  // Quick add
  const quickAdd = async () => {
    if (!user || !quickTitle.trim()) return;
    const title = quickTitle.trim();
    setQuickTitle("");
    const maxPos = openList.reduce((m, t) => Math.max(m, t.position), 0);
    const { error } = await supabase.from("tasks").insert({
      user_id: user.id, title, position: maxPos + 1,
    });
    if (error) toast.error("שגיאה ביצירת משימה");
  };

  // Full create / edit
  const openEdit = (t?: Task) => {
    if (t) {
      const due = t.due_at ? parseISO(t.due_at) : null;
      setForm({
        id: t.id, title: t.title, description: t.description || "",
        priority: t.priority, color: t.color,
        dueDate: due ? format(due, "yyyy-MM-dd") : "",
        dueTime: due ? format(due, "HH:mm") : "",
        recurrence: t.recurrence,
        reminder_minutes_before: t.reminder_minutes_before,
      });
    } else {
      setForm(emptyForm());
    }
    setDialogOpen(true);
  };

  const saveForm = async () => {
    if (!user || !form.title.trim()) { toast.error("חסר כותרת"); return; }
    let due_at: string | null = null;
    if (form.dueDate) {
      const time = form.dueTime || "09:00";
      due_at = new Date(`${form.dueDate}T${time}:00`).toISOString();
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      priority: form.priority,
      color: form.color,
      due_at,
      recurrence: form.recurrence,
      reminder_minutes_before: form.reminder_minutes_before,
    };
    if (form.id) {
      const { error } = await supabase.from("tasks").update(payload).eq("id", form.id);
      if (error) { toast.error("שגיאה בשמירה"); return; }
      toast.success("המשימה עודכנה");
    } else {
      const maxPos = openList.reduce((m, t) => Math.max(m, t.position), 0);
      const { error } = await supabase.from("tasks").insert({ ...payload, user_id: user.id, position: maxPos + 1 });
      if (error) { toast.error("שגיאה ביצירה"); return; }
      toast.success("המשימה נוספה");
    }
    setDialogOpen(false);
    setForm(emptyForm());
  };

  const toggleDone = async (t: Task) => {
    if (!t.is_done) {
      // Mark done; if recurring, create next instance
      await supabase.from("tasks").update({ is_done: true, completed_at: new Date().toISOString() }).eq("id", t.id);
      if (t.recurrence !== "none" && t.due_at) {
        const base = parseISO(t.due_at);
        const next = t.recurrence === "daily" ? addDays(base, 1)
                   : t.recurrence === "weekly" ? addWeeks(base, 1)
                   : addMonths(base, 1);
        const maxPos = openList.reduce((m, x) => Math.max(m, x.position), 0);
        await supabase.from("tasks").insert({
          user_id: t.user_id, title: t.title, description: t.description, priority: t.priority,
          color: t.color, due_at: next.toISOString(), recurrence: t.recurrence,
          reminder_minutes_before: t.reminder_minutes_before, position: maxPos + 1,
        });
        toast.success(`✓ הושלם · נוצרה משימה הבאה ל-${format(next, "d MMM", { locale: he })}`);
      } else {
        toast.success("✓ הושלם");
      }
    } else {
      await supabase.from("tasks").update({ is_done: false, completed_at: null }).eq("id", t.id);
    }
  };

  const remove = async (id: string) => {
    await supabase.from("tasks").delete().eq("id", id);
    toast.success("נמחק");
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = openList.findIndex(t => t.id === active.id);
    const newIdx = openList.findIndex(t => t.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(openList, oldIdx, newIdx);
    // Optimistic
    setTasks(prev => {
      const doneOnes = prev.filter(t => t.is_done);
      const positioned = reordered.map((t, i) => ({ ...t, position: i + 1 }));
      return [...positioned, ...doneOnes];
    });
    // Persist
    await Promise.all(
      reordered.map((t, i) =>
        supabase.from("tasks").update({ position: i + 1 }).eq("id", t.id)
      )
    );
  };

  const list = tab === "open" ? openList : doneList;

  return (
    <div className={cn("rounded-xl border border-border bg-card shadow-sm overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-gradient-to-l from-primary/5 to-transparent">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <ListChecks className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-base">לוח המשימות שלי</h3>
            <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              <span>פתוחות: <strong className="text-foreground">{stats.open}</strong></span>
              {stats.today > 0 && <span className="text-amber-600">• היום: <strong>{stats.today}</strong></span>}
              {stats.overdue > 0 && <span className="text-red-600">• באיחור: <strong>{stats.overdue}</strong></span>}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => openEdit()} className="gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> חדשה
        </Button>
      </div>

      {/* Quick add */}
      <div className="px-4 py-3 border-b border-border bg-muted/20 flex gap-2">
        <Input
          dir="rtl"
          placeholder="הוסף משימה במהירות... (Enter לשמירה)"
          value={quickTitle}
          onChange={e => setQuickTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") quickAdd(); }}
          className="h-10"
        />
        <Button onClick={quickAdd} disabled={!quickTitle.trim()} size="icon" className="h-10 w-10 shrink-0">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button onClick={() => setTab("open")}
          className={cn("flex-1 py-2.5 text-sm font-medium transition-colors",
            tab === "open" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground")}>
          לביצוע ({stats.open})
        </button>
        <button onClick={() => setTab("done")}
          className={cn("flex-1 py-2.5 text-sm font-medium transition-colors",
            tab === "done" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground")}>
          הושלמו ({stats.done})
        </button>
      </div>

      {/* List */}
      <div className="p-3 max-h-[480px] overflow-y-auto">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">טוען...</div>
        ) : list.length === 0 ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">
              {tab === "open" ? "אין משימות פתוחות 🎉" : "עוד לא הושלמו משימות"}
            </p>
          </div>
        ) : tab === "open" ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={list.map(t => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {list.map(t => (
                  <SortableTaskRow key={t.id} task={t} onToggle={toggleDone} onDelete={remove} onEdit={openEdit} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="space-y-2">
            {list.map(t => (
              <SortableTaskRow key={t.id} task={t} onToggle={toggleDone} onDelete={remove} onEdit={openEdit} />
            ))}
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{form.id ? "ערוך משימה" : "משימה חדשה"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">כותרת *</label>
              <Input dir="rtl" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">תיאור (אופציונלי)</label>
              <Textarea dir="rtl" rows={2} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">תאריך</label>
                <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">שעה</label>
                <Input type="time" value={form.dueTime} onChange={e => setForm(f => ({ ...f, dueTime: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">עדיפות</label>
                <Select value={form.priority} onValueChange={(v: Task["priority"]) => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">🔴 דחוף</SelectItem>
                    <SelectItem value="medium">🟡 רגיל</SelectItem>
                    <SelectItem value="low">⚪ נמוך</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">חזרה</label>
                <Select value={form.recurrence} onValueChange={(v: Task["recurrence"]) => setForm(f => ({ ...f, recurrence: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ללא</SelectItem>
                    <SelectItem value="daily">יומי</SelectItem>
                    <SelectItem value="weekly">שבועי</SelectItem>
                    <SelectItem value="monthly">חודשי</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">תזכורת</label>
              <Select value={String(form.reminder_minutes_before)}
                onValueChange={v => setForm(f => ({ ...f, reminder_minutes_before: v === "null" ? null : Number(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REMINDER_OPTIONS.map(o => (
                    <SelectItem key={String(o.value)} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">צבע</label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {COLOR_PALETTE.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={cn("w-7 h-7 rounded-full transition-all", form.color === c ? "ring-2 ring-offset-2 ring-foreground" : "opacity-80 hover:opacity-100")}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>ביטול</Button>
            <Button onClick={saveForm}>{form.id ? "שמור" : "הוסף"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TasksBoard;
