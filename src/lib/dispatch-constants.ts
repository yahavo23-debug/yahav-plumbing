/** Dispatch board status colors — maps service call status to Tailwind classes */
export const dispatchStatusConfig: Record<string, { bg: string; border: string; text: string; label: string }> = {
  open: {
    bg: "bg-muted/60",
    border: "border-muted-foreground/30",
    text: "text-muted-foreground",
    label: "חדש",
  },
  scheduled: {
    bg: "bg-primary/10",
    border: "border-primary/30",
    text: "text-primary",
    label: "משובץ",
  },
  on_the_way: {
    bg: "bg-orange-100 dark:bg-orange-900/30",
    border: "border-orange-300 dark:border-orange-700",
    text: "text-orange-700 dark:text-orange-400",
    label: "בדרך",
  },
  diagnosing: {
    bg: "bg-purple-100 dark:bg-purple-900/30",
    border: "border-purple-300 dark:border-purple-700",
    text: "text-purple-700 dark:text-purple-400",
    label: "באבחון",
  },
  in_progress: {
    bg: "bg-yellow-100 dark:bg-yellow-900/30",
    border: "border-yellow-300 dark:border-yellow-700",
    text: "text-yellow-700 dark:text-yellow-400",
    label: "בביצוע",
  },
  completed: {
    bg: "bg-green-100 dark:bg-green-900/30",
    border: "border-green-300 dark:border-green-700",
    text: "text-green-700 dark:text-green-400",
    label: "הושלם",
  },
  cancelled: {
    bg: "bg-muted",
    border: "border-muted-foreground/20",
    text: "text-muted-foreground",
    label: "בוטל",
  },
};

/** Get status config with fallback */
export function getDispatchStatus(status: string) {
  return dispatchStatusConfig[status] || dispatchStatusConfig.open;
}

/** Hours to display on the dispatch board (6am to 10pm) */
export const DISPATCH_HOURS = Array.from({ length: 17 }, (_, i) => i + 6);

/** Default slot duration in minutes */
export const DEFAULT_SLOT_DURATION = 60;
