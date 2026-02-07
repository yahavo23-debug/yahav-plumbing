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

/** Technician color palette — each technician gets a unique color by index */
export const TECHNICIAN_COLORS = [
  { bg: "bg-blue-100 dark:bg-blue-900/30", border: "border-blue-400 dark:border-blue-600", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/30", border: "border-emerald-400 dark:border-emerald-600", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  { bg: "bg-amber-100 dark:bg-amber-900/30", border: "border-amber-400 dark:border-amber-600", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  { bg: "bg-rose-100 dark:bg-rose-900/30", border: "border-rose-400 dark:border-rose-600", text: "text-rose-700 dark:text-rose-300", dot: "bg-rose-500" },
  { bg: "bg-violet-100 dark:bg-violet-900/30", border: "border-violet-400 dark:border-violet-600", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/30", border: "border-cyan-400 dark:border-cyan-600", text: "text-cyan-700 dark:text-cyan-300", dot: "bg-cyan-500" },
  { bg: "bg-orange-100 dark:bg-orange-900/30", border: "border-orange-400 dark:border-orange-600", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  { bg: "bg-teal-100 dark:bg-teal-900/30", border: "border-teal-400 dark:border-teal-600", text: "text-teal-700 dark:text-teal-300", dot: "bg-teal-500" },
];

/** Get color for a technician by index */
export function getTechnicianColor(index: number) {
  return TECHNICIAN_COLORS[index % TECHNICIAN_COLORS.length];
}
