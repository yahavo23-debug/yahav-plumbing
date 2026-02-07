import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "react-router-dom";
import { Clock, MapPin, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getDispatchStatus } from "@/lib/dispatch-constants";
import { getJobTypeLabel } from "@/lib/constants";
import type { DispatchCall } from "@/hooks/useDispatchCalls";
import { cn } from "@/lib/utils";

interface DispatchCardProps {
  call: DispatchCall;
  isOverlay?: boolean;
}

export function DispatchCard({ call, isOverlay = false }: DispatchCardProps) {
  const navigate = useNavigate();
  const statusConfig = getDispatchStatus(call.status);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: call.id,
    data: { call },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isUrgent = call.priority === "urgent";

  return (
    <div
      ref={setNodeRef}
      style={isOverlay ? undefined : style}
      className={cn(
        "rounded-lg border-2 p-3 cursor-grab active:cursor-grabbing transition-shadow",
        "hover:shadow-md touch-manipulation select-none",
        statusConfig.bg,
        statusConfig.border,
        isDragging && "shadow-lg ring-2 ring-primary/30",
        isOverlay && "shadow-xl rotate-2 scale-105"
      )}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="mt-1 touch-none text-muted-foreground/50 hover:text-muted-foreground"
        >
          <GripVertical className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0" onClick={() => navigate(`/service-calls/${call.id}`)}>
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-base text-foreground truncate">
              {call.customer_name}
            </span>
            <Badge variant="outline" className={cn("text-xs", statusConfig.text, statusConfig.border)}>
              {statusConfig.label}
            </Badge>
            {isUrgent && (
              <Badge className="bg-destructive text-destructive-foreground text-xs animate-pulse">
                דחוף
              </Badge>
            )}
          </div>

          {/* Info row */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            <span className="font-medium">{getJobTypeLabel(call.job_type)}</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {call.duration_minutes} דק׳
            </span>
            <span className="text-xs">קריאה #{call.call_number}</span>
          </div>

          {/* Description */}
          {call.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{call.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
