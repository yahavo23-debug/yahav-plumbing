import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DispatchTimeSlot } from "./DispatchTimeSlot";
import { DISPATCH_HOURS } from "@/lib/dispatch-constants";
import type { DispatchCall } from "@/hooks/useDispatchCalls";
import type { Technician } from "@/hooks/useTechnicians";

interface DispatchDayViewProps {
  calls: DispatchCall[];
  technicians: Technician[];
  techColorMap: Map<string, number>;
  onAssignTechnician: (callId: string, techId: string | null) => void;
}

export function DispatchDayView({
  calls,
  technicians,
  techColorMap,
  onAssignTechnician,
}: DispatchDayViewProps) {
  const currentHour = new Date().getHours();

  const callsByHour = useMemo(() => {
    const map: Record<number, DispatchCall[]> = {};
    DISPATCH_HOURS.forEach((h) => (map[h] = []));

    calls.forEach((call) => {
      if (!call.scheduled_at) return;
      const hour = new Date(call.scheduled_at).getHours();
      if (map[hour]) {
        map[hour].push(call);
      } else {
        const closest = DISPATCH_HOURS.reduce((prev, curr) =>
          Math.abs(curr - hour) < Math.abs(prev - hour) ? curr : prev
        );
        map[closest].push(call);
      }
    });

    return map;
  }, [calls]);

  return (
    <ScrollArea className="flex-1 h-full">
      <div className="divide-y divide-transparent">
        {DISPATCH_HOURS.map((hour) => (
          <DispatchTimeSlot
            key={hour}
            hour={hour}
            calls={callsByHour[hour] || []}
            isCurrentHour={hour === currentHour}
            technicians={technicians}
            techColorMap={techColorMap}
            onAssignTechnician={onAssignTechnician}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
