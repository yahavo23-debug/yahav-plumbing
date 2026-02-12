import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useFinanceTransactions, FinanceTransaction } from "@/hooks/useFinanceTransactions";
import { FinanceTransactionForm } from "@/components/finance/FinanceTransactionForm";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Plus, TrendingUp, TrendingDown, ArrowDownUp, Trash2,
  Pencil, Download, Loader2, FileText, Copy,
} from "lucide-react";
import {
  categoryLabels, paymentMethodLabels, directionLabels,
  docTypeLabels, statusLabels as finStatusLabels, financeCategories,
} from "@/lib/finance-constants";

function getMonthDefault(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function Finance() {
  const { isAdmin, role } = useAuth();
  const canEdit = isAdmin || role === "secretary";

  const [month, setMonth] = useState(getMonthDefault);
  const { transactions, loading, kpis, refresh } = useFinanceTransactions(month);

  const [showForm, setShowForm] = useState(false);
  const [editTxn, setEditTxn] = useState<FinanceTransaction | null>(null);
  const [filterDirection, setFilterDirection] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const filtered = transactions.filter(t => {
    if (filterDirection !== "all" && t.direction !== filterDirection) return false;
    if (filterCategory !== "all" && t.category !== filterCategory) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    return true;
  });

  const handleDelete = async (id: string) => {
    const txn = transactions.find(t => t.id === id);
    if (txn?.doc_path) {
      await supabase.storage.from("finance-docs").remove([txn.doc_path]);
    }
    const { error } = await (supabase as any).from("financial_transactions").delete().eq("id", id);
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "נמחק" });
      refresh();
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke("export-finance", {
        body: { month },
      });
      if (error) throw error;
      if (data?.url) {
        setExportUrl(data.url);
        toast({ title: "הייצוא מוכן", description: "לחץ על העתק קישור או הורד" });
      } else {
        throw new Error("No URL returned");
      }
    } catch (err: any) {
      toast({ title: "שגיאה בייצוא", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const copyExportUrl = () => {
    if (exportUrl) {
      navigator.clipboard.writeText(exportUrl);
      toast({ title: "הקישור הועתק" });
    }
  };

  const monthLabel = (() => {
    const [y, m] = month.split("-").map(Number);
    const months = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
    return `${months[m - 1]} ${y}`;
  })();

  return (
    <AppLayout title="כספים">
      {/* Month selector + Actions */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Input
          type="month"
          value={month}
          onChange={e => { setMonth(e.target.value); setExportUrl(null); }}
          className="w-48"
        />
        <span className="text-sm font-medium text-muted-foreground">{monthLabel}</span>

        <div className="mr-auto flex gap-2">
          {canEdit && (
            <Button onClick={() => { setEditTxn(null); setShowForm(true); }} className="gap-1.5">
              <Plus className="w-4 h-4" /> רשומה חדשה
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" onClick={handleExport} disabled={exporting} className="gap-1.5">
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              ייצוא לרו״ח
            </Button>
          )}
        </div>
      </div>

      {/* Export URL */}
      {exportUrl && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">קובץ הייצוא מוכן להורדה</p>
              <p className="text-xs text-muted-foreground truncate">{exportUrl}</p>
            </div>
            <Button size="sm" variant="outline" onClick={copyExportUrl} className="gap-1.5 shrink-0">
              <Copy className="w-3.5 h-3.5" /> העתק קישור
            </Button>
            <Button size="sm" asChild className="shrink-0">
              <a href={exportUrl} target="_blank" rel="noopener noreferrer">הורד</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">הכנסות</p>
              <p className="text-lg font-bold">₪{kpis.totalIncome.toLocaleString("he-IL", { minimumFractionDigits: 2 })}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">הוצאות</p>
              <p className="text-lg font-bold">₪{kpis.totalExpenses.toLocaleString("he-IL", { minimumFractionDigits: 2 })}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpis.net >= 0 ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
              <ArrowDownUp className={`w-5 h-5 ${kpis.net >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">נטו</p>
              <p className="text-lg font-bold">₪{kpis.net.toLocaleString("he-IL", { minimumFractionDigits: 2 })}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={filterDirection} onValueChange={setFilterDirection}>
          <SelectTrigger className="w-32"><SelectValue placeholder="כיוון" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">הכל</SelectItem>
            <SelectItem value="income">הכנסה</SelectItem>
            <SelectItem value="expense">הוצאה</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40"><SelectValue placeholder="קטגוריה" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">הכל</SelectItem>
            {financeCategories.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32"><SelectValue placeholder="סטטוס" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">הכל</SelectItem>
            <SelectItem value="paid">שולם</SelectItem>
            <SelectItem value="debt">חוב</SelectItem>
            <SelectItem value="credit">זיכוי</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>אין רשומות לחודש זה</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-right px-4 py-3 font-medium">תאריך</th>
                    <th className="text-right px-4 py-3 font-medium">כיוון</th>
                    <th className="text-right px-4 py-3 font-medium">סכום</th>
                    <th className="text-right px-4 py-3 font-medium">קטגוריה</th>
                    <th className="text-right px-4 py-3 font-medium">אמצעי</th>
                    <th className="text-right px-4 py-3 font-medium">שם</th>
                    <th className="text-right px-4 py-3 font-medium">סטטוס</th>
                    <th className="text-right px-4 py-3 font-medium">מסמך</th>
                    {canEdit && <th className="text-right px-4 py-3 font-medium">פעולות</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <tr key={t.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">{new Date(t.txn_date).toLocaleDateString("he-IL")}</td>
                      <td className="px-4 py-3">
                        <Badge variant={t.direction === "income" ? "default" : "destructive"} className="text-xs">
                          {directionLabels[t.direction] || t.direction}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-medium">₪{Number(t.amount).toLocaleString("he-IL", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-muted-foreground">{categoryLabels[t.category || ""] || t.category || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{paymentMethodLabels[t.payment_method || ""] || t.payment_method || "—"}</td>
                      <td className="px-4 py-3">{t.counterparty_name || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">{finStatusLabels[t.status] || t.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {t.doc_path ? (
                          <Badge variant="secondary" className="text-xs">{docTypeLabels[t.doc_type || ""] || "📄"}</Badge>
                        ) : "—"}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditTxn(t); setShowForm(true); }}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>מחיקת רשומה</AlertDialogTitle>
                                  <AlertDialogDescription>האם למחוק רשומה זו? לא ניתן לשחזר.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>ביטול</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(t.id)}>מחק</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form dialog */}
      {showForm && (
        <FinanceTransactionForm
          open={showForm}
          onClose={() => { setShowForm(false); setEditTxn(null); }}
          onSaved={refresh}
          editTransaction={editTxn}
        />
      )}
    </AppLayout>
  );
}
