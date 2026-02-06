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
import { Tables } from "@/integrations/supabase/types";

type CustomerOption = { id: string; name: string };

const jobTypes = ["תיקון", "התקנה", "תחזוקה", "בדיקה", "ייעוץ", "אחר"];

const ServiceCallForm = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [form, setForm] = useState({
    customer_id: "", job_type: "", description: "", scheduled_date: "", status: "open",
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
        customer_id: data.customer_id, job_type: data.job_type,
        description: data.description || "", scheduled_date: data.scheduled_date || "", status: data.status,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    try {
      if (isEdit) {
        const { error } = await supabase.from("service_calls").update(form).eq("id", id!);
        if (error) throw error;
        toast({ title: "עודכן", description: "הקריאה עודכנה בהצלחה" });
        navigate(`/service-calls/${id}`);
      } else {
        const { data, error } = await supabase.from("service_calls")
          .insert({ ...form, created_by: user.id })
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

  return (
    <AppLayout title={isEdit ? "עריכת קריאה" : "קריאת שירות חדשה"}>
      <Button variant="ghost" onClick={() => navigate("/service-calls")} className="mb-4 gap-2">
        <ArrowRight className="w-4 h-4" /> חזרה
      </Button>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{isEdit ? "עריכת קריאת שירות" : "יצירת קריאת שירות"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>סוג עבודה *</Label>
                <Select value={form.job_type} onValueChange={(v) => setForm((f) => ({ ...f, job_type: v }))}>
                  <SelectTrigger><SelectValue placeholder="בחר סוג" /></SelectTrigger>
                  <SelectContent>
                    {jobTypes.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>תאריך מתוכנן</Label>
                <Input type="date" value={form.scheduled_date} onChange={(e) => setForm((f) => ({ ...f, scheduled_date: e.target.value }))} dir="ltr" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>תיאור</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={4} />
            </div>
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
            <Button type="submit" className="w-full h-12" disabled={loading || !form.customer_id || !form.job_type}>
              {loading ? "שומר..." : isEdit ? "עדכן" : "צור קריאה"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AppLayout>
  );
};

export default ServiceCallForm;
