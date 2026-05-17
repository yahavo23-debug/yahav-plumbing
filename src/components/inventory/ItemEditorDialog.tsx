import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Camera, ImageIcon, Loader2 } from "lucide-react";
import { InventoryImage } from "./InventoryImage";

export interface InventoryItemRow {
  id: string;
  name: string;
  category_id: string | null;
  image_path: string | null;
  quantity_in_stock: number;
  minimum_stock: number;
  purchase_price: number;
  recommended_sale_price: number;
  notes: string | null;
}
export interface CategoryRow { id: string; name: string; color: string }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: InventoryItemRow | null;
  categories: CategoryRow[];
  onSaved: () => void;
}

export function ItemEditorDialog({ open, onOpenChange, item, categories, onSaved }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: "", category_id: "", image_path: null as string | null,
    quantity_in_stock: 0, minimum_stock: 0, purchase_price: 0, recommended_sale_price: 0, notes: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: item?.name ?? "",
        category_id: item?.category_id ?? "",
        image_path: item?.image_path ?? null,
        quantity_in_stock: item?.quantity_in_stock ?? 0,
        minimum_stock: item?.minimum_stock ?? 0,
        purchase_price: item?.purchase_price ?? 0,
        recommended_sale_price: item?.recommended_sale_price ?? 0,
        notes: item?.notes ?? "",
      });
    }
  }, [open, item]);

  async function pickImage(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `items/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("inventory").upload(path, file, { upsert: false });
      if (error) throw error;
      setForm(f => ({ ...f, image_path: path }));
    } catch (e: any) {
      toast({ title: "שגיאה בהעלאת תמונה", description: e.message, variant: "destructive" });
    } finally { setUploading(false); }
  }

  async function save() {
    if (!form.name.trim()) {
      toast({ title: "חסר שם מוצר", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      category_id: form.category_id || null,
      image_path: form.image_path,
      quantity_in_stock: Number(form.quantity_in_stock) || 0,
      minimum_stock: Number(form.minimum_stock) || 0,
      purchase_price: Number(form.purchase_price) || 0,
      recommended_sale_price: Number(form.recommended_sale_price) || 0,
      notes: form.notes.trim() || null,
    };
    const { error } = item
      ? await supabase.from("inventory_items").update(payload).eq("id", item.id)
      : await supabase.from("inventory_items").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "שגיאה בשמירה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: item ? "המוצר עודכן" : "המוצר נוסף" });
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "עריכת מוצר" : "מוצר חדש"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-32 h-32 rounded-xl overflow-hidden border">
              <InventoryImage path={form.image_path} alt="" className="w-full h-full" />
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) pickImage(f); }} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) pickImage(f); }} />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => cameraRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                מצלמה
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <ImageIcon className="w-4 h-4" />
                גלריה
              </Button>
            </div>
          </div>

          <div>
            <Label>שם מוצר *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-11" />
          </div>

          <div>
            <Label>קטגוריה</Label>
            <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
              <SelectTrigger className="h-11"><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>במלאי</Label>
              <Input type="number" inputMode="decimal" value={form.quantity_in_stock}
                onChange={e => setForm({ ...form, quantity_in_stock: Number(e.target.value) })} className="h-11" />
            </div>
            <div>
              <Label>מינימום</Label>
              <Input type="number" inputMode="decimal" value={form.minimum_stock}
                onChange={e => setForm({ ...form, minimum_stock: Number(e.target.value) })} className="h-11" />
            </div>
            <div>
              <Label>מחיר קנייה ₪</Label>
              <Input type="number" inputMode="decimal" value={form.purchase_price}
                onChange={e => setForm({ ...form, purchase_price: Number(e.target.value) })} className="h-11" />
            </div>
            <div>
              <Label>מחיר ללקוח ₪</Label>
              <Input type="number" inputMode="decimal" value={form.recommended_sale_price}
                onChange={e => setForm({ ...form, recommended_sale_price: Number(e.target.value) })} className="h-11" />
            </div>
          </div>

          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={save} disabled={saving}>{saving ? "שומר..." : "שמור"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
