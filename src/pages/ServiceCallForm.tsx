import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [customJobType, setCustomJobType] = useState("");

  const [form, setForm] = useState({
    customer_id: customerId || "",
    job_type: "",
    description: "",
    scheduled_date: "",
    status: "open",
    priority: "medium",
    notes: "",
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
      const isKnownType = knownServiceTypeKeys.has(data.job_type);
      setForm({
        customer_id: data.customer_id,
        job_type: isKnownType ? data.job_type : "other",
        description: data.description || "",
        scheduled_date: data.scheduled_date || "",
        status: data.status,
        priority: (data as any).priority || "medium",
        notes: (data as any).notes || "",
      });
      if (!isKnownType) {
        setCustomJobType(data.job_type);
      }
      setCustomerName((data as any).customers?.name || "");
    }
  };

  const resolvedJobType = form.job_type === "other" && isAdmin && customJobType.trim()
    ? customJobType.trim()
    : form.job_type;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    try {
      const payload = {
        customer_id: form.customer_id,
        job_type: resolvedJobType,
        description: form.description.trim() || null,
        scheduled_date: form.scheduled_date || null,
        status: form.status,
        priority: form.priority,
        notes: form.notes.trim() || null,
      };

      if (isEdit) {
        const { error } = await supabase.from("service_calls").update(payload as any).eq("id", id!);
        if (error) throw error;
        toast({ title: "עודכן", description: "הקריאה עודכנה בהצלחה" });
        navigate(`/service-calls/${id}`);
      } else {
        const { data, error } = await supabase
          .from("service_calls")
          .insert({ ...payload, created_by: user.id } as any)
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

  const isFormValid = form.customer_id && (form.job_type !== "other" || !isAdmin || customJobType.trim()) && form.job_type;

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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>סוג שירות *</Label>
                <Select value={form.job_type} onValueChange={(v) => {
                  setForm((f) => ({ ...f, job_type: v }));
                  if (v !== "other") setCustomJobType("");
                }}>
                  <SelectTrigger><SelectValue placeholder="בחר סוג שירות" /></SelectTrigger>
                  <SelectContent>
                    {serviceTypes.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.job_type === "other" && isAdmin && (
                  <Input
                    value={customJobType}
                    onChange={(e) => setCustomJobType(e.target.value)}
                    placeholder="הקלד סוג שירות מותאם..."
                    className="mt-2"
                    maxLength={100}
                  />
                )}
              </div>
              <div className="space-y-2">
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
