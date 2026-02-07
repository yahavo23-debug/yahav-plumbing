import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Scale, TrendingDown, TrendingUp, CheckCircle } from "lucide-react";
import type { BillingSummary } from "@/hooks/useCustomerBilling";

interface CustomerBillingBadgeProps {
  summary: BillingSummary;
  size?: "sm" | "md";
}

const statusConfig: Record<
  BillingSummary["status"],
  {
    label: string;
    icon: typeof AlertTriangle;
    className: string;
    tooltip: (s: BillingSummary) => string;
  }
> = {
  clear: {
    label: "מאוזן",
    icon: CheckCircle,
    className: "bg-muted text-muted-foreground border-border",
    tooltip: () => "אין יתרה פתוחה",
  },
  credit: {
    label: "זכות",
    icon: TrendingUp,
    className: "bg-success/15 text-success border-success/30",
    tooltip: (s) => `ללקוח יתרת זכות של ₪${Math.abs(s.balance).toFixed(0)}`,
  },
  debt: {
    label: "חוב",
    icon: TrendingDown,
    className: "bg-warning/15 text-warning border-warning/30",
    tooltip: (s) =>
      `חוב של ₪${s.balance.toFixed(0)}${s.overdueDays > 0 ? ` • ${s.overdueDays} ימים` : ""}`,
  },
  overdue: {
    label: "פיגור",
    icon: AlertTriangle,
    className: "bg-destructive/15 text-destructive border-destructive/30",
    tooltip: (s) =>
      `פיגור של ₪${s.balance.toFixed(0)} — ${s.overdueMonths > 0 ? `${s.overdueMonths} חודשים` : `${s.overdueDays} ימים`}`,
  },
  legal: {
    label: "טיפול משפטי",
    icon: Scale,
    className: "bg-destructive/20 text-destructive border-destructive/40 font-bold",
    tooltip: (s) =>
      `בטיפול משפטי${s.legalActionNote ? ` • ${s.legalActionNote}` : ""}`,
  },
};

export function CustomerBillingBadge({ summary, size = "sm" }: CustomerBillingBadgeProps) {
  if (summary.loading) return null;
  if (summary.status === "clear") return null;

  const config = statusConfig[summary.status];
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`${config.className} ${size === "sm" ? "text-xs gap-1 px-2 py-0.5" : "text-sm gap-1.5 px-3 py-1"}`}
          >
            <Icon className={size === "sm" ? "w-3 h-3" : "w-4 h-4"} />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">{config.tooltip(summary)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
