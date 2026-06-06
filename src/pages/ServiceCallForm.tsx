import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { ArrowRight } from "lucide-react";
import { serviceTypes, priorities, priorityColors, knownServiceTypeKeys } from "@/lib/constants";

const ServiceCallForm = () => {
  const { id, customerId } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [customJobType, setCustomJobType] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");

  const [form, setForm] = useState({
    customer_id: customerId || "",
    description: "",
    scheduled_date: "",
    status: "open",
    priority: "medium",
    notes: "",
    scheduled_at: "",
  });

  useEffect(() => {
    if (!user) return;
    if (customerId) loadCustomerName(customerId);
    if (isEdit) loadCall();
  }, [id, customerId, user]);

  const loadCustomerName = async (custId: string) => {
    const { data } = await supabase.from("customers").select("name").eq("id", custId).single();
    if (data) setCustomerName(data.name);
  };

  const loadCall = async () => {
    const { data, error } = await supabase.from("service_calls").select("*, customers(name)").eq("id", id!).single();
    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן לטעון את הקריאה", variant: "destructive" });
      navigate("/service-calls");
    } else if (data) {
      const parts = (data.job_type || "")
        .split(",")
        .map((p: string) => p.trim())
        .filter(Boolean);
      const known = parts.filter((p: string) => knownServiceTypeKeys.has(p));
      const unknown = parts.filter((p: string) => !knownServiceTypeKeys.has(p));
      setSelectedTypes(known);
      setCustomJobType(unknown.join(", "));
      setForm({
        customer_id: data.customer_id,
        description: data.description || "",
        scheduled_date: data.scheduled_date || "",
        status: data.status,
        priority: (data as any).priority || "medium",
        notes: (data as any).notes || "",
        scheduled_at: (data as any).scheduled_at || "",
      });
      if ((data as any).scheduled_at) {
        const d = new Date((data as any).scheduled_at);
        setScheduledTime(
          `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
        );
      }
      setCustomerName((data as any).customers?.name || "");
    }
  };

  const resolvedJobType = [
    ...selectedTypes,
    ...(customJobType.trim() ? [customJobType.trim()] : []),
  ].join(", ");

  const toggleType = (value: string) => {
    setSelectedTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    try {
      /** Build scheduled_at from scheduled_date while preserving existing hour when editing */
      const computeScheduledAt = (): string | null => {
        if (!form.scheduled_date) return null;
        const t = scheduledTime || "09:00";
        return new Date(`${form.scheduled_date}T${t}:00`).toISOString();
      };

      const payload: any = {
        customer_id: form.customer_id,
        job_type: resolvedJobType,
        description: form.description.trim() || null,
        scheduled_date: form.scheduled_date || null,
        status: form.status,
        priority: form.priority,
        notes: form.notes.trim() || null,
        scheduled_at: computeScheduledAt(),
      };

      if (isEdit) {
        const { error } = await supabase.from("service_calls").update(payload).eq("id", id!);
        if (error) throw error;
        toast({ title: "עודכן", description: "הקריאה עודכנה בהצלחה" });
        navigate(`/service-calls/${id}`);
      } else {
        const insertPayload = { ...payload, created_by: user.id };
        const { data, error } = await supabase
          .from("service_calls")
          .insert(insertPayload as any)
          .select()
          .single();
        if (error) throw error;
        toast({ title: "נוצר", description: "הקריאה נוצרה בהצלחה" });
        navigate(`/service-calls/${data.id}`);
      }
    } catch (err: any) {
      console.error("Service call save error:", err);
      toast({ title: "שגיאה", description: err.message || "אירעה שגיאה", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const backPath = isEdit ? `/service-calls/${id}` : "/service-calls/new";

  const isFormValid = !!form.customer_id && (selectedTypes.length > 0 || customJobType.trim().length > 0);

  return (
    <AppLayout title={isEdit ? "עריכת קריאה" : "קריאת שירות חדשה"}>
      <Button variant="ghost" onClick={() => navigate(backPath)} className="mb-4 gap-2">
        <ArrowRight className="w-4 h-4" /> חזרה
      </Button>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{isEdit ? "עריכת קריאת שירות" : "קריאת שירות חדשה"}</CardTitle>
          {customerName && (
            <p className="text-sm text-muted-foreground mt-1">
              לקוח: <span className="font-medium text-foreground">{customerName}</span>
            </p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Service details */}
            <div className="space-y-2">
              <Label>סוג שירות * <span className="text-xs text-muted-foreground font-normal">(ניתן לבחור יותר מאחד)</span></Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {serviceTypes.map((t) => {
                  const checked = selectedTypes.includes(t.value);
                  return (
                    <label
                      key={t.value}
                      className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                        checked ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                      }`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleType(t.value)} />
                      <span className="text-sm">{t.label}</span>
                    </label>
                  );
                })}
              </div>
              <Input
                value={customJobType}
                onChange={(e) => setCustomJobType(e.target.value)}
                placeholder="או הוסף סוג מותאם (כתיבה חופשית)..."
                className="mt-2"
                maxLength={200}
              />
            </div>

            <div className="space-y-2 max-w-xs">
              <Label>עדיפות</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {priorities.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${priorityColors[p.value]}`}>
                        {p.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Scheduled date */}
            <div className="space-y-2">
              <Label>תאריך מתוכנן</Label>
              <Input
                type="date"
                value={form.scheduled_date}
                onChange={(e) => setForm((f) => ({ ...f, scheduled_date: e.target.value }))}
                dir="ltr"
                className="max-w-xs"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>תיאור התלונה</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="תאר את התלונה או הבעיה..."
                maxLength={2000}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>הערות</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="הערות נוספות..."
                maxLength={2000}
              />
            </div>

            {/* Status (edit only) */}
            {isEdit && (
              <div className="space-y-2">
                <Label>סטטוס</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">פתוח</SelectItem>
                    <SelectItem value="in_progress">בטיפול</SelectItem>
                    <SelectItem value="completed">הושלם</SelectItem>
                    <SelectItem value="cancelled">בוטל</SelectItem>
                    <SelectItem value="pending_customer">ממתין לאישור לקוח</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button type="submit" className="w-full h-12" disabled={loading || !isFormValid}>
              {loading ? "שומר..." : isEdit ? "עדכן" : "צור קריאה"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AppLayout>
  );
};

export default ServiceCallForm;
