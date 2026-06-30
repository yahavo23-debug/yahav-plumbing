export const serviceTypes = [
  { value: "leak_detection", label: "איתור נזילה" },
  { value: "sewer_camera", label: "צילום קו ביוב" },
  { value: "visit", label: "ביקור" },
  { value: "faucet_replacement", label: "החלפת ברז" },
  { value: "unblocking", label: "פתיחת סתימה" },
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
  pending_customer: "ממתין לאישור לקוח",
  awaiting_payment: "ממתין לתשלום",
};

export const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  in_progress: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-muted text-muted-foreground",
  pending_customer: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  awaiting_payment: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
};

/** Bank account details for collection reports (shown on דוח גבייה PDF). */
export const BANK_DETAILS = {
  bankName: "בנק מזרחי טפחות",
  bankNumber: "20",
  branchNumber: "615",
  accountNumber: "155793",
  accountType: "עסק שאינו תאגיד",
  beneficiaryName: "יהב אוחנה",
};

/**
 * Resolve a job_type value to a display label.
 * If the value is a known key, return its Hebrew label.
 * Otherwise return the raw value (custom free-text from admin).
 */
export function getJobTypeLabel(jobType: string | null | undefined): string {
  if (!jobType) return "—";
  return jobType
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => serviceTypeLabels[p] || p)
    .join(" • ");
}

/** Lead source options for customers */
export const leadSources = [
  { value: "facebook", label: "פייסבוק", color: "bg-blue-500" },
  { value: "instagram", label: "אינסטגרם", color: "bg-pink-500" },
  { value: "tiktok", label: "טיקטוק", color: "bg-black dark:bg-white" },
  { value: "google", label: "גוגל / GBP", color: "bg-red-600" },
  { value: "madrag", label: "מדרג", color: "bg-purple-700" },
  { value: "easy", label: "איזי", color: "bg-amber-700" },
  { value: "shapatz", label: "שפץ", color: "bg-zinc-700" },
  { value: "alufim", label: "אלופים", color: "bg-yellow-500" },
  { value: "organic", label: "אורגני", color: "bg-emerald-500" },
  { value: "lead", label: "ליד", color: "bg-red-500" },
  { value: "recommendation", label: "המלצה", color: "bg-teal-500" },
  { value: "referral", label: "המלצה (referral)", color: "bg-teal-600" },
  { value: "word_of_mouth", label: "פה לאוזן", color: "bg-green-500" },
  { value: "contractor", label: "קבלן", color: "bg-orange-500" },
  { value: "returning", label: "לקוח חוזר", color: "bg-indigo-500" },
  { value: "sign", label: "שלט / רכב", color: "bg-cyan-600" },
  { value: "other", label: "אחר", color: "bg-slate-500" },
];

export const leadSourceLabels: Record<string, string> = Object.fromEntries(
  leadSources.map((s) => [s.value, s.label])
);

export const leadSourceColors: Record<string, string> = Object.fromEntries(
  leadSources.map((s) => [s.value, s.color])
);
