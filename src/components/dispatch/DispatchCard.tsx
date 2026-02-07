import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "react-router-dom";
import { Clock, GripVertical, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getDispatchStatus, getTechnicianColor } from "@/lib/dispatch-constants";
import { getJobTypeLabel } from "@/lib/constants";
import { TechnicianAssign } from "./TechnicianAssign";
import type { DispatchCall } from "@/hooks/useDispatchCalls";
import type { Technician } from "@/hooks/useTechnicians";
import { cn } from "@/lib/utils";

interface DispatchCardProps {
  call: DispatchCall;
  isOverlay?: boolean;
  technicians?: Technician[];
  techColorMap?: Map<string, number>;
  onAssignTechnician?: (callId: string, techId: string | null) => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
}

export function DispatchCard({
  call,
  isOverlay = false,
  technicians = [],
  techColorMap = new Map(),
  onAssignTechnician,
}: DispatchCardProps) {
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

  // Technician info
  const assignedTech = technicians.find((t) => t.user_id === call.assigned_to);
  const techColorIdx = call.assigned_to ? techColorMap.get(call.assigned_to) ?? -1 : -1;
  const techColor = techColorIdx >= 0 ? getTechnicianColor(techColorIdx) : null;

  return (
    <div
      ref={setNodeRef}
      style={isOverlay ? undefined : style}
      className={cn(
        "rounded-lg border-2 p-3 cursor-grab active:cursor-grabbing transition-shadow relative overflow-hidden",
        "hover:shadow-md touch-manipulation select-none",
        statusConfig.bg,
        statusConfig.border,
        isDragging && "shadow-lg ring-2 ring-primary/30",
        isOverlay && "shadow-xl rotate-2 scale-105"
      )}
    >
      {/* Technician color strip on right edge (RTL start) */}
      {techColor && (
        <div className={cn("absolute top-0 bottom-0 right-0 w-1.5 rounded-r-lg", techColor.dot)} />
      )}

      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="mt-1 touch-none text-muted-foreground/50 hover:text-muted-foreground"
        >
          <GripVertical className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Clickable area for navigation */}
          <div onClick={() => navigate(`/service-calls/${call.id}`)} className="cursor-pointer">
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

          {/* Technician assignment row */}
          <div
            className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30"
            onClick={(e) => e.stopPropagation()}
          >
            {!isOverlay && onAssignTechnician ? (
              <TechnicianAssign
                assignedTo={call.assigned_to}
                technicians={technicians}
                techColorMap={techColorMap}
                onAssign={(techId) => onAssignTechnician(call.id, techId)}
              />
            ) : assignedTech && techColor ? (
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0",
                  techColor.bg,
                  techColor.text
                )}
              >
                {getInitials(assignedTech.full_name)}
              </div>
            ) : null}

            {assignedTech ? (
              <div className="flex items-center gap-2 text-xs min-w-0">
                <span className={cn("font-medium truncate", techColor?.text)}>
                  {assignedTech.full_name}
                </span>
                {assignedTech.phone && (
                  <span className="flex items-center gap-0.5 text-muted-foreground shrink-0">
                    <Phone className="w-3 h-3" />
                    {assignedTech.phone}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground/50">לא שובץ טכנאי</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
