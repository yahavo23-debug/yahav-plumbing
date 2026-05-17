import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Trash2, Camera, Loader2, Package } from "lucide-react";
import { InventoryImage } from "./InventoryImage";

interface InvItem {
  id: string; name: string; image_path: string | null;
  quantity_in_stock: number; recommended_sale_price: number; purchase_price: number;
}
interface Material {
  id: string; inventory_item_id: string | null; name: string; image_path: string | null;
  quantity: number; purchase_price: number; customer_price: number;
  receipt_path: string | null; is_one_off: boolean; added_to_inventory: boolean;
}

export function MaterialsTab({ serviceCallId, readOnly }: { serviceCallId: string; readOnly?: boolean }) {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [oneOffOpen, setOneOffOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("service_call_materials").select("*")
      .eq("service_call_id", serviceCallId).order("created_at");
    setMaterials((data as any) || []);
    setLoading(false);
  }, [serviceCallId]);
  useEffect(() => { load(); }, [load]);

  async function addInventoryMaterial(item: InvItem, qty: number) {
    if (qty <= 0) return;
    const { error } = await supabase.from("service_call_materials").insert({
      service_call_id: serviceCallId,
      inventory_item_id: item.id,
      name: item.name,
      image_path: item.image_path,
      quantity: qty,
      purchase_price: item.purchase_price,
      customer_price: item.recommended_sale_price,
      is_one_off: false,
      created_by: user!.id,
    });
    if (error) { toast({ title: "שגיאה", description: error.message, variant: "destructive" }); return; }
    toast({ title: `${item.name} נוסף`, description: `המלאי ירד ב-${qty}` });
    load();
  }

  async function removeMaterial(id: string) {
    const { error } = await supabase.from("service_call_materials").delete().eq("id", id);
    if (error) { toast({ title: "שגיאה", variant: "destructive" }); return; }
    toast({ title: "החומר הוסר" });
    load();
  }

  const totalCost = materials.reduce((s, m) => s + Number(m.purchase_price) * Number(m.quantity), 0);
  const totalCustomer = materials.reduce((s, m) => s + Number(m.customer_price) * Number(m.quantity), 0);

  return (
    <div className="space-y-3" dir="rtl">
      {!readOnly && (
        <div className="flex gap-2">
          <Button onClick={() => setPickerOpen(true)} className="flex-1 h-12 gap-2">
            <Package className="w-5 h-5" />הוסף מהמלאי
          </Button>
          <Button onClick={() => setOneOffOpen(true)} variant="outline" className="flex-1 h-12 gap-2">
            <Plus className="w-5 h-5" />מוצר חד-פעמי
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-center text-muted-foreground py-6">טוען...</p>
      ) : materials.length === 0 ? (
        <p className="text-center text-muted-foreground py-6">לא נוספו חומרים</p>
      ) : (
        <div className="space-y-2">
          {materials.map(m => (
            <Card key={m.id}>
              <CardContent className="p-3 flex gap-3 items-center">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                  <InventoryImage path={m.image_path} alt={m.name} className="w-full h-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{m.name}</div>
                  <div className="text-xs text-muted-foreground">
                    כמות: {m.quantity} · ללקוח: ₪{(Number(m.customer_price) * Number(m.quantity)).toFixed(0)}
                    {m.is_one_off && <span className="mr-1 text-primary">· חד-פעמי</span>}
                  </div>
                </div>
                {!readOnly && (
                  <Button size="icon" variant="ghost" onClick={() => removeMaterial(m.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
          <div className="text-sm text-muted-foreground flex justify-between px-2 pt-2 border-t">
            <span>עלות: ₪{totalCost.toFixed(0)}</span>
            <span>סה״כ ללקוח: ₪{totalCustomer.toFixed(0)}</span>
          </div>
        </div>
      )}

      {pickerOpen && (
        <InventoryPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onPick={addInventoryMaterial} />
      )}
      {oneOffOpen && (
        <OneOffDialog open={oneOffOpen} onOpenChange={setOneOffOpen} serviceCallId={serviceCallId} onSaved={load} />
      )}
    </div>
  );
}

function InventoryPickerDialog({
  open, onOpenChange, onPick,
}: { open: boolean; onOpenChange: (v: boolean) => void; onPick: (item: InvItem, qty: number) => void }) {
  const [items, setItems] = useState<InvItem[]>([]);
  const [q, setQ] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});

  useEffect(() => {
    supabase.from("inventory_items").select("id,name,image_path,quantity_in_stock,recommended_sale_price,purchase_price")
      .eq("is_archived", false).order("name").then(({ data }) => setItems((data as any) || []));
  }, []);

  const filtered = items.filter(i => !q || i.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader><DialogTitle>בחר מוצר מהמלאי</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="חיפוש..." value={q} onChange={e => setQ(e.target.value)} className="h-11 pr-10" />
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 -mx-2 px-2">
          {filtered.map(i => {
            const q = qty[i.id] ?? 1;
            return (
              <div key={i.id} className="flex items-center gap-3 p-2 border rounded-lg">
                <div className="w-12 h-12 rounded overflow-hidden bg-muted shrink-0">
                  <InventoryImage path={i.image_path} alt={i.name} className="w-full h-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{i.name}</div>
                  <div className="text-xs text-muted-foreground">במלאי: {i.quantity_in_stock}</div>
                </div>
                <Input type="number" inputMode="decimal" value={q} min={0.1} step={0.1}
                  onChange={e => setQty(s => ({ ...s, [i.id]: Number(e.target.value) }))}
                  className="w-16 h-10" />
                <Button size="sm" className="h-10" onClick={() => { onPick(i, q); onOpenChange(false); }}>
                  הוסף
                </Button>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="text-center text-muted-foreground py-6">אין מוצרים</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OneOffDialog({
  open, onOpenChange, serviceCallId, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; serviceCallId: string; onSaved: () => void }) {
  const { user } = useAuth();
  const imgRef = useRef<HTMLInputElement>(null);
  const receiptRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"img" | "receipt" | null>(null);
  const [form, setForm] = useState({
    name: "", quantity: 1, purchase_price: 0, customer_price: 0,
    image_path: null as string | null, receipt_path: null as string | null,
    add_to_inventory: false,
  });

  async function upload(kind: "img" | "receipt", file: File) {
    setUploading(kind);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const folder = kind === "img" ? "oneoff" : "receipts";
      const path = `${folder}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("inventory").upload(path, file);
      if (error) throw error;
      setForm(f => ({ ...f, [kind === "img" ? "image_path" : "receipt_path"]: path }));
    } catch (e: any) {
      toast({ title: "שגיאה בהעלאה", description: e.message, variant: "destructive" });
    } finally { setUploading(null); }
  }

  async function save() {
    if (!form.name.trim()) { toast({ title: "חסר שם", variant: "destructive" }); return; }
    setSaving(true);
    let newItemId: string | null = null;

    if (form.add_to_inventory) {
      const { data, error } = await supabase.from("inventory_items").insert({
        name: form.name.trim(),
        image_path: form.image_path,
        quantity_in_stock: 0,
        minimum_stock: 0,
        purchase_price: form.purchase_price,
        recommended_sale_price: form.customer_price,
      }).select("id").single();
      if (error) {
        toast({ title: "שגיאה בהוספה למלאי", description: error.message, variant: "destructive" });
        setSaving(false); return;
      }
      newItemId = data.id;
    }

    const { error } = await supabase.from("service_call_materials").insert({
      service_call_id: serviceCallId,
      inventory_item_id: null, // don't decrement stock for one-off purchases
      name: form.name.trim(),
      image_path: form.image_path,
      quantity: form.quantity,
      purchase_price: form.purchase_price,
      customer_price: form.customer_price,
      receipt_path: form.receipt_path,
      is_one_off: true,
      added_to_inventory: !!newItemId,
      created_by: user!.id,
    });
    setSaving(false);
    if (error) { toast({ title: "שגיאה", description: error.message, variant: "destructive" }); return; }
    toast({ title: "נוסף" });
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>מוצר שנקנה במיוחד</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>שם המוצר *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-11" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>כמות</Label>
              <Input type="number" inputMode="decimal" value={form.quantity}
                onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} className="h-11" />
            </div>
            <div>
              <Label>עלות ₪</Label>
              <Input type="number" inputMode="decimal" value={form.purchase_price}
                onChange={e => setForm({ ...form, purchase_price: Number(e.target.value) })} className="h-11" />
            </div>
            <div>
              <Label>ללקוח ₪</Label>
              <Input type="number" inputMode="decimal" value={form.customer_price}
                onChange={e => setForm({ ...form, customer_price: Number(e.target.value) })} className="h-11" />
            </div>
          </div>

          <div className="flex gap-2">
            <input ref={imgRef} type="file" accept="image/*" capture="environment" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) upload("img", f); }} />
            <Button type="button" variant="outline" className="flex-1 h-11" onClick={() => imgRef.current?.click()} disabled={uploading === "img"}>
              {uploading === "img" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              {form.image_path ? "תמונה הוטענה" : "תמונה"}
            </Button>
            <input ref={receiptRef} type="file" accept="image/*,application/pdf" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) upload("receipt", f); }} />
            <Button type="button" variant="outline" className="flex-1 h-11" onClick={() => receiptRef.current?.click()} disabled={uploading === "receipt"}>
              {uploading === "receipt" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              {form.receipt_path ? "קבלה הוטענה" : "קבלה"}
            </Button>
          </div>

          <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer">
            <Checkbox checked={form.add_to_inventory} onCheckedChange={v => setForm({ ...form, add_to_inventory: !!v })} />
            <span className="text-sm">הוסף גם למלאי הקבוע</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={save} disabled={saving}>{saving ? "שומר..." : "שמור"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
