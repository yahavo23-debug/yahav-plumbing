import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { FinanceDocUpload } from "./FinanceDocUpload";
import { financeCategories, financePaymentMethods } from "@/lib/finance-constants";
import type { FinanceTransaction } from "@/hooks/useFinanceTransactions";
import { Loader2, Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";


interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editTransaction?: FinanceTransaction | null;
}

export function FinanceTransactionForm({ open, onClose, onSaved, editTransaction }: Props) {
  const { user } = useAuth();
  const isEdit = !!editTransaction;

  const [txnDate, setTxnDate] = useState(editTransaction?.txn_date || new Date().toISOString().split("T")[0]);
  const [direction, setDirection] = useState<string>(editTransaction?.direction || "expense");
  const [amount, setAmount] = useState(editTransaction ? String(editTransaction.amount) : "");
  const [category, setCategory] = useState(editTransaction?.category || "");
  const [customCategory, setCustomCategory] = useState(
    editTransaction?.category && !financeCategories.some(c => c.value === editTransaction.category)
      ? editTransaction.category : ""
  );
  const [paymentMethod, setPaymentMethod] = useState(editTransaction?.payment_method || "");
  const [counterpartyName, setCounterpartyName] = useState(editTransaction?.counterparty_name || "");
  const [notes, setNotes] = useState(editTransaction?.notes || "");
  const [docType, setDocType] = useState(editTransaction?.doc_type || "receipt");
  const [docPath, setDocPath] = useState<string | null>(editTransaction?.doc_path || null);
  const [status, setStatus] = useState(editTransaction?.status || "paid");
  const [customerId, setCustomerId] = useState<string | null>(editTransaction?.customer_id || null);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (supabase as any)
      .from("customers")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data }: any) => {
        if (Array.isArray(data)) setCustomers(data);
      });
  }, [open]);


  const handleSubmit = async () => {
    if (!user || !amount || !direction) return;
    setSaving(true);

    try {
      const payload = {
        txn_date: txnDate,
        direction,
        amount: parseFloat(amount),
        category: category === "other_custom" ? (customCategory.trim() || "אחר") : (category || null),
        payment_method: paymentMethod || null,
        counterparty_name: counterpartyName.trim() || null,
        customer_id: direction === "income" ? customerId : null,
        notes: notes.trim() || null,
        doc_type: docType || null,
        doc_path: docPath,
        status,
      };


      if (isEdit) {
        const { error } = await (supabase as any)
          .from("financial_transactions")
          .update(payload)
          .eq("id", editTransaction!.id);
        if (error) throw error;
        toast({ title: "עודכן", description: "הרשומה עודכנה בהצלחה" });
      } else {
        const { error } = await (supabase as any)
          .from("financial_transactions")
          .insert({ ...payload, created_by: user.id });
        if (error) throw error;
        toast({ title: "נשמר", description: "הרשומה נוספה בהצלחה" });
      }

      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[96vw] sm:max-w-lg max-h-[92vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          <DialogTitle>{isEdit ? "עריכת רשומה" : "רשומה חדשה"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Direction */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={direction === "income" ? "default" : "outline"}
              onClick={() => setDirection("income")}
              className="w-full h-12 text-base"
            >
              הכנסה
            </Button>
            <Button
              type="button"
              variant={direction === "expense" ? "default" : "outline"}
              onClick={() => setDirection("expense")}
              className="w-full h-12 text-base"
            >
              הוצאה
            </Button>
          </div>


          {/* Date + Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>תאריך</Label>
              <Input type="date" value={txnDate} onChange={e => setTxnDate(e.target.value)} />
            </div>
            <div>
              <Label>סכום (₪)</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          {/* Category */}
          <div>
            <Label>קטגוריה</Label>
            <Select value={category} onValueChange={(v) => { setCategory(v); if (v !== "other_custom") setCustomCategory(""); }}>
              <SelectTrigger><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
              <SelectContent>
                {financeCategories.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
                <SelectItem value="other_custom">אחר (טקסט חופשי)</SelectItem>
              </SelectContent>
            </Select>
            {category === "other_custom" && (
              <Input
                className="mt-2"
                value={customCategory}
                onChange={e => setCustomCategory(e.target.value)}
                placeholder="הקלד קטגוריה..."
                maxLength={100}
              />
            )}
          </div>

          {/* Payment method */}
          <div>
            <Label>אמצעי תשלום</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
              <SelectContent>
                {financePaymentMethods.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div>
            <Label>סטטוס</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">שולם</SelectItem>
                <SelectItem value="debt">חוב</SelectItem>
                <SelectItem value="credit">זיכוי</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Customer picker (income only) */}
          {direction === "income" && (
            <div>
              <Label>לקוח</Label>
              <div className="flex gap-2">
                <Popover open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className={cn("flex-1 justify-between", !customerId && "text-muted-foreground")}
                    >
                      {customerId
                        ? customers.find(c => c.id === customerId)?.name || "לקוח"
                        : "בחר לקוח (אופציונלי)"}
                      <ChevronsUpDown className="ms-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-popover" align="start">
                    <Command>
                      <CommandInput placeholder="חפש לקוח..." />
                      <CommandList>
                        <CommandEmpty>לא נמצאו לקוחות</CommandEmpty>
                        <CommandGroup>
                          {customers.map(c => (
                            <CommandItem
                              key={c.id}
                              value={c.name}
                              onSelect={() => {
                                setCustomerId(c.id);
                                if (!counterpartyName.trim()) setCounterpartyName(c.name);
                                setCustomerPickerOpen(false);
                              }}
                            >
                              <Check className={cn("ms-2 h-4 w-4", customerId === c.id ? "opacity-100" : "opacity-0")} />
                              {c.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {customerId && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => setCustomerId(null)} title="נקה">
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Counterparty */}
          <div>
            <Label>{direction === "income" ? "שם משלם (חופשי)" : "שם ספק"}</Label>
            <Input value={counterpartyName} onChange={e => setCounterpartyName(e.target.value)} placeholder="אופציונלי" />
          </div>


          {/* Notes */}
          <div>
            <Label>הערות</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="אופציונלי" />
          </div>

          {/* Doc type + upload */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <Label>סוג מסמך</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receipt">קבלה</SelectItem>
                  <SelectItem value="supplier_invoice">חשבונית ספק</SelectItem>
                  <SelectItem value="other">אחר</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <FinanceDocUpload
              currentPath={docPath}
              onUploaded={setDocPath}
              onRemoved={() => setDocPath(null)}
            />
          </div>

          <Button onClick={handleSubmit} disabled={saving || !amount} className="w-full">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {isEdit ? "עדכן" : "שמור"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
