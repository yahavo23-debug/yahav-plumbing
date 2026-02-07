import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { DispatchCard } from "./DispatchCard";
import type { DispatchCall } from "@/hooks/useDispatchCalls";
import type { Technician } from "@/hooks/useTechnicians";
import { cn } from "@/lib/utils";

interface DispatchTimeSlotProps {
  hour: number;
  calls: DispatchCall[];
  isCurrentHour: boolean;
  technicians: Technician[];
  techColorMap: Map<string, number>;
  onAssignTechnician: (callId: string, techId: string | null) => void;
  onUnscheduleCall: (callId: string) => void;
}

export function DispatchTimeSlot({
  hour,
  calls,
  isCurrentHour,
  technicians,
  techColorMap,
  onAssignTechnician,
  onUnscheduleCall,
}: DispatchTimeSlotProps) {
  const droppableId = `hour-${hour}`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { hour },
  });

  const timeLabel = `${String(hour).padStart(2, "0")}:00`;

  return (
    <div
      className={cn(
        "flex gap-3 border-b border-border/50 min-h-[80px] transition-colors",
        isCurrentHour && "bg-primary/5",
        isOver && "bg-primary/10 border-primary/30"
      )}
    >
      {/* Time label */}
      <div
        className={cn(
          "w-16 shrink-0 py-3 px-2 text-left font-mono text-sm font-semibold",
          isCurrentHour ? "text-primary" : "text-muted-foreground"
        )}
      >
        {timeLabel}
        {isCurrentHour && (
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse mt-1" />
        )}
      </div>

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 py-2 px-1 space-y-2 rounded-md transition-colors min-h-[72px]",
          isOver && "ring-2 ring-primary/20 ring-dashed bg-primary/5"
        )}
      >
        <SortableContext items={calls.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {calls.map((call) => (
            <DispatchCard
              key={call.id}
              call={call}
              technicians={technicians}
              techColorMap={techColorMap}
              onAssignTechnician={onAssignTechnician}
              onUnscheduleCall={onUnscheduleCall}
            />
          ))}
        </SortableContext>

        {calls.length === 0 && (
          <div
            className={cn(
              "h-full min-h-[56px] flex items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground/40 transition-colors",
              isOver ? "border-primary/30 text-primary/50" : "border-border/50"
            )}
          >
            {isOver ? "שחרר כאן" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
