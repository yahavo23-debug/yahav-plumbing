import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { serviceTypes, priorities, leadSources } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X, Search, Plus, Wrench, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface CustomerHit {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
}

type Mode = "choose" | "existing" | "new";

export function QuickCallDialog({ open, onClose }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("choose");

  // Existing customer search
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerHit | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // New customer fields
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newLeadSource, setNewLeadSource] = useState<string>("");

  // Call fields
  const [jobType, setJobType] = useState("leak_detection");
  const [priority, setPriority] = useState("medium");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const searchRef = useRef<NodeJS.Timeout>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMode("choose");
      setCustomerQuery(""); setCustomerHits([]); setSelectedCustomer(null);
      setNewName(""); setNewPhone(""); setNewCity(""); setNewAddress(""); setNewLeadSource("");
      setJobType("leak_detection"); setPriority("medium");
      setScheduledDate(""); setScheduledTime("09:00"); setDescription("");
    }
  }, [open]);

  useEffect(() => {
    if (mode === "existing") {
      setTimeout(() => inputRef.current?.focus(), 80);
    } else if (mode === "new") {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [mode]);

  useEffect(() => {
    if (!customerQuery.trim() || selectedCustomer) { setCustomerHits([]); return; }
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      const q = customerQuery.trim();
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, city")
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(6);
      setCustomerHits(data || []);
      setShowDropdown(true);
    }, 200);
    return () => clearTimeout(searchRef.current);
  }, [customerQuery, selectedCustomer]);

  const selectCustomer = (c: CustomerHit) => {
    setSelectedCustomer(c);
    setCustomerQuery(c.name);
    setShowDropdown(false);
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomerHits([]);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const createServiceCall = async (customerId: string, customerName: string) => {
    const timeStr = scheduledTime || "09:00";
    const scheduledAt = scheduledDate
      ? new Date(`${scheduledDate}T${timeStr}:00`).toISOString()
      : new Date().toISOString();
    const { data, error } = await (supabase
      .from("service_calls")
      .insert({
        customer_id: customerId,
        job_type: jobType,
        priority,
        scheduled_date: scheduledDate || null,
        scheduled_at: scheduledAt,
        description: description || null,
        status: "open",
        created_by: user!.id,
      } as any)
      .select("id")
      .single());
    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן לפתוח קריאה", variant: "destructive" });
      return null;
    }
    toast({ title: "✅ קריאה נפתחה!", description: `ללקוח ${customerName}` });
    onClose();
    navigate(`/service-calls/${data.id}`);
    return data.id;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (mode === "existing") {
      if (!selectedCustomer) {
        toast({ title: "שגיאה", description: "יש לבחור לקוח", variant: "destructive" });
        return;
      }
      setLoading(true);
      await createServiceCall(selectedCustomer.id, selectedCustomer.name);
      setLoading(false);
      return;
    }

    if (mode === "new") {
      if (!newName.trim()) {
        toast({ title: "שגיאה", description: "יש להזין שם לקוח", variant: "destructive" });
        return;
      }
      setLoading(true);
      const { data: newCust, error: custErr } = await (supabase
        .from("customers")
        .insert({
          name: newName.trim(),
          phone: newPhone.trim() || null,
          city: newCity.trim() || null,
          address: newAddress.trim() || null,
          lead_source: newLeadSource || null,
          created_by: user.id,
        } as any)
        .select("id, name")
        .single());

      if (custErr || !newCust) {
        setLoading(false);
        toast({ title: "שגיאה", description: custErr?.message || "לא ניתן ליצור לקוח", variant: "destructive" });
        return;
      }
      await createServiceCall(newCust.id, newCust.name);
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl border border-border overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <Wrench className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-lg">קריאת שירות חדשה</h2>
              {mode !== "choose" && (
                <button
                  type="button"
                  onClick={() => setMode("choose")}
                  className="text-xs text-muted-foreground hover:text-primary"
                >
                  ← חזרה לבחירה
                </button>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-accent rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode chooser */}
        {mode === "choose" && (
          <div className="p-5 space-y-3">
            <p className="text-sm text-muted-foreground text-center mb-2">למי הקריאה?</p>
            <button
              type="button"
              onClick={() => setMode("existing")}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-right"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <div className="font-bold">לקוח קיים</div>
                <div className="text-xs text-muted-foreground">חפש לפי שם או טלפון</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode("new")}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-all text-right"
            >
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                <UserPlus className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="font-bold text-emerald-700 dark:text-emerald-400">לקוח חדש</div>
                <div className="text-xs text-muted-foreground">פתיחת לקוח + קריאה ביחד</div>
              </div>
            </button>
          </div>
        )}

        {mode !== "choose" && (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Existing customer picker */}
            {mode === "existing" && (
              <div className="space-y-1.5">
                <Label>לקוח *</Label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={inputRef}
                    value={customerQuery}
                    onChange={e => { setCustomerQuery(e.target.value); setSelectedCustomer(null); }}
                    onFocus={() => customerHits.length > 0 && setShowDropdown(true)}
                    placeholder="חפש שם או טלפון..."
                    className={cn("pr-9", selectedCustomer && "border-primary bg-primary/5")}
                    dir="rtl"
                    autoComplete="off"
                  />
                  {selectedCustomer && (
                    <button type="button" onClick={clearCustomer} className="absolute left-3 top-1/2 -translate-y-1/2">
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  )}
                  {showDropdown && customerHits.length > 0 && !selectedCustomer && (
                    <div className="absolute top-full mt-1 w-full bg-card border border-border rounded-xl shadow-lg z-10 overflow-hidden">
                      {customerHits.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectCustomer(c)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent text-right transition-colors"
                        >
                          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0 text-primary font-bold text-sm">
                            {c.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{c.name}</p>
                            {(c.phone || c.city) && (
                              <p className="text-xs text-muted-foreground">{[c.phone, c.city].filter(Boolean).join(" • ")}</p>
                            )}
                          </div>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setMode("new")}
                        className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-border text-primary hover:bg-accent text-sm transition-colors"
                      >
                        <Plus className="w-4 h-4" /> לקוח חדש
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* New customer fields */}
            {mode === "new" && (
              <div className="space-y-3 p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-200 dark:border-emerald-900">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
                  <UserPlus className="w-4 h-4" /> פרטי לקוח חדש
                </div>
                <div className="space-y-1.5">
                  <Label>שם מלא *</Label>
                  <Input ref={inputRef} value={newName} onChange={e => setNewName(e.target.value)} placeholder="שם הלקוח" dir="rtl" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>טלפון</Label>
                    <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="05X-XXXXXXX" dir="ltr" type="tel" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>עיר</Label>
                    <Input value={newCity} onChange={e => setNewCity(e.target.value)} placeholder="עיר" dir="rtl" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>כתובת</Label>
                  <Input value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="רחוב ומספר" dir="rtl" />
                </div>
                <div className="space-y-1.5">
                  <Label>מקור הליד</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {leadSources.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setNewLeadSource(s.value === newLeadSource ? "" : s.value)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors",
                          newLeadSource === s.value
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:bg-accent"
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Job type */}
            <div className="space-y-1.5">
              <Label>סוג עבודה</Label>
              <div className="grid grid-cols-3 gap-2">
                {serviceTypes.filter(s => s.value !== "other").map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setJobType(s.value)}
                    className={cn(
                      "px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-center",
                      jobType === s.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-accent"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority + date row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>עדיפות</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {priorities.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPriority(p.value)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors",
                        priority === p.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:bg-accent"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>תאריך מתוכנן</Label>
                <div className="flex gap-1.5">
                  <Input
                    type="date"
                    value={scheduledDate}
                    onChange={e => setScheduledDate(e.target.value)}
                    className="text-sm flex-1"
                  />
                  <Input
                    type="time"
                    value={scheduledTime}
                    onChange={e => setScheduledTime(e.target.value)}
                    className="text-sm w-24"
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>תיאור קצר</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="פירוט קצר על הבעיה..."
                className="resize-none h-20 text-sm"
                dir="rtl"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                type="submit"
                className="flex-1"
                disabled={loading || (mode === "existing" ? !selectedCustomer : !newName.trim())}
              >
                {loading ? "פותח..." : mode === "new" ? "צור לקוח ופתח קריאה" : "פתח קריאה"}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>ביטול</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
