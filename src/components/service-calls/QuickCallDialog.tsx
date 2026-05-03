import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { serviceTypes, priorities } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X, Search, Plus, Wrench } from "lucide-react";
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

export function QuickCallDialog({ open, onClose }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [customerQuery, setCustomerQuery] = useState("");
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerHit | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const [jobType, setJobType] = useState("leak_detection");
  const [priority, setPriority] = useState("medium");
  const [scheduledDate, setScheduledDate] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const searchRef = useRef<NodeJS.Timeout>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
      setCustomerQuery(""); setCustomerHits([]); setSelectedCustomer(null);
      setJobType("leak_detection"); setPriority("medium");
      setScheduledDate(""); setDescription("");
    }
  }, [open]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) {
      toast({ title: "שגיאה", description: "יש לבחור לקוח", variant: "destructive" });
      return;
    }
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("service_calls")
      .insert({
        customer_id: selectedCustomer.id,
        job_type: jobType,
        priority,
        scheduled_date: scheduledDate || null,
        description: description || null,
        status: "open",
        created_by: user.id,
      })
      .select("id")
      .single();

    setLoading(false);
    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן לפתוח קריאה", variant: "destructive" });
    } else {
      toast({ title: "✅ קריאה נפתחה!", description: `ללקוח ${selectedCustomer.name}` });
      onClose();
      navigate(`/service-calls/${data.id}`);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl border border-border overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <Wrench className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-bold text-lg">קריאת שירות חדשה</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-accent rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Customer picker */}
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
                    onClick={() => { onClose(); navigate("/customers/new?returnTo=service-call"); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-border text-primary hover:bg-accent text-sm transition-colors"
                  >
                    <Plus className="w-4 h-4" /> לקוח חדש
                  </button>
                </div>
              )}
            </div>
          </div>

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
              <Input
                type="date"
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
                className="text-sm"
              />
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
            <Button type="submit" className="flex-1" disabled={loading || !selectedCustomer}>
              {loading ? "פותח..." : "פתח קריאה"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>ביטול</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
