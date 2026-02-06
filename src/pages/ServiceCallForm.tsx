import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { ArrowRight, UserPlus, Users } from "lucide-react";

type CustomerOption = { id: string; name: string };

const serviceTypes = [
  { value: "leak_detection", label: "איתור נזילה" },
  { value: "sewer_camera", label: "צילום קו ביוב" },
  { value: "pressure_test", label: "בדיקת לחץ" },
  { value: "other", label: "אחר" },
];

const priorities = [
  { value: "low", label: "נמוכה" },
  { value: "medium", label: "בינונית" },
  { value: "high", label: "גבוהה" },
  { value: "urgent", label: "דחופה" },
];

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-destructive/10 text-destructive",
};

const ServiceCallForm = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");

  const [form, setForm] = useState({
    customer_id: "",
    job_type: "",
    description: "",
    scheduled_date: "",
    status: "open",
    priority: "medium",
    notes: "",
  });

  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    city: "",
    address: "",
  });

  useEffect(() => {
    if (!user) return;
    loadCustomers();
    if (isEdit) loadCall();
  }, [id, user]);

  const loadCustomers = async () => {
    const { data } = await supabase.from("customers").select("id, name").order("name");
    setCustomers(data || []);
  };

  const loadCall = async () => {
    const { data, error } = await supabase.from("service_calls").select("*").eq("id", id!).single();
    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן לטעון את הקריאה", variant: "destructive" });
      navigate("/service-calls");
    } else if (data) {
      setForm({
        customer_id: data.customer_id,
        job_type: data.job_type,
        description: data.description || "",
        scheduled_date: data.scheduled_date || "",
        status: data.status,
        priority: (data as any).priority || "medium",
        notes: (data as any).notes || "",
      });
    }
  };

  const createCustomerAndGetId = async (): Promise<string | null> => {
    if (!user) return null;
    const trimmedName = newCustomer.name.trim();
    const trimmedPhone = newCustomer.phone.trim();

    if (!trimmedName || !trimmedPhone) {
      toast({ title: "שגיאה", description: "שם וטלפון לקוח הם שדות חובה", variant: "destructive" });
      return null;
    }

    const { data, error } = await supabase
      .from("customers")
      .insert({
        name: trimmedName,
        phone: trimmedPhone,
        city: newCustomer.city.trim() || null,
        address: newCustomer.address.trim() || null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Customer creation error:", error);
      toast({ title: "שגיאה ביצירת לקוח", description: error.message, variant: "destructive" });
      return null;
    }

    return data.id;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    try {
      let customerId = form.customer_id;

      if (!isEdit && customerMode === "new") {
        const newId = await createCustomerAndGetId();
        if (!newId) {
          setLoading(false);
          return;
        }
        customerId = newId;
      }

      if (!customerId) {
        toast({ title: "שגיאה", description: "יש לבחור או ליצור לקוח", variant: "destructive" });
        setLoading(false);
        return;
      }

      const payload = {
        customer_id: customerId,
        job_type: form.job_type,
        description: form.description.trim() || null,
        scheduled_date: form.scheduled_date || null,
        status: form.status,
        priority: form.priority,
        notes: form.notes.trim() || null,
      };

      if (isEdit) {
        const { error } = await supabase.from("service_calls").update(payload).eq("id", id!);
        if (error) throw error;
        toast({ title: "עודכן", description: "הקריאה עודכנה בהצלחה" });
        navigate(`/service-calls/${id}`);
      } else {
        const { data, error } = await supabase
          .from("service_calls")
          .insert({ ...payload, created_by: user.id })
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

  const isFormValid = () => {
    if (!form.job_type) return false;
    if (customerMode === "new") {
      return newCustomer.name.trim() !== "" && newCustomer.phone.trim() !== "";
    }
    return form.customer_id !== "";
  };

  return (
    <AppLayout title={isEdit ? "עריכת קריאה" : "קריאת שירות חדשה"}>
      <Button variant="ghost" onClick={() => navigate("/service-calls")} className="mb-4 gap-2">
        <ArrowRight className="w-4 h-4" /> חזרה
      </Button>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{isEdit ? "עריכת קריאת שירות" : "קריאת שירות חדשה"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Customer section */}
            {!isEdit && (
              <div className="space-y-4">
                <Label className="text-base font-semibold">לקוח</Label>
                <ToggleGroup
                  type="single"
                  value={customerMode}
                  onValueChange={(v) => {
                    if (v) setCustomerMode(v as "existing" | "new");
                  }}
                  className="justify-start"
                >
                  <ToggleGroupItem value="existing" className="gap-2">
                    <Users className="w-4 h-4" />
                    לקוח קיים
                  </ToggleGroupItem>
                  <ToggleGroupItem value="new" className="gap-2">
                    <UserPlus className="w-4 h-4" />
                    לקוח חדש
                  </ToggleGroupItem>
                </ToggleGroup>

                {customerMode === "existing" ? (
                  <div className="space-y-2">
                    <Select value={form.customer_id} onValueChange={(v) => setForm((f) => ({ ...f, customer_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="בחר לקוח" /></SelectTrigger>
                      <SelectContent>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/30">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>שם לקוח *</Label>
                        <Input
                          value={newCustomer.name}
                          onChange={(e) => setNewCustomer((c) => ({ ...c, name: e.target.value }))}
                          placeholder="שם מלא"
                          maxLength={100}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>טלפון *</Label>
                        <Input
                          value={newCustomer.phone}
                          onChange={(e) => setNewCustomer((c) => ({ ...c, phone: e.target.value }))}
                          placeholder="050-0000000"
                          dir="ltr"
                          maxLength={20}
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>עיר</Label>
                        <Input
                          value={newCustomer.city}
                          onChange={(e) => setNewCustomer((c) => ({ ...c, city: e.target.value }))}
                          placeholder="עיר"
                          maxLength={100}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>כתובת</Label>
                        <Input
                          value={newCustomer.address}
                          onChange={(e) => setNewCustomer((c) => ({ ...c, address: e.target.value }))}
                          placeholder="רחוב ומספר"
                          maxLength={200}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Existing customer selector for edit mode */}
            {isEdit && (
              <div className="space-y-2">
                <Label>לקוח *</Label>
                <Select value={form.customer_id} onValueChange={(v) => setForm((f) => ({ ...f, customer_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="בחר לקוח" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Service details */}
            <div className="space-y-4">
              <Label className="text-base font-semibold">פרטי הקריאה</Label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>סוג שירות *</Label>
                  <Select value={form.job_type} onValueChange={(v) => setForm((f) => ({ ...f, job_type: v }))}>
                    <SelectTrigger><SelectValue placeholder="בחר סוג שירות" /></SelectTrigger>
                    <SelectContent>
                      {serviceTypes.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>עדיפות</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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

            <Button type="submit" className="w-full h-12" disabled={loading || !isFormValid()}>
              {loading ? "שומר..." : isEdit ? "עדכן" : "צור קריאה"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AppLayout>
  );
};

export default ServiceCallForm;
