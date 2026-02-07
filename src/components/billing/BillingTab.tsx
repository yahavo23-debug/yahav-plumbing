import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calendar,
  Lock,
  CreditCard,
  Receipt,
  ArrowDownCircle,
} from "lucide-react";

interface LedgerEntry {
  id: string;
  entry_date: string;
  entry_type: string;
  amount: number;
  description: string | null;
  service_call_id: string | null;
  is_locked: boolean;
  created_at: string;
  created_by: string;
}

interface BillingTabProps {
  customerId: string;
}

const entryTypeConfig: Record<
  string,
  { label: string; icon: typeof Receipt; color: string }
> = {
  charge: {
    label: "חיוב",
    icon: Receipt,
    color: "bg-destructive/10 text-destructive",
  },
  payment: {
    label: "תשלום",
    icon: CreditCard,
    color: "bg-success/10 text-success",
  },
  credit: {
    label: "זיכוי",
    icon: ArrowDownCircle,
    color: "bg-primary/10 text-primary",
  },
};

export function BillingTab({ customerId }: BillingTabProps) {
  const { user, role, isAdmin } = useAuth();
  const isContractor = role === "contractor";
  const canAdd = (isAdmin || role === "secretary" || role === "technician") && !isContractor;
  const canLock = isAdmin;

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formDate, setFormDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [formType, setFormType] = useState<string>("charge");
  const [formAmount, setFormAmount] = useState("");
  const [formDescription, setFormDescription] = useState("");

  const loadEntries = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("customer_ledger")
      .select("*")
      .eq("customer_id", customerId)
      .order("entry_date", { ascending: false });

    if (error) {
      console.error("Load ledger error:", error);
      toast({
        title: "שגיאה",
        description: "לא ניתן לטעון נתוני חשבון",
        variant: "destructive",
      });
    } else {
      setEntries((data as LedgerEntry[]) || []);
    }
    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    if (!user) return;
    loadEntries();
  }, [user, loadEntries]);

  // Calculations
  const totalCharges = entries
    .filter((e) => e.entry_type === "charge")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const totalPayments = entries
    .filter((e) => e.entry_type === "payment")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const totalCredits = entries
    .filter((e) => e.entry_type === "credit")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const balance = totalCharges - totalPayments - totalCredits;

  const lastPayment = entries
    .filter((e) => e.entry_type === "payment")
    .sort(
      (a, b) =>
        new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
    )[0];

  const overdueSince =
    balance > 0
      ? entries
          .filter((e) => e.entry_type === "charge")
          .sort(
            (a, b) =>
              new Date(a.entry_date).getTime() -
              new Date(b.entry_date).getTime()
          )[0]?.entry_date
      : null;

  const handleSubmit = async () => {
    if (!user || !formAmount) return;
    setSaving(true);

    try {
      const { error } = await (supabase as any)
        .from("customer_ledger")
        .insert({
          customer_id: customerId,
          entry_date: formDate,
          entry_type: formType,
          amount: parseFloat(formAmount),
          description: formDescription.trim() || null,
          created_by: user.id,
        });

      if (error) throw error;

      toast({ title: "נשמר", description: "הרשומה נוספה בהצלחה" });
      setShowForm(false);
      resetForm();
      loadEntries();
    } catch (err: any) {
      console.error("Add ledger entry error:", err);
      toast({
        title: "שגיאה",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLock = async (entryId: string) => {
    const { error } = await (supabase as any)
      .from("customer_ledger")
      .update({ is_locked: true })
      .eq("id", entryId);

    if (error) {
      toast({
        title: "שגיאה",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "ננעל", description: "הרשומה ננעלה לעריכה" });
      loadEntries();
    }
  };

  const resetForm = () => {
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormType("charge");
    setFormAmount("");
    setFormDescription("");
  };

  if (loading) {
    return (
      <p className="text-center py-8 text-muted-foreground">טוען...</p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                balance > 0
                  ? "bg-destructive/10"
                  : balance < 0
                  ? "bg-success/10"
                  : "bg-muted"
              }`}
            >
              {balance > 0 ? (
                <TrendingDown className="w-5 h-5 text-destructive" />
              ) : (
                <TrendingUp className="w-5 h-5 text-success" />
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">יתרה</p>
              <p
                className={`text-lg font-bold ${
                  balance > 0
                    ? "text-destructive"
                    : balance < 0
                    ? "text-success"
                    : ""
                }`}
              >
                ₪{Math.abs(balance).toFixed(2)}
                {balance > 0 ? " חוב" : balance < 0 ? " זכות" : ""}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">תשלום אחרון</p>
              <p className="text-sm font-medium">
                {lastPayment
                  ? new Date(lastPayment.entry_date).toLocaleDateString(
                      "he-IL"
                    )
                  : "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                overdueSince ? "bg-warning/10" : "bg-muted"
              }`}
            >
              {overdueSince ? (
                <AlertTriangle className="w-5 h-5 text-warning" />
              ) : (
                <Calendar className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">פיגור מתאריך</p>
              <p className="text-sm font-medium">
                {overdueSince
                  ? new Date(overdueSince).toLocaleDateString("he-IL")
                  : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Entry Button */}
      {canAdd && (
        <div className="flex justify-end">
          <Button
            onClick={() => setShowForm(!showForm)}
            variant={showForm ? "secondary" : "default"}
            size="sm"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />{" "}
            {showForm ? "ביטול" : "הוסף רשומה"}
          </Button>
        </div>
      )}

      {/* Add Entry Form */}
      {showForm && canAdd && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">תאריך</Label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">סוג</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="charge">חיוב</SelectItem>
                    <SelectItem value="payment">תשלום</SelectItem>
                    <SelectItem value="credit">זיכוי</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">סכום (₪)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  dir="ltr"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">תיאור</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
                placeholder="תיאור הפעולה..."
              />
            </div>
            <Button
              onClick={handleSubmit}
              disabled={saving || !formAmount}
              className="h-10"
            >
              {saving ? "שומר..." : "שמור"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Entries List */}
      {entries.length === 0 ? (
        <p className="text-center text-muted-foreground py-6">
          אין רשומות חשבון
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const config =
              entryTypeConfig[entry.entry_type] || entryTypeConfig.charge;
            const Icon = config.icon;
            return (
              <Card key={entry.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${config.color}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-xs ${config.color}`}
                        >
                          {config.label}
                        </Badge>
                        <span className="text-sm font-medium">
                          ₪{Number(entry.amount).toFixed(2)}
                        </span>
                        {entry.is_locked && (
                          <Lock className="w-3 h-3 text-muted-foreground" />
                        )}
                      </div>
                      {!isContractor && entry.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {entry.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.entry_date).toLocaleDateString("he-IL")}
                    </span>
                    {canLock && !entry.is_locked && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleLock(entry.id)}
                        title="נעל רשומה"
                      >
                        <Lock className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
