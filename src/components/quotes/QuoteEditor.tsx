import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, X } from "lucide-react";

const VAT_RATE = 0.18;

interface QuoteItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  sort_order: number;
}

interface QuoteEditorProps {
  serviceCallId: string;
  quoteId?: string;
  onSaved: () => void;
  onCancel: () => void;
}

export const QuoteEditor = ({ serviceCallId, quoteId, onSaved, onCancel }: QuoteEditorProps) => {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [items, setItems] = useState<QuoteItem[]>([
    { description: "", quantity: 1, unit_price: 0, sort_order: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!quoteId);

  useEffect(() => {
    if (quoteId) loadQuote();
  }, [quoteId]);

  const loadQuote = async () => {
    const [quoteRes, itemsRes] = await Promise.all([
      supabase.from("quotes").select("*").eq("id", quoteId!).single(),
      supabase.from("quote_items").select("*").eq("quote_id", quoteId!).order("sort_order"),
    ]);

    if (quoteRes.data) {
      const q = quoteRes.data as any;
      setTitle(q.title || "");
      setNotes(q.notes || "");
      setValidUntil(q.valid_until || "");
      setDiscountPercent(Number(q.discount_percent) || 0);
    }
    if (itemsRes.data && itemsRes.data.length > 0) {
      setItems(
        (itemsRes.data as any[]).map((item) => ({
          id: item.id,
          description: item.description,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          sort_order: item.sort_order,
        }))
      );
    }
    setLoading(false);
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { description: "", quantity: 1, unit_price: 0, sort_order: prev.length },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof QuoteItem, value: string | number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  // Calculations
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );
  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const vatAmount = afterDiscount * VAT_RATE;
  const totalWithVat = afterDiscount + vatAmount;

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      let finalQuoteId = quoteId;

      if (quoteId) {
        const { error } = await supabase
          .from("quotes")
          .update({
            title: title.trim() || "הצעת מחיר",
            notes: notes.trim() || null,
            valid_until: validUntil || null,
            discount_percent: discountPercent,
          } as any)
          .eq("id", quoteId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("quotes")
          .insert({
            service_call_id: serviceCallId,
            title: title.trim() || "הצעת מחיר",
            notes: notes.trim() || null,
            valid_until: validUntil || null,
            discount_percent: discountPercent,
            created_by: user.id,
          } as any)
          .select()
          .single();
        if (error) throw error;
        finalQuoteId = (data as any).id;
      }

      // Delete existing items and re-insert
      if (quoteId) {
        await supabase.from("quote_items").delete().eq("quote_id", quoteId);
      }

      const validItems = items.filter((item) => item.description.trim());
      if (validItems.length > 0) {
        const { error: itemsError } = await supabase.from("quote_items").insert(
          validItems.map((item, i) => ({
            quote_id: finalQuoteId,
            description: item.description.trim(),
            quantity: item.quantity,
            unit_price: item.unit_price,
            sort_order: i,
          })) as any
        );
        if (itemsError) throw itemsError;
      }

      toast({ title: "נשמר", description: "הצעת המחיר נשמרה בהצלחה" });
      onSaved();
    } catch (err: any) {
      console.error("Save quote error:", err);
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-center py-4 text-muted-foreground">טוען...</p>;

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">
          {quoteId ? "עריכת הצעת מחיר" : "הצעת מחיר חדשה"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground">כותרת</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="הצעת מחיר"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">בתוקף עד</Label>
            <Input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
        </div>

        {/* Line items */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">פריטים</Label>
          <div className="rounded-md border">
            {/* Header */}
            <div className="grid grid-cols-[1fr_80px_100px_80px_40px] gap-2 p-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
              <span>תיאור</span>
              <span>כמות</span>
              <span>מחיר יחידה</span>
              <span>סה"כ</span>
              <span />
            </div>
            {items.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-[1fr_80px_100px_80px_40px] gap-2 p-2 items-center border-b last:border-b-0"
              >
                <Input
                  value={item.description}
                  onChange={(e) => updateItem(index, "description", e.target.value)}
                  placeholder="תיאור הפריט..."
                  className="h-9"
                />
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.quantity}
                  onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                  className="h-9"
                />
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.unit_price}
                  onChange={(e) => updateItem(index, "unit_price", Number(e.target.value))}
                  className="h-9"
                />
                <span className="text-sm font-medium text-center">
                  ₪{(item.quantity * item.unit_price).toFixed(2)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => removeItem(index)}
                  disabled={items.length <= 1}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={addItem} className="gap-1">
            <Plus className="w-3.5 h-3.5" /> הוסף פריט
          </Button>
        </div>

        {/* Totals summary */}
        <div className="rounded-md border bg-muted/20 divide-y">
          {/* Subtotal */}
          <div className="flex justify-between items-center px-4 py-2.5">
            <span className="text-sm text-muted-foreground">סה"כ לפני מע"מ</span>
            <span className="text-sm font-medium">₪{subtotal.toFixed(2)}</span>
          </div>

          {/* Discount */}
          <div className="flex justify-between items-center px-4 py-2.5 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">הנחה</span>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                  className="h-8 w-20 text-center"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            {discountAmount > 0 && (
              <span className="text-sm font-medium text-destructive">-₪{discountAmount.toFixed(2)}</span>
            )}
          </div>

          {/* After discount (only show if discount applied) */}
          {discountPercent > 0 && (
            <div className="flex justify-between items-center px-4 py-2.5">
              <span className="text-sm text-muted-foreground">לאחר הנחה</span>
              <span className="text-sm font-medium">₪{afterDiscount.toFixed(2)}</span>
            </div>
          )}

          {/* VAT */}
          <div className="flex justify-between items-center px-4 py-2.5">
            <span className="text-sm text-muted-foreground">מע"מ (18%)</span>
            <span className="text-sm font-medium">₪{vatAmount.toFixed(2)}</span>
          </div>

          {/* Total with VAT */}
          <div className="flex justify-between items-center px-4 py-3 bg-muted/40">
            <span className="font-semibold">סה"כ כולל מע"מ</span>
            <span className="text-lg font-bold">₪{totalWithVat.toFixed(2)}</span>
          </div>
        </div>

        {/* Notes */}
        <div>
          <Label className="text-xs text-muted-foreground">הערות</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="הערות להצעה..."
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" /> {saving ? "שומר..." : "שמור"}
          </Button>
          <Button variant="outline" onClick={onCancel} className="gap-2">
            <X className="w-4 h-4" /> ביטול
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
