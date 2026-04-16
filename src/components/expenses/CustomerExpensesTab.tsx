import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReceiptUpload } from "@/components/billing/ReceiptUpload";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Receipt, Package, Wrench, HelpCircle, TrendingUp, TrendingDown, ArrowUpDown, Users, CalendarDays } from "lucide-react";
import { useCustomerBilling } from "@/hooks/useCustomerBilling";

interface Expense {
  id: string;
  customer_id: string;
  amount: number;
  description: string | null;
  category: string;
  receipt_path: string | null;
  supplier_name: string | null;
  expense_date: string;
  created_by: string;
  created_at: string;
}

const categoryLabels: Record<string, string> = {
  materials: "חומרים",
  contractor: "קבלן",
  other: "אחר",
};

const categoryIcons: Record<string, React.ReactNode> = {
  materials: <Package className="w-4 h-4" />,
  contractor: <Wrench className="w-4 h-4" />,
  other: <HelpCircle className="w-4 h-4" />,
};

const categoryColors: Record<string, string> = {
  materials: "bg-primary/10 text-primary",
  contractor: "bg-warning/10 text-warning",
  other: "bg-muted text-muted-foreground",
};

interface Props {
  customerId: string;
  customerName: string;
}

export function CustomerExpensesTab({ customerId, customerName }: Props) {
  const { isAdmin } = useAuth();
  const billing = useCustomerBilling(customerId);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formAmount, setFormAmount] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("materials");
  const [formSupplier, setFormSupplier] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formReceiptPath, setFormReceiptPath] = useState("");
  const [saving, setSaving] = useState(false);

  // Contractor-specific fields
  const [formWorkerCount, setFormWorkerCount] = useState("");
  const [formWorkDays, setFormWorkDays] = useState("");
  const [formWorkerCost, setFormWorkerCost] = useState("");
  const [formContractorNotes, setFormContractorNotes] = useState("");

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadExpenses();
  }, [customerId]);

  const loadExpenses = async () => {
    const { data, error } = await (supabase as any)
      .from("customer_expenses")
      .select("*")
      .eq("customer_id", customerId)
      .order("expense_date", { ascending: false });

    if (!error) setExpenses(data || []);
    setLoading(false);
  };

  const resetForm = () => {
    setFormAmount("");
    setFormDescription("");
    setFormCategory("materials");
    setFormSupplier("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormReceiptPath("");
    setFormWorkerCount("");
    setFormWorkDays("");
    setFormWorkerCost("");
    setFormContractorNotes("");
  };

  const handleSave = async () => {
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) {
      toast({ title: "שגיאה", description: "יש להזין סכום תקין", variant: "destructive" });
      return;
    }

    setSaving(true);

    // Build contractor details if applicable
    let details: Record<string, any> | null = null;
    if (formCategory === "contractor") {
      details = {};
      if (formWorkerCount) details.worker_count = parseInt(formWorkerCount);
      if (formWorkDays) details.work_days = parseInt(formWorkDays);
      if (formWorkerCost) details.worker_cost = parseFloat(formWorkerCost);
      if (formContractorNotes.trim()) details.notes = formContractorNotes.trim();
      if (Object.keys(details).length === 0) details = null;
    }

    const { error } = await (supabase as any).from("customer_expenses").insert({
      customer_id: customerId,
      amount,
      description: formDescription.trim() || null,
      category: formCategory,
      supplier_name: formSupplier.trim() || null,
      expense_date: formDate,
      receipt_path: formReceiptPath || null,
      details,
    });

    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן לשמור את ההוצאה", variant: "destructive" });
    } else {
      // Auto-sync expense to financial_transactions
      const supplierLabel = formSupplier.trim() || categoryLabels[formCategory] || "";
      const descLabel = formDescription.trim() || `הוצאה - ${categoryLabels[formCategory]}`;
      try {
        await (supabase as any).from("financial_transactions").insert({
          direction: "expense",
          amount,
          txn_date: formDate,
          category: formCategory === "contractor" ? "subcontractor" : formCategory === "materials" ? "materials" : "other_expense",
          counterparty_name: supplierLabel || customerName || null,
          customer_id: customerId,
          notes: descLabel,
          status: "paid",
          doc_path: formReceiptPath || null,
          doc_type: formReceiptPath ? "receipt" : null,
        });
      } catch (finErr) {
        console.error("Auto finance expense sync error:", finErr);
      }

      toast({ title: "נשמר", description: "ההוצאה נוספה בהצלחה (+ הוצאה בכספים)" });
      setShowForm(false);
      resetForm();
      loadExpenses();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await (supabase as any).from("customer_expenses").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן למחוק", variant: "destructive" });
    } else {
      toast({ title: "נמחק", description: "ההוצאה נמחקה" });
      loadExpenses();
    }
    setDeleteId(null);
  };

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalMaterials = expenses.filter(e => e.category === "materials").reduce((s, e) => s + Number(e.amount), 0);
  const totalContractor = expenses.filter(e => e.category === "contractor").reduce((s, e) => s + Number(e.amount), 0);
  const totalOther = expenses.filter(e => e.category === "other").reduce((s, e) => s + Number(e.amount), 0);

  if (loading) return <p className="text-center py-8 text-muted-foreground">טוען...</p>;

  return (
    <div className="space-y-4">
      {/* Profitability Summary */}
      {!billing.loading && (
        <Card className="border-2 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4" />
              סיכום רווחיות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg bg-success/10">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <TrendingUp className="w-4 h-4 text-success" />
                  <p className="text-xs text-muted-foreground">הכנסות מגבייה</p>
                </div>
                <p className="text-lg font-bold text-success">
                  ₪{billing.totalPayments.toLocaleString()}
                </p>
              </div>
              <div className="text-center p-3 rounded-lg bg-destructive/10">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <TrendingDown className="w-4 h-4 text-destructive" />
                  <p className="text-xs text-muted-foreground">הוצאות בפועל</p>
                </div>
                <p className="text-lg font-bold text-destructive">
                  ₪{totalExpenses.toLocaleString()}
                </p>
              </div>
              <div className={`text-center p-3 rounded-lg ${(billing.totalPayments - totalExpenses) >= 0 ? "bg-success/10" : "bg-destructive/10"}`}>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <ArrowUpDown className="w-4 h-4" />
                  <p className="text-xs text-muted-foreground">רווח נקי</p>
                </div>
                <p className={`text-lg font-bold ${(billing.totalPayments - totalExpenses) >= 0 ? "text-success" : "text-destructive"}`}>
                  ₪{(billing.totalPayments - totalExpenses).toLocaleString()}
                </p>
                {billing.totalPayments > 0 && (
                  <p className={`text-sm mt-1 font-medium ${(billing.totalPayments - totalExpenses) >= 0 ? "text-success" : "text-destructive"}`}>
                    {Math.round(((billing.totalPayments - totalExpenses) / billing.totalPayments) * 100)}%
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">סה״כ הוצאות</p>
            <p className="text-lg font-bold">₪{totalExpenses.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">חומרים</p>
            <p className="text-lg font-bold text-primary">₪{totalMaterials.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">קבלן</p>
            <p className="text-lg font-bold text-warning">₪{totalContractor.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">אחר</p>
            <p className="text-lg font-bold">₪{totalOther.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Add Button */}
      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={() => setShowForm(!showForm)} className="gap-2">
            <Plus className="w-4 h-4" /> הוספת הוצאה
          </Button>
        </div>
      )}

      {/* Add Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">הוצאה חדשה</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">סכום (₪) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">קטגוריה</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="materials">חומרים</SelectItem>
                    <SelectItem value="contractor">קבלן</SelectItem>
                    <SelectItem value="other">אחר</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{formCategory === "contractor" ? "שם קבלן" : "שם ספק"}</Label>
                <Input
                  value={formSupplier}
                  onChange={(e) => setFormSupplier(e.target.value)}
                  placeholder={formCategory === "contractor" ? "שם הקבלן" : "שם החנות / ספק"}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">תאריך</Label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>
            </div>

            {/* Contractor-specific fields */}
            {formCategory === "contractor" && (
              <div className="border border-warning/30 rounded-lg p-4 bg-warning/5 space-y-4">
                <p className="text-sm font-medium flex items-center gap-2 text-warning">
                  <Wrench className="w-4 h-4" /> פרטי קבלן משנה
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <Users className="w-3 h-3" /> כמות עובדים
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={formWorkerCount}
                      onChange={(e) => setFormWorkerCount(e.target.value)}
                      placeholder="1"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" /> ימי עבודה
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      step="0.5"
                      value={formWorkDays}
                      onChange={(e) => setFormWorkDays(e.target.value)}
                      placeholder="1"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">עלות לעובד ליום (₪)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formWorkerCost}
                      onChange={(e) => setFormWorkerCost(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                {formWorkerCount && formWorkDays && formWorkerCost && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      חישוב: {formWorkerCount} עובדים × {formWorkDays} ימים × ₪{parseFloat(formWorkerCost).toLocaleString()} ={" "}
                      <span className="font-bold text-foreground">
                        ₪{(parseInt(formWorkerCount) * parseFloat(formWorkDays) * parseFloat(formWorkerCost)).toLocaleString()}
                      </span>
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1"
                      onClick={() => {
                        const calc = parseInt(formWorkerCount) * parseFloat(formWorkDays) * parseFloat(formWorkerCost);
                        if (!isNaN(calc) && calc > 0) setFormAmount(calc.toString());
                      }}
                    >
                      העבר לסכום
                    </Button>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">הערות קבלן</Label>
                  <Textarea
                    value={formContractorNotes}
                    onChange={(e) => setFormContractorNotes(e.target.value)}
                    placeholder="סוג עבודה, תנאים מיוחדים..."
                    rows={2}
                  />
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">תיאור</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="פירוט ההוצאה..."
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">צירוף קבלה</Label>
              <ReceiptUpload
                customerId={customerId}
                entryId="expense"
                currentPath={formReceiptPath || null}
                onUploaded={(path) => setFormReceiptPath(path)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
                ביטול
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "שומר..." : "שמור"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expenses List */}
      {expenses.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">אין הוצאות רשומות ללקוח זה</p>
      ) : (
        <div className="space-y-2">
          {expenses.map((exp) => (
            <Card key={exp.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${categoryColors[exp.category]}`}>
                      {categoryIcons[exp.category]}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold">₪{Number(exp.amount).toLocaleString()}</span>
                        <Badge variant="outline" className={`text-xs ${categoryColors[exp.category]}`}>
                          {categoryLabels[exp.category]}
                        </Badge>
                        {exp.receipt_path && (
                          <Receipt className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                        {exp.supplier_name && <span>{exp.supplier_name}</span>}
                        {exp.supplier_name && exp.description && <span>·</span>}
                        {exp.description && <span className="truncate max-w-xs">{exp.description}</span>}
                      </div>
                      {exp.category === "contractor" && (exp as any).details && (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          {(exp as any).details.worker_count && (
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" /> {(exp as any).details.worker_count} עובדים
                            </span>
                          )}
                          {(exp as any).details.work_days && (
                            <span className="flex items-center gap-1">
                              <CalendarDays className="w-3 h-3" /> {(exp as any).details.work_days} ימים
                            </span>
                          )}
                          {(exp as any).details.worker_cost && (
                            <span>₪{(exp as any).details.worker_cost}/עובד/יום</span>
                          )}
                          {(exp as any).details.notes && (
                            <span className="truncate max-w-xs">· {(exp as any).details.notes}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {new Date(exp.expense_date).toLocaleDateString("he-IL")}
                    </span>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteId(exp.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת הוצאה</AlertDialogTitle>
            <AlertDialogDescription>האם אתה בטוח שברצונך למחוק הוצאה זו?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
