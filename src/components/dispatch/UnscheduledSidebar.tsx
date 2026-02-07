import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { DispatchCard } from "./DispatchCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Inbox } from "lucide-react";
import type { DispatchCall } from "@/hooks/useDispatchCalls";
import { cn } from "@/lib/utils";

interface UnscheduledSidebarProps {
  calls: DispatchCall[];
}

export function UnscheduledSidebar({ calls }: UnscheduledSidebarProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: "unscheduled",
    data: { hour: null },
  });

  return (
    <div className="flex flex-col h-full border-r border-border bg-muted/30">
      <div className="px-4 py-3 border-b border-border bg-card">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Inbox className="w-4 h-4" />
          ממתינות לשיבוץ
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            {calls.length}
          </span>
        </h3>
      </div>

      <ScrollArea className="flex-1">
        <div
          ref={setNodeRef}
          className={cn(
            "p-3 space-y-2 min-h-[200px] transition-colors",
            isOver && "bg-primary/5"
          )}
        >
          <SortableContext items={calls.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {calls.map((call) => (
              <DispatchCard key={call.id} call={call} />
            ))}
          </SortableContext>

          {calls.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Inbox className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
              <p>אין קריאות ממתינות</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
