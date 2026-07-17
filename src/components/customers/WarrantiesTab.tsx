import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShieldCheck, Plus, Loader2, Camera, Eye, Trash2, Pencil } from "lucide-react";

/**
 * טאב אחריות בכרטיס לקוח: מה הוחלף/הותקן, תוקף האחריות (ממתי עד מתי, כמה נשאר)
 * ותעודת האחריות המצולמת. הצוות מנהל, התעודות נשמרות ב-storage פרטי.
 */

interface Warranty {
  id: string;
  product_name: string;
  description: string | null;
  installed_at: string;
  warranty_until: string;
  certificate_path: string | null;
  notes: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("he-IL");

/** סטטוס אחריות: בתוקף / עומד לפוג (חודש) / פג */
function warrantyStatus(until: string) {
  const daysLeft = Math.ceil((new Date(until + "T23:59:59").getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) {
    return { label: "פג תוקף", sub: `נגמר לפני ${Math.abs(daysLeft)} ימים`, cls: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800" };
  }
  if (daysLeft <= 30) {
    return { label: "עומד לפוג", sub: `נשארו ${daysLeft} ימים`, cls: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700" };
  }
  const months = Math.floor(daysLeft / 30);
  return { label: "בתוקף ✓", sub: months >= 2 ? `נשארו כ-${months} חודשים` : `נשארו ${daysLeft} ימים`, cls: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800" };
}

const DURATIONS = [
  { value: "6", label: "חצי שנה" },
  { value: "12", label: "שנה" },
  { value: "24", label: "שנתיים" },
  { value: "36", label: "3 שנים" },
  { value: "60", label: "5 שנים" },
  { value: "120", label: "10 שנים" },
  { value: "custom", label: "תאריך אחר..." },
];

export function WarrantiesTab({ customerId, customerName }: { customerId: string; customerName?: string }) {
  const { user, isAdmin, role } = useAuth();
  const canManage = isAdmin || role === "technician" || role === "secretary";
  const [items, setItems] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);

  // דיאלוג הוספה/עריכה
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Warranty | null>(null);
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [installedAt, setInstalledAt] = useState(today());
  const [duration, setDuration] = useState("12");
  const [customUntil, setCustomUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Warranty | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("warranties")
      .select("*")
      .eq("customer_id", customerId)
      .order("warranty_until", { ascending: false });
    if (error) {
      toast({ title: "שגיאה בטעינת אחריות", description: error.message, variant: "destructive" });
    }
    setItems((data || []) as Warranty[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [customerId]);

  const openAdd = () => {
    setEditing(null);
    setProductName("");
    setDescription("");
    setInstalledAt(today());
    setDuration("12");
    setCustomUntil("");
    setNotes("");
    setCertFile(null);
    setDialogOpen(true);
  };

  const openEdit = (w: Warranty) => {
    setEditing(w);
    setProductName(w.product_name);
    setDescription(w.description || "");
    setInstalledAt(w.installed_at);
    setDuration("custom");
    setCustomUntil(w.warranty_until);
    setNotes(w.notes || "");
    setCertFile(null);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (!productName.trim()) {
      toast({ title: "חסר שם מוצר", description: "כתוב מה הותקן או הוחלף", variant: "destructive" });
      return;
    }
    const until = duration === "custom" ? customUntil : addMonths(installedAt, parseInt(duration));
    if (!until) {
      toast({ title: "חסר תאריך סיום אחריות", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // העלאת תעודת אחריות (אם צורפה)
      let certificatePath = editing?.certificate_path || null;
      if (certFile) {
        const ext = certFile.name.split(".").pop() || "jpg";
        const path = `${customerId}/${Date.now()}-cert.${ext}`;
        const { error: upErr } = await supabase.storage.from("warranties").upload(path, certFile, { contentType: certFile.type });
        if (upErr) throw upErr;
        certificatePath = path;
      }

      const payload = {
        customer_id: customerId,
        product_name: productName.trim(),
        description: description.trim() || null,
        installed_at: installedAt,
        warranty_until: until,
        certificate_path: certificatePath,
        notes: notes.trim() || null,
      };

      if (editing) {
        const { error } = await (supabase as any).from("warranties").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast({ title: "עודכן", description: "פרטי האחריות עודכנו" });
      } else {
        const { error } = await (supabase as any).from("warranties").insert({ ...payload, created_by: user.id });
        if (error) throw error;
        toast({ title: "אחריות נשמרה", description: `${productName.trim()} — בתוקף עד ${fmtDate(until)}` });
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "שגיאה בשמירה", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const viewCertificate = async (w: Warranty) => {
    if (!w.certificate_path) return;
    setViewingId(w.id);
    try {
      const { data, error } = await supabase.storage.from("warranties").createSignedUrl(w.certificate_path, 3600);
      if (error || !data?.signedUrl) throw error || new Error("אין קישור");
      window.open(data.signedUrl, "_blank");
    } catch (e: any) {
      toast({ title: "שגיאה בפתיחת התעודה", description: e.message, variant: "destructive" });
    } finally {
      setViewingId(null);
    }
  };

  const remove = async (w: Warranty) => {
    const { error } = await (supabase as any).from("warranties").delete().eq("id", w.id);
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }
    if (w.certificate_path) {
      await supabase.storage.from("warranties").remove([w.certificate_path]);
    }
    toast({ title: "נמחק", description: "רשומת האחריות נמחקה" });
    setDeleteTarget(null);
    load();
  };

  return (
    <div>
      {canManage && (
        <div className="flex justify-end mb-4">
          <Button onClick={openAdd} className="gap-2 bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white">
            <Plus className="w-4 h-4" /> הוסף אחריות
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>אין רשומות אחריות ללקוח זה</p>
          <p className="text-sm mt-1">כשמחליפים מוצר עם אחריות — מוסיפים אותו כאן עם תעודת האחריות</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((w) => {
            const st = warrantyStatus(w.warranty_until);
            return (
              <div key={w.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0" aria-hidden="true">
                    <ShieldCheck className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{w.product_name}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${st.cls}`}>
                        {st.label}
                      </span>
                      <span className="text-xs text-muted-foreground">{st.sub}</span>
                    </div>
                    {w.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">{w.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      אחריות מ-<b>{fmtDate(w.installed_at)}</b> עד <b>{fmtDate(w.warranty_until)}</b>
                    </p>
                    {w.notes && <p className="text-xs text-muted-foreground mt-0.5">📝 {w.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {w.certificate_path && (
                      <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => viewCertificate(w)} disabled={viewingId === w.id}>
                        {viewingId === w.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                        תעודה
                      </Button>
                    )}
                    {canManage && (
                      <>
                        <Button variant="ghost" size="sm" className="h-9 w-9 p-0" title="עריכה" onClick={() => openEdit(w)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-destructive" title="מחיקה" onClick={() => setDeleteTarget(w)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* דיאלוג הוספה/עריכה */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!saving) setDialogOpen(o); }}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              {editing ? "עריכת אחריות" : `אחריות חדשה${customerName ? ` — ${customerName}` : ""}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="mb-1.5 block">מה הותקן / הוחלף <span className="text-destructive">*</span></Label>
              <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="למשל: דוד שמש 150 ליטר, ניאגרה סמויה גביע..." autoFocus />
            </div>
            <div>
              <Label className="mb-1.5 block">פרטים על העבודה</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="איפה הותקן, איזה דגם, מה כלול באחריות..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">תאריך התקנה</Label>
                <Input type="date" value={installedAt} onChange={(e) => setInstalledAt(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1.5 block">משך האחריות</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {duration === "custom" ? (
              <div>
                <Label className="mb-1.5 block">בתוקף עד</Label>
                <Input type="date" value={customUntil} onChange={(e) => setCustomUntil(e.target.value)} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                האחריות תהיה בתוקף עד: <b>{fmtDate(addMonths(installedAt, parseInt(duration)))}</b>
              </p>
            )}
            <div>
              <Label className="mb-1.5 block flex items-center gap-1.5">
                <Camera className="w-4 h-4" /> תמונת תעודת האחריות
              </Label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setCertFile(e.target.files?.[0] || null)}
                className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-md file:border file:border-input file:bg-background file:text-sm file:font-medium hover:file:bg-accent"
              />
              {editing?.certificate_path && !certFile && (
                <p className="text-xs text-muted-foreground mt-1">יש תעודה שמורה — העלאת קובץ חדש תחליף אותה</p>
              )}
            </div>
            <div>
              <Label className="mb-1.5 block">הערות</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="למשל: אחריות יבואן, דורש שירות שנתי..." />
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={save} disabled={saving} className="gap-2 bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? "שמור שינויים" : "שמור אחריות"}
            </Button>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>ביטול</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* אישור מחיקה */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת רשומת אחריות</AlertDialogTitle>
            <AlertDialogDescription>
              למחוק את האחריות על "{deleteTarget?.product_name}"? גם תעודת האחריות המצורפת תימחק.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && remove(deleteTarget)}
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
