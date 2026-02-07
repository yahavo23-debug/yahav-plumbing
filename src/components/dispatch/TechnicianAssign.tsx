import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserPlus, X, Check, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Technician } from "@/hooks/useTechnicians";
import { getTechnicianColor } from "@/lib/dispatch-constants";

interface TechnicianAssignProps {
  assignedTo: string | null;
  technicians: Technician[];
  techColorMap: Map<string, number>;
  onAssign: (techId: string | null) => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
}

export function TechnicianAssign({
  assignedTo,
  technicians,
  techColorMap,
  onAssign,
}: TechnicianAssignProps) {
  const [open, setOpen] = useState(false);
  const assigned = technicians.find((t) => t.user_id === assignedTo);
  const colorIdx = assignedTo ? techColorMap.get(assignedTo) ?? -1 : -1;
  const color = colorIdx >= 0 ? getTechnicianColor(colorIdx) : null;

  const handleAssign = (techId: string | null) => {
    onAssign(techId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 touch-manipulation"
          onClick={(e) => e.stopPropagation()}
        >
          {assigned && color ? (
            <Avatar className="h-7 w-7">
              <AvatarFallback
                className={cn("text-[10px] font-bold", color.bg, color.text)}
              >
                {getInitials(assigned.full_name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="h-7 w-7 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary/50 transition-colors">
              <UserPlus className="w-3.5 h-3.5 text-muted-foreground/50" />
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-60 p-2"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground px-2 py-1">
            שיבוץ טכנאי
          </p>
          {technicians.map((tech) => {
            const idx = techColorMap.get(tech.user_id) ?? 0;
            const c = getTechnicianColor(idx);
            const isSelected = tech.user_id === assignedTo;
            return (
              <button
                key={tech.user_id}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-accent transition-colors text-right",
                  isSelected && "bg-accent"
                )}
                onClick={() => handleAssign(tech.user_id)}
              >
                <div
                  className={cn("w-3 h-3 rounded-full shrink-0", c.dot)}
                />
                <span className="flex-1 truncate font-medium">
                  {tech.full_name}
                </span>
                {tech.phone && (
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Phone className="w-3 h-3" />
                    {tech.phone}
                  </span>
                )}
                {isSelected && (
                  <Check className="w-4 h-4 text-primary shrink-0" />
                )}
              </button>
            );
          })}
          {assignedTo && (
            <>
              <div className="border-t border-border my-1" />
              <button
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-destructive/10 text-destructive transition-colors"
                onClick={() => handleAssign(null)}
              >
                <X className="w-3 h-3" />
                <span>הסר שיבוץ</span>
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
