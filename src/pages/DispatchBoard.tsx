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
import { ChevronRight, ChevronLeft, CalendarDays, RefreshCw, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/layout/AppLayout";
import { DispatchDayView } from "@/components/dispatch/DispatchDayView";
import { UnscheduledSidebar } from "@/components/dispatch/UnscheduledSidebar";
import { DispatchCard } from "@/components/dispatch/DispatchCard";
import { TechnicianStatsPanel } from "@/components/dispatch/TechnicianStatsPanel";
import { useDispatchCalls, type DispatchCall } from "@/hooks/useDispatchCalls";
import { useTechnicians } from "@/hooks/useTechnicians";
import { getTechnicianColor } from "@/lib/dispatch-constants";
import { cn } from "@/lib/utils";

export default function DispatchBoard() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeCall, setActiveCall] = useState<DispatchCall | null>(null);
  const [filterTechId, setFilterTechId] = useState<string | null>(null);

  const { calls, unscheduledCalls, loading, scheduleCall, unscheduleCall, assignTechnician, reload } =
    useDispatchCalls(selectedDate);

  const { technicians } = useTechnicians();

  // Stable color mapping: sorted by user_id → index
  const techColorMap = useMemo(() => {
    const map = new Map<string, number>();
    const sorted = [...technicians].sort((a, b) => a.user_id.localeCompare(b.user_id));
    sorted.forEach((t, i) => map.set(t.user_id, i));
    return map;
  }, [technicians]);

  // DnD sensors — optimised for tablet touch
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 8 } });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 8 },
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

      // Dropped on "unscheduled" zone
      if (overId === "unscheduled") {
        await unscheduleCall(callId);
        return;
      }

      // Dropped on a time slot (hour-XX)
      if (overId.startsWith("hour-")) {
        const hour = parseInt(overId.replace("hour-", ""), 10);
        await scheduleCall(callId, hour);
        return;
      }

      // Dropped on another card — use that card's time slot
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

  // Filter calls by selected technician
  const filteredCalls = useMemo(
    () => (filterTechId ? calls.filter((c) => c.assigned_to === filterTechId) : calls),
    [calls, filterTechId]
  );
  const filteredUnscheduled = useMemo(
    () => (filterTechId ? unscheduledCalls.filter((c) => c.assigned_to === filterTechId) : unscheduledCalls),
    [unscheduledCalls, filterTechId]
  );

  const todayLabel = isToday(selectedDate);
  const dateDisplay = format(selectedDate, "EEEE, d בMMMM yyyy", { locale: he });

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)]">
        {/* Header bar */}
        <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 bg-card border-b border-border rounded-t-lg">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">לוח שיבוץ</h1>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10"
              onClick={() => setSelectedDate((d) => subDays(d, 1))}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>

            <Button
              variant={todayLabel ? "default" : "outline"}
              className="min-w-[180px] text-sm font-semibold h-10"
              onClick={() => setSelectedDate(new Date())}
            >
              {todayLabel ? "היום — " : ""}
              {dateDisplay}
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10"
              onClick={() => setSelectedDate((d) => addDays(d, 1))}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              onClick={reload}
              disabled={loading}
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <TechnicianStatsPanel technicians={technicians} techColorMap={techColorMap} />
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{filteredCalls.length}</span> קריאות משובצות
            </div>
          </div>
        </header>

        {/* Technician filter bar */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-muted/30 border-b border-border overflow-x-auto">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          <Button
            variant={filterTechId === null ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs shrink-0"
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
                className={cn(
                  "h-7 text-xs shrink-0 gap-1.5",
                  !isActive && "bg-card"
                )}
                onClick={() => setFilterTechId(isActive ? null : tech.user_id)}
              >
                <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", color.dot)} />
                {tech.full_name}
                {isActive && <X className="w-3 h-3" />}
              </Button>
            );
          })}
        </div>

        {/* Main content with DnD */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 overflow-hidden">
            {/* Unscheduled sidebar */}
            <div className="w-72 shrink-0">
              <UnscheduledSidebar
                calls={filteredUnscheduled}
                technicians={technicians}
                techColorMap={techColorMap}
                onAssignTechnician={handleAssignTechnician}
              />
            </div>

            {/* Day timeline */}
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

          {/* Drag overlay */}
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
