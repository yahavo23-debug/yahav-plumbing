import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DispatchTimeSlot } from "./DispatchTimeSlot";
import { DISPATCH_HOURS } from "@/lib/dispatch-constants";
import type { DispatchCall } from "@/hooks/useDispatchCalls";

interface DispatchDayViewProps {
  calls: DispatchCall[];
}

export function DispatchDayView({ calls }: DispatchDayViewProps) {
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
        // If the hour is outside our range, put it in the closest slot
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
          />
        ))}
      </div>
    </ScrollArea>
  );
}
