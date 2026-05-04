import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { format, addDays, subDays, isToday } from "date-fns";
import { he } from "date-fns/locale";
import { ChevronRight, ChevronLeft, CalendarDays, RefreshCw, Filter, X, Inbox, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/layout/AppLayout";
import { DispatchDayView } from "@/components/dispatch/DispatchDayView";
import { UnscheduledSidebar } from "@/components/dispatch/UnscheduledSidebar";
import { DispatchCard } from "@/components/dispatch/DispatchCard";
import { TechnicianStatsPanel } from "@/components/dispatch/TechnicianStatsPanel";
import { useDispatchCalls, type DispatchCall } from "@/hooks/useDispatchCalls";
import { useTechnicians } from "@/hooks/useTechnicians";
import { getTechnicianColor } from "@/lib/dispatch-constants";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export default function DispatchBoard() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeCall, setActiveCall] = useState<DispatchCall | null>(null);
  const [filterTechId, setFilterTechId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"schedule" | "unscheduled">("schedule");

  const isMobile = useIsMobile();

  const { calls, unscheduledCalls, loading, scheduleCall, unscheduleCall, assignTechnician, reload } =
    useDispatchCalls(selectedDate);

  const { technicians } = useTechnicians();

  const techColorMap = useMemo(() => {
    const map = new Map<string, number>();
    const sorted = [...technicians].sort((a, b) => a.user_id.localeCompare(b.user_id));
    sorted.forEach((t, i) => map.set(t.user_id, i));
    return map;
  }, [technicians]);

  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 8 } });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 10 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const call = event.active.data.current?.call as DispatchCall | undefined;
    if (call) setActiveCall(call);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveCall(null);
      const { active, over } = event;
      if (!over) return;

      const callId = active.id as string;
      const overId = String(over.id);

      if (overId === "unscheduled") {
        await unscheduleCall(callId);
        return;
      }
      if (overId.startsWith("hour-")) {
        const hour = parseInt(overId.replace("hour-", ""), 10);
        await scheduleCall(callId, hour);
        return;
      }
      const overCallData = over.data.current?.call as DispatchCall | undefined;
      if (overCallData?.scheduled_at) {
        const hour = new Date(overCallData.scheduled_at).getHours();
        await scheduleCall(callId, hour);
      }
    },
    [scheduleCall, unscheduleCall]
  );

  const handleAssignTechnician = useCallback(
    async (callId: string, techId: string | null) => {
      await assignTechnician(callId, techId);
    },
    [assignTechnician]
  );

  const handleUnscheduleCall = useCallback(
    async (callId: string) => {
      await unscheduleCall(callId);
    },
    [unscheduleCall]
  );

  const filteredCalls = useMemo(
    () => (filterTechId ? calls.filter((c) => c.assigned_to === filterTechId) : calls),
    [calls, filterTechId]
  );
  const filteredUnscheduled = useMemo(
    () => (filterTechId ? unscheduledCalls.filter((c) => c.assigned_to === filterTechId) : unscheduledCalls),
    [unscheduledCalls, filterTechId]
  );

  // Reset active drag when date changes
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const todayLabel = isToday(selectedDate);
  const dateDisplay = isMobile
    ? format(selectedDate, "EEEE d/M", { locale: he })
    : format(selectedDate, "EEEE, d בMMMM yyyy", { locale: he });

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)]">

        {/* ── Header ── */}
        <header className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-card border-b border-border rounded-t-lg">
          {/* Title — hidden on mobile to save space */}
          {!isMobile && (
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold">לוח שיבוץ</h1>
            </div>
          )}

          {/* Date navigation */}
          <div className="flex items-center gap-1 flex-1 justify-center md:justify-start md:flex-none">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setSelectedDate((d) => subDays(d, 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>

            <Button
              variant={todayLabel ? "default" : "outline"}
              className="text-sm font-semibold h-9 px-3 min-w-0 flex-1 md:flex-none md:min-w-[160px]"
              onClick={() => setSelectedDate(new Date())}
            >
              {todayLabel && <span className="ml-1">היום —</span>}
              <span className="truncate">{dateDisplay}</span>
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setSelectedDate((d) => addDays(d, 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={reload}
              disabled={loading}
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
          </div>

          {/* Stats — only on desktop */}
          {!isMobile && (
            <div className="flex items-center gap-3">
              <TechnicianStatsPanel technicians={technicians} techColorMap={techColorMap} />
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{filteredCalls.length}</span> קריאות
              </div>
            </div>
          )}
        </header>

        {/* ── Technician filter bar ── */}
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b border-border overflow-x-auto">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Button
            variant={filterTechId === null ? "default" : "ghost"}
            size="sm"
            className="h-6 text-xs shrink-0 px-2"
            onClick={() => setFilterTechId(null)}
          >
            הכל
          </Button>
          {technicians.map((tech) => {
            const idx = techColorMap.get(tech.user_id) ?? 0;
            const color = getTechnicianColor(idx);
            const isActive = filterTechId === tech.user_id;
            return (
              <Button
                key={tech.user_id}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className={cn("h-6 text-xs shrink-0 gap-1 px-2", !isActive && "bg-card")}
                onClick={() => setFilterTechId(isActive ? null : tech.user_id)}
              >
                <div className={cn("w-2 h-2 rounded-full shrink-0", color.dot)} />
                {tech.full_name.split(" ")[0]}
                {isActive && <X className="w-3 h-3" />}
              </Button>
            );
          })}
        </div>

        {/* ── Mobile tab switcher ── */}
        {isMobile && (
          <div className="shrink-0 flex border-b border-border bg-card">
            <button
              onClick={() => setMobileTab("schedule")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors",
                mobileTab === "schedule"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground"
              )}
            >
              <Clock className="w-4 h-4" />
              לוח יום
              {filteredCalls.length > 0 && (
                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                  {filteredCalls.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setMobileTab("unscheduled")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors",
                mobileTab === "unscheduled"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground"
              )}
            >
              <Inbox className="w-4 h-4" />
              ממתינות
              {filteredUnscheduled.length > 0 && (
                <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">
                  {filteredUnscheduled.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* ── Main content ── */}
        <DndContext
          key={dateStr}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {isMobile ? (
            /* ── MOBILE: single panel with tabs ── */
            <div className="flex-1 overflow-hidden">
              {mobileTab === "unscheduled" ? (
                <UnscheduledSidebar
                  calls={filteredUnscheduled}
                  technicians={technicians}
                  techColorMap={techColorMap}
                  onAssignTechnician={handleAssignTechnician}
                />
              ) : (
                loading ? (
                  <div className="flex items-center justify-center h-full">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <DispatchDayView
                    calls={filteredCalls}
                    technicians={technicians}
                    techColorMap={techColorMap}
                    onAssignTechnician={handleAssignTechnician}
                    onUnscheduleCall={handleUnscheduleCall}
                  />
                )
              )}
            </div>
          ) : (
            /* ── DESKTOP: side-by-side layout ── */
            <div className="flex flex-1 overflow-hidden">
              <div className="w-72 shrink-0">
                <UnscheduledSidebar
                  calls={filteredUnscheduled}
                  technicians={technicians}
                  techColorMap={techColorMap}
                  onAssignTechnician={handleAssignTechnician}
                />
              </div>
              <div className="flex-1 overflow-hidden bg-card">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <DispatchDayView
                    calls={filteredCalls}
                    technicians={technicians}
                    techColorMap={techColorMap}
                    onAssignTechnician={handleAssignTechnician}
                    onUnscheduleCall={handleUnscheduleCall}
                  />
                )}
              </div>
            </div>
          )}

          <DragOverlay dropAnimation={null}>
            {activeCall && (
              <DispatchCard
                call={activeCall}
                isOverlay
                technicians={technicians}
                techColorMap={techColorMap}
              />
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </AppLayout>
  );
}
