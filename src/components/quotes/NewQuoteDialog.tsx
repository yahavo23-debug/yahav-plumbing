import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { FileText, Search, UserPlus, Users, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * הצעת מחיר חדשה — בלחיצה אחת, משני סוגים:
 * - לקוח קיים: בוחרים מהרשימה (חיפוש שם/טלפון בכל פורמט) ועוברים ישר לעורך ההצעה.
 * - לקוח מזדמן: שם וטלפון בלבד, בלי להישמר ברשימת הלקוחות הקבועה.
 * בשני המקרים נפתחת קריאת "הצעת מחיר" מאחורי הקלעים והעורך נפתח מיד.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CustomerLite {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
}

const digitsOnly = (s: string | null | undefined) => (s || "").replace(/\D/g, "").replace(/^972/, "0");

export const NewQuoteDialog = ({ open, onOpenChange }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"existing" | "walkin">("existing");

  // לקוח קיים
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // מזדמן
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("customers")
        .select("id, name, phone, city")
        .eq("is_walkin", false)
        .order("name");
      setCustomers((data || []) as CustomerLite[]);
    })();
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = digitsOnly(search);
    if (!q) return customers.slice(0, 6);
    return customers.filter((c) =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.city || "").toLowerCase().includes(q) ||
      (qDigits.length >= 3 && digitsOnly(c.phone).includes(qDigits))
    ).slice(0, 6);
  }, [customers, search]);

  const reset = () => {
    setMode("existing");
    setSearch("");
    setSelectedId(null);
    setName("");
    setPhone("");
    setAddress("");
    setDescription("");
  };

  const handleCreate = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      let customerId: string;

      if (mode === "existing") {
        if (!selectedId) {
          toast({ title: "בחר לקוח", description: "חפש ובחר לקוח מהרשימה", variant: "destructive" });
          setSubmitting(false);
          return;
        }
        customerId = selectedId;
      } else {
        if (!name.trim()) {
          toast({ title: "חסר שם", description: "יש להזין שם ללקוח המזדמן", variant: "destructive" });
          setSubmitting(false);
          return;
        }
        const { data: customer, error: custErr } = await supabase
          .from("customers")
          .insert({
            name: name.trim(),
            phone: phone.trim() || null,
            address: address.trim() || null,
            is_walkin: true,
            created_by: user.id,
          } as any)
          .select()
          .single();
        if (custErr) throw custErr;
        customerId = (customer as any).id;
      }

      const { data: call, error: callErr } = await supabase
        .from("service_calls")
        .insert({
          customer_id: customerId,
          job_type: "הצעת מחיר",
          description: description.trim() || null,
          status: "open",
          priority: "medium",
          created_by: user.id,
        } as any)
        .select()
        .single();
      if (callErr) throw callErr;

      toast({ title: "נוצר", description: "פותח את עורך הצעת המחיר" });
      reset();
      onOpenChange(false);
      navigate(`/service-calls/${(call as any).id}?tab=quotes&new=1`);
    } catch (err: any) {
      console.error("New quote error:", err);
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCustomer = customers.find((c) => c.id === selectedId) || null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent dir="rtl" className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            הצעת מחיר חדשה
          </DialogTitle>
          <DialogDescription>
            בחר לקוח קיים או צור הצעה למזדמן — ותועבר ישר לעורך ההצעה.
          </DialogDescription>
        </DialogHeader>

        {/* בחירת סוג */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMode("existing")}
            className={cn(
              "h-11 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-colors",
              mode === "existing"
                ? "bg-gradient-to-l from-blue-600 to-cyan-500 text-white border-transparent shadow"
                : "bg-background border-input hover:bg-accent"
            )}
          >
            <Users className="w-4 h-4" /> לקוח קיים
          </button>
          <button
            onClick={() => setMode("walkin")}
            className={cn(
              "h-11 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-colors",
              mode === "walkin"
                ? "bg-gradient-to-l from-orange-500 to-amber-500 text-white border-transparent shadow"
                : "bg-background border-input hover:bg-accent"
            )}
          >
            <UserPlus className="w-4 h-4" /> מזדמן (בלי שמירה)
          </button>
        </div>

        {mode === "existing" ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelectedId(null); }}
                placeholder="חפש לפי שם או טלפון (בכל פורמט)..."
                className="pr-10"
                autoFocus
              />
            </div>
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">לא נמצא לקוח — נסה חיפוש אחר או צור מזדמן</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-2.5 rounded-lg border text-right transition-colors",
                      selectedId === c.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent"
                    )}
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-amber-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {(c.name || "?").trim().charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{[c.phone, c.city].filter(Boolean).join(" • ")}</p>
                    </div>
                    {selectedId === c.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">שם <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הלקוח" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">טלפון</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050-..." type="tel" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">כתובת</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="אופציונלי" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              המזדמן לא יישמר ברשימת הלקוחות הקבועה. אפשר יהיה לשמור אותו בהמשך בלחיצת "שמור לקוח".
            </p>
          </div>
        )}

        <div>
          <Label className="text-xs text-muted-foreground">על מה ההצעה?</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="למשל: החלפת דוד שמש, שיפוץ חדר אמבטיה... (אופציונלי)"
            rows={2}
          />
        </div>

        <DialogFooter className="flex-row-reverse gap-2">
          <Button
            onClick={handleCreate}
            disabled={submitting || (mode === "existing" ? !selectedId : !name.trim())}
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            {submitting ? "יוצר..." : selectedCustomer ? `המשך להצעה — ${selectedCustomer.name.split(" ")[0]}` : "המשך להצעה"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
