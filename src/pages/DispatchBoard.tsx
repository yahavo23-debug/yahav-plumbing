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
import { ChevronRight, ChevronLeft, CalendarDays, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/layout/AppLayout";
import { DispatchDayView } from "@/components/dispatch/DispatchDayView";
import { UnscheduledSidebar } from "@/components/dispatch/UnscheduledSidebar";
import { DispatchCard } from "@/components/dispatch/DispatchCard";
import { TechnicianStatsPanel } from "@/components/dispatch/TechnicianStatsPanel";
import { useDispatchCalls, type DispatchCall } from "@/hooks/useDispatchCalls";
import { useTechnicians } from "@/hooks/useTechnicians";
import { cn } from "@/lib/utils";

export default function DispatchBoard() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeCall, setActiveCall] = useState<DispatchCall | null>(null);

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
              <span className="font-medium text-foreground">{calls.length}</span> קריאות משובצות
            </div>
          </div>
        </header>

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
                calls={unscheduledCalls}
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
                  calls={calls}
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
