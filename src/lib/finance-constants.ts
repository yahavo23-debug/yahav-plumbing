export const financeCategories = [
  { value: "tools", label: "כלים וציוד" },
  { value: "fuel", label: "דלק" },
  { value: "marketing", label: "שיווק ופרסום" },
  { value: "subcontractor", label: "קבלן משנה" },
  { value: "car", label: "רכב" },
  { value: "phone", label: "טלפון" },
  { value: "insurance", label: "ביטוח" },
  { value: "office", label: "משרד" },
  { value: "professional", label: "שירותים מקצועיים" },
  { value: "materials", label: "חומרים" },
  { value: "service_income", label: "הכנסה משירות" },
  { value: "other", label: "אחר" },
];

export const categoryLabels: Record<string, string> = Object.fromEntries(
  financeCategories.map(c => [c.value, c.label])
);

export const financePaymentMethods = [
  { value: "cash", label: "מזומן" },
  { value: "credit", label: "אשראי" },
  { value: "bank_transfer", label: "העברה בנקאית" },
  { value: "check", label: "צ׳ק" },
  { value: "bit", label: "ביט" },
  { value: "paybox", label: "פייבוקס" },
  { value: "standing_order", label: "הוראת קבע" },
];

export const paymentMethodLabels: Record<string, string> = Object.fromEntries(
  financePaymentMethods.map(m => [m.value, m.label])
);

export const directionLabels: Record<string, string> = {
  income: "הכנסה",
  expense: "הוצאה",
};

export const docTypeLabels: Record<string, string> = {
  receipt: "קבלה",
  supplier_invoice: "חשבונית ספק",
  other: "אחר",
};

export const statusLabels: Record<string, string> = {
  paid: "שולם",
  debt: "חוב",
  credit: "זיכוי",
};
