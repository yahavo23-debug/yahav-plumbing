import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Plus, Search, AlertTriangle, TrendingUp, Package2, Edit, Trash2, Check, ShoppingCart, Minus, Flame, Trophy, Medal } from "lucide-react";
import { InventoryImage } from "@/components/inventory/InventoryImage";
import { ItemEditorDialog, InventoryItemRow, CategoryRow } from "@/components/inventory/ItemEditorDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function InventoryPage() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<InventoryItemRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");
  const [editing, setEditing] = useState<InventoryItemRow | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [usageStats, setUsageStats] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: its }, { data: cats }, { data: mv }] = await Promise.all([
      supabase.from("inventory_items").select("*").eq("is_archived", false).order("name"),
      supabase.from("inventory_categories").select("id,name,color").order("sort_order"),
      supabase.from("inventory_movements").select("inventory_item_id, quantity, movement_type").eq("movement_type", "use"),
    ]);
    setItems((its as any) || []);
    setCategories((cats as any) || []);
    const stats: Record<string, number> = {};
    (mv || []).forEach((m: any) => { stats[m.inventory_item_id] = (stats[m.inventory_item_id] || 0) + Number(m.quantity); });
    setUsageStats(stats);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(i =>
      (activeCat === "all" || i.category_id === activeCat) &&
      (!q || i.name.toLowerCase().includes(q))
    );
  }, [items, query, activeCat]);

  const lowStock = items.filter(i => i.quantity_in_stock <= i.minimum_stock);
  const topUsed = [...items]
    .map(i => ({ item: i, used: usageStats[i.id] || 0 }))
    .filter(x => x.used > 0)
    .sort((a, b) => b.used - a.used)
    .slice(0, 5);

  function openNew() { setEditing(null); setEditorOpen(true); }
  function openEdit(i: InventoryItemRow) { setEditing(i); setEditorOpen(true); }

  async function confirmDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from("inventory_items").update({ is_archived: true }).eq("id", deleteId);
    setDeleteId(null);
    if (error) { toast({ title: "שגיאה במחיקה", description: error.message, variant: "destructive" }); return; }
    toast({ title: "המוצר הוסר" });
    load();
  }

  return (
    <AppLayout title="מחסן">
      <div className="space-y-4 max-w-6xl mx-auto" dir="rtl">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-4 flex items-center gap-3">
            <Package2 className="w-8 h-8 text-primary shrink-0" />
            <div><div className="text-2xl font-bold">{items.length}</div><div className="text-xs text-muted-foreground">מוצרים</div></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className={`w-8 h-8 shrink-0 ${lowStock.length > 0 ? "text-warning" : "text-muted-foreground"}`} />
            <div><div className="text-2xl font-bold">{lowStock.length}</div><div className="text-xs text-muted-foreground">לקנייה</div></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-success shrink-0" />
            <div><div className="text-2xl font-bold">{Object.values(usageStats).reduce((a, b) => a + b, 0)}</div><div className="text-xs text-muted-foreground">שימושים</div></div>
          </CardContent></Card>
        </div>

        {/* Search + Add */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="חיפוש מוצר..." value={query} onChange={e => setQuery(e.target.value)} className="h-12 pr-10" />
          </div>
          {isAdmin && (
            <Button onClick={openNew} className="h-12 px-4 gap-2"><Plus className="w-5 h-5" />מוצר</Button>
          )}
        </div>

        <Tabs value={activeCat} onValueChange={setActiveCat} dir="rtl">
          <TabsList className="h-11 w-full justify-start overflow-x-auto">
            <TabsTrigger value="all" className="h-9 px-4">הכל ({items.length})</TabsTrigger>
            {lowStock.length > 0 && (
              <TabsTrigger value="__low" className="h-9 px-4 text-warning">
                <AlertTriangle className="w-4 h-4 ml-1" />רשימת קנייה ({lowStock.length})
              </TabsTrigger>
            )}
            {categories.map(c => {
              const count = items.filter(i => i.category_id === c.id).length;
              if (count === 0) return null;
              return <TabsTrigger key={c.id} value={c.id} className="h-9 px-4">{c.name} ({count})</TabsTrigger>;
            })}
          </TabsList>

          <TabsContent value="__low" className="mt-4">
            <PurchaseList items={lowStock} categories={categories} onDone={load} />
          </TabsContent>
          <TabsContent value={activeCat} className="mt-4">
            {loading ? (
              <p className="text-center text-muted-foreground py-8">טוען...</p>
            ) : filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">אין מוצרים</p>
            ) : (
              <ItemGrid items={filtered} categories={categories} usage={usageStats} onEdit={openEdit} onDelete={isAdmin ? setDeleteId : undefined} />
            )}
          </TabsContent>
        </Tabs>

        {topUsed.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4" />הכי בשימוש</h3>
              <div className="space-y-2">
                {topUsed.map(({ item, used }) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span>{item.name}</span>
                    <Badge variant="secondary">{used} פעמים</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <ItemEditorDialog open={editorOpen} onOpenChange={setEditorOpen} item={editing} categories={categories} onSaved={load} />

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק מוצר?</AlertDialogTitle>
            <AlertDialogDescription>המוצר יוסר מהמחסן (שימושים קודמים יישמרו).</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function ItemGrid({
  items, categories, usage, onEdit, onDelete,
}: {
  items: InventoryItemRow[];
  categories: CategoryRow[];
  usage: Record<string, number>;
  onEdit: (i: InventoryItemRow) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map(i => {
        const cat = categories.find(c => c.id === i.category_id);
        const low = i.quantity_in_stock <= i.minimum_stock;
        return (
          <Card key={i.id} className={low ? "border-warning/60" : ""}>
            <CardContent className="p-3 space-y-2">
              <div className="aspect-square w-full rounded-lg overflow-hidden bg-muted">
                <InventoryImage path={i.image_path} alt={i.name} className="w-full h-full" />
              </div>
              <div>
                <h4 className="font-semibold text-sm leading-tight line-clamp-2 min-h-[2.5rem]">{i.name}</h4>
                {cat && <span className="inline-block text-[10px] px-2 py-0.5 rounded-full mt-1" style={{ background: cat.color + "22", color: cat.color }}>{cat.name}</span>}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className={`font-bold text-base ${low ? "text-warning" : ""}`}>{i.quantity_in_stock}</span>
                <span className="text-muted-foreground">מינ׳ {i.minimum_stock}</span>
              </div>
              {i.recommended_sale_price > 0 && (
                <div className="text-xs text-muted-foreground">₪{i.recommended_sale_price} ללקוח</div>
              )}
              {usage[i.id] > 0 && <div className="text-[10px] text-muted-foreground">{usage[i.id]} שימושים</div>}
              <div className="flex gap-1 pt-1">
                <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => onEdit(i)}>
                  <Edit className="w-3.5 h-3.5" />
                </Button>
                {onDelete && (
                  <Button size="sm" variant="outline" className="h-8" onClick={() => onDelete(i.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PurchaseList({
  items, categories, onDone,
}: {
  items: InventoryItemRow[];
  categories: CategoryRow[];
  onDone: () => void;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  if (items.length === 0) {
    return <p className="text-center text-muted-foreground py-8">אין מוצרים שצריך לקנות</p>;
  }

  function toggle(id: string) {
    setCart(c => {
      const next = { ...c };
      if (next[id]) delete next[id]; else next[id] = 1;
      return next;
    });
  }
  function setQty(id: string, q: number) {
    if (q < 1) { const n = { ...cart }; delete n[id]; setCart(n); return; }
    setCart(c => ({ ...c, [id]: q }));
  }

  const totalItems = Object.keys(cart).length;
  const totalUnits = Object.values(cart).reduce((a, b) => a + b, 0);

  async function confirmPurchase() {
    setSaving(true);
    const entries = Object.entries(cart);
    let ok = 0;
    for (const [id, qty] of entries) {
      const item = items.find(i => i.id === id);
      if (!item) continue;
      const { error: upErr } = await supabase
        .from("inventory_items")
        .update({ quantity_in_stock: Number(item.quantity_in_stock) + qty })
        .eq("id", id);
      if (upErr) continue;
      await supabase.from("inventory_movements").insert({
        inventory_item_id: id, movement_type: "restock", quantity: qty,
      });
      ok++;
    }
    setSaving(false);
    setCart({});
    toast({ title: `עודכנו ${ok} מוצרים במלאי` });
    onDone();
  }

  return (
    <div className="space-y-3 pb-24">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map(i => {
          const cat = categories.find(c => c.id === i.category_id);
          const inCart = cart[i.id];
          const qty = inCart || 0;
          return (
            <Card
              key={i.id}
              onClick={() => toggle(i.id)}
              className={`cursor-pointer transition-all relative ${inCart ? "border-2 bg-success/10" : "border-warning/60"}`}
              style={inCart ? { borderColor: "hsl(var(--success))" } : undefined}
            >
              {inCart && (
                <div className="absolute top-2 left-2 z-10 rounded-full w-7 h-7 flex items-center justify-center shadow-md text-white" style={{ background: "hsl(var(--success))" }}>
                  <Check className="w-4 h-4" />
                </div>
              )}
              <CardContent className="p-3 space-y-2">
                <div className="aspect-square w-full rounded-lg overflow-hidden bg-muted">
                  <InventoryImage path={i.image_path} alt={i.name} className="w-full h-full" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm leading-tight line-clamp-2 min-h-[2.5rem]">{i.name}</h4>
                  {cat && <span className="inline-block text-[10px] px-2 py-0.5 rounded-full mt-1" style={{ background: cat.color + "22", color: cat.color }}>{cat.name}</span>}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-base text-warning">{i.quantity_in_stock}</span>
                  <span className="text-muted-foreground">מינ׳ {i.minimum_stock}</span>
                </div>
                {inCart ? (
                  <div className="flex items-center gap-1 pt-1" onClick={e => e.stopPropagation()}>
                    <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setQty(i.id, qty - 1)}>
                      <Minus className="w-4 h-4" />
                    </Button>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={qty}
                      onChange={e => setQty(i.id, parseInt(e.target.value) || 0)}
                      className="h-9 text-center px-1"
                    />
                    <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setQty(i.id, qty + 1)}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="text-[11px] text-center text-muted-foreground pt-1">לחץ להוספה לסל</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {totalItems > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-2xl mx-auto">
          <Card className="shadow-2xl border-primary border-2">
            <CardContent className="p-3 flex items-center gap-3">
              <ShoppingCart className="w-6 h-6 text-primary shrink-0" />
              <div className="flex-1 text-sm">
                <div className="font-bold">{totalItems} מוצרים · {totalUnits} יחידות</div>
                <div className="text-xs text-muted-foreground">לעדכן את המלאי?</div>
              </div>
              <Button onClick={confirmPurchase} disabled={saving} className="h-11 px-5 gap-2">
                <Check className="w-5 h-5" />קניתי
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
