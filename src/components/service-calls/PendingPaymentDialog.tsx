import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Trash2, Package, FileDown, Loader2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface ChargeItem { id: string; description: string; amount: string; }
interface MaterialItem { id: string; inventory_item_id: string; name: string; purchase_price: number; customer_price: number; quantity: number; }
interface InvItem { id: string; name: string; quantity_in_stock: number; recommended_sale_price: number; purchase_price: number; }

interface Props {
  open: boolean;
  onClose: () => void;
  serviceCall: any;
  onSuccess: () => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function PendingPaymentDialog({ open, onClose, serviceCall, onSuccess }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const customerId = serviceCall?.customer_id;
  const customerName = serviceCall?.customers?.name || "";

  const [workSummary, setWorkSummary] = useState("");
  const [charges, setCharges] = useState<ChargeItem[]>([{ id: uid(), description: "עבודה", amount: "" }]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [inventory, setInventory] = useState<InvItem[]>([]);
  const [matPickerOpen, setMatPickerOpen] = useState(false);
  const [openReport, setOpenReport] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWorkSummary(serviceCall?.job_type ? `שירות: ${serviceCall.job_type}` : "");
    setCharges([{ id: uid(), description: "עבודה", amount: "" }]);
    setMaterials([]);
    (async () => {
      const { data } = await supabase
        .from("inventory_items")
        .select("id,name,quantity_in_stock,recommended_sale_price,purchase_price")
        .order("name");
      setInventory((data as any) || []);
    })();
  }, [open, serviceCall]);

  const chargesTotal = charges.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const materialsTotal = materials.reduce((s, m) => s + Number(m.customer_price) * Number(m.quantity), 0);
  const grandTotal = chargesTotal + materialsTotal;

