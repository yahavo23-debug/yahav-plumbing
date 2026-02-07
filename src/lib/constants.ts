export const serviceTypes = [
  { value: "leak_detection", label: "איתור נזילה" },
  { value: "sewer_camera", label: "צילום קו ביוב" },
  { value: "pressure_test", label: "בדיקת לחץ" },
  { value: "other", label: "אחר" },
];

export const serviceTypeLabels: Record<string, string> = Object.fromEntries(
  serviceTypes.map((t) => [t.value, t.label])
);

/** Known service type keys */
export const knownServiceTypeKeys = new Set(serviceTypes.map((t) => t.value));

export const priorities = [
  { value: "low", label: "נמוכה" },
  { value: "medium", label: "בינונית" },
  { value: "high", label: "גבוהה" },
  { value: "urgent", label: "דחופה" },
];

export const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-destructive/10 text-destructive",
};

export const statusLabels: Record<string, string> = {
  open: "פתוח",
  in_progress: "בטיפול",
  completed: "הושלם",
  cancelled: "בוטל",
};

export const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  in_progress: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-muted text-muted-foreground",
};

/**
 * Resolve a job_type value to a display label.
 * If the value is a known key, return its Hebrew label.
 * Otherwise return the raw value (custom free-text from admin).
 */
export function getJobTypeLabel(jobType: string | null | undefined): string {
  if (!jobType) return "—";
  return serviceTypeLabels[jobType] || jobType;
}