  const updateCharge = (id: string, patch: Partial<ChargeItem>) =>
    setCharges(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  const removeCharge = (id: string) => setCharges(prev => prev.filter(c => c.id !== id));
  const addCharge = () => setCharges(prev => [...prev, { id: uid(), description: "", amount: "" }]);

  const addMaterial = (inv: InvItem) => {
    setMaterials(prev => [...prev, {
      id: uid(),
      inventory_item_id: inv.id,
      name: inv.name,
      purchase_price: Number(inv.purchase_price) || 0,
      customer_price: Number(inv.recommended_sale_price) || 0,
      quantity: 1,
    }]);
    setMatPickerOpen(false);
  };
  const updateMaterial = (id: string, patch: Partial<MaterialItem>) =>
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  const removeMaterial = (id: string) => setMaterials(prev => prev.filter(m => m.id !== id));

  const handleSubmit = async () => {
    if (!user || !serviceCall) return;
    if (!workSummary.trim()) {
      toast({ title: "חסר תיאור", description: "פרט מה בוצע בעבודה", variant: "destructive" });
      return;
    }
    if (grandTotal <= 0) {
      toast({ title: "סכום ריק", description: "יש להזין לפחות חיוב אחד", variant: "destructive" });
      return;
    }
    const validCharges = charges.filter(c => (parseFloat(c.amount) || 0) > 0 && c.description.trim());
    if (validCharges.length === 0 && materials.length === 0) {
      toast({ title: "פירוט חסר", description: "יש להזין לפחות פריט אחד עם תיאור וסכום", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      // 1) Insert materials into service_call_materials
      for (const m of materials) {
        const { error } = await supabase.from("service_call_materials").insert({
          service_call_id: serviceCall.id,
          inventory_item_id: m.inventory_item_id,
          name: m.name,
          quantity: m.quantity,
          purchase_price: m.purchase_price,
          customer_price: m.customer_price,
          is_one_off: false,
          created_by: user.id,
        });
        if (error) throw error;
      }

      // 2) Build detailed description
      const lines: string[] = [];
      lines.push(`בוצע: ${workSummary.trim()}`);
      if (validCharges.length) {
        lines.push("");
        lines.push("פירוט חיובים:");
        validCharges.forEach(c => lines.push(`• ${c.description.trim()} — ₪${(parseFloat(c.amount) || 0).toFixed(2)}`));
      }
      if (materials.length) {
        lines.push("");
        lines.push("חומרים:");
        materials.forEach(m => lines.push(`• ${m.name} x${m.quantity} — ₪${(m.customer_price * m.quantity).toFixed(2)}`));
      }
      lines.push("");
      lines.push(`סה"כ: ₪${grandTotal.toFixed(2)}`);
      const description = lines.join("\n");

      // 3) Insert single ledger charge
      const { error: ledgerErr } = await (supabase as any).from("customer_ledger").insert({
        customer_id: customerId,
        service_call_id: serviceCall.id,
        entry_date: new Date().toISOString().slice(0, 10),
        entry_type: "charge",
        amount: grandTotal,
        description,
        created_by: user.id,
      });
      if (ledgerErr) throw ledgerErr;

      // 4) Update service call status
      const { error: callErr } = await supabase
        .from("service_calls")
        .update({ status: "awaiting_payment", pending_payment_at: new Date().toISOString() } as any)
        .eq("id", serviceCall.id);
      if (callErr) throw callErr;

      toast({ title: "✅ נשמר", description: `הקריאה סומנה כממתינה לתשלום (₪${grandTotal.toFixed(2)})` });
      onSuccess();
      onClose();

      if (openReport && customerId) {
        navigate(`/customers/${customerId}?tab=billing&autoPdf=1`);
      }
    } catch (err: any) {
      console.error("PendingPayment error:", err);
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-rose-600" />
            בוצע — ממתין לתשלום · {customerName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Work summary */}
          <div>
            <Label>מה בוצע *</Label>
            <Textarea
              value={workSummary}
              onChange={(e) => setWorkSummary(e.target.value)}
              placeholder="פרט בקצרה מה בוצע בעבודה..."
              rows={2}
              className="mt-1"
            />
          </div>

          {/* Charges breakdown */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>פירוט חיובים</Label>
              <Button type="button" variant="outline" size="sm" onClick={addCharge} className="gap-1">
                <Plus className="w-4 h-4" /> הוסף שורה
              </Button>
            </div>
            <div className="space-y-2">
              {charges.map((c) => (
                <div key={c.id} className="flex gap-2 items-start">
                  <Input
                    value={c.description}
                    onChange={(e) => updateCharge(c.id, { description: e.target.value })}
                    placeholder="תיאור (למשל: שעת עבודה)"
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={c.amount}
                    onChange={(e) => updateCharge(c.id, { amount: e.target.value })}
                    placeholder="₪"
                    className="w-28"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeCharge(c.id)} disabled={charges.length === 1}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Materials */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>חומרים מהמחסן</Label>
              <Popover open={matPickerOpen} onOpenChange={setMatPickerOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-1">
                    <Package className="w-4 h-4" /> בחר חומר
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <Command>
                    <CommandInput placeholder="חפש מוצר..." />
                    <CommandList>
                      <CommandEmpty>לא נמצא</CommandEmpty>
                      <CommandGroup>
                        {inventory.map((i) => (
                          <CommandItem key={i.id} onSelect={() => addMaterial(i)}>
                            <div className="flex flex-col w-full">
                              <span className="font-medium">{i.name}</span>
                              <span className="text-xs text-muted-foreground">
                                במלאי: {i.quantity_in_stock} · מחיר ללקוח: ₪{i.recommended_sale_price}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            {materials.length === 0 ? (
              <p className="text-xs text-muted-foreground">לא נבחרו חומרים</p>
            ) : (
              <div className="space-y-2">
                {materials.map((m) => (
                  <Card key={m.id} className="p-3 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground">סה״כ: ₪{(m.customer_price * m.quantity).toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Label className="text-xs">כמות</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={m.quantity}
                        onChange={(e) => updateMaterial(m.id, { quantity: Number(e.target.value) || 0 })}
                        className="w-16 h-9"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Label className="text-xs">מחיר</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={m.customer_price}
                        onChange={(e) => updateMaterial(m.id, { customer_price: Number(e.target.value) || 0 })}
                        className="w-20 h-9"
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeMaterial(m.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Total */}
          <Card className="p-4 bg-rose-50 border-rose-200 dark:bg-rose-900/10 dark:border-rose-900/40">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">סה״כ חוב ללקוח</p>
                <p className="text-3xl font-bold text-rose-700 dark:text-rose-400">₪{grandTotal.toFixed(2)}</p>
              </div>
              <div className="text-xs text-muted-foreground text-left">
                <p>חיובים: ₪{chargesTotal.toFixed(2)}</p>
                <p>חומרים: ₪{materialsTotal.toFixed(2)}</p>
              </div>
            </div>
          </Card>

          {/* Auto-open report */}
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={openReport} onCheckedChange={(v) => setOpenReport(!!v)} />
            <span className="text-sm">פתח דוח גביה להפקה מיד לאחר השמירה</span>
            <FileDown className="w-4 h-4 text-muted-foreground" />
          </label>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={submitting}>ביטול</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2 bg-rose-600 hover:bg-rose-700">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> שומר...</> : <><Wallet className="w-4 h-4" /> שמור והעבר לחוב</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
